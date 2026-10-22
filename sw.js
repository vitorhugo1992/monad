// MONAD offline: the page, its manifest, icons and curiosity facts are kept. The network is asked first, so an update
// arrives on the next opening; if it does not answer within a few seconds (or there is none), the kept copy opens instead.
const CACHE = 'monad-5';
const FILES = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './facts.json'];
const WAIT_MS = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? './' : req;   // every page address opens the one page
  const kept = () => caches.match(key, { ignoreSearch: true });
  const fresh = fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
    return res;
  });
  const slow = new Promise((resolve) => setTimeout(resolve, WAIT_MS)).then(kept);
  e.respondWith(Promise.race([fresh.catch(kept), slow.then((r) => r || fresh)]).then((r) => r || fresh));
});
