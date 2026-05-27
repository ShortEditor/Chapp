const CACHE_NAME = 'chapp-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/favicon.ico',
];

// Install Event - Pre-cache core static assets
self.addEventListener('install', (event) => {
  console.log('🤖 [Service Worker] Installing and caching static shell...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('🤖 [Service Worker] Activating & pruning stale caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log(`🤖 [Service Worker] Pruning deprecated cache: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Handle network-first and cache-first strategies
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Skip non-GET requests, non-http/https protocols, or WebSocket connections
  if (request.method !== 'GET' || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname.includes('/socket.io')) {
    return;
  }

  // 2. Network-First strategy for REST API calls (ensure we get fresh user details / statuses)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // If offline and request is media download, let it fail gracefully (Dexie handles stored Blobs)
          return caches.match(request);
        })
    );
    return;
  }

  // 3. Cache-First strategy for static scripts, styles, layouts, and fonts
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in the background to update cache (stale-while-revalidate)
        fetch(request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => { /* suppress offline background fetch error */ });
        
        return cachedResponse;
      }

      // If not in cache, fetch from network
      return fetch(request).then((networkResponse) => {
        // Cache valid static responses
        if (networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback page if offline and completely uncached request
        return caches.match('/');
      });
    })
  );
});

// 🤖 [Push Listener] Listen to incoming push events from push servers
self.addEventListener('push', (event) => {
  console.log('🤖 [Service Worker] Received push event.');
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (err) {
      data = {
        title: 'New Notification',
        body: event.data.text()
      };
    }
  }

  const options = {
    body: data.body || 'You have a new message!',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/chat'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Chapp', options)
  );
});

// 🤖 [Notification Click] Focus target tab or open a new window
self.addEventListener('notificationclick', (event) => {
  console.log('🤖 [Service Worker] Notification clicked.');
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/chat';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
