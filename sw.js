/* ================================================================
   PLAN ZMIAN — Service Worker (PWA)
   Cache'owanie + powiadomienia push o zmianach
   ================================================================ */
const CACHE_NAME = 'plan-zmian-' + '__BUILD_ID__';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/calendar.css',
  './css/components.css',
  './css/dashboard.css',
  './css/layout.css',
  './css/overtime.css',
  './css/print.css',
  './css/responsive.css',
  './css/smart-popup.css',
  './css/app-shell.css',
  './css/variables.css',
  './css/views.css',
  './js/schedules/_core.js',
  './js/schedules/_registry.js',
  './js/schedules/gillette/metadata.js',
  './js/schedules/gillette/2026.js',
  './js/schedules/remote.js',
  './js/personal/sync-tracking.js',
  './js/personal/notes-tracking.js',
  './js/overtime-logic.js',
  './js/core.js',
  './js/ui.js',
  './js/edit.js',
  './js/dashboard.js',
  './js/smart-popup.js',
  './js/calendar.js',
  './js/views.js',
  './js/actions.js',
  './js/pwa.js',
  './js/sync.js',
  './js/admin.js',
  './js/i18n/pl.js',
  './js/i18n/en.js',
  './js/i18n/uk.js',
  './js/i18n/i18n.js',
  './js/personalization.js',
  './js/app-shell.js',
  './js/settings.js',
  './js/admin-center.js',
  './js/notes-view.js',
  './js/main.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

/* === INSTALL: cache'ujemy wszystkie zasoby ===
   cache.addAll() is all-or-nothing: a single 404 or flaky request rejects the
   whole install, so the new service worker never activates and the user stays
   on the old build with no visible error. We therefore cache the app shell
   (index.html + './') strictly and everything else best-effort, logging what
   failed instead of aborting the update. */
const CRITICAL_ASSETS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(CRITICAL_ASSETS);
        const rest = ASSETS.filter((a) => !CRITICAL_ASSETS.includes(a));
        const results = await Promise.allSettled(rest.map((a) => cache.add(a)));
        const failed = results
          .map((r, i) => (r.status === 'rejected' ? rest[i] : null))
          .filter(Boolean);
        if (failed.length) {
          console.warn('[SW] not precached (will be fetched on demand):', failed);
        }
      })
      .then(() => self.skipWaiting())
  );
});

/* === ACTIVATE: usuwamy stare cache === */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

/* === FETCH ===
   Strategy per resource type:

   • App shell (navigations, index.html, css/, js/) — NETWORK FIRST.
     The old cache-first strategy served the app shell from Cache Storage, and
     because the cache name only changes when `sw.js` itself changes (its
     `__BUILD_ID__` placeholder is substituted in CI), a new deploy was
     invisible until the worker was unregistered by hand. Network-first fixes
     that: a fresh copy is always used when online, the cache is only the
     offline fallback.
   • Everything else (icons, images, fonts) — CACHE FIRST + background
     revalidate (stale-while-revalidate), because those files are immutable. */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Ignore requests from browser extensions (chrome-extension://, moz-extension://, etc.)
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  event.respondWith(
    (function handleRequest() {
      // API traffic must never be served stale from the cache-first strategy:
      // for /api/* the client keeps its own localStorage copy, and /api/admin/*
      // must never be cached at all.
      if (url.pathname.indexOf('/api/') === 0) {
        if (url.pathname.indexOf('/api/admin/') === 0) {
          return fetch(event.request);
        }
        return fetch(event.request).catch(() => new Response(null, { status: 504 }));
      }

      // Same-origin app shell → network first.
      const isShellRequest =
        event.request.mode === 'navigate' ||
        /\/(css|js)\//.test(url.pathname) ||
        /\/index\.html$/.test(url.pathname) ||
        url.pathname === '/' ||
        url.pathname === '';

      if (isShellRequest) {
        return fetch(event.request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() =>
            caches.match(event.request).then((cached) => {
              if (cached) return cached;
              if (event.request.mode === 'navigate') {
                return caches.match('./index.html').then((fallback) => fallback || Response.error());
              }
              return Response.error();
            })
          );
      }

      // Static, immutable assets → cache first, revalidate in background.
      return caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      });
    })()
  );
});

/* === PUSH: pokazujemy powiadomienia === */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Plan Zmian', body: 'Nadchodzi zmiana!' };
  }
  const options = {
    body: data.body || 'Sprawdź grafik swojej brygady',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' },
    tag: 'grafik-reminder',
  };
  event.waitUntil(self.registration.showNotification(data.title || '⏰ Plan Zmian', options));
});

/* === NOTIFICATION CLICK: open the app === */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url =
    event.notification.data && event.notification.data.url ? event.notification.data.url : './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
/* === MESSAGE: handling commands from the client === */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
