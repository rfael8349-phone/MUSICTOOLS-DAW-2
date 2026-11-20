// MUSICTOOL DAW service worker — Stage 1
// Caches the app shell. Audio recordings are NOT cached here; they live in memory
// and (Stage 5) IndexedDB.

const VERSION = 'musictool-v0.1.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './css/theme.css',
  './js/app.js',
  './js/state.js',
  './js/audio-engine.js',
  './js/recorder.js',
  './js/transport.js',
  './js/playlist.js',
  './js/storage.js',
  './js/worklets/recorder-processor.js',
  './assets/mascot.svg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok && e.request.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});