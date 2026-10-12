// Pulled into the generated service worker: tapping a trip notification
// opens (or focuses) the app at the page the notification names.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate?.(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
