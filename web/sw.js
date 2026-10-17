








const BUILD = '__BUILD_ID__';
const CACHE = 'psd_editor-' + BUILD;
const PRECACHE = [];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('psd_editor-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const HASHED = /\/[a-z]{3,}\.[a-f0-9]{8,}\.(js|css)$/i;
const DYNAMIC = /^\/(api|mcp)(\/|$)|^\/(health|openapi\.json|sw\.js)$/;

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') c.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || DYNAMIC.test(url.pathname)) return;
  if (HASHED.test(url.pathname)) { e.respondWith(cacheFirst(req)); return; }
  if (req.mode === 'navigate' || /\.(html|webmanifest)$/.test(url.pathname) || url.pathname.startsWith('/assets/')) e.respondWith(networkFirst(req));
});
