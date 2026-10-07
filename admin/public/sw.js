// Service worker de l'administration Axone : application installable + notifications push.
// Aucune mise en cache des données : le panneau affiche toujours les chiffres en direct.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
// Requis par certains navigateurs pour proposer l'installation ; on laisse passer toutes les requêtes.
self.addEventListener('fetch', () => {})

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* message non JSON */ }
  const title = data.title || 'Axone'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'axone-admin',
      renotify: true,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) {
          c.postMessage({ type: 'open', url })
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
