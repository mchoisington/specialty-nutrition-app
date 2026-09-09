// Minimal service worker. App shell is cached on install; data files are network-first so content updates land.
const VERSION = 'pm-v1.2.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './src/app.css', './src/app.js', './src/store.js',
  './src/engine/plan.js', './src/engine/checker.js', './src/engine/planner.js', './src/engine/grocery.js', './src/engine/nutrition.js', './src/engine/dictionary.js', './src/engine/screen.js', './src/engine/energy.js', './src/engine/group.js', './src/engine/pantry.js', './src/engine/sync.js', './src/engine/crypto.js',
  './src/ui/common.js', './src/ui/home.js', './src/ui/people.js', './src/ui/plan.js', './src/ui/check.js', './src/ui/week.js', './src/ui/grocery.js', './src/ui/log.js', './src/ui/learn.js', './src/ui/settings.js', './src/ui/today.js', './src/ui/pantry.js', './src/ui/together.js', './src/ui/breathe.js', './src/ui/recipes.js', './src/ui/recipes-edit.js', './src/ui/sharing.js', './src/ui/owner.js', './breathe.html'
];
const DATA = ['./data/sources.json', './data/conditions.json', './data/dictionaries.json', './data/foods.json', './data/recipes.json', './data/recipes-open.json', './data/recipes-usda.json', './data/articles.json'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all([...SHELL, ...DATA].map(u => cache.add(u).catch(() => null)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isData = url.pathname.includes('/data/');
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (isData) {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw new Error('offline and not cached');
      }
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  })());
});
