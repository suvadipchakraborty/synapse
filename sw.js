const CACHE_NAME = "synapse-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/graph.js",
  "./js/mock-data.js",
  "./assets/icon-192.svg",
  "./assets/icon-512.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/og-banner.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for OpenAlex API calls (so data stays fresh when online),
// cache-first for same-origin app shell assets, so the app still boots
// and the graph still renders from mock data when fully offline.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.origin === "https://api.openalex.org") {
    event.respondWith(
      fetch(event.request).catch(() => new Response(null, { status: 504 }))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
