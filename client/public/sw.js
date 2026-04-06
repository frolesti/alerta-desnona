// Service Worker per Alerta Desnona (PWA)
// Gestiona cache offline i notificacions push
// @ts-nocheck

const CACHE_NAME = 'alerta-desnona-v1';

// Assets estàtics per cachejar (shell de l'app)
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
];

// ─── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activar immediatament sense esperar que es tanquin pestanyes
  self.skipWaiting();
});

// ─── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  // Pren control de totes les pestanyes obertes
  self.clients.claim();
});

// ─── FETCH: Network-first amb fallback a cache ───────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignorar peticions no-GET
  if (request.method !== 'GET') return;

  // API: sempre network (no cachejar dades dinàmiques)
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ ok: false, error: 'Sense connexió' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // Assets estàtics: network-first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clonar resposta per guardar al cache
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clone);
        });
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
      .then((response) => response || new Response('Offline', { status: 503 }))
  );
});

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;

  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Alerta Desnona', body: event.data.text() };
  }

  const options = {
    body: data.body || 'Nova alerta de desnonament',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || 'alerta-desnona',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      ...data.data,
    },
    actions: [
      { action: 'open', title: 'Veure detall' },
      { action: 'dismiss', title: 'Tancar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Alerta Desnona', options)
  );
});

// ─── NOTIFICATION CLICK ──────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Si ja hi ha una pestanya oberta, enfocar-la
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Si no, obrir-ne una de nova
      return self.clients.openWindow(url);
    })
  );
});

