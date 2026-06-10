/* CIC signage PWA — cache shell + latest feed; offline fallback when empty */
const CACHE = 'cic-signage-v1'
const FEED_CACHE = 'cic-signage-feed-v1'
const OFFLINE_FALLBACK = '/signage/offline-fallback.json'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_FALLBACK])).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.pathname.includes('/api/signage/screen/') && url.pathname.endsWith('/feed')) {
    event.respondWith(handleFeed(event.request))
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

async function handleFeed(request) {
  const cache = await caches.open(FEED_CACHE)
  try {
    const res = await fetch(request)
    if (res.ok) {
      cache.put(request, res.clone())
      return res
    }
  } catch {
    /* offline */
  }
  const cached = await cache.match(request)
  if (cached) return cached
  const fallback = await caches.open(CACHE).then((c) => c.match(OFFLINE_FALLBACK))
  if (fallback) {
    return new Response(fallback.body, {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ offline: true, media: [], ticker: ['Display will resume shortly'] }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
