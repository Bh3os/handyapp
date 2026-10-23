/* global self, caches */
// The staff app's service worker (TSK-0079; HH-OFF-01, HH-OFF-02, HH-OFF-04). It keeps only the app itself available
// without a network: the page and its built assets. It never caches an API answer: the job packets kept offline are
// the app's own verified IndexedDB copies (src/offline), chosen per assignment and purged when it ends. Every write
// still goes to the server; offline it fails and the app says so, or saves a draft it labels "Saved on this phone".
const SHELL = 'hh-staff-shell-v1'
const PAGE = new URL('./', self.registration.scope).href

async function precache() {
  const cache = await caches.open(SHELL)
  const res = await fetch(PAGE, { cache: 'no-store' })
  if (!res.ok) return
  const html = await res.clone().text()
  await cache.put(PAGE, res)
  // The built assets the page names (the scripts and styles under /assets/).
  const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => new URL(m[1], PAGE).href)
  await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)))
}

// TSK-0080 (HH-OFF-07, T52): the first version takes over at once; a new version waits until the person chooses to
// update (the app warns first when work is not uploaded yet, then sends SKIP_WAITING).
self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => (self.registration.active ? undefined : self.skipWaiting())))
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('hh-staff-') && k !== SHELL).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (req.mode === 'navigate') {
    // The network first, so a new release and the server's own redirects win; the kept page only when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            void caches.open(SHELL).then((c) => c.put(PAGE, copy))
          }
          return res
        })
        .catch(() =>
          caches
            .open(SHELL)
            .then((c) => c.match(PAGE))
            .then((hit) => hit ?? Response.error()),
        ),
    )
    return
  }
  if (url.pathname.includes('/assets/')) {
    // Built assets have content-hashed names: a kept copy is always the right one.
    event.respondWith(
      caches.open(SHELL).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ??
            fetch(req).then((res) => {
              if (res.ok) void c.put(req, res.clone())
              return res
            }),
        ),
      ),
    )
  }
})
