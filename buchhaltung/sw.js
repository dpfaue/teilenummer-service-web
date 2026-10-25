/* Service Worker – Buchhaltung: Oberfläche offline verfügbar, Daten immer frisch vom Server. */
const CACHE = 'tns-buch-v1';
const SHELL = ['./', 'index.html', 'style.css?v=1', 'app.js?v=1', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-180.png', 'icons/favicon-64.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('tns-buch-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
