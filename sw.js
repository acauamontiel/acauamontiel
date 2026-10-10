// Service worker do Crazy Astra: rede primeiro (sempre a versão nova quando online), cache como reserva
// para jogar offline. Os GLB e o three.js ficam em cache depois da primeira visita.
const CACHE = 'crazy-astra-v3';
const CORE = ['./', './index.html', './manifest.webmanifest', './css/style.css', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // cache: 'no-cache' revalida no servidor (ETag/304) em vez de aceitar o cache HTTP do navegador: evita misturar
    // um módulo JS novo com outro antigo depois de uma atualização.
    fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
