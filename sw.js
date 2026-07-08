/* PR Upper/Lower — offline cache (v5: ασφαλές για iOS navigations) */
const CACHE = 'pruplo-v5';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-180.png'];

/* Ποτέ μην επιστρέφεις/αποθηκεύεις redirected response σε navigation — το iOS το απορρίπτει και η σελίδα κολλάει */
function sanitize(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then(b => new Response(b, {
    status: 200,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/html; charset=utf-8' }
  }));
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  /* Navigations: φρέσκο δίκτυο με νέο request (redirect:follow), αλλιώς cached index */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-store' })
        .then(sanitize)
        .then(res => {
          if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* Λοιπά GET: network-first, cache μόνο καθαρές (ok, basic, όχι redirected) απαντήσεις */
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && res.type === 'basic' && !res.redirected) {
          const cp = res.clone();
          caches.open(CACHE).then(c => c.put(req, cp));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
