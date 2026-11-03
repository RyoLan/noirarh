// Lets the panel install as an app. The panel needs the live gateway anyway, so this caches
// only the static shell for a fast start and never caches /api or the token-bearing page.
const SHELL = 'noira-shell-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(['manifest.webmanifest', 'icon-192.png', 'icon-512.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.endsWith('.html')) return;
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.open(SHELL).then(async c => (await c.match(e.request)) ?? fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
  }
});
