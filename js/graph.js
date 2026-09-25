// Constellation graph — a thin, focused wrapper around d3-force + SVG
// rendering. Knows nothing about OpenAlex; only deals in generic
// { id, label, domain, size, isCenter } nodes and { source, target } links.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const DOMAIN_COLOR = {
  "computer science": "#37E6FF",
  "mathematics": "#37E6FF",
  "physical sciences": "#9B7BFF",
  "physics and astronomy": "#9B7BFF",
  "chemistry": "#9B7BFF",
  "social sciences": "#FFC15E",
  "economics, econometrics and finance": "#FFC15E",
  "psychology": "#FFC15E",
  "life sciences": "#4CE0A0",
  "medicine": "#4CE0A0",
  "biochemistry, genetics and molecular biology": "#4CE0A0",
};

export function colorForDomain(domainName = "") {
  const key = (domainName || "").toLowerCase();
  return DOMAIN_COLOR[key] || "#B9C4E8";
}

export class ConstellationGraph {
  constructor(svgEl, { onNodeTap, onBackgroundTap } = {}) {
    this.svgEl = svgEl;
    this.onNodeTap = onNodeTap || (() => {});
    this.onBackgroundTap = onBackgroundTap || (() => {});
    this.frozen = false;
    this.nodes = [];
    this.links = [];

    this.svg = d3.select(svgEl);
    this.root = this.svg.append("g").attr("class", "root");
    this.linkLayer = this.root.append("g").attr("class", "links");
    this.nodeLayer = this.root.append("g").attr("class", "nodes");

    this.zoom = d3.zoom()
      .scaleExtent([0.35, 3.2])
      .on("zoom", (ev) => this.root.attr("transform", ev.transform));
    this.svg.call(this.zoom);
    this.svg.on("click", (ev) => {
      if (ev.target === svgEl) this.onBackgroundTap();
    });

    this._resize();
    window.addEventListener("resize", () => this._resize());

    this.sim = d3.forceSimulation()
      .force("charge", d3.forceManyBody().strength(-260))
      .force("link", d3.forceLink().id(d => d.id).distance(l => l.distance || 110).strength(0.9))
      .force("center", d3.forceCenter(this.width / 2, this.height / 2))
      .force("collide", d3.forceCollide().radius(d => d.r + 18))
      .on("tick", () => this._tick());
  }

  _resize() {
    const rect = this.svgEl.getBoundingClientRect();
    this.width = rect.width || 360;
    this.height = rect.height || 600;
    this.svg.attr("viewBox", `0 0 ${this.width} ${this.height}`);
    if (this.sim) this.sim.force("center", d3.forceCenter(this.width / 2, this.height / 2));
  }

  /** Replace the whole graph with a fresh center node + its connections. */
  setData(nodes, links, centerId) {
    // preserve position of nodes that already existed (smooth re-bloom)
    const prevPos = new Map(this.nodes.map(n => [n.id, { x: n.x, y: n.y }]));
    this.nodes = nodes.map(n => {
      const p = prevPos.get(n.id);
      return {
        ...n,
        x: p ? p.x : this.width / 2 + (Math.random() - 0.5) * 40,
        y: p ? p.y : this.height / 2 + (Math.random() - 0.5) * 40,
      };
    });
    this.links = links.map(l => ({ ...l }));
    this.centerId = centerId;

    this.sim.nodes(this.nodes);
    this.sim.force("link").links(this.links);
    this.sim.alpha(0.9).restart();
    if (this.frozen) this.sim.stop();

    this._render();
    this._bloom(centerId);
  }

  _render() {
    // ---- links ----
    const link = this.linkLayer.selectAll("path.edge").data(this.links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
    link.exit().remove();
    link.enter().append("path").attr("class", "edge").merge(link);

    // ---- nodes ----
    const self = this;
    const node = this.nodeLayer.selectAll("g.node").data(this.nodes, d => d.id);
    node.exit().transition().duration(220).style("opacity", 0).remove();

    const enter = node.enter().append("g")
      .attr("class", d => "node" + (d.id === this.centerId ? " active" : ""))
      .style("opacity", 0)
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) self.sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) self.sim.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on("click", (ev, d) => { ev.stopPropagation(); self.onNodeTap(d); });

    enter.append("circle").attr("class", "pulse").attr("r", 14).attr("stroke", d => colorForDomain(d.domain));
    enter.append("circle").attr("class", "node-glow").attr("r", d => d.r + 6).attr("fill", d => colorForDomain(d.domain)).attr("opacity", 0.35);
    enter.append("circle").attr("class", "core").attr("r", d => d.r).attr("fill", d => colorForDomain(d.domain));
    enter.append("text").attr("text-anchor", "middle").attr("dy", d => d.r + 16).text(d => truncate(d.label, 20));

    enter.transition().duration(260).style("opacity", 1);

    const merged = enter.merge(node);
    merged.attr("class", d => "node" + (d.id === this.centerId ? " active" : ""));
    merged.select(".pulse").style("display", d => d.id === this.centerId ? null : "none");

    this._linkSel = this.linkLayer.selectAll("path.edge");
    this._nodeSel = this.nodeLayer.selectAll("g.node");
  }

  _tick() {
    if (!this._linkSel || !this._nodeSel) return;
    this._linkSel.attr("d", d => {
      const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
      const mx = (sx + tx) / 2, my = (sy + ty) / 2 - 12;
      return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
    });
    this._nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
  }

  /** Staggered elastic "bloom" for satellites of a freshly-set center node. */
  _bloom(centerId) {
    const sel = this.nodeLayer.selectAll("g.node").filter(d => d.id !== centerId);
    sel.select("circle.core")
      .attr("r", 0)
      .transition()
      .delay((d, i) => i * 55)
      .duration(520)
      .ease(d3.easeElasticOut.amplitude(1).period(0.4))
      .attr("r", d => d.r);
    sel.select("circle.node-glow")
      .attr("r", 0)
      .transition()
      .delay((d, i) => i * 55)
      .duration(520)
      .ease(d3.easeElasticOut.amplitude(1).period(0.4))
      .attr("r", d => d.r + 6);
  }

  toggleFreeze(forceState) {
    this.frozen = forceState !== undefined ? forceState : !this.frozen;
    if (this.frozen) this.sim.stop(); else this.sim.alpha(0.4).restart();
    return this.frozen;
  }

  recenter() {
    const node = this.nodes.find(n => n.id === this.centerId) || this.nodes[0];
    if (!node) return;
    const scale = 1;
    const t = d3.zoomIdentity.translate(this.width / 2 - node.x * scale, this.height / 2 - node.y * scale).scale(scale);
    this.svg.transition().duration(500).call(this.zoom.transform, t);
  }

  setActive(id) {
    this.centerId = id;
    this.nodeLayer.selectAll("g.node").attr("class", d => "node" + (d.id === id ? " active" : ""));
    this.nodeLayer.selectAll("g.node .pulse").style("display", d => d.id === id ? null : "none");
  }
}

function truncate(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
