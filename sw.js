/* 暖言小站 Service Worker：仅负责 Web Push 通知，不做离线缓存 */
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  const title = d.title || '暖言小站';
  const options = {
    body: d.body || '你的反馈有新进展',
    icon: '/static/icon-512.png',
    badge: '/static/apple-touch-icon.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/#/mine' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/#/mine';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('focus' in c) {
        try { await c.navigate(target); } catch (err) { /* 忽略跨域导航失败 */ }
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
