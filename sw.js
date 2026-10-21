// Rum to Riches service worker.
// Caches the app shell so the game opens offline. It NEVER touches /api/ (game state always comes from the server).
// Bump VERSION whenever the shell changes shape; old caches are deleted on activate.
const VERSION = "v1";
const CACHE = `rtr-shell-${VERSION}`;
const SHELL = [
  "/", "/index.html", "/404.html", "/manifest.webmanifest",
  "/src/styles.css", "/src/app.js", "/src/api.js", "/src/views.js", "/src/chart.js", "/src/pin.js", "/src/favicon.svg",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rtr-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) return; // live data only

  // Network first so a new deploy shows up straight away; fall back to the cache when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === "navigate") return (await caches.match("/index.html")) || Response.error();
        return Response.error();
      })
  );
});
