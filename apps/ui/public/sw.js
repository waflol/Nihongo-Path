// Nihongo Path service worker (docs/plans/plan-pwa.md).
//
// It never caches pages, API responses or learning data — those are
// per-account and a device can be shared. Its jobs:
//   P0  make the site installable, and show /offline.html instead of the
//       browser's error page when a page is opened without a connection;
//   P2  show the daily review reminder (Web Push) and open the review page
//       when it is tapped;
//   P3  cache-first for content-hashed build files (/_next/static) and icons,
//       ONLY when registered from a production build (`?static=1`). Under
//       `next dev` those files are not hashed and caching them breaks HMR.
//
// Bump VERSION whenever offline.html or the caching rules change, so old
// caches are dropped on activate.
const VERSION = "v2";
const OFFLINE_CACHE = `nihongo-offline-${VERSION}`;
const STATIC_CACHE = `nihongo-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const STATIC_CACHING = new URL(self.location.href).searchParams.get("static") === "1";
/** Cap the static cache so old build chunks don't pile up across deploys. */
const STATIC_MAX_ENTRIES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([OFFLINE_CACHE, ...(STATIC_CACHING ? [STATIC_CACHE] : [])]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("nihongo-") && !keep.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    // Oldest first (insertion order) — trim the overflow.
    for (const key of keys.slice(0, Math.max(0, keys.length - STATIC_MAX_ENTRIES))) {
      await cache.delete(key);
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (STATIC_CACHING) {
    const url = new URL(request.url);
    if (
      url.origin === self.location.origin &&
      (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))
    ) {
      event.respondWith(cacheFirst(request));
      return;
    }
  }

  // Otherwise only full page loads; everything else goes straight to the network.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return (
        cached ??
        new Response("Mất kết nối mạng.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    }),
  );
});

// P2 — payload sent by apps/api NotificationsService: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Nihongo Path";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Đến giờ ôn tập rồi!",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "nihongo",
      lang: "vi",
      data: { url: data.url || "/learn/review" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/learn/review";
  // Only ever open our own origin, whatever the payload says.
  const target = new URL(path, self.location.origin);
  const url = target.origin === self.location.origin ? target.href : self.location.origin + "/learn/review";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) return client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
