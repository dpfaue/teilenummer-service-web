/* Service Worker – hält die App-Oberfläche offline verfügbar und zeigt Push-Nachrichten an.
   Daten kommen immer frisch vom Server. */
const CACHE = 'tns-app-v4';
const SHELL = ['./', 'index.html', 'style.css?v=4', 'app.js?v=4', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/favicon-64.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Apps Script, Gmail, Firebase usw. nie cachen
  // Netzwerk zuerst (damit Updates sofort ankommen), bei Offline aus dem Cache
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: false }).then(m => m || caches.match('index.html'))));
});

/* ---------- Push (Firebase Cloud Messaging, reine Daten-Nachrichten) ---------- */
function readPush(e) {
  if (!e.data) return {};
  try {
    const j = e.data.json();
    if (j.data) return j.data;
    if (j.notification) return { title: j.notification.title, body: j.notification.body };
    return j;
  } catch (err) {
    try { return { body: e.data.text() }; } catch (err2) { return {}; }
  }
}

self.addEventListener('push', e => {
  const d = readPush(e);
  const n = parseInt(d.badge, 10);
  const jobs = [
    self.registration.showNotification(d.title || 'Teilenummer.Service', {
      body: d.body || '',
      icon: 'icons/icon-192.png',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || '' }
    }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(cs => cs.forEach(c => c.postMessage({ type: 'refresh' })))
  ];
  if (!isNaN(n) && self.navigator && 'setAppBadge' in self.navigator) {
    jobs.push((n > 0 ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  e.waitUntil(Promise.all(jobs));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || '';
  const target = new URL('./' + (hash.charAt(0) === '#' ? hash : ''), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.indexOf(self.registration.scope) === 0) {
        c.postMessage({ type: 'open', url: hash });
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
