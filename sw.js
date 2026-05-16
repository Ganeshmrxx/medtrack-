const CACHE_NAME = 'medtrack-v4';


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
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            }));
        })
    );
});

self.addEventListener('fetch', (e) => {
    // Skip caching for API calls
    if (e.request.url.includes('/api/')) {
        return;
    }

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
