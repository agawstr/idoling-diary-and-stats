#!/usr/bin/env node
/* Test unit service worker (tanpa browser): memuat sw.js di sandbox `vm` dengan API SW palsu.
   Mencakup hal yang tidak bisa dipicu dari halaman:
     - Mode Hemat Data (navigator.connection.saveData) -> tidak ada foto yang diunduh di background
     - dua pemicu pra-unduh bersamaan -> hanya satu proses unduh (tidak ada unduhan ganda)
     - thumbnail diunduh lebih dulu daripada foto penuh
     - networkFirst: jaringan mati -> cache; respons 5xx -> cache; jaringan macet -> cache setelah NET_TIMEOUT
   Jalankan:  node scripts/sw_unit_test.js */
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok     ' : 'ERROR  ') + msg); if (!ok) fails++; };

function makeSandbox({saveData = false, fetchImpl} = {}) {
  const store = new Map(); // namaCache -> Map(url -> Response-like)
  const log = {adds: [], fetches: [], opens: 0};
  const mkCache = name => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      match: async (k) => m.get(typeof k === 'string' ? k : k.url),
      put: async (k, v) => { m.set(typeof k === 'string' ? k : k.url, v); },
      add: async (k) => { const u = typeof k === 'string' ? k : k.url; log.adds.push(u); m.set(u, {ok: true, status: 200, url: u}); },
      keys: async () => [...m.keys()].map(url => ({url})),
      delete: async (k) => m.delete(typeof k === 'string' ? k : k.url)
    };
  };
  const self = {
    addEventListener() {}, skipWaiting() {}, clients: {claim() {}},
    registration: {scope: 'https://x.test/'}, navigator: {connection: {saveData}}
  };
  const ctx = {
    self, location: {origin: 'https://x.test'}, URL, Request: class { constructor(u) { this.url = u; } }, Response: class {},
    Promise, setTimeout, clearTimeout, console,
    caches: {open: async n => { log.opens++; return mkCache(n); }, keys: async () => [...store.keys()], delete: async n => store.delete(n)},
    fetch: (...a) => { log.fetches.push(a[0]); return (fetchImpl || (async () => ({ok: true, status: 200, clone() { return this; }})))(...a); }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return {ctx, log, store};
}

const dataRes = () => ({json: async () => ({records: [{photo: 'photos/a.jpg'}, {photo: 'photos/b.jpg'}], solo: [{photo: 'photos/c.jpg'}]})});

(async () => {
  // 1. Data Saver
  {
    const {ctx, log} = makeSandbox({saveData: true});
    await vm.runInContext('precachePhotos', ctx)(dataRes());
    check(log.adds.length === 0, 'Mode Hemat Data: tidak ada foto diunduh di background');
  }
  // 2. normal: thumbnail dulu, lalu foto penuh
  {
    const {ctx, log} = makeSandbox();
    await vm.runInContext('precachePhotos', ctx)(dataRes());
    check(log.adds.length === 6, `normal: 3 foto x (thumbnail + penuh) = 6 unduhan (${log.adds.length})`);
    const firstFull = log.adds.findIndex(u => !u.includes('/photos/t/'));
    const lastThumb = log.adds.map(u => u.includes('/photos/t/')).lastIndexOf(true);
    check(lastThumb < firstFull, 'thumbnail diunduh lebih dulu daripada foto penuh');
  }
  // 3. dua pemicu bersamaan -> satu proses
  {
    const {ctx, log} = makeSandbox();
    const pp = vm.runInContext('precachePhotos', ctx);
    await Promise.all([pp(dataRes()), pp(dataRes()), pp(dataRes())]);
    check(log.adds.length === 6, `3 pemicu bersamaan: tetap 6 unduhan, bukan 18 (${log.adds.length})`);
  }
  // 4. foto yang sudah ada tidak diunduh lagi
  {
    const {ctx, log} = makeSandbox();
    const pp = vm.runInContext('precachePhotos', ctx);
    await pp(dataRes()); await pp(dataRes());
    check(log.adds.length === 6, 'pemanggilan kedua (sesudah selesai) tidak mengunduh ulang foto yang sudah ada');
  }
  // 5. networkFirst: jaringan mati -> cache
  {
    const {ctx, store} = makeSandbox({fetchImpl: async () => { throw new TypeError('offline'); }});
    store.set('shell-test', new Map([['https://x.test/a.css', {ok: true, status: 200, tag: 'dari-cache'}]]));
    const nf = vm.runInContext('networkFirst', ctx);
    const r = await nf(null, {url: 'https://x.test/a.css'}, 'shell-test');
    check(r && r.tag === 'dari-cache', 'networkFirst: jaringan mati -> pakai cache');
    let threw = false;
    try { await nf(null, {url: 'https://x.test/tidak-ada.css'}, 'shell-test'); } catch (e) { threw = true; }
    check(threw, 'networkFirst: jaringan mati dan tak ada cache -> error diteruskan (bukan hang)');
  }
  // 6. 5xx -> cache
  {
    const {ctx, store} = makeSandbox({fetchImpl: async () => ({ok: false, status: 503, clone() { return this; }})});
    store.set('shell-test', new Map([['https://x.test/a.js', {ok: true, status: 200, tag: 'cache-bagus'}]]));
    const r = await vm.runInContext('networkFirst', ctx)(null, {url: 'https://x.test/a.js'}, 'shell-test');
    check(r.tag === 'cache-bagus', 'networkFirst: server 503 -> pakai salinan cache yang baik');
  }
  // 7. 404 -> diteruskan apa adanya (bukan cache basi) jika tidak ada salinan; jika ada salinan tetap respons jaringan (status < 500)
  {
    const {ctx} = makeSandbox({fetchImpl: async () => ({ok: false, status: 404, clone() { return this; }})});
    const r = await vm.runInContext('networkFirst', ctx)(null, {url: 'https://x.test/hilang.js'}, 'shell-test');
    check(r.status === 404, 'networkFirst: 404 diteruskan apa adanya');
  }
  // 8. jaringan macet -> cache setelah NET_TIMEOUT
  {
    const {ctx, store} = makeSandbox({fetchImpl: () => new Promise(() => {})});
    store.set('shell-test', new Map([['https://x.test/b.js', {ok: true, status: 200, tag: 'cache-lambat'}]]));
    const waited = [];
    const e = {waitUntil: p => waited.push(p)};
    const t0 = Date.now();
    const r = await vm.runInContext('networkFirst', ctx)(e, {url: 'https://x.test/b.js'}, 'shell-test');
    const dt = Date.now() - t0, lim = vm.runInContext('NET_TIMEOUT', ctx);
    check(r.tag === 'cache-lambat' && dt >= lim - 100 && dt < lim + 800, `networkFirst: jaringan macet -> cache setelah ~NET_TIMEOUT (${dt} ms, batas ${lim} ms)`);
    check(waited.length === 1, 'networkFirst: pembaruan di belakang layar didaftarkan lewat waitUntil');
  }
  // 9. kunci cache data.json kanonik + validasi URL kanonik (bukan ?t=...)
  {
    const calls = [];
    const {ctx} = makeSandbox({fetchImpl: async u => { calls.push(String(u.url || u)); return {ok: true, status: 200, clone() { return this; }}; }});
    const key = 'https://x.test/data.json';
    await vm.runInContext('networkFirst', ctx)(null, {url: key + '?t=123'}, 'data-test', key, key);
    check(calls[0] === key, `data.json: yang divalidasi ke server adalah URL kanonik tanpa ?t= (${calls[0]})`);
  }
  console.log();
  if (fails) { console.log(fails + ' pemeriksaan GAGAL'); process.exit(1); }
  console.log('semua pemeriksaan SW lolos');
})();
