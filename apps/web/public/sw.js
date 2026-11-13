/* global self, caches, fetch, URL */
/* BricoMission service worker (hand-written; see ARCHITECTURE.md "apps/web").
 * - install: precache the manifest and icons only ("/" can redirect by locale).
 * - navigations: network-first; 200 non-redirected responses are cached; offline serves
 *   the cached copy (ignoreVary: Next varies on RSC headers).
 * - /_next/static/*, fonts and icons: cache-first.
 * - /api/*, /auth/* (sign-in, session state) and non-GET requests: never intercepted.
 * Bump VERSION to drop old caches on activate.
 */
const VERSION = 'v2';
const CACHE = `bricomission-shell-${VERSION}`;
const PRECACHE = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isCacheFirst(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(?:woff2?|ttf|otf)$/.test(url.pathname)
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.status === 200 && !response.redirected && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200 && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (isCacheFirst(url)) {
    event.respondWith(cacheFirst(request));
  }
});
