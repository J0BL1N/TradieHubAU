/**
 * service-worker.js
 * Basic offline support for PWA
 */
const CACHE_NAME = 'ath-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/css/main/style.css',
  '/js/core/script.js',
  '/js/core/data.js',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/feather-icons/dist/feather.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
