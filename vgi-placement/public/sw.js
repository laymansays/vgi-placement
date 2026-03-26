/* ═══════════════════════════════════════════════════════
   VGI Placement — Service Worker
   Caches app shell for fast load; data always fetched live
   ═══════════════════════════════════════════════════════ */

// Bump this version string whenever you deploy new files.
// Changing it forces all users to get fresh files immediately.
const CACHE = 'vgi-placement-v3';

const STATIC = [
  'logo.jpg',
  'manifest.json',
  'shared.js',
];

/* Install — only pre-cache true static assets (not HTML) */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

/* Activate — delete ALL old caches, claim clients immediately */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Fetch strategy:
   - Google APIs / Sheets / Drive / Fonts → always network (never cache)
   - HTML documents                        → network-first, cache as offline fallback
   - Everything else (JS, CSS, images)     → cache-first, revalidate in background
*/
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always bypass for Google services
  if (
    url.hostname.includes('google') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('fonts.g') ||
    url.hostname.includes('clearbit') ||
    url.hostname.includes('script.google')
  ) { return; }

  // HTML pages — network-first so users always get the latest version
  if (e.request.destination === 'document' || e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))  // offline fallback
    );
    return;
  }

  // Static assets — cache-first, update in background (stale-while-revalidate)
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(res => {
          if (res && res.status === 200 && url.origin === self.location.origin) {
            cache.put(e.request, res.clone());
          }
          return res;
        }).catch(() => null);
        return cached || fetchPromise;
      })
    )
  );
});
