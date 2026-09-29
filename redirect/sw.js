/* ================================================================
   LEGACY SITE — SELF-DESTRUCTING SERVICE WORKER
   https://servitantgit.github.io/Graffik/

   The old app registered a cache-first worker on this origin. It is
   still controlling existing visitors and would keep serving the OLD
   index.html/CSS from Cache Storage — so they would never see the
   redirect page. This worker replaces it (a changed sw.js is picked up
   automatically), wipes every cache of this origin and unregisters
   itself, handing control back to the network.
   ================================================================ */

/* === INSTALL: take over immediately === */
self.addEventListener('install', () => {
  self.skipWaiting();
});

/* === ACTIVATE: delete caches + unregister + claim clients === */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch (e) {
        /* ignore */
      }
      try {
        // Removes this worker; clients fall back to plain network requests.
        await self.registration.unregister();
      } catch (e) {
        /* ignore */
      }
      try {
        await self.clients.claim();
      } catch (e) {
        /* ignore */
      }
    })()
  );
});

/* === FETCH: never serve anything from the cache === */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() =>
      // Offline: the redirect page itself is a static file, let the browser
      // handle the failure rather than pinning an old cached response.
      Response.error()
    )
  );
});
