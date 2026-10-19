// apps/web/public/sw.js — NEW (E1)
//
// Deliberately minimal: this service worker exists only to let the page
// register a Background Sync tag ('attendance-sync') as a best-effort
// enhancement on browsers that support it (Chrome/Android). It does not
// cache any assets or intercept fetches — that's a separate, much larger
// scope (an offline app shell) that this feature doesn't need. The real
// cross-platform sync trigger is the page's own `window.online` listener
// (see features/attendance/offline/queue.ts) — Background Sync fires this
// event when it wakes the worker, but iOS Safari never fires it at all.
self.addEventListener("sync", (event) => {
  if (event.tag === "attendance-sync") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: "attendance-sync-requested" });
        }
      }),
    );
  }
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
