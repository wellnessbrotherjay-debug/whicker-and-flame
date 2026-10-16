// Offline fallback only: pages and built files come from the network first; when the network is gone,
// the last copy is used so recipes already opened still read in the kitchen. Accounts and the API are never cached.
const CACHE = 'wh-v1';
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(c => c.add('/'))); });
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/go/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && (event.request.mode === 'navigate' || url.pathname.startsWith('/assets/'))) {
      const copy = response.clone();
      caches.open(CACHE).then(c => c.put(event.request.mode === 'navigate' ? '/' : event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request.mode === 'navigate' ? '/' : event.request)));
});
