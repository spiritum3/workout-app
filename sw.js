/* LiftMate — offline cache (v23: φόρτιση ανά ομάδα από την εβδομάδα) */
const CACHE = 'liftmate-v3';
const ASSETS = ['./', './index.html', './manifest.json', './support.js', './pr3d.js?v=27',
  './ds/modernist-870f250c-185c-454a-b379-126cde1f86a3/styles.css',
  './vendor/react.production.min.js', './vendor/react-dom.production.min.js', './vendor/babel.min.js',
  './vendor/three.module.js', './vendor/three.core.js',
  './icon-192.png', './icon-512.png', './icon-180.png', './uploads/r0t0r-click-151673.mp3'];

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
