// Kálamos — service worker: funciona offline depois que os dados foram abertos ou baixados.
// Os caminhos são relativos ao escopo, então funciona na raiz ou numa subpasta (GitHub Pages).
const VERSION = "kalamos-v2"; // v2: descarta caches antigos (a NVI agora só circula criptografada)
const BASE = new URL(self.registration.scope).pathname; // ex.: "/" ou "/kalamos/"
const SHELL = ["", "index.html", "manifest.webmanifest", "kalamos.svg", "icons/icon-192.png"].map((p) => BASE + p);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);

  // páginas: rede primeiro, cópia local se estiver offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(BASE + "index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match(BASE + "index.html")),
    );
    return;
  }

  // arquivos com hash e fontes: cache primeiro
  if (path.startsWith("assets/") || path.startsWith("icons/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetchAndStore(req)));
    return;
  }

  // dados do NT e do léxico (a NVI vem criptografada): devolve o que tem e atualiza por trás
  if (path.startsWith("data/")) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const net = fetchAndStore(req).catch(() => hit);
        return hit || net;
      }),
    );
  }
});

function fetchAndStore(req) {
  return fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  });
}
