// Offline support. Pages are fetched fresh when there is a connection and
// fall back to the last copy when there is not. Built assets have content
// hashes in their names, so they are served from the cache once fetched.
// Everything else (card art, icons) is served from the cache and refreshed
// in the background.

const CACHE = 'solitaire-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add('./')));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Each language has its own page (/ and /da/), kept under its own address
    // without the query (?deal=...), so offline play opens the right one.
    const page = url.origin + url.pathname;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(page, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(page)) ?? caches.match('./')),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const hashed = url.pathname.includes('/assets/');
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached && hashed) return cached;
      return cached ?? refresh;
    }),
  );
});
