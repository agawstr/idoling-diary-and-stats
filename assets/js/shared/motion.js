/* assets/js/shared/motion.js — Animasi: pindah tab, perubahan grafik/peta, angka berhitung, pil tab cair
   Bagian dari kode bersama index.html & admin.html (dulu satu file shared.js). Dimuat berurutan sebagai skrip klasik
   (satu lingkup global yang sama); urutan muat ada di index.html dan admin.html dan diperiksa oleh scripts/check_assets.py. */
// ================= Animasi isi tab =================
// kelas .enter dipasang saat tab dibuka (dan saat data pertama tampil), lalu dilepas supaya render ulang (filter, pencarian) tidak mengulang animasi
function playEnter(el) {
  if (!el) return;
  el.classList.remove('enter');
  void el.offsetWidth; // paksa animasi mulai dari awal
  el.classList.add('enter');
  clearTimeout(el._enT);
  el._enT = setTimeout(() => el.classList.remove('enter'), 2600);
  watchReveal(el);
}

// ================= Klik grafik / kalender -> filter peta =================
function applyChartFilter(kind, val) {
  if (kind === 'row') filter.row = filter.row === val ? '' : val;
  else {
    let from = val, to = val; // 'd' = satu hari
    if (kind === 'mo') { // bulan: YYYY-MM
      const [y, m] = val.split('-').map(Number);
      from = val + '-01'; to = val + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
    }
    const same = filter.from === from && filter.to === to; // klik lagi = lepas filter
    filter.from = same ? '' : from; filter.to = same ? '' : to;
    syncDates();
  }
  renderChart();
  $('filters').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
}
[['rchart', 'row', 'data-row'], ['cal', 'd', 'data-d'], ['mchart', 'mo', 'data-mo']].forEach(([id, kind, attr]) => {
  $(id).addEventListener('click', e => { const t = e.target.closest('[' + attr + ']'); if (t) applyChartFilter(kind, t.getAttribute(attr)); });
  $(id).addEventListener('keydown', e => { // keyboard: Enter / spasi
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); }
  });
});

// ================= Animasi perubahan grafik & peta =================
// Elemen grafik dibuat ulang setiap render, jadi nilai lama dicatat dulu lalu bar/angka/kursi digerakkan dari nilai lama ke nilai baru.
const BAR_SETS = [ // [kontainer, bar, properti, angka, fungsi kunci]
  ['sl-chart', '.sl-bar i', 'width', '.sl-c', x => x.closest('[data-setlist]')?.dataset.setlist],
  ['ev-rank', '.sl-bar i', 'width', '.rc', x => x.closest('[data-m]')?.dataset.m],
  ['rchart', '.mc-b i', 'height', '.mc-n', (x, i) => i],
  ['mchart', '.mc-b i', 'height', '.mc-n', (x, i) => i]
];
const numOf = s => { const m = /\d+/.exec(s || ''); return m ? +m[0] : 0; };

function snapAnim() {
  const bars = BAR_SETS.map(([id, bs, prop, ns, keyOf]) => {
    const el = $(id), b = new Map(), n = new Map();
    if (el) {
      el.querySelectorAll(bs).forEach((x, i) => { const k = keyOf(x, i); if (k !== undefined) b.set(k, x.style[prop]); });
      el.querySelectorAll(ns).forEach((x, i) => { const k = keyOf(x, i); if (k !== undefined) n.set(k, numOf(x.textContent)); });
    }
    return {b, n};
  });
  const seats = new Map();
  $('chart').querySelectorAll('.seat').forEach(x => { const cs = getComputedStyle(x); if (cs.opacity) seats.set(x.dataset.seat, [cs.opacity, cs.backgroundColor]); });
  return {bars, seats};
}

function tweenNum(el, from, to) {
  const m = /^(\D*)(\d+)(.*)$/.exec(el.textContent);
  if (!m) return;
  const t0 = performance.now();
  const step = t => {
    const p = Math.min(1, (t - t0) / 850);
    el.textContent = m[1] + Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))) + m[3];
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function playAnim(snap) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const todo = [], tw = [], seatCh = [];
  BAR_SETS.forEach(([id, bs, prop, ns, keyOf], n) => {
    const el = $(id), old = snap.bars[n];
    if (!el || !old.b.size) return; // render pertama: biarkan animasi masuk (.enter)
    el.querySelectorAll(bs).forEach((x, i) => {
      const k = keyOf(x, i), target = x.style[prop];
      if (k === undefined) return;
      const from = old.b.has(k) ? old.b.get(k) : '0%'; // bar baru tumbuh dari 0
      if (from !== target) { x.style.transition = 'none'; x.style[prop] = from; todo.push([x, prop, target]); }
    });
    el.querySelectorAll(ns).forEach((x, i) => {
      const k = keyOf(x, i), to = numOf(x.textContent), from = old.n.has(k) ? old.n.get(k) : 0;
      if (k !== undefined && x.textContent && from !== to) tw.push([x, from, to]);
    });
  });
  $('chart').querySelectorAll('.seat').forEach(x => { // baca dulu semua, tulis belakangan (hindari reflow berulang)
    const o = snap.seats.get(x.dataset.seat), cs = getComputedStyle(x);
    if (o && cs.opacity && (o[0] !== cs.opacity || o[1] !== cs.backgroundColor)) seatCh.push([x, o, x.style.backgroundColor]);
  });
  seatCh.forEach(([x, o]) => { x.style.transition = 'none'; x.style.opacity = o[0]; x.style.backgroundColor = o[1]; });
  if (!todo.length && !tw.length && !seatCh.length) return;
  void document.body.offsetWidth; // paksa nilai lama sempat dilukis
  todo.forEach(([x, p, t]) => { x.style.transition = ''; x.style[p] = t; });
  seatCh.forEach(([x, , bg]) => { x.style.transition = ''; x.style.opacity = ''; x.style.backgroundColor = bg; });
  tw.forEach(([x, f, t]) => tweenNum(x, f, t));
}

let animDepth = 0;
function withAnim(fn) {
  if (animDepth++) { try { fn(); } finally { animDepth--; } return; } // panggilan bersarang cukup dijalankan
  let snap;
  try { snap = snapAnim(); fn(); } finally { animDepth--; }
  playAnim(snap);
}
function renderChart() { withAnim(renderChartRaw); }
function renderTickets() { withAnim(renderTicketsRaw); }

// ================= Animasi perubahan data: bar naik/turun, angka berhitung, peta bereaksi =================
const barMem = {}, numMem = {};
let lastSig = null; // tanda filter terakhir, untuk mendeteksi perubahan filter
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;


// angka kartu statistik berhitung dari nilai lama ke nilai baru saat filter berubah
function tweenNums(id, box) {
  const prev = numMem[id] || {}, next = {}, skip = calm() || intro || replayN !== null;
  box.querySelectorAll('[data-n]').forEach(el => {
    const key = el.nextElementSibling ? el.nextElementSibling.textContent : '', to = +el.dataset.n, from = prev[key];
    next[key] = to;
    if (skip || from === undefined || from === to) return;
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / 900);
      el.textContent = fmtNum(from + (to - from) * (1 - Math.pow(1 - p, 3)), el.dataset.fmt || '');
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = fmtNum(from, el.dataset.fmt || '');
    requestAnimationFrame(step);
  });
  numMem[id] = next;
}

// kursi yang cocok "membesar" bergantian setelah filter berubah
function playRefresh() {
  const c = $('chart');
  c.classList.remove('refresh');
  void c.offsetWidth;
  c.classList.add('refresh');
  clearTimeout(c._rf);
  c._rf = setTimeout(() => c.classList.remove('refresh'), 1700);
}

// ================= Animasi lanjutan: tampil saat terlihat, daftar bergeser, tab meluncur, pil filter, hitung mundur, kembang api =================
const REVEAL = ['sl-chart', 'rchart', 'cal', 'mchart', 'ev-rank', 'lot'];
function showReveal(el) { // nyalakan animasi bar / kalender / cincin pada bagian ini
  el.classList.add('shown');
  if (el.id === 'lot') { flowCount(el); countUp($('lot').querySelector('.lot-cards') || el, true); if ($('ev-cats')) countUp($('ev-cats'), true); }
  clearTimeout(el._sh);
  el._sh = setTimeout(() => el.classList.remove('shown'), 3600);
}
const revealIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  revealIO.unobserve(e.target);
  showReveal(e.target);
}), {threshold: 0.15}) : null;
function watchReveal(root) { // animasi bar/kalender/cincin jalan saat bagiannya terlihat
  REVEAL.forEach(id => {
    const el = $(id);
    if (!el || (root && !root.contains(el))) return;
    el.classList.remove('shown');
    if (revealIO) revealIO.unobserve(el);
    const r = el.getBoundingClientRect();
    if (r.width && r.top < innerHeight * 0.9 && r.bottom > 0) showReveal(el); // sudah di layar: nyalakan sekarang juga, jadi tidak ada frame "penuh lalu kosong"
    else if (revealIO) revealIO.observe(el);
    else showReveal(el);
  });
}

// daftar bergeser ke posisi baru (FLIP), item baru memudar masuk
function flipRender(box, itemSel, keyOf, doRender) {
  if (calm() || !box.offsetParent || box.closest('.enter') || box.querySelectorAll(itemSel).length > 40) { doRender(); return; }
  const first = new Map();
  box.querySelectorAll(itemSel).forEach(el => first.set(keyOf(el), el.getBoundingClientRect()));
  doRender();
  if (!first.size) return;
  box.querySelectorAll(itemSel).forEach(el => {
    const a = first.get(keyOf(el)), b = el.getBoundingClientRect();
    if (!a) el.animate([{opacity: 0, transform: 'translateY(10px)'}, {opacity: 1, transform: 'none'}], {duration: 520, easing: 'cubic-bezier(.32,.72,0,1)'});
    else if (a.left !== b.left || a.top !== b.top) el.animate([{transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`}, {transform: 'none'}], {duration: 620, easing: 'cubic-bezier(.32,.72,0,1)'});
  });
}

// penanda tab aktif yang meluncur ("pil cair")
function setStick() { // tinggi tab bar -> posisi header bulan yang menempel
  const bar = document.querySelector('.tabbar');
  if (bar) document.documentElement.style.setProperty('--stick', Math.round(bar.getBoundingClientRect().height + 16) + 'px');
}
/* Satu-satunya tempat yang menggerakkan pil. Aturan:
   - moveInd()      -> meluncur ke tab aktif (tepi depan melaju duluan, tepi belakang menyusul, tanpa memantul)
   - moveInd(true)  -> ukur ulang saja (ukuran layar / label berubah). Kalau pil sedang meluncur, hanya target yang diperbarui,
                       jadi gerakannya tidak pernah dipotong atau dilempar ke posisi akhir.
   - indFollow()    -> mengikuti jari saat menggeser tab */
const IND_MS_FULL = 560, IND_MS_LITE = 460; // sebelumnya 720: lebih lama dari isi tab, jadi pil terasa tertinggal
const indLead = k => 1 - Math.pow(1 - k, 3);
const indTrail = k => { k = Math.min(1, Math.max(0, (k - 0.14) / 0.86)); return 1 - Math.pow(1 - k, 2.4); };
const indRectOf = el => ({x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight});
function indSize(ind, b) { if (ind._bw !== b.w || ind._bh !== b.h) { ind.style.width = b.w + 'px'; ind.style.height = b.h + 'px'; ind._bw = b.w; ind._bh = b.h; } }
function indPaint(ind, r, base) { // base = ukuran dasar elemen; peregangan "cair" hanya lewat scale (tanpa memicu layout)
  const b = base || r;
  ind._cur = r;
  indSize(ind, b);
  ind.style.transform = `translate3d(${r.x}px,${r.y}px,0) scale(${(r.w / b.w).toFixed(4)},${(r.h / b.h).toFixed(4)})`;
}
function indAxis(p0, s0, p1, s1, ea, eb) { // ea: easing tepi awal, eb: easing tepi akhir
  const a = p0 + (p1 - p0) * ea, b = (p0 + s0) + ((p1 + s1) - (p0 + s0)) * eb;
  return [a, Math.max(b - a, 0)];
}
function indBlend(f, t, kLead, kTrail) { // f -> t; arah gerak menentukan tepi mana yang memimpin
  const fx = t.x >= f.x, fy = t.y >= f.y;
  const [x, w] = indAxis(f.x, f.w, t.x, t.w, fx ? kTrail : kLead, fx ? kLead : kTrail);
  const [y, h] = indAxis(f.y, f.h, t.y, t.h, fy ? kTrail : kLead, fy ? kLead : kTrail);
  return {x, y, w, h};
}
/* Meluncur lewat WAAPI (keyframe transform): berjalan di compositor, jadi tetap mulus walau main thread sedang
   sibuk menggambar isi tab baru. Sebelumnya digerakkan requestAnimationFrame di main thread -> patah-patah. */
const indSame = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every(k => Math.abs(a[k] - b[k]) < 0.01);
function indStop(ind) { const a = ind._anim; ind._anim = null; if (a) { try { a.cancel(); } catch (e) {} } }
function indProg(ind) { // 0..1 seberapa jauh animasi berjalan
  const a = ind._anim; if (!a) return 1;
  return Math.min(1, Math.max(0, Number(a.currentTime || 0) / ind._aDur));
}
function indNow(ind) { // posisi pil saat ini, juga ketika sedang meluncur
  if (ind._anim && ind._aFrom && ind._aTo) { const k = indProg(ind); return indBlend(ind._aFrom, ind._aTo, indLead(k), indTrail(k)); }
  return ind._cur;
}
function indGlide(ind, from, to, ms) {
  indStop(ind);
  if (!ind.animate) { indPaint(ind, to); return; }
  indSize(ind, to);
  const N = 24, kf = [];
  for (let n = 0; n <= N; n++) {
    const k = n / N, r = indBlend(from, to, indLead(k), indTrail(k));
    kf.push({offset: k, transform: `translate3d(${r.x}px,${r.y}px,0) scale(${(r.w / to.w).toFixed(4)},${(r.h / to.h).toFixed(4)})`});
  }
  ind._aFrom = from; ind._aTo = to; ind._aDur = ms;
  const a = ind.animate(kf, {duration: ms, easing: 'linear', fill: 'forwards'});
  ind._anim = a;
  a.onfinish = () => { if (ind._anim !== a) return; ind._anim = null; indPaint(ind, to); try { a.cancel(); } catch (e) {} };
}
function indEl(create) {
  const bar = document.querySelector('.tabbar');
  if (!bar) return null;
  let ind = bar.querySelector('.tab-ind');
  if (!ind && create) { ind = document.createElement('i'); ind.className = 'tab-ind'; bar.prepend(ind); }
  return ind;
}
function moveInd(remeasure) {
  if (remeasure === true || !moveInd._s) { moveInd._s = 1; setStick(); } // tinggi bar tidak berubah saat pindah tab: jangan paksa layout tiap kali
  const bar = document.querySelector('.tabbar'), on = bar && bar.querySelector('.tab.on');
  if (!on) return;
  let ind = indEl(false), fresh = false;
  if (!ind) { ind = indEl(true); fresh = true; }
  const to = indRectOf(on);
  ind._to = to;
  const cur = indNow(ind);
  if (fresh || calm() || !cur || (remeasure === true && !ind._anim)) { indStop(ind); indPaint(ind, to); return; }
  if (remeasure === true) { // sedang meluncur: lanjut dari posisi sekarang ke target terbaru, tidak dipotong / dilempar
    indGlide(ind, cur, to, Math.max(240, ind._aDur * (1 - indProg(ind))));
    return;
  }
  if (ind._anim && indSame(ind._aTo, to)) return; // sudah meluncur ke tab ini
  if (!ind._anim && indSame(cur, to)) return;
  indGlide(ind, cur, to, perf.lite() ? IND_MS_LITE : IND_MS_FULL);
}
function indFollow(fromTab, toTab, p) { // p 0..1: pil mengikuti jari di antara dua tab
  const ind = indEl(true);
  if (!ind || !fromTab || !toTab) return;
  indStop(ind);
  p = Math.max(0, Math.min(1, p));
  const f0 = indRectOf(fromTab);
  indPaint(ind, indBlend(f0, indRectOf(toTab), Math.pow(p, 0.85), Math.pow(p, 1.3)), f0);
}
if (document.querySelector('.tabbar')) {
  const ro = new ResizeObserver(() => moveInd(true)); // lebar tab berubah saat angka jumlah muncul
  document.querySelectorAll('.tab').forEach(t => ro.observe(t));
  window.addEventListener('resize', () => moveInd(true));
  moveInd(true);
}

// pil pemberitahuan filter aktif (hanya di halaman publik)
const fbar = document.querySelector('.tabbar') && $('view-main') ? document.body.appendChild(Object.assign(document.createElement('div'), {id: 'fbar'})) : null;
fbar?.setAttribute('role', 'status');
fbar?.addEventListener('click', e => { if (e.target.closest('button')) $('flt-reset').click(); });
function syncFbar() {
  if (!fbar) return;
  const parts = [];
  if (filter.row) parts.push('Baris ' + filter.row);
  if (filter.setlist) parts.push(filter.setlist);
  if (filter.member) parts.push(filter.member);
  if (filter.from || filter.to) parts.push(filter.from === filter.to ? fmtDate(filter.from) : `${filter.from ? fmtDate(filter.from) : '…'} – ${filter.to ? fmtDate(filter.to) : '…'}`);
  const show = isFiltered() && !$('view-main').hidden;
  if (show) fbar.innerHTML = `<span>${esc(parts.join(' · '))} · <b>${view().length}</b> show</span><button type="button">Reset</button>`;
  fbar.classList.toggle('on', show);
  centerFbar();
}
// bar filter di bawah: tengahnya = tengah PETA (bukan tengah layar), supaya tidak geser saat ada panel kanan / sidebar
function centerFbar() {
  if (!fbar) return;
  const w = $('seating-wrapper'), r = w && w.getBoundingClientRect();
  if (!r || !r.width) return;
  const l = Math.max(r.left, 0), rt = Math.min(r.right, innerWidth);
  if (rt > l) fbar.style.left = Math.round((l + rt) / 2) + 'px';
}
addEventListener('resize', () => centerFbar());

// hitung mundur tiket mendatang
function tickCountdown() {
  document.querySelectorAll('.cd-live').forEach(el => {
    const ms = new Date(el.dataset.t) - Date.now();
    if (isNaN(ms)) return;
    if (ms <= 0) { el.textContent = 'sedang berlangsung'; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    el.textContent = d ? `${d} hari ${h} jam lagi` : `${h} jam ${m} menit lagi`;
  });
}
// hitung mundur diperbarui tiap 30 dtk, tapi tidak saat tab disembunyikan (hemat baterai); langsung disegarkan begitu tab terlihat lagi
setInterval(() => { if (!document.hidden) tickCountdown(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickCountdown(); });

// percikan kecil di kursi saat putar ulang mencapai show ke-10, 25, 50, ...
function burst(el) {
  if (!el || calm()) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('i');
    p.className = 'sparkle';
    p.style.cssText = `left:${cx}px;top:${cy}px;background:${['#ffd23f', '#ff8c00', '#ff2a5f'][i % 3]}`;
    document.body.appendChild(p);
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
    p.animate([{transform: 'translate(0,0) scale(1)', opacity: 1}, {transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(0)`, opacity: 0}],
      {duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.32,.72,0,1)'}).onfinish = () => p.remove();
  }
}

// animasi ganti tahun di kalender: kalender & judul tahun meluncur sesuai arah, kotak berisi menyala bergantian
function slideCal(dir) {
  if (calm()) return;
  const ease = {duration: 560, easing: 'cubic-bezier(.32,.72,0,1)'};
  ['.cal-g', '.cal-m'].forEach(sel => $('cal').querySelector(sel)?.animate([{opacity: 0, transform: `translateX(${dir * 28}px)`}, {opacity: 1, transform: 'none'}], ease));
  $('cal-nav').querySelector('b')?.animate([{opacity: 0, transform: `translateY(${dir * -10}px)`}, {opacity: 1, transform: 'none'}], ease);
  const c = $('cal');
  c.classList.remove('shown'); void c.offsetWidth; c.classList.add('shown');
  clearTimeout(c._sh); c._sh = setTimeout(() => c.classList.remove('shown'), 2000);
}

// alur OFC -> General: bar terisi berurutan, angka tiap tahap berhitung bergantian
function flowCount(box) {
  if (calm()) return;
  box.querySelectorAll('.lot-r.fl').forEach((row, i) => {
    row.querySelectorAll('[data-n]').forEach(el => { el.textContent = '0'; });
    setTimeout(() => countUp(row), i * 260 + 200);
  });
}

