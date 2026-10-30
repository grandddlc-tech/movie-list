/* Reel List service worker — makes the app work offline.
   Bump VERSION whenever you change any app file so phones pick up the update. */
const VERSION = 'v1';
const APP_CACHE = 'reellist-app-' + VERSION;
const FONT_CACHE = 'reellist-fonts';
const POSTER_CACHE = 'reellist-posters';
const MAX_POSTERS = 400;

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

const POSTER_HOSTS = ['image.tmdb.org', 'm.media-amazon.com', 'ia.media-imdb.com'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('reellist-app-') && k !== APP_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

async function trimCache(name, max){
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

// App files: answer instantly from the cache, refresh the cache in the background.
async function appShell(request){
  const cache = await caches.open(APP_CACHE);
  const key = request.mode === 'navigate' ? './index.html' : request;
  const cached = await cache.match(key, {ignoreSearch: true});
  const fresh = fetch(request).then(res => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await fresh) || new Response('Offline', {status: 503, statusText: 'Offline'});
}

// Posters & fonts: use the cached copy if we have one, otherwise download and keep it.
async function cacheFirst(request, cacheName, max){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque'){
      cache.put(request, res.clone());
      if (max) trimCache(cacheName, max);
    }
    return res;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin){
    event.respondWith(appShell(req));
  } else if (POSTER_HOSTS.includes(url.hostname)){
    event.respondWith(cacheFirst(req, POSTER_CACHE, MAX_POSTERS));
  } else if (FONT_HOSTS.includes(url.hostname)){
    event.respondWith(cacheFirst(req, FONT_CACHE));
  }
  // Everything else (TMDB / OMDb searches) goes straight to the network.
});
