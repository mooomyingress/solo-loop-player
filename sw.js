/* Solo Loop Player — service worker of the hosted build (site/). build.py fills in VERSION (a content hash of the
 * shell) and SHELL (the files to precache). Never part of dist/index.html (file:// has no service worker).
 *
 * - install: precache the shell into 'slp-shell-<VERSION>' (bypassing the HTTP cache). It does NOT skip waiting: the
 *   page shows "Update ready – reload" and the new version takes over only when the user taps it (no reload while
 *   practising). On the very first install there is no old version, so it activates at once.
 * - activate: delete older 'slp-shell-*' caches, claim the open page (first install: offline from the first visit).
 * - fetch: only same-origin GET requests inside the scope are answered: navigations → the cached index.html, shell
 *   files → cache first, falling back to the network. Everything else — above all https://api.github.com (the sync) —
 *   is not intercepted at all (no respondWith): it goes straight to the network and is never cached.
 */
'use strict';
const VERSION = '0fe07f160505';
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
const CACHE = 'slp-shell-' + VERSION;
const scopeUrl = new URL(self.registration.scope);
const shellUrls = SHELL.map((f) => new URL(f, scopeUrl).href);
const INDEX = new URL('index.html', scopeUrl).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the HTTP cache (GitHub Pages sends max-age=600), so a new version never mixes in old files
    await cache.addAll(shellUrls.map((u) => new Request(u, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('slp-shell-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const m = event.data || {};
  if (m.type === 'skipWaiting') self.skipWaiting();
  else if (m.type === 'version' && event.source) event.source.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scopeUrl.origin || !url.href.startsWith(scopeUrl.href)) return; // the GitHub API and anything else: network only
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(INDEX)) || fetch(req);
    })());
    return;
  }
  const clean = url.origin + url.pathname;
  if (!shellUrls.includes(clean)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(clean)) || fetch(req);
  })());
});
