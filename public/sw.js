const CACHE_NAME = 'racepushbike-shell-v1'
const SHELL_URLS = ['/', '/quick', '/icon.png', '/apple-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .catch(() => undefined)
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/_next/')) return

  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((cached) => cached ?? caches.match('/quick/motos')))
  )
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    const payload = event.data.json()
    const title = payload.title || 'RacePushBike'
    const options = {
      body: payload.body || '',
      icon: payload.icon || '/icon.png',
      badge: '/icon.png',
      data: payload.data || {},
      vibrate: [200, 100, 200],
    }
    
    event.waitUntil(self.registration.showNotification(title, options))
  } catch (err) {
    console.error('Failed to parse push payload:', err)
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url
  if (url && typeof url === 'string' && url.startsWith('/')) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        // If window already open, focus it and navigate
        for (let client of windowClients) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(url)
        }
      })
    )
  }
})
