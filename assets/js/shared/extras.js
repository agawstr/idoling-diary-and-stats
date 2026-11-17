/* assets/js/shared/extras.js — Zoom peta di HP, cerita otomatis, cek versi aset, tombol info, sub-tab galeri, kilas balik "tahun lalu"
   Bagian dari kode bersama index.html & admin.html (dulu satu file shared.js). Dimuat berurutan sebagai skrip klasik
   (satu lingkup global yang sama); urutan muat ada di index.html dan admin.html dan diperiksa oleh scripts/check_assets.py. */
// ================= Zoom peta di HP =================
$('seating-wrapper').insertAdjacentHTML('beforebegin', '<div id="zoomctl"><button type="button" class="btn-s" data-z="out" aria-label="Perkecil peta">−</button><button type="button" class="btn-s" data-z="in" aria-label="Perbesar peta">+</button><button type="button" class="btn-s" data-z="fit">⤢ Pas layar</button></div>');
function setMapScale(s, px) { // px = titik (relatif ke wadah peta) yang dipertahankan saat zoom
  if (window.innerWidth > 768) return;
  const w = $('seating-wrapper'), c = $('stage-container');
  if (px === undefined) px = w.clientWidth / 2;
  const anchor = (w.scrollLeft + px) / mapScale;
  c.style.zoom = '';
  const natural = c.scrollWidth, min = Math.min(1, w.clientWidth / natural);
  mapScale = Math.max(min, Math.min(2.4, s));
  mapAuto = mapScale <= min + .001; // kembali ke ukuran pas = mode otomatis lagi
  c.style.zoom = mapScale === 1 ? '' : mapScale;
  w.scrollLeft = anchor * mapScale - px;
}
$('zoomctl').addEventListener('click', e => {
  const b = e.target.closest('[data-z]');
  if (!b) return;
  setMapScale(b.dataset.z === 'fit' ? 0 : mapScale * (b.dataset.z === 'in' ? 1.3 : 1 / 1.3));
});
(() => { // cubit dua jari
  const w = $('seating-wrapper'), dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let d0 = 0, s0 = 1;
  w.addEventListener('touchstart', e => { if (e.touches.length === 2) { d0 = dist(e.touches); s0 = mapScale; } }, {passive: true});
  w.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !d0) return;
    e.preventDefault();
    const px = (e.touches[0].clientX + e.touches[1].clientX) / 2 - w.getBoundingClientRect().left;
    setMapScale(s0 * dist(e.touches) / d0, px);
  }, {passive: false});
  w.addEventListener('touchend', e => { if (e.touches.length < 2) d0 = 0; });
})();

// ================= Cerita otomatis di bagian atas =================
$('last').insertAdjacentHTML('beforebegin', '<p id="story"></p>');
function renderStory() {
  const el = $('story');
  if (!el) return;
  if (!records.length) { el.innerHTML = ''; return; }
  const who = ((document.querySelector('h1') || {textContent: ''}).textContent.match(/^(.+?)['’]s\b/) || [])[1] || 'Pemilik halaman ini';
  const ok = records.filter(r => SEATS.has(r.seat)), ds = records.map(r => r.date).filter(Boolean).sort();
  const seat = tally(ok, r => r.seat, seatTie), row = tally(ok, r => r.seat[0], (a, b) => a.localeCompare(b)), sl = tally(records, r => r.setlist);
  const b = t => `<b>${esc(t)}</b>`; // hanya angka utama yang ditebalkan
  const line = (t, cls = '') => `<span class="st${cls ? ' ' + cls : ''}">${t}</span>`;
  const out = [];
  out.push(line((ds.length ? `Sejak ${esc(MON_ID[+ds[0].slice(5, 7) - 1] + ' ' + ds[0].slice(0, 4))}, ${esc(who)} sudah menonton ` : `${esc(who)} sudah menonton `)
    + `${b(records.length)} show di ${b(new Set(ok.map(r => r.seat)).size)} kursi berbeda.`));
  if (seat && row) out.push(line(`Kursi favoritnya ${esc(seat[0])} (${seat[1]}×), paling sering di baris ${esc(row[0])} (${row[1]}×).` + (sl ? ` Setlist yang paling sering ditonton: ${esc(sl[0])} (${sl[1]}×).` : '')));
  try {
    const fl = lotFlowStats();
    if (fl && fl.n) {
      const refunds = tickets.filter(t => t.status === 'refund').length, watched = fl.got - refunds, rest = records.length - watched, gen = fl.got - fl.ofcWin;
      out.push(line(`Dari ${fl.n} show teater yang diincar lewat undian, ${fl.got} berhasil didapat (${b(Math.round(fl.got / fl.n * 100) + '%')}): ${fl.ofcWin} langsung menang di OFC${gen ? ' dan ' + gen + ' lewat General' : ''}.`
        + ` ${refunds ? refunds + ' show dibatalkan dan di-refund, jadi ' : ''}${watched} ditonton${rest > 0 ? ', ditambah ' + rest + ' show lain di luar undian show teater (mis. JKT48 School)' : ''}.`, 'mute'));
    }
  } catch (e) { /* data tiket belum dimuat */ }
  const h = out.join('');
  el.innerHTML = h;
}

// ================= Selalu pakai shared/*.js/css terbaru =================
// Ambil ulang dengan revalidasi ringan (ETag). Kalau isinya beda dari salinan di cache, cache sudah terperbarui, lalu muat ulang satu kali.
// Dilewati kalau service worker sudah mengendalikan halaman: sw.js sendiri memvalidasi ulang (ETag) setiap file, jadi pengecekan ini
// hanya akan mengunduh ~280 KB dua kali tanpa manfaat. Tetap berlaku untuk kunjungan pertama / browser tanpa service worker.
(async () => {
  if (location.protocol === 'file:' || sessionStorage.getItem('freshChecked')) return;
  if (navigator.serviceWorker && navigator.serviceWorker.controller) return;
  try {
    for (const u of ['assets/js/shared/core.js', 'assets/css/shared.css']) {
      const [a, b] = await Promise.all([fetch(u).then(r => r.text()), fetch(u, {cache: 'no-cache'}).then(r => r.text())]);
      if (a !== b) { sessionStorage.setItem('freshChecked', '1'); location.reload(); return; }
    }
    sessionStorage.setItem('freshChecked', '1');
  } catch (e) { /* offline: abaikan */ }
})();

// tombol ⓘ: buka/tutup keterangan di sebelahnya
document.addEventListener('click', e => {
  const b = e.target.closest('.info-btn');
  const t = b && b.nextElementSibling;
  if (!t) return;
  t.hidden = !t.hidden;
  b.setAttribute('aria-expanded', String(!t.hidden));
});

// bayangan di bar tab saat halaman digulir
(() => {
  const bar = document.querySelector('.tabbar');
  if (!bar) return;
  let t = 0;
  addEventListener('scroll', () => { if (t) return; t = requestAnimationFrame(() => { t = 0; bar.classList.toggle('stuck', scrollY > 30); }); }, {passive: true});
})();

// sub-tab Galeri: Semua / 2-Shot / 2-Shot Event / Chekicha
let galKind = '';
if ($('gallery-bar')) {
  $('gallery-bar').insertAdjacentHTML('beforebegin', '<div id="g-kinds" class="gk-bar"></div>');
  $('g-kinds').addEventListener('click', e => { const b = e.target.closest('[data-gk]'); if (b) { galKind = b.dataset.gk; renderGallery(); } });
}


// ================= Rekap "tahun lalu hari ini" =================
// Tanggal hari ini bisa diuji lewat ?today=YYYY-MM-DD. Memakai semua data (tidak terpengaruh filter peta).
function todayStr() {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
$('last').insertAdjacentHTML('afterend', '<div id="memory"></div>');
function memoryItems(today) {
  const md = today.slice(5), ty = +today.slice(0, 4), out = [];
  const yrs = d => ty - +d.slice(0, 4);
  const ok = d => d && d.slice(5) === md && yrs(d) > 0;
  records.filter(r => ok(r.date)).forEach(r => out.push({y: yrs(r.date), t: r.setlist || '(tanpa setlist)', sub: [r.sesi, ...extras(r).map(x => `${x.label} dengan ${x.member}`)].filter(Boolean).join(' · '), seat: r.seat, ph: (extras(r).find(x => x.photo) || {}).photo}));
  solo.filter(w => ok(w.date)).forEach(w => out.push({y: yrs(w.date), t: (w.kind === 'ts' ? '2-Shot' : 'Chekicha') + ' dengan ' + w.member, sub: w.setlist || '', ph: w.photo}));
  tickets.filter(t => t.type !== 'SHOW' && t.used > 0 && ok(t.date)).forEach(t => out.push({y: yrs(t.date), t: t.name, sub: ['Event', t.member].filter(Boolean).join(' · ')}));
  return out.sort((a, b) => a.y - b.y);
}
function renderMemory() {
  const el = $('memory');
  if (!el) return;
  const today = todayStr(), items = dataLoaded ? memoryItems(today) : [];
  if (!items.length) { el.innerHTML = ''; return; }
  const when = y => y === 1 ? 'Setahun lalu hari ini' : `${y} tahun lalu hari ini`;
  const shown = items.slice(0, 4);
  el.innerHTML = `<div class="mem-c"><span class="last-l">Kilas balik · ${esc(fmtDate(today).replace(/ \d{4}$/, ''))}</span>` + shown.map(i => `
    <div class="mem-i">${i.ph ? `<img src="${esc(thumbOf(i.ph))}" data-full="${esc(i.ph)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="Foto kilas balik" data-cap="${esc(i.t)}" data-sub="${esc(when(i.y) + (i.sub ? ' · ' + i.sub : ''))}" decoding="async">` : ''}
      <div class="mem-b"><b>${esc(i.t)}</b><span>${when(i.y)}${i.sub ? ' · ' + esc(i.sub) : ''}${i.seat ? ` · Kursi <button type="button" class="seat-badge tl-s" data-seat="${esc(i.seat)}">${esc(i.seat)}</button>` : ''}</span></div></div>`).join('')
    + (items.length > shown.length ? `<span class="mem-more">+${items.length - shown.length} lainnya di tanggal ini</span>` : '') + '</div>';
}
$('memory').addEventListener('click', e => {
  const b = e.target.closest('[data-seat]');
  if (b) openSeat(b.dataset.seat);
});

