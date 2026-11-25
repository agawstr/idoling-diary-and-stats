/* sw.js — service worker untuk Idoling Diary (PWA).
   Strategi:
   - Shell (html/css/js/ikon): jaringan dulu dengan batas waktu (NET_TIMEOUT). Selalu divalidasi ulang ke server (ETag -> 304 kalau
              tidak berubah, jadi hemat kuota); kalau jaringan lambat/mati dipakai salinan cache -> kode baru langsung terpakai, tetap jalan offline
   - data.json: sama, tetapi yang divalidasi adalah URL kanonik (tanpa ?t=...) supaya ETag bisa bekerja
   - photos/: cache dulu. Semua foto yang ada di data.json (thumbnail dulu, lalu foto penuh) diunduh otomatis di background
              setiap data.json berhasil dimuat, jadi galeri tetap lengkap saat offline tanpa harus dibuka satu per satu.
              Dilewati kalau pengunjung memakai Mode Hemat Data; hanya satu proses unduh berjalan pada satu waktu
   - Google Fonts: pakai cache dulu, diperbarui di belakang
   - admin.html & request non-GET: tidak disentuh
   Naikkan VERSION kalau daftar SHELL berubah (cache shell lama dihapus). Cache foto/font/data sengaja TIDAK ikut VERSION:
   foto tidak berubah antar rilis kode, jadi pengunjung tidak perlu mengunduh ulang ~3,6 MB tiap rilis. */
const VERSION = 'v23';
const NET_TIMEOUT = 3500; // ms: lebih lambat dari ini dan sudah ada salinan -> pakai salinan, jaringan tetap memperbarui cache di belakang
const SHELL_CACHE = 'shell-' + VERSION;
const PHOTO_CACHE = 'photos-v2'; // nama file foto unik (id/timestamp); naikkan angka ini hanya bila skema foto berubah
const FONT_CACHE = 'fonts-v1';
const DATA_CACHE = 'data-v1';
const KEEP = [SHELL_CACHE, PHOTO_CACHE, FONT_CACHE, DATA_CACHE];
const MAX_PHOTOS = 400; // thumbnail + foto penuh; 150 hampir penuh (134 thumbnail saja) -> saling menggusur

let warmed = false;

const SHELL = [
  './', 'index.html',
  'assets/css/shared.css', 'assets/css/app.css', 'assets/css/liquid.css', 'assets/css/splash.css', 'assets/js/shared/core.js', 'assets/js/shared/stats.js', 'assets/js/shared/views.js', 'assets/js/shared/share.js', 'assets/js/shared/tickets.js', 'assets/js/shared/motion.js', 'assets/js/shared/extras.js', 'assets/js/shared/members.js', 'assets/js/shared/compare.js', 'assets/js/shared/subtabs.js', 'assets/js/app.js', 'assets/js/liquid.js', 'assets/js/splash.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    // satu file gagal tidak boleh menggagalkan seluruh instalasi
    await Promise.allSettled(SHELL.map(u => c.add(new Request(u, {cache: 'reload'}))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => !KEEP.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function trim(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(e, req, cacheName, key, netReq) {
  const c = await caches.open(cacheName);
  const find = () => c.match(key || req, {ignoreSearch: !key});
  const net = fetch(netReq || req, {cache: 'no-cache'}).then(res => {
    if (res && res.ok) c.put(key || req, res.clone());
    return res;
  });
  net.catch(() => {}); // kalah balapan / gagal: jangan jadi unhandled rejection
  let timer;
  const slow = new Promise(r => { timer = setTimeout(() => r(null), NET_TIMEOUT); });
  try {
    const res = await Promise.race([net, slow]);
    if (res && res.status < 500) return res;
    const hit = await find();
    if (hit) { if (!res && e) e.waitUntil(net.catch(() => {})); return hit; }
    return res || await net; // belum ada salinan: tunggu jaringan apa adanya
  } catch (err) {
    const hit = await find();
    if (hit) return hit;
    throw err;
  } finally { clearTimeout(timer); }
}

async function cacheFirst(req, cacheName, max) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) { c.put(req, res.clone()); if (max) trim(cacheName, max); }
  return res;
}

// Mode Hemat Data: jangan menyedot ~3,6 MB foto di background. Foto yang dibuka tetap tersimpan lewat cacheFirst.
const saveData = () => { const n = self.navigator && self.navigator.connection; return !!(n && n.saveData); };

// unduh semua foto yang dirujuk data.json ke cache, yang belum ada saja; thumbnail (dipakai galeri) lebih dulu, foto penuh setelahnya
let precaching = null;
function precachePhotos(res) {
  if (saveData()) return Promise.resolve();
  if (!precaching) precaching = doPrecache(res).catch(() => {}).finally(() => { precaching = null; });
  return precaching; // pemanggil kedua (mis. pemicu kunjungan pertama + data.json) ikut menunggu proses yang sama, tidak mengunduh ganda
}
async function doPrecache(res) {
  let data;
  try { data = await res.json(); } catch (err) { return; }
  const found = new Set();
  (function walk(o) {
    if (typeof o === 'string') { if (/^photos\/[\w.-]+$/.test(o)) found.add(o); }
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') Object.values(o).forEach(walk);
  })(data);
  const abs = p => new URL(p, self.registration.scope).href;
  const urls = [...[...found].map(p => abs(p.replace('photos/', 'photos/t/'))), ...[...found].map(abs)];
  const c = await caches.open(PHOTO_CACHE);
  const todo = [];
  for (const u of urls) if (!(await c.match(u))) todo.push(u);
  for (let i = 0; i < todo.length; i += 6) { // sedikit demi sedikit supaya tidak menyaingi pemuatan halaman
    await Promise.allSettled(todo.slice(i, i + 6).map(u => c.add(u)));
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }
  if (url.origin !== location.origin) return;

  // kunjungan pertama: data.json dimuat sebelum SW aktif, jadi pemicu di data.json belum jalan. Hangatkan cache foto sekali per hidup SW.
  if (!warmed && !url.pathname.endsWith('/data.json')) {
    warmed = true;
    e.waitUntil((async () => {
      try { await precachePhotos(await fetch(new URL('data.json', self.registration.scope).href, {cache: 'no-store'})); } catch (err) { warmed = false; }
    })());
  }

  const path = url.pathname;
  if (path.endsWith('/admin.html')) return; // halaman admin selalu langsung ke jaringan

  // data.json: kunci cache tetap walau URL membawa ?t=... (anti cache browser)
  if (path.endsWith('/data.json')) {
    const key = new URL('data.json', self.registration.scope).href;
    const work = (async () => {
      const res = await networkFirst(e, req, DATA_CACHE, key, key); // validasi URL kanonik (ETag), bukan ?t=...
      return {res, copy: res && res.ok ? res.clone() : null}; // salinan dibuat sebelum halaman membaca isinya
    })();
    e.respondWith(work.then(w => w.res));
    e.waitUntil(work.then(w => w.copy ? precachePhotos(w.copy) : null).catch(() => {}));
    return;
  }

  // foto & thumbnail
  if (path.includes('/photos/')) {
    e.respondWith(cacheFirst(req, PHOTO_CACHE, MAX_PHOTOS));
    return;
  }

  // buka halaman: jaringan dulu, offline jatuh ke index.html tersimpan
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try { return await networkFirst(e, req, SHELL_CACHE); }
      catch (err) {
        const c = await caches.open(SHELL_CACHE);
        return (await c.match('index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // css / js / ikon / manifest
  e.respondWith(networkFirst(e, req, SHELL_CACHE));
});
