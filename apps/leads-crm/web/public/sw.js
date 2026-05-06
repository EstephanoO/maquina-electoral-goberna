// Tombstone Service Worker — se auto-desregistra y limpia caches viejos.
//
// Por qué: la versión anterior cacheaba bundles de Vite (index-XXX.js) y al
// rebuild aparecían 404/errors porque el filename hash cambia en cada deploy.
// El CMS web no necesita offline ni install, así que el SW agregaba bugs sin
// beneficio. Esto reemplaza al viejo y limpia el estado del browser sin que
// los usuarios tengan que ir a DevTools → Application → Unregister.
//
// Flujo cuando un user con el SW viejo entra:
//   1. Browser detecta /sw.js cambió → instala este nuevo
//   2. install: skipWaiting() — toma control inmediato
//   3. activate: borra TODOS los caches Y se desregistra
//   4. Recarga las pestañas abiertas para que los assets vengan de network
//
// Después de la primera visita post-deploy, no queda ningún SW registrado y
// las recargas siguientes funcionan normal.
self.addEventListener("install", (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    } catch (_e) {
      // Si algo explota, mejor un SW pasivo que un SW roto.
    }
  })());
});

// Pass-through para todas las requests mientras el activate corre.
self.addEventListener("fetch", () => {
  // No-op: dejamos que el network handler default del browser responda.
});
