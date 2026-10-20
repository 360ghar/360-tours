/* 360 Tours service worker — minimal installability + offline resilience.
 *
 * Strategy: network-first with cache fallback for same-origin GET requests.
 * Successful responses are cached for offline use; navigations fall back to
 * the cached entry when the network is unavailable. Versioned static assets
 * (Vite hashes) are naturally evicted as new builds land.
 *
 * Account data never enters the cache. The backend marks every account response
 * `Cache-Control: private, no-store`, and the cache outlives sign-out, so this
 * worker (1) leaves `/api/` and `/ws/` to the network, (2) skips a request that
 * carries an Authorization header and (3) skips a response that says `no-store`
 * or `private`. */
const CACHE_NAME = '360-tours-v2';

const NETWORK_ONLY_PATH = /^\/(api|ws)\//;
const UNCACHEABLE = /no-store|private/i;

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

// The activate step deletes every cache but the current one, so the v1 cache
// (which could hold same-origin API responses) is removed on the first load.
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
  if (NETWORK_ONLY_PATH.test(url.pathname) || request.headers.has('Authorization')) return;

  const isNavigation = request.mode === 'navigate';

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && !UNCACHEABLE.test(response.headers.get('Cache-Control') || '')) {
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
