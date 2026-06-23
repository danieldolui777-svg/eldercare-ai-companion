// Minimal service worker — enables "Add to Home Screen" / installability.
// Network-first passthrough; we deliberately do NOT cache API/audio responses.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", () => {
  // Let the browser handle requests normally (no offline caching for now).
});
