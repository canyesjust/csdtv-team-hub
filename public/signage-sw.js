/* CIC signage PWA — offline page shell only; feed always fetched live from the network */
const CACHE = 'cic-signage-v2'
const OFFLINE_FALLBACK = '/signage/offline-fallback.json'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_FALLBACK])).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('cic-signage') && name !== CACHE)
          .map((name) => caches.delete(name)),
      ),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Feed must never be cached by the service worker — stale slides persist after deletes.
  if (url.pathname.includes('/api/signage/screen/') && url.pathname.endsWith('/feed')) {
    return
  }
  if (event.request.mode === 'navigate' && url.pathname.startsWith('/signage/screen/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((r) => r || caches.match(OFFLINE_FALLBACK)),
      ),
    )
  }
})
