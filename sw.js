/* Bones' offline copy. index.html registers this worker; it keeps Bones' own files
   (the page, its manifest and its icons) so the game opens with no network after
   one visit. It answers for those files only. Every other request (the other
   games on this site, the Anthropic API, anything on another origin) is left
   alone: the worker never calls respondWith for it, so the browser fetches it
   exactly as if there were no worker.
   The page is network-first (a new version arrives as soon as the player is
   online; the cache is the fallback); the manifest and icons are cache-first.
   Change VERSION whenever these files change: the old caches are deleted. */
'use strict';
const VERSION = 'bones-v3';
const SCOPE = self.registration.scope; // e.g. https://host/ or https://host/novatria/
const CACHE = VERSION + ' ' + SCOPE;   // the scope in the name: two copies of the site on one origin keep apart
const PAGE = 'index.html';
const FILES = [PAGE, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const OWN = new Set(FILES.map(f => new URL(f, SCOPE).href));
const PAGE_URL = new URL(PAGE, SCOPE).href;

// The file a request is for, by path only (a ?query is ignored); the scope itself is the page. Null: not Bones'.
function ownFile(request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  const bare = url.origin + url.pathname;
  if (bare === SCOPE) return PAGE_URL;
  return OWN.has(bare) ? bare : null;
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(FILES.map(f => new Request(new URL(f, SCOPE).href, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('bones-') && k.endsWith(' ' + SCOPE) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function fromNetworkFirst(request, key) {
  const cache = await caches.open(CACHE);
  try {
    // A fresh Request: a navigation's own cannot be given options. no-cache: ask the server, so a new page is never held back.
    const response = await fetch(new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }));
    if (response.redirected) return fetch(request); // a redirect is the browser's to follow, not the worker's
    if (response.ok && response.type === 'basic') await cache.put(key, response.clone());
    return response;
  } catch (e) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw e;
  }
}

async function fromCacheFirst(request, key) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(key, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const key = ownFile(event.request);
  if (!key) return; // not Bones': the browser fetches it as usual
  event.respondWith(key === PAGE_URL ? fromNetworkFirst(event.request, key) : fromCacheFirst(event.request, key));
});
