/* 360 Tours service worker — minimal installability + offline resilience.
 *
 * Strategy: network-first with cache fallback for same-origin GET requests.
 * Successful responses are cached for offline use; navigations fall back to
 * the cached entry when the network is unavailable. Versioned static assets
 * (Vite hashes) are naturally evicted as new builds land. */
const CACHE_NAME = '360-tours-v1';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin GET requests; let everything else hit the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached => {
          if (cached) return cached;
          if (isNavigation) {
            return caches.match('/index.html').then(fallback => fallback || Response.error());
          }
          return Response.error();
        })
      )
  );
});
