const CACHE = 'wacrm-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
          )
        ),
    ])
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Nova notificação', body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nova notificação', {
      body: data.body || '',
      icon: '/icon',
      badge: '/icon',
      tag: data.tag || undefined,
      data: { url: data.url || '/notifications' },
      vibrate: [180, 80, 180],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin)
    .href;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const current = clients.find((client) =>
          client.url.startsWith(self.location.origin)
        );
        if (current) {
          current.navigate(url);
          return current.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});
