import { ConstellationGraph, colorForDomain } from "./graph.js";
import { MOCK_TOPICS, SEED_SPARKS, mockSearch, mockGet, mockRandom } from "./mock-data.js";

const MAILTO = "suvadipchakraborty@gmail.com";
const API_BASE = "https://api.openalex.org/topics";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_PREFIX = "synapse:topic:";
const API_KEY_STORAGE = "synapse:apiKey";
// Built-in fallback so search works out of the box; a key saved in the
// About panel (stored per-device in localStorage) always takes priority.
const DEFAULT_API_KEY = "yCJexcJhHoHqLfwEcs0ODu";

function getApiKey() {
  try {
    const stored = (localStorage.getItem(API_KEY_STORAGE) || "").trim();
    return stored || DEFAULT_API_KEY;
  } catch (_) { return DEFAULT_API_KEY; }
}

// Appended to every OpenAlex request. Since Feb 13 2026, OpenAlex requires a
// free API key for all calls — without one, requests are heavily rate-limited
// (or rejected outright) and the app silently falls back to offline sample data.
function authParams() {
  const key = getApiKey();
  return key ? `&api_key=${encodeURIComponent(key)}` : "";
}

let missingKeyWarned = false;
let offlineMode = false;
let currentTopic = null;
let savedIds = new Set(JSON.parse(localStorage.getItem("synapse:codex") || "[]"));
let audioCtx = null;
let soundOn = false;

// ---------------------------------------------------------------- helpers

function toast(msg, ms = 2200) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), ms);
}

function vibrate(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (_) {} }
}

function playChime() {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = 1180;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.5);
  } catch (_) {}
}

function fmtNum(n) {
  if (n == null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

function cacheGet(id) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id);
    if (!raw) return null;
    const { t, data } = JSON.parse(raw);
    if (Date.now() - t > CACHE_TTL_MS) { localStorage.removeItem(CACHE_PREFIX + id); return null; }
    return data;
  } catch (_) { return null; }
}
function cacheSet(id, data) {
  try { localStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ t: Date.now(), data })); } catch (_) {}
}

// ---------------------------------------------------------------- normalizing

// Turns a raw OpenAlex (or mock) topic payload into the shape the rest of
// the app relies on, and pre-resolves sibling display names either way.
function normalizeTopic(raw) {
  const siblings = (raw.siblings || []).map(s => {
    if (typeof s === "string") {
      const m = mockGet(s);
      return m ? { id: m.id, display_name: m.display_name } : null;
    }
    return { id: s.id, display_name: s.display_name };
  }).filter(Boolean);

  return {
    id: raw.id,
    display_name: raw.display_name,
    description: raw.description || "No description available for this topic yet.",
    domain: raw.domain || { display_name: "Unclassified" },
    field: raw.field || { display_name: "Unclassified" },
    subfield: raw.subfield || { display_name: "Unclassified" },
    works_count: raw.works_count ?? 0,
    cited_by_count: raw.cited_by_count ?? 0,
    siblings,
  };
}

// ---------------------------------------------------------------- data layer

async function apiSearch(query) {
  const url = `${API_BASE}?search=${encodeURIComponent(query)}&per_page=8&mailto=${MAILTO}${authParams()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error("search failed");
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return json.results || [];
}

async function apiGetById(id) {
  const bare = id.replace("https://openalex.org/", "");
  const url = `${API_BASE}/${bare}?mailto=${MAILTO}${authParams()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error("fetch failed");
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function searchTopics(query) {
  if (offlineMode) return mockSearch(query).map(normalizeTopic);
  try {
    const results = await apiSearch(query);
    return results.map(normalizeTopic);
  } catch (e) {
    setOffline(true, e);
    return mockSearch(query).map(normalizeTopic);
  }
}

async function getTopicById(id) {
  const cached = cacheGet(id);
  if (cached) return normalizeTopic(cached);

  if (offlineMode || id.startsWith("mock:")) {
    const m = mockGet(id);
    if (m) return normalizeTopic(m);
  }
  try {
    const raw = await apiGetById(id);
    cacheSet(id, raw);
    return normalizeTopic(raw);
  } catch (e) {
    setOffline(true, e);
    const m = mockGet(id);
    if (m) return normalizeTopic(m);
    throw e;
  }
}

function setOffline(state, err) {
  if (state && !offlineMode) {
    const unauthorized = err && (err.status === 401 || err.status === 403 || err.status === 429);
    if (unauthorized && !missingKeyWarned) {
      missingKeyWarned = true;
      toast("OpenAlex rejected the API key — check it in the ⓘ About panel", 4200);
    } else {
      toast("Network unreachable — exploring offline sample data");
    }
  }
  offlineMode = state;
}

function randomTopic() {
  if (offlineMode) return Promise.resolve(normalizeTopic(mockRandom()));
  const pool = SEED_SPARKS.filter(s => s.query);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return searchTopics(pick.query).then(r => r[0] || normalizeTopic(mockRandom()));
}

// ---------------------------------------------------------------- graph building

function buildGraphData(topic) {
  const nodes = [];
  const links = [];
  const centerId = topic.id;

  nodes.push({ id: centerId, label: topic.display_name, domain: topic.domain.display_name, r: 26, kind: "topic", ref: topic });

  const taxo = [
    { key: "domain", val: topic.domain, r: 16 },
    { key: "field", val: topic.field, r: 15 },
    { key: "subfield", val: topic.subfield, r: 14 },
  ];
  taxo.forEach(t => {
    if (!t.val || !t.val.display_name) return;
    const id = `taxo:${t.key}:${t.val.display_name}`;
    if (nodes.find(n => n.id === id)) return;
    nodes.push({ id, label: t.val.display_name, domain: topic.domain.display_name, r: t.r, kind: t.key, query: t.val.display_name });
    links.push({ source: centerId, target: id, distance: 95 });
  });

  topic.siblings.slice(0, 8).forEach(s => {
    if (nodes.find(n => n.id === s.id)) return;
    nodes.push({ id: s.id, label: s.display_name, domain: topic.domain.display_name, r: 18, kind: "topic" });
    links.push({ source: centerId, target: s.id, distance: 130 });
  });

  return { nodes, links, centerId };
}

// ---------------------------------------------------------------- rendering topic → UI

function renderInspector(topic) {
  currentTopic = topic;
  document.getElementById("breadcrumbs").innerHTML =
    [topic.domain.display_name, topic.field.display_name, topic.subfield.display_name]
      .map(s => `<span>${escapeHtml(s)}</span>`).join('<span class="sep">›</span>');
  document.getElementById("topicTitle").textContent = topic.display_name;
  document.getElementById("metricWorks").textContent = fmtNum(topic.works_count);
  document.getElementById("metricCites").textContent = fmtNum(topic.cited_by_count);
  document.getElementById("topicDesc").textContent = topic.description;

  const chipRow = document.getElementById("siblingChips");
  chipRow.innerHTML = "";
  topic.siblings.slice(0, 8).forEach(s => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = s.display_name;
    chip.addEventListener("click", () => focusTopicById(s.id));
    chipRow.appendChild(chip);
  });

  const oaId = topic.id.startsWith("mock:") ? null : topic.id.replace("https://openalex.org/", "");
  const oaLink = document.getElementById("openAlexLink");
  const scLink = document.getElementById("scholarLink");
  if (oaId) {
    oaLink.href = `https://openalex.org/${oaId}`;
    oaLink.style.display = "";
  } else {
    oaLink.style.display = "none";
  }
  scLink.href = `https://scholar.google.com/scholar?q=${encodeURIComponent(topic.display_name)}`;

  const starBtn = document.getElementById("starBtn");
  const isSaved = savedIds.has(topic.id);
  starBtn.setAttribute("aria-pressed", String(isSaved));
  starBtn.querySelector("span").textContent = isSaved ? "Saved to Codex" : "Save to Codex";

  openInspector("peek");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openInspector(mode) {
  const insp = document.getElementById("inspector");
  insp.classList.remove("peek", "open");
  insp.classList.add(mode);
  insp.setAttribute("aria-hidden", "false");
}
function closeInspector() {
  const insp = document.getElementById("inspector");
  insp.classList.remove("peek", "open");
  insp.setAttribute("aria-hidden", "true");
}

// ---------------------------------------------------------------- core flow

let graph;

async function loadTopicAsCenter(topic, { spark = true } = {}) {
  setLoading(true, `Charting ${topic.display_name}…`);
  document.getElementById("emptyState").style.display = "none";
  try {
    const data = buildGraphData(topic);
    graph.setData(data.nodes, data.links, data.centerId);
    renderInspector(topic);
    document.getElementById("searchInput").value = "";
    hideSuggestions();
    if (spark) { vibrate([15, 30]); playChime(); }
  } finally {
    setLoading(false);
  }
}

async function focusTopicById(id) {
  try {
    setLoading(true, "Blooming new cluster…");
    const topic = await getTopicById(id);
    await loadTopicAsCenter(topic);
  } catch (e) {
    toast("Couldn't load that topic — try again.");
  } finally {
    setLoading(false);
  }
}

async function focusTaxonomyNode(node) {
  try {
    setLoading(true, `Searching ${node.query}…`);
    const results = await searchTopics(node.query);
    if (results[0]) await loadTopicAsCenter(results[0]);
    else toast("No topics found for that category.");
  } catch (e) {
    toast("Search failed — check your connection.");
  } finally {
    setLoading(false);
  }
}

function setLoading(state, label) {
  const el = document.getElementById("loadingState");
  el.hidden = !state;
  if (label) document.getElementById("loadingLabel").textContent = label;
}

// ---------------------------------------------------------------- search UI

let searchDebounce;
const searchInput = document.getElementById("searchInput");
const suggestionsEl = document.getElementById("suggestions");

function hideSuggestions() { suggestionsEl.hidden = true; suggestionsEl.innerHTML = ""; }

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (q.length < 2) { hideSuggestions(); return; }
  searchDebounce = setTimeout(async () => {
    const results = await searchTopics(q);
    renderSuggestions(results, q);
  }, 280);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = suggestionsEl.querySelector(".suggestion-item");
    if (first) first.click();
  } else if (e.key === "Escape") {
    searchInput.blur();
    hideSuggestions();
  }
});

function renderSuggestions(results, query) {
  if (!results.length) {
    // OpenAlex Topics is a fixed taxonomy of ~4,500 narrow research topics —
    // broad umbrella terms (e.g. "data science") often have no topic of that
    // exact name, even though closely related topics exist. Say so plainly
    // instead of just going quiet, which reads as broken.
    suggestionsEl.innerHTML = `<div class="suggestion-empty">No topic named "${escapeHtml(query)}" in OpenAlex's taxonomy. Try a narrower term, e.g. "data mining" or "big data analytics".</div>`;
    suggestionsEl.hidden = false;
    return;
  }
  suggestionsEl.innerHTML = "";
  results.forEach(t => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.setAttribute("role", "option");
    div.innerHTML = `<span>${escapeHtml(t.display_name)}</span><span class="suggestion-meta">${escapeHtml(t.domain.display_name)}</span>`;
    div.addEventListener("click", () => loadTopicAsCenter(t));
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.hidden = false;
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrap")) hideSuggestions();
});

// ---------------------------------------------------------------- seed ticker

function renderSeedTicker() {
  const el = document.getElementById("seedTicker");
  SEED_SPARKS.forEach(s => {
    const pill = document.createElement("button");
    pill.className = "seed-pill";
    pill.textContent = s.label;
    pill.addEventListener("click", async () => {
      vibrate([8]);
      setLoading(true, `Seeding ${s.label}…`);
      try {
        if (s.id) await loadTopicAsCenter(await getTopicById(s.id));
        else {
          const results = await searchTopics(s.query);
          if (results[0]) await loadTopicAsCenter(results[0]);
          else toast("Couldn't find that spark right now.");
        }
      } finally { setLoading(false); }
    });
    el.appendChild(pill);
  });
}

// ---------------------------------------------------------------- inspector drag

(function setupInspectorDrag() {
  const insp = document.getElementById("inspector");
  // The whole header (handle + breadcrumbs/title/metrics) is draggable, not
  // just the tiny dot — that's the part still visible while "peeking", so a
  // swipe anywhere on it should resize the sheet.
  const zone = document.getElementById("inspectorDragZone");

  let dragging = false, moved = false;
  let startY = 0, startTop = 0, dragTop = 0;
  let lastY = 0, lastT = 0, velocity = 0;

  function naturalTopPx() {
    // Where the sheet's top edge sits with --sheet-y: 0 (fully open).
    return Math.max(0, window.innerHeight - insp.offsetHeight);
  }
  function openTopPx() { return naturalTopPx(); }
  function peekTopPx() { return window.innerHeight - 128; }

  function setDragY(px) { insp.style.setProperty("--sheet-y", `${px}px`); }
  function clearDragY() { insp.style.removeProperty("--sheet-y"); }

  zone.addEventListener("pointerdown", (e) => {
    dragging = true; moved = false;
    startY = e.clientY; lastY = e.clientY; lastT = e.timeStamp;
    velocity = 0;
    startTop = insp.getBoundingClientRect().top;
    dragTop = startTop;
    insp.style.transition = "none";
    zone.setPointerCapture(e.pointerId);
  });

  zone.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;

    // Dragging only ever moves the sheet between "open" and "peek" — it
    // never closes it, so an under-shot swipe can't accidentally dismiss
    // the sheet instead of expanding it.
    const top = openTopPx(), bottom = peekTopPx();
    dragTop = Math.max(top, Math.min(bottom, startTop + dy));

    const dt = e.timeStamp - lastT || 16;
    velocity = (e.clientY - lastY) / dt; // px/ms, +down / -up
    lastY = e.clientY; lastT = e.timeStamp;

    setDragY(dragTop - naturalTopPx());
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    insp.style.transition = "";
    clearDragY();

    if (!moved) {
      // A tap on the handle/header toggles between peek and open.
      openInspector(insp.classList.contains("open") ? "peek" : "open");
      return;
    }

    const FLICK = 0.5; // px/ms — a decisive flick wins even over a short drag
    let target;
    if (velocity < -FLICK) target = "open";
    else if (velocity > FLICK) target = "peek";
    else {
      const mid = (openTopPx() + peekTopPx()) / 2;
      target = dragTop < mid ? "open" : "peek";
    }
    openInspector(target);
  }
  zone.addEventListener("pointerup", endDrag);
  zone.addEventListener("pointercancel", endDrag);
})();

// ---------------------------------------------------------------- dock + shortcuts

document.getElementById("btnRecenter").addEventListener("click", () => { graph.recenter(); vibrate([8]); });

document.getElementById("btnFreeze").addEventListener("click", () => {
  const frozen = graph.toggleFreeze();
  document.getElementById("freezeLabel").textContent = frozen ? "Play" : "Freeze";
  document.getElementById("btnFreeze").classList.toggle("active-state", frozen);
  vibrate([8]);
});

document.getElementById("btnShuffle").addEventListener("click", async () => {
  vibrate([8]);
  setLoading(true, "Sparking a random field…");
  try { await loadTopicAsCenter(await randomTopic()); }
  finally { setLoading(false); }
});

document.getElementById("btnCodex").addEventListener("click", openCodex);

document.getElementById("starBtn").addEventListener("click", () => {
  if (!currentTopic) return;
  if (savedIds.has(currentTopic.id)) savedIds.delete(currentTopic.id);
  else savedIds.add(currentTopic.id);
  localStorage.setItem("synapse:codex", JSON.stringify([...savedIds]));
  cacheSet(currentTopic.id, currentTopic);
  renderInspector(currentTopic);
  updateCodexCount();
  vibrate([8]);
});

function updateCodexCount() {
  document.getElementById("codexCount").textContent = savedIds.size ? `Codex (${savedIds.size})` : "Codex";
}

function openCodex() {
  const modal = document.getElementById("codexModal");
  const list = document.getElementById("codexList");
  const empty = document.getElementById("codexEmpty");
  list.innerHTML = "";
  if (!savedIds.size) { empty.hidden = false; }
  else {
    empty.hidden = true;
    [...savedIds].forEach(id => {
      const cached = cacheGet(id) || mockGet(id);
      const name = cached ? cached.display_name : id;
      const domain = cached && cached.domain ? (cached.domain.display_name || cached.domain) : "";
      const item = document.createElement("div");
      item.className = "codex-item";
      item.innerHTML = `<div><div class="codex-item-name">${escapeHtml(name)}</div><div class="codex-item-domain">${escapeHtml(domain)}</div></div>`;
      const rm = document.createElement("button");
      rm.className = "codex-remove"; rm.textContent = "×";
      rm.addEventListener("click", (e) => { e.stopPropagation(); savedIds.delete(id); localStorage.setItem("synapse:codex", JSON.stringify([...savedIds])); updateCodexCount(); openCodex(); });
      item.appendChild(rm);
      item.addEventListener("click", () => { closeModal(modal); focusTopicById(id); });
      list.appendChild(item);
    });
  }
  modal.hidden = false;
}

function closeModal(m) { m.hidden = true; }
document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", (e) => closeModal(e.target.closest(".modal-backdrop"))));
document.querySelectorAll(".modal-backdrop").forEach(m => m.addEventListener("click", (e) => { if (e.target === m) closeModal(m); }));

document.getElementById("aboutBtn").addEventListener("click", () => {
  document.getElementById("apiKeyInput").value = getApiKey();
  document.getElementById("apiKeyStatus").hidden = true;
  document.getElementById("aboutModal").hidden = false;
});

// ---------------------------------------------------------------- API key settings

document.getElementById("apiKeySave").addEventListener("click", () => {
  const input = document.getElementById("apiKeyInput");
  const status = document.getElementById("apiKeyStatus");
  const key = input.value.trim();
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch (_) {}
  missingKeyWarned = false;
  offlineMode = false; // give the API another chance with the (new or default) key
  status.textContent = key ? "Saved. Searches will now use this key." : "Reset to the app's built-in key.";
  status.classList.toggle("is-success", true);
  status.hidden = false;
});

// ---------------------------------------------------------------- install (Android/desktop prompt + iOS instructions)

let deferredInstallPrompt = null;
const installBtn = document.getElementById("installBtn");

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

if (!isStandalone()) {
  if (isIOS()) {
    // iOS Safari has no beforeinstallprompt — show the button up front
    // and point people to the manual Add to Home Screen flow.
    installBtn.hidden = false;
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
    deferredInstallPrompt = null;
    toast("Synapse installed ✦");
  });
}

installBtn.addEventListener("click", async () => {
  vibrate([8]);
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (outcome === "accepted") installBtn.hidden = true;
  } else if (isIOS()) {
    document.getElementById("installModal").hidden = false;
  } else {
    toast("Use your browser's menu → \"Install app\" or \"Add to Home Screen\".");
  }
});
document.getElementById("feedbackBtn").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = `mailto:${MAILTO}?subject=${encodeURIComponent("Synapse feedback")}&body=${encodeURIComponent("Hi Suva,\n\n")}`;
});

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") { if (e.key === "Escape") e.target.blur(); return; }
  if (e.key === "/") { e.preventDefault(); searchInput.focus(); }
  else if (e.key === " ") { e.preventDefault(); document.getElementById("btnFreeze").click(); }
  else if (e.key === "Escape") { closeInspector(); document.querySelectorAll(".modal-backdrop").forEach(closeModal); }
  else if (e.key.toLowerCase() === "r") { document.getElementById("btnShuffle").click(); }
  else if (e.key.toLowerCase() === "f") { document.getElementById("btnRecenter").click(); }
});

// ---------------------------------------------------------------- starfield background

function initStardust() {
  const canvas = document.getElementById("stardust");
  const ctx = canvas.getContext("2d");
  let stars = [];
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const count = Math.floor((canvas.width * canvas.height) / 9000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.2,
      s: Math.random() * 0.15 + 0.02,
      a: Math.random() * 0.6 + 0.2,
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    stars.forEach(st => {
      st.y += st.s;
      if (st.y > canvas.height) st.y = 0;
      ctx.globalAlpha = st.a;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resize);
  resize();
  draw();
}

// ---------------------------------------------------------------- boot

function initGraph() {
  const svg = document.getElementById("graphSvg");
  graph = new ConstellationGraph(svg, {
    onNodeTap: (d) => {
      vibrate([8]);
      if (d.kind === "topic") focusTopicById(d.id);
      else focusTaxonomyNode(d);
    },
    onBackgroundTap: () => closeInspector(),
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

(function boot() {
  initStardust();
  initGraph();
  renderSeedTicker();
  updateCodexCount();
  registerServiceWorker();

  // Quick connectivity probe so we fail over to mock data proactively.
  fetch(`${API_BASE}?per_page=1&mailto=${MAILTO}`).catch(() => setOffline(true));
})();
