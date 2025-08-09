/* =========================================================
   Service Worker -- Second Cerveau OS Ultra
   - Cache différencié
   - Navigation Preload
   - Gestion offline totale
   - LRU purge
   - Update instantanée
========================================================= */

const VERSION = "v3.0.0";
const STATIC_CACHE = `scos-static-${VERSION}`;
const RUNTIME_CACHE = `scos-runtime-${VERSION}`;
const API_CACHE = `scos-api-${VERSION}`;

const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png"
];

const STATIC_EXTS = [".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".json", ".woff", ".woff2", ".ttf"];
const API_HOSTS = ["api.open-meteo.com", "api.quotable.io"];

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; } catch { return false; }
}
function hasStaticExt(url) {
  return STATIC_EXTS.some(ext => url.endsWith(ext));
}
async function putInCache(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  try { await cache.put(request, response.clone()); } catch {}
  return response;
}
async function limitCache(cacheName, maxEntries = 50) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await cache.delete(keys[0]);
    return limitCache(cacheName, maxEntries);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![STATIC_CACHE, RUNTIME_CACHE, API_CACHE].includes(k)).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;
  if (request.method !== "GET") return;

  // Navigation (pages)
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        const net = await fetch(request, { cache: "no-store" });
        await putInCache(RUNTIME_CACHE, request, net.clone());
        return net;
      } catch {
        const cached = await caches.match(request);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  const u = new URL(url);

  // API externes : network-first + cache limité
  if (API_HOSTS.includes(u.hostname)) {
    event.respondWith((async () => {
      try {
        const net = await fetch(request, { cache: "no-store" });
        await putInCache(API_CACHE, request, net.clone());
        await limitCache(API_CACHE, 30);
        return net;
      } catch {
        return await caches.match(request) || new Response(JSON.stringify({ offline: true }), { headers: { "Content-Type": "application/json" } });
      }
    })());
    return;
  }

  // Statique local : stale-while-revalidate
  if (isSameOrigin(url) && hasStaticExt(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request).then((net) => {
        cache.put(request, net.clone());
        return net;
      }).catch(() => null);
      return cached || fetchPromise || caches.match("./index.html");
    })());
    return;
  }

  // Autres mêmes origine : cache-first + refresh
  if (isSameOrigin(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        fetch(request).then(res => putInCache(RUNTIME_CACHE, request, res)).catch(()=>{});
        return cached;
      }
      try {
        const net = await fetch(request);
        await putInCache(RUNTIME_CACHE, request, net.clone());
        await limitCache(RUNTIME_CACHE, 50);
        return net;
      } catch {
        return caches.match("./index.html");
      }
    })());
  }
});