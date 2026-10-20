const CACHE = 'side-a-shell-v1'
const CORE = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(CORE)
      const shell = await cache.match('/')
      const html = await shell.text()
      // Vite generates these first-party hashed assets. Cache them with the matching HTML.
      const assets = [
        ...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g),
      ].map((match) => match[1])
      await cache.addAll([...new Set(assets)])
    })(),
  )
  // No skipWaiting: installing an update must not interrupt an active listening session.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key.startsWith('side-a-shell-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  // Never intercept media, YouTube requests, API responses, or non-GET mutations.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok) return response
        } catch {
          /* Return the offline screen; do not claim media is cached. */
        }
        const cache = await caches.open(CACHE)
        const fallback = await cache.match('/offline.html')
        // Static asset hosts may redirect /offline.html to /offline. A redirected cached
        // response cannot satisfy a navigation with redirect mode "manual".
        return fallback
          ? new Response(fallback.body, {
              status: 200,
              headers: fallback.headers,
            })
          : new Response('You are offline. Reconnect to play music.', {
              status: 503,
            })
      })(),
    )
    return
  }

  if (CORE.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        // Only installation precaches the shell's assets; arbitrary responses are not persisted.
        return fetch(request)
      })(),
    )
  }
})
