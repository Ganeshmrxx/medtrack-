const CACHE_NAME = 'medtrack-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});

// For background notification logic (placeholder)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-stock') {
        // This is where background checks would happen
        // Requires Periodic Background Sync API
    }
});
