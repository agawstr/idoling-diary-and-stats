/* shared/*.js — dipakai bareng index.html & admin.html
   Butuh elemen: #chart, #total, #seating-wrapper, #stage-container,
   #seat-modal (+ #seat-close, #modal-seat, #modal-hist), #lightbox (+ #lb-img) */
const $ = id => document.getElementById(id);
// Harga/biaya HANYA tampil di admin (body.adm). Di halaman publik harga dianggap 0, jadi kartu Total biaya, chip harga, tooltip bulan,
// kartu Wrapped, dan riwayat kursi otomatis tidak menampilkan harga sama sekali.
const PRICES_VISIBLE = document.body.classList.contains('adm');
const lastFocus = {}, timers = {};

// ---------- Tingkat performa: SATU penentu untuk CSS (html[data-perf], html[data-glass]) dan JS (perf.*) ----------
// data-perf  = "lite" (HP, tablet sentuh, hemat data, perangkat lemah) / "full": berapa berat animasi & lapisan
// data-glass = "on" / "off": efek kaca (backdrop-filter). Mati otomatis di perangkat lemah, hemat data, reduced-transparency,
//              atau kalau perf.degrade() dipanggil (pengaman: pindah tab berkali-kali patah). Disimpan di perangkat ini.
// Uji manual: ?perf=lite|full  dan  ?glass=on|off  (glass=on juga menghapus status "dimatikan otomatis")
const perf = (() => {
  const root = document.documentElement;
  const q = new URLSearchParams(location.search), force = q.get('perf'), forceGlass = q.get('glass');
  const mqs = [matchMedia('(max-width:768px)'), matchMedia('(hover:none) and (pointer:coarse)'), matchMedia('(prefers-reduced-transparency: reduce)')];
  // ?glass=off (uji manual) tersimpan di perangkat; pengaman otomatis HANYA berlaku selama sesi ini (sessionStorage)
  const lsGet = () => { try { return localStorage.getItem('jkt48_glass_m'); } catch (e) { return null; } };
  const lsSet = v => { try { if (v) localStorage.setItem('jkt48_glass_m', v); else localStorage.removeItem('jkt48_glass_m'); } catch (e) {} };
  const autoGet = () => { try { return sessionStorage.getItem('jkt48_glass_auto'); } catch (e) { return null; } };
  const autoSet = v => { try { if (v) sessionStorage.setItem('jkt48_glass_auto', v); else sessionStorage.removeItem('jkt48_glass_auto'); } catch (e) {} };
  try { localStorage.removeItem('jkt48_glass'); } catch (e) {} // status "mati otomatis" lama (permanen) dibersihkan
  if (forceGlass === 'on') { lsSet(null); autoSet(null); } else if (forceGlass === 'off') lsSet('off');
  const weak = () => {
    const c = navigator.connection || {};
    return !!c.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  };
  const tier = () => (force === 'lite' || force === 'full') ? force : (weak() || mqs[0].matches || mqs[1].matches ? 'lite' : 'full');
  const glass = () => {
    if (forceGlass === 'on') return 'on';
    if (!(CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))) return 'off';
    return weak() || mqs[2].matches || lsGet() === 'off' || autoGet() === 'off' ? 'off' : 'on';
  };
  const apply = () => {
    const t = tier(), g = glass();
    if (root.dataset.perf !== t) root.dataset.perf = t;
    if (root.dataset.glass !== g) root.dataset.glass = g;
  };
  apply();
  mqs.forEach(m => m.addEventListener('change', apply));
  if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener('change', apply);
  return {
    lite: () => root.dataset.perf === 'lite',
    glassOn: () => root.dataset.glass === 'on',
    degrade() { if (root.dataset.glass !== 'on') return false; autoSet('off'); apply(); return true; }
  };
})();
// ---------- Kecepatan animasi: satu pengali untuk SEMUA animasi JS (tab, kartu, pil, foto, modal) di index & admin ----------
// 1 = kecepatan lama, 1.35 = lebih pelan. Uji cepat: ?speed=1.6 (tersimpan di perangkat ini; ?speed=1 untuk mengembalikan).
// Durasi < 250ms (umpan balik sentuhan / gestur) tidak diubah supaya tetap responsif.
const ANIM_SLOW = (() => {
  let v = 1.35;
  try {
    const q = parseFloat(new URLSearchParams(location.search).get('speed'));
    if (q > 0 && q <= 4) localStorage.setItem('jkt48_speed', String(q));
    const st = parseFloat(localStorage.getItem('jkt48_speed'));
    if (st > 0 && st <= 4) v = st;
  } catch (e) {}
  return v;
})();
// Pengali yang sama dipakai CSS lewat --spd (animasi buka/tutup modal, lembar bawah, overlay), jadi modal, lightbox, dan tab
// bergerak dengan kecepatan yang sama. "Kurangi Gerakan" -> 1 (CSS-nya sendiri sudah dipersingkat).
const SPD = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : ANIM_SLOW;
document.documentElement.style.setProperty('--spd', String(SPD));
if (ANIM_SLOW !== 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const baseAnimate = Element.prototype.animate;
  Element.prototype.animate = function (kf, o) {
    if (o && typeof o === 'object') {
      const d = typeof o.duration === 'number' ? o.duration : null;
      if (d !== null && d >= 250) { o = {...o, duration: d * ANIM_SLOW}; if (typeof o.delay === 'number') o.delay *= ANIM_SLOW; }
    } else if (typeof o === 'number' && o >= 250) o *= ANIM_SLOW;
    return baseAnimate.call(this, kf, o);
  };
}
// lapisan terbuka (kartu / modal / lightbox) mengunci halaman di belakangnya, dan tombol Back menutup lapisan paling atas
// (bukan keluar dari halaman). Satu entri riwayat "penjaga" dipasang selama ada lapisan terbuka.
const OV_SEL = '.overlay.open:not(.docked),.overlay.open.over'; // panel kursi yang menempel (laptop) dihitung sebagai lapisan hanya saat .over (dibuka dari kartu member)
const topOverlay = () => document.querySelector('#share-sheet.open:not(.closing)') || document.querySelector('.overlay.open.over:not(.closing)') || [...document.querySelectorAll(OV_SEL)].pop(); // yang paling atas (riwayat kursi dari kartu member = di atas kartu)
const ovOpen = () => [...document.querySelectorAll(OV_SEL)].filter(o => !o.classList.contains('closing'));
const ovLock = () => document.documentElement.classList.toggle('ov-lock', !!document.querySelector(OV_SEL));
let histArmed = false, histIgnore = 0;
const histSync = () => setTimeout(() => { // ditunda sedikit: tutup-lalu-buka (mis. kartu member -> kursi) tidak boleh memicu back
  const n = ovOpen().length;
  if (n && !histArmed) { try { history.pushState({ov: 1}, ''); histArmed = true; } catch (e) {} }
  else if (!n && histArmed) { histArmed = false; histIgnore++; try { history.back(); } catch (e) { histIgnore--; } }
}, 0);
addEventListener('popstate', () => {
  if (histIgnore) { histIgnore--; return; }
  if (!histArmed) return;
  histArmed = false; // entri penjaga sudah terpakai oleh Back
  escClose();        // tutup hanya lapisan paling atas: foto -> kartu -> halaman
  histSync();        // masih ada lapisan di bawahnya? pasang penjaga lagi
});
const openEl = id => {
  const el = $(id);
  clearTimeout(timers[id]);
  el.classList.remove('closing');
  lastFocus[id] = document.activeElement; // untuk dikembalikan saat ditutup
  el.classList.add('open');
  ovLock(); histSync();
};
const closeEl = id => {
  const el = $(id);
  if (!el.classList.contains('open') || el.classList.contains('closing')) return;
  el.classList.add('closing'); // animasi tutup dulu, baru disembunyikan
  timers[id] = setTimeout(() => { el.classList.remove('open', 'closing'); if (id === 'seat-modal') el.classList.remove('over'); ovLock(); try { lastFocus[id]?.focus?.({preventScroll: true}); } catch (e) {} }, Math.round(520 * SPD));
  histSync();
};

// ---------- Layout kursi: jumlah kursi per blok (b1..b4) di tiap baris ----------
const COUNTS = {
  A:[4,6,6,5], B:[5,6,6,6], C:[6,6,6,7], D:[7,6,6,7], E:[7,6,6,7],
  F:[7,6,6,7], G:[8,6,6,7], H:[8,6,6,7], I:[8,6,6,6], J:[7,6,6,4]
};
const SEATS = new Set();
const LAYOUT = Object.entries(COUNTS).map(([row, counts]) => {
  let n = 1;
  return counts.map(c => Array.from({length: c}, () => { const code = row + '-' + n++; SEATS.add(code); return code; }));
});

// ---------- Helper & data ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normSeat = s => {
  const m = String(s || '').trim().toUpperCase().match(/^([A-Z])\s*-?\s*(\d{1,2})$/);
  return m ? m[1] + '-' + Number(m[2]) : '';
};
const okPhoto = p => typeof p === 'string' && (p.startsWith('data:image/') || /^https?:\/\//i.test(p) || /^photos\/[\w.-]+$/.test(p)); // data URL, URL, atau file di folder photos/
// foto penuh: photos/X.jpg, versi kecil (untuk galeri/modal): photos/t/X.jpg; kalau thumbnail belum ada, otomatis memakai foto penuh
const thumbOf = p => /^photos\/[\w.-]+$/.test(p) ? p.replace('photos/', 'photos/t/') : p;
const KINDS = [
  {k:'ts', q:'2-Shot?', name:'2-Shot', icon:'', f:'twoshot', t:'tsType', m:'member', p:'photo',
   types:[['birthday','Birthday 2-Shot'],['roulette','2-Shot Roulette']], short:{birthday:'Birthday 2-Shot', roulette:'2-Shot'}},
  {k:'ck', q:'Chekicha?', name:'Chekicha', icon:'', f:'chekicha', t:'ckType', m:'ckMember', p:'ckPhoto',
   types:[['birthday','Birthday Chekicha'],['roulette','Roulette Chekicha']], short:{birthday:'Birthday Chekicha', roulette:'Chekicha'}}
];
// daftar 2-Shot / Chekicha yang aktif di satu record (roulette ditampilkan singkat)
const extras = r => KINDS.filter(K => r[K.f] === 'Ya')
  .map(K => ({label: K.short[r[K.t]] || K.short.roulette, icon: K.icon, member: r[K.m], photo: r[K.p], k: K.k}));
const SO = {Malam: 2, Siang: 1};
const MON_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${MON_ID[+m[2] - 1]} ${m[1]}` : (d || ''); }; // 2026-09-25 -> 25 Sep 2026
const cmp = (a, b) => b.date.localeCompare(a.date) || ((SO[b.sesi] || 0) - (SO[a.sesi] || 0));

// sesi lepas: Chekicha / 2-Shot yang dilakukan di luar menonton theater (punya tanggal, member, dan foto sendiri)
let solo = [];
let setlistMaster = []; // daftar setlist resmi (opsional, dari data.json "setlists"): dipakai kartu Cakupan setlist
const sanitizeSetlists = a => Array.isArray(a) ? [...new Set(a.map(x => String(x || '').trim().slice(0, 80)).filter(Boolean))].slice(0, 300) : [];
const sanitizeSolo = (s, i) => ({
  id: Number(s.id) || Date.now() + i,
  date: String(s.date || ''),
  kind: s.kind === 'ts' ? 'ts' : 'ck',
  type: s.type === 'birthday' ? 'birthday' : 'roulette',
  member: String(s.member || ''),
  photo: okPhoto(s.photo) ? s.photo : '',
  setlist: String(s.setlist || '').slice(0, 80), // setlist pada hari itu (opsional), tetap dicantumkan di keterangan
  note: String(s.note || '').slice(0, 200)
});
function sanitize(r, i) {
  r = r || {};
  const o = {
    id: Number(r.id) || Date.now() + i,
    seat: normSeat(r.seat) || String(r.seat || '').toUpperCase(),
    setlist: String(r.setlist || ''), date: String(r.date || ''),
    sesi: ['Siang', 'Malam'].includes(r.sesi) ? r.sesi : '',
    note: String(r.note || ''),
    harga: PRICES_VISIBLE ? Math.max(0, Number(r.harga) || 0) : 0, // biaya tiket (Rp); disembunyikan di halaman publik
    tiket: String(r.tiket || '').slice(0, 40),
    // lineup: semua member yang tampil di show ini (diisi dari admin), tanpa duplikat
    lineup: Array.isArray(r.lineup) ? [...new Set(r.lineup.map(x => String(x || '').trim().slice(0, 60)).filter(Boolean))].slice(0, 80) : []
  };
  for (const K of KINDS) {
    const on = r[K.f] === 'Ya' || r[K.f] === true;
    o[K.f] = on ? 'Ya' : 'Tidak';
    o[K.t] = on ? (r[K.t] === 'birthday' ? 'birthday' : 'roulette') : '';
    o[K.m] = on ? String(r[K.m] || '') : '';
    o[K.p] = on && okPhoto(r[K.p]) ? r[K.p] : '';
  }
  return o;
}

let records = []; // diisi oleh halaman (index: dari data.json, admin: dari localStorage)

// ---------- Render malas: tab yang sedang tersembunyi baru digambar saat dibuka ----------
// (render pertama tetap jalan supaya angka di label tab terisi; setelah itu hanya ditandai usang)
const lazyDone = {}, lazyStale = {};
function lazyView(viewId, fn) {
  const v = $(viewId);
  if (v && v.hidden && lazyDone[viewId]) { lazyStale[viewId] = fn; scheduleFlush(); return; }
  lazyDone[viewId] = dataLoaded; delete lazyStale[viewId]; // baru dianggap "sudah digambar" kalau data sungguhan sudah ada
  fn();
}
let flushT = 0;
function scheduleFlush() { // gambar ulang tab yang usang saat browser sedang menganggur
  if (flushT) return;
  const run = () => { flushT = 0; Object.keys(lazyStale).forEach(flushLazy); };
  flushT = 'requestIdleCallback' in window ? requestIdleCallback(run, {timeout: 500}) : setTimeout(run, 300); // cepat: kalau tab langsung dibuka, tidak perlu menggambar di jalur klik
}
function flushLazy(viewId) { const fn = lazyStale[viewId]; if (fn) { delete lazyStale[viewId]; fn(); } }

// ---------- Render peta ----------
function renderChartRaw() {
  hidePop();
  const counts = {}, all = {}, on = isFiltered();
  records.forEach(r => all[r.seat] = 1);
  const allTime = {}; // skala warna memakai semua riwayat (bukan hasil filter) supaya warna tidak bergeser saat memfilter
  records.forEach(r => allTime[r.seat] = (allTime[r.seat] || 0) + 1);
  setHeatScale(Math.max(0, ...Object.values(allTime)));
  const lgs = $('lg-scale'); if (lgs) lgs.innerHTML = heatLegend();
  view().forEach(r => counts[r.seat] = (counts[r.seat] || 0) + 1);
  const seat = code => {
    const c = counts[code] || 0, h = c ? heat(c) : null;
    const st = h ? ` style="background:${h.bg};color:${h.fg};border-color:${h.bd}"` : '';
    return `<button type="button" class="seat${c ? ' visited' : ''}${on && all[code] && !c ? ' dim' : ''}${showUnv ? (c ? ' seen' : ' want') : ''}" data-seat="${code}"${st} aria-label="Kursi ${code}${c ? `, ${c} kali` : ''}">
      <span>${code}</span>${c ? `<span class="seat-count">${c}</span>` : ''}</button>`;
  };
  $('chart').innerHTML = rowLabels() + [0, 1, 2, 3].map(j =>
    `<div class="seat-block block-${j + 1}">` +
    LAYOUT.map((row, i) => `<div class="seat-row" style="--r:${i}">${row[j].map(seat).join('')}</div>`).join('') + '</div>').join('') + rowLabels();
  fitKey = ''; // isi peta baru digambar: ukurannya harus diukur ulang
  $('total').textContent = records.length; $('total').dataset.cu = records.length;
  const first = !introDone && records.length > 0; // animasi masuk hanya sekali
  introDone = introDone || first; intro = first;
  $('chart').classList.toggle('intro', first);
  // .intro harus dilepas setelah animasi masuk selesai. Kalau dibiarkan, setiap tab Peta dibuka lagi (display:none -> tampil)
  // 60 baris kursi memutar ulang animasi 'rise' (delay bertingkat sampai ~4 detik) = berat + peta lama muncul
  if (first) { clearTimeout(renderChartRaw._introT); renderChartRaw._introT = setTimeout(() => $('chart').classList.remove('intro'), 4600); }
  const sig = JSON.stringify(filter);
  if (lastSig !== null && sig !== lastSig && !first && replayN === null) playRefresh();
  lastSig = sig;
  syncFbar();
  if (first) playEnter($('view-main'));
  if (first && !calm()) setTimeout(pingLatest, 4700); // setelah animasi masuk peta selesai
  renderFilters(); renderStats(); if (first) { countUp($('stats')); countUp($('total').parentElement); }
  tweenNums('st', $('stats'));
  renderSetlists(); renderRows(); renderCal(); lazyView('view-gal', renderGallery); lazyView('view-tl', renderTimeline); renderCover(); renderCoverSl(); if (first) { countUp($('cover')); countUp($('cover-sl')); } renderLast(); renderMemory(); renderCompare(); renderMembers(); renderStory(); lazyView('view-ev', renderTickets); syncUrl();
  requestAnimationFrame(centerChart);
}

// kursi show terakhir berdenyut dua kali (sekali, saat peta pertama kali tampil) supaya mata langsung tertuju ke sana
function pingLatest() {
  const r = [...records].sort(cmp)[0], v = $('view-main');
  if (!r || !v || v.hidden) return;
  const el = $('chart').querySelector(`.seat[data-seat="${r.seat}"]`);
  if (!el) return;
  el.classList.add('fresh');
  setTimeout(() => el.classList.remove('fresh'), 3400);
}
let mapScale = 1, mapAuto = true; // zoom peta di HP (cubit dua jari / tombol); mapAuto = otomatis pas lebar layar
var fitKey = ''; // ukuran saat terakhir diukur: kalau sama, peta tidak perlu diukur ulang (hemat 250 kursi x 2 tata letak)
function fitChart(force) {
  const w = $('seating-wrapper'), c = $('stage-container');
  const key = w.clientWidth + ':' + innerWidth + ':' + (mapAuto ? 'a' : mapScale);
  if (!force && key === fitKey && w.clientWidth) return;
  fitKey = key;
  c.style.zoom = ''; c.style.transform = ''; c.style.marginLeft = c.style.marginBottom = ''; w.style.overflowX = '';
  if (!w.clientWidth) return; // tab tersembunyi
  const fit = Math.min(1, w.clientWidth / c.scrollWidth);
  if (window.innerWidth > 768) {
    mapScale = 1;
    if (fit < 1) { // transform: kotak DAN teks mengecil bersama di semua browser; margin menyesuaikan ruang yang dipakai
      const nw = c.offsetWidth, nh = c.offsetHeight;
      c.style.transformOrigin = '0 0';
      c.style.transform = `scale(${fit.toFixed(4)})`;
      c.style.marginLeft = Math.max(0, (w.clientWidth - nw * fit) / 2) + 'px';
      c.style.marginBottom = -(nh * (1 - fit)) + 'px';
      w.style.overflowX = 'hidden'; // sudah pasti muat; lebar tata letak aslinya tidak boleh menjadi area gulir
    }
    return;
  }
  if (mapAuto) mapScale = fit; // HP: peta langsung muat selebar layar; cubit / tombol + untuk memperbesar
  else mapScale = Math.max(fit, mapScale);
  if (mapScale !== 1) c.style.zoom = mapScale.toFixed(3);
}
function centerChart() {
  fitChart();
  const w = $('seating-wrapper'), c = $('stage-container');
  if (window.innerWidth <= 768 && !mapAuto) return; // sedang di-zoom manual: jangan pindahkan posisi geser
  if (c.style.transform) { w.scrollLeft = 0; return; } // peta diskalakan agar muat: tidak ada yang perlu digulir
  w.scrollLeft = (c.scrollWidth - w.clientWidth) / 2;
}
window.addEventListener('resize', centerChart);

// ---------- Modal riwayat kursi ----------
function openSeat(code) {
  hidePop();
  $('modal-seat').textContent = code;
  const list = records.filter(r => r.seat === code).sort(cmp);
  $('modal-hist').innerHTML = list.length ? list.map((r, ri) => `
    <div class="hi" style="--i:${Math.min(ri, 5)}">
      <b>${esc(r.setlist)}</b>
      <div class="hd">${esc(fmtDate(r.date))}${r.sesi ? ' · ' + r.sesi : ''}</div>
      ${r.note ? `<div class="hn">"${esc(r.note)}"</div>` : ''}
      ${extras(r).map(x => `<div class="ht">${esc(x.label)} dengan ${x.member ? `<button type="button" class="mem-link" data-mem="${esc(x.member)}">${esc(x.member)}</button>` : ''}</div>${x.photo ? `<div class="hi-ph"><img src="${esc(thumbOf(x.photo))}" data-full="${esc(x.photo)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="Foto ${esc(x.label)}" data-cap="${esc(x.label)} dengan ${esc(x.member)}" data-sub="${esc([r.setlist, fmtDate(r.date), r.sesi, 'Kursi ' + r.seat].filter(Boolean).join(' · '))}" decoding="async"></div>` : ''}`).join('')}
      ${r.harga ? `<div class="hn">${esc(rupiah(r.harga))}${r.tiket ? ' · ' + esc(r.tiket) : ''}</div>` : ''}
      ${lotHtml(r)}
      <button type="button" class="btn-s share" data-share="${r.id}">Bagikan kartu</button>
    </div>`).join('') : `<div class="empty">Belum ada riwayat di kursi ${esc(code)}</div>`;
  $('modal-hist').scrollTop = 0;
  openEl('seat-modal');
  $('seat-close').focus({preventScroll: true});
}
$('modal-hist').addEventListener('load', e => { // foto memudar masuk setelah selesai dimuat (tempatnya sudah dipesan, jadi tidak ada lompatan)
  if (e.target.tagName !== 'IMG') return;
  e.target.classList.add('ld'); e.target.parentElement.classList.add('ld');
}, true);

// ---------- Popover hover (satu elemen dipakai bergantian) ----------
const pop = document.createElement('div');
pop.id = 'pop';
pop.setAttribute('role', 'tooltip');
document.body.appendChild(pop);
let popSeat = null;
const hidePop = () => { popSeat = null; pop.classList.remove('on'); };

function showPop(btn) {
  const code = btn.dataset.seat;
  const list = records.filter(r => r.seat === code).sort(cmp);
  if (!list.length) return hidePop(); // kursi belum pernah ditempati: tanpa popover
  if (popSeat !== code) {
    popSeat = code;
    pop.innerHTML = `<div class="pop-h"><span class="seat-badge">${esc(code)}</span><span>${list.length}× duduk</span></div>` +
      list.slice(0, 3).map(r => `
        <div class="pop-i"><b>${esc(r.setlist)}</b>
          <div class="hd">${esc(fmtDate(r.date))}${r.sesi ? ' · ' + r.sesi : ''}</div>
          ${extras(r).map(x => `<div class="ht">${esc(x.label)} dengan ${esc(x.member)}</div>`).join('')}
        </div>`).join('') +
      `<div class="pop-m">${list.length > 3 ? `+${list.length - 3} lainnya · ` : ''}klik untuk detail & foto</div>`;
  }
  pop.classList.add('on');
  // position:fixed + rect kursi, jadi tidak terpengaruh zoom chart
  const b = btn.getBoundingClientRect(), p = pop.getBoundingClientRect();
  const above = b.top - p.height - 8;
  pop.style.top = (above >= 8 ? above : b.bottom + 8) + 'px';
  pop.style.left = Math.max(8, Math.min(innerWidth - p.width - 8, b.left + b.width / 2 - p.width / 2)) + 'px';
}

const canHover = matchMedia('(hover: hover)');
$('chart').addEventListener('mouseover', e => {
  if (!canHover.matches) return;
  const b = e.target.closest('[data-seat]');
  b ? showPop(b) : hidePop();
});
$('chart').addEventListener('mouseleave', hidePop);
$('chart').addEventListener('focusin', e => { // navigasi keyboard
  const b = e.target.closest('[data-seat]');
  if (b && b.matches(':focus-visible')) showPop(b);
});
$('chart').addEventListener('focusout', hidePop);
addEventListener('scroll', hidePop, true);

// ---------- Event modal & lightbox ----------
$('chart').addEventListener('click', e => {
  const b = e.target.closest('[data-seat]');
  if (b) openSeat(b.dataset.seat);
});
$('seat-close').addEventListener('click', () => closeEl('seat-modal'));
// Lembar bawah ala iOS (HP): tarik gagang/judul ke bawah > 90px untuk menutup, kalau kurang lepas kembali. Dipakai modal kursi dan lembar bagikan.
function sheetDragClose(m, handleSel, overlayId) {
  let y0 = 0, dy = 0, on = false;
  m.addEventListener('touchstart', e => { on = innerWidth <= 600 && !!e.target.closest(handleSel) && e.touches.length === 1; y0 = e.touches[0].clientY; dy = 0; if (on) m.style.transition = 'none'; }, {passive: true});
  m.addEventListener('touchmove', e => { if (!on) return; dy = Math.max(0, e.touches[0].clientY - y0); m.style.transform = `translate3d(0,${dy}px,0)`; }, {passive: true});
  m.addEventListener('touchend', () => {
    if (!on) return; on = false;
    m.style.transition = '';
    if (dy > 90) { closeEl(overlayId); setTimeout(() => { m.style.transform = ''; }, 320); } // lanjut meluncur turun (kelas .closing)
    else m.style.transform = '';
  });
}
(() => {
  const m = document.querySelector('#seat-modal .modal');
  m.insertAdjacentHTML('afterbegin', '<div class="sheet-grip" aria-hidden="true"></div>');
  sheetDragClose(m, '.sheet-grip,#modal-title', 'seat-modal');
})();
$('seat-modal').addEventListener('click', e => { if (e.target.id === 'seat-modal') closeEl('seat-modal'); });
document.addEventListener('click', e => {
  const im = e.target.closest('img[data-photo]');
  if (im) openLightbox(im);
});
let lbTok = 0, lbSrc = null, lbDrag = {dy: 0, sc: 1}, lbMoved = false, lbList = [], lbIdx = 0;
const lbRoot = $('lightbox'), lbEase = 'cubic-bezier(.32,.72,0,1)';
lbRoot.insertAdjacentHTML('beforeend', `<button type="button" class="lb-x" id="lb-x" aria-label="Tutup foto">&times;</button>
  <button type="button" class="lb-nav lb-prev" id="lb-prev" aria-label="Foto sebelumnya"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
  <button type="button" class="lb-nav lb-next" id="lb-next" aria-label="Foto berikutnya"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>
  <div class="lb-cap" id="lb-cap" aria-live="polite"><b></b><span></span><small></small></div>`);
const lbShowSrc = () => { if (lbSrc) lbSrc.style.visibility = ''; };
// foto yang dibuka digabung dengan foto-foto lain di wadah yang sama (galeri, kartu member, riwayat kursi, kilas balik) supaya bisa digeser
const LB_GROUP = '#gallery,.mem-ph,#modal-hist,#memory';
function lbGather(im) {
  const box = im.closest(LB_GROUP), els = box ? [...box.querySelectorAll('img[data-photo]')] : [im];
  return els.includes(im) ? els : [im];
}
function lbCaption() { // keterangan di bawah foto: judul + sub (data-cap / data-sub), cadangan: alt
  const im = lbList[lbIdx], cap = $('lb-cap'), [t, s, n] = cap.children;
  t.textContent = (im.dataset.cap || im.alt || '').trim();
  s.textContent = im.dataset.sub || '';
  n.textContent = lbList.length > 1 ? `${lbIdx + 1} / ${lbList.length}` : '';
  cap.hidden = !t.textContent && !s.textContent && !n.textContent;
  $('lb-prev').hidden = $('lb-next').hidden = lbList.length < 2;
  $('lb-prev').disabled = lbIdx <= 0; $('lb-next').disabled = lbIdx >= lbList.length - 1;
  if (!calm() && !cap.hidden) cap.animate([{opacity: 0, transform: 'translateY(6px)'}, {opacity: 1, transform: 'none'}], {duration: 380, easing: lbEase});
}
function lbLoad(im, tok) { // pasang foto kecil dulu (langsung tampil), lalu foto penuh ditukar tanpa kedip
  const lb = $('lb-img'), full = im.dataset.full || im.src;
  const ar = im.complete && im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : 0;
  // ukuran tampil dikunci dari rasio thumbnail (rasio foto penuh sama), jadi saat ditukar foto tidak melompat
  const setAr = a => { if (a) lb.style.setProperty('--ar', a.toFixed(4)); else lb.style.removeProperty('--ar'); lb.classList.toggle('fit', !!a); };
  setAr(ar);
  if (ar) lb.src = im.currentSrc || im.src;
  if (!ar || full !== lb.src) {
    const pre = new Image(); pre.src = full;
    (pre.decode ? pre.decode() : Promise.resolve()).catch(() => {}).then(() => {
      if (tok !== lbTok || !lbRoot.classList.contains('open')) return;
      if (!ar && pre.naturalWidth) setAr(pre.naturalWidth / pre.naturalHeight);
      lb.src = full;
    });
  }
  [-2, -1, 1, 2].forEach(o => { const x = lbList[lbIdx + o]; if (x) { x.loading = 'eager'; const p = new Image(); p.src = x.dataset.full || x.src; } }); // tetangga disiapkan lebih dulu
}
function openLightbox(im) { // foto kecil langsung tampil & membesar dari posisinya
  const lb = $('lb-img'), from = im.getBoundingClientRect(), tok = ++lbTok;
  lb.getAnimations().forEach(a => a.cancel()); // bersihkan sisa animasi tutup sebelumnya
  lb.style.animation = ''; lb.style.transform = ''; lbRoot.style.opacity = ''; lbDrag = {dy: 0, sc: 1};
  lbShowSrc(); lbSrc = im;
  lbList = lbGather(im); lbIdx = lbList.indexOf(im);
  lbCaption();
  lbLoad(im, tok);
  openEl('lightbox');
  try { $('lb-x').focus({preventScroll: true}); } catch (e) {}
  if (!calm() && from.width) {
    const to = lb.getBoundingClientRect(); // layout dipaksa sekarang juga (overlay sudah tampil), jadi tidak ada frame "loncat"
    if (to.width) {
      const s = from.width / to.width, dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2);
      lb.style.animation = 'none'; // gerak ini diatur di sini; jangan tumpang tindih dengan animasi CSS bawaan
      lb.animate([{transform: `translate3d(${dx}px,${dy}px,0) scale(${s})`, opacity: .6}, {transform: 'none', opacity: 1}], {duration: 560, easing: lbEase});
    }
  }
}
function lbGo(d) { // ganti ke foto sebelumnya (-1) / berikutnya (+1) di grup yang sama
  const ni = lbIdx + d;
  if (!lbRoot.classList.contains('open') || lbRoot.classList.contains('closing') || ni < 0 || ni >= lbList.length) return false;
  const lb = $('lb-img'), tok = ++lbTok, im = lbList[ni];
  lbIdx = ni; lbSrc = im;
  lb.getAnimations().forEach(a => a.cancel()); lb.style.animation = 'none'; lb.style.transform = ''; lbDrag = {dy: 0, sc: 1};
  try { im.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'}); } catch (e) {} // thumbnail asal ikut terlihat di belakang, jadi foto bisa "terbang pulang" saat ditutup
  lbCaption();
  lbLoad(im, tok);
  if (!calm()) lb.animate([{transform: `translate3d(${d * 64}px,0,0) scale(.96)`, opacity: 0}, {transform: 'none', opacity: 1}], {duration: 460, easing: lbEase});
  return true;
}
// Geometri "mendarat" foto yang terbang pulang: meniru cara thumbnail menampilkan foto (object-fit + object-position + radius),
// supaya foto tidak lebih tinggi/lebar dari thumbnail lalu melompat saat overlay dilepas. Semua ukuran dalam px kotak foto besar (sebelum skala).
function lbLandGeom(lb, src, r, bw, bh) {
  const ba = bw / bh, na = lb.naturalWidth && lb.naturalHeight ? lb.naturalWidth / lb.naturalHeight : ba;
  const cw = na > ba ? bw : bh * na, ch = na > ba ? bw / na : bh; // area foto sebenarnya di dalam kotak (object-fit: contain)
  const cs = getComputedStyle(src), rad0 = parseFloat(cs.borderTopLeftRadius) || 0;
  if (cs.objectFit !== 'cover') { // thumbnail menampilkan seluruh foto: cukup skala pas, tanpa potong
    const s = Math.min(r.width / cw, r.height / ch);
    return {s, clip: `inset(0px round ${rad0 / s}px)`, rad: rad0 / s, u0: 0, v0: 0};
  }
  const pos = cs.objectPosition.split(' ').map(v => v.endsWith('%') ? parseFloat(v) / 100 : .5), px = isNaN(pos[0]) ? .5 : pos[0], py = isNaN(pos[1]) ? .5 : pos[1];
  const s = Math.max(r.width / cw, r.height / ch), vw = r.width / s, vh = r.height / s; // bagian foto yang tampak di thumbnail
  const L = (bw - cw) / 2 + (cw - vw) * px, T = (bh - ch) / 2 + (ch - vh) * py;
  return {s, clip: `inset(${T}px ${bw - L - vw}px ${bh - T - vh}px ${L}px round ${rad0 / s}px)`, rad: rad0 / s, u0: L + vw / 2 - bw / 2, v0: T + vh / 2 - bh / 2};
}
function closeLightbox() { // foto "terbang" kembali ke thumbnail asalnya; kalau thumbnail tak terlihat: mengecil + memudar
  if (!lbRoot.classList.contains('open') || lbRoot.classList.contains('closing')) return;
  const lb = $('lb-img'), src = lbSrc, tok = ++lbTok;
  const r = src && src.isConnected ? src.getBoundingClientRect() : null;
  const vis = r && r.width > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const cur = lb.getBoundingClientRect(); // posisi sekarang, termasuk geseran jari
  const under = ovOpen().filter(o => o !== lbRoot).pop(); // fokus kembali ke kartu di bawahnya (mis. kartu member), bukan ke halaman
  lastFocus.lightbox = under && under.querySelector('.x') || lastFocus.lightbox;
  closeEl('lightbox'); // latar memudar lewat kelas .closing
  if (calm() || !cur.width) { lbShowSrc(); return; }
  const fromT = `translate3d(0,${lbDrag.dy}px,0) scale(${lbDrag.sc})`;
  lb.getAnimations().forEach(a => a.cancel());
  lb.style.animation = 'none'; lb.style.transform = '';
  let anim;
  if (vis) {
    const bw = cur.width / lbDrag.sc, bh = cur.height / lbDrag.sc, bcx = cur.left + cur.width / 2, bcy = cur.top + cur.height / 2 - lbDrag.dy;
    const g = lbLandGeom(lb, src, r, bw, bh), r0 = parseFloat(getComputedStyle(lb).borderTopLeftRadius) || 0;
    const dx = r.left + r.width / 2 - bcx - g.s * g.u0, dy = r.top + r.height / 2 - bcy - g.s * g.v0;
    anim = lb.animate([
      {transform: fromT, opacity: 1, clipPath: `inset(0px round ${r0}px)`, borderRadius: r0 + 'px'},
      {transform: `translate3d(${dx}px,${dy}px,0) scale(${g.s})`, opacity: 1, clipPath: g.clip, borderRadius: g.rad + 'px'}
    ], {duration: 380, easing: lbEase, fill: 'forwards'});
    anim.onfinish = () => { if (tok === lbTok) lbShowSrc(); };
  } else {
    anim = lb.animate([{transform: fromT, opacity: 1}, {transform: `translate3d(0,${lbDrag.dy + 28}px,0) scale(${lbDrag.sc * .92})`, opacity: 0}], {duration: 280, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards'});
    lbShowSrc();
  }
}
lbRoot.addEventListener('click', e => {
  if (e.target.closest('.lb-nav,.lb-cap')) return; // tombol panah & keterangan tidak menutup foto
  if (lbMoved) { lbMoved = false; return; }
  closeLightbox();
});
$('lb-prev').addEventListener('click', () => lbGo(-1));
$('lb-next').addEventListener('click', () => lbGo(1));
(() => { // geser foto: ke atas/bawah = tutup (foto + latar mengikuti jari), ke kiri/kanan = foto lain (HP)
  const lb = $('lb-img');
  let id = null, x0 = 0, y0 = 0, lastX = 0, lastY = 0, lastT = 0, vx = 0, vy = 0, axis = '';
  lbRoot.addEventListener('pointerdown', e => {
    lbMoved = false;
    if (e.pointerType === 'mouse' || !e.isPrimary || lbRoot.classList.contains('closing') || e.target.closest('.lb-nav,.lb-x')) return;
    id = e.pointerId; x0 = lastX = e.clientX; y0 = lastY = e.clientY; lastT = e.timeStamp; vx = vy = 0; axis = '';
  });
  lbRoot.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const dy = e.clientY - y0, dx = e.clientX - x0;
    if (!axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      axis = Math.abs(dx) > Math.abs(dy) ? (lbList.length > 1 ? 'h' : 'n') : 'v';
      if (axis === 'n') return;
      lbMoved = true;
      try { lbRoot.setPointerCapture(id); } catch (err) {}
      lb.getAnimations().forEach(a => a.cancel()); lb.style.animation = 'none';
    }
    if (axis === 'n') return;
    const dt = e.timeStamp - lastT;
    if (dt > 0) { vx = (e.clientX - lastX) / dt; vy = (e.clientY - lastY) / dt; }
    lastX = e.clientX; lastY = e.clientY; lastT = e.timeStamp;
    if (axis === 'h') { // di ujung grup, geseran terasa berat (tidak ada foto lagi)
      const has = lbList[lbIdx + (dx < 0 ? 1 : -1)], x = has ? dx : dx * .3;
      lbDrag = {dy: 0, sc: 1, dx: x};
      lb.style.transform = `translate3d(${x}px,0,0)`;
      return;
    }
    const p = Math.min(Math.abs(dy) / 320, 1), sc = 1 - .16 * p;
    lbDrag = {dy, sc};
    lb.style.transform = `translate3d(0,${dy}px,0) scale(${sc})`;
    lbRoot.style.opacity = String(1 - .75 * p);
  });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null;
    if (!axis || axis === 'n') return;
    const ax = axis; axis = '';
    if (ax === 'h') {
      const dx = lbDrag.dx || 0, dir = dx < 0 ? 1 : -1;
      if ((Math.abs(dx) > 60 || Math.abs(vx) > .45) && lbGo(dir)) return;
      const t = lb.style.transform; lb.style.transform = ''; lbDrag = {dy: 0, sc: 1};
      lb.animate([{transform: t}, {transform: 'none'}], {duration: 420, easing: lbEase});
      return;
    }
    if (Math.abs(lbDrag.dy) > 110 || Math.abs(vy) > .6) { closeLightbox(); return; }
    const t = lb.style.transform, o = lbRoot.style.opacity || '1';
    lb.style.transform = ''; lbRoot.style.opacity = ''; lbDrag = {dy: 0, sc: 1};
    lb.animate([{transform: t}, {transform: 'none'}], {duration: 420, easing: lbEase});
    lbRoot.animate([{opacity: o}, {opacity: 1}], {duration: 420, easing: lbEase});
  };
  lbRoot.addEventListener('pointerup', end);
  lbRoot.addEventListener('pointercancel', end);
})();

// ---- halaman di belakang kartu tidak ikut tergulir: roda / jari di mana pun menggulir isi kartu ----
(() => {
  const SC = '.mem-body,.hist', OVS = ['mem-modal', 'seat-modal'];
  const topOv = topOverlay;
  document.addEventListener('wheel', e => {
    const ov = topOv();
    if (!ov || !e.target.closest) return;
    if (ov.id === 'lightbox') { e.preventDefault(); return; }
    if (!OVS.includes(ov.id) || e.ctrlKey) return;
    const own = e.target.closest(SC), box = own || ov.querySelector(SC);
    if (own) { // sedang di area gulir: biarkan gulir bawaan, tapi jangan bocor ke halaman saat sudah di ujung
      const up = e.deltaY < 0;
      if ((up && own.scrollTop <= 0) || (!up && own.scrollTop + own.clientHeight >= own.scrollHeight - 1)) e.preventDefault();
      return;
    }
    e.preventDefault(); // di latar / judul kartu: dipakai untuk menggulir kartu
    if (box) box.scrollTop += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
  }, {passive: false});
  let ty = 0;
  document.addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, {passive: true});
  document.addEventListener('touchmove', e => {
    const ov = topOv();
    if (!ov || !OVS.includes(ov.id) || !e.target.closest) return;
    const y = e.touches[0].clientY, dy = y - ty; ty = y;
    if (e.target.closest('.sheet-grip,#modal-title')) return; // tarik gagang lembar bawah: urusan gestur lembar
    const own = e.target.closest(SC);
    if (own) { if ((dy > 0 && own.scrollTop <= 0) || (dy < 0 && own.scrollTop + own.clientHeight >= own.scrollHeight - 1)) e.preventDefault(); return; }
    const box = ov.querySelector(SC);
    if (box) box.scrollTop -= dy;
    e.preventDefault();
  }, {passive: false});
})();

// Escape: lightbox dulu, lalu hook halaman (mis. dialog konfirmasi admin), terakhir modal kursi
const escHooks = [];
function escClose() { // tutup lapisan paling atas (dipakai Esc dan tombol Back)
  if ($('share-sheet')?.classList.contains('open') && !$('share-sheet').classList.contains('closing')) closeEl('share-sheet'); // lembar bagikan selalu di paling atas
  else if (lbRoot.classList.contains('open') && !lbRoot.classList.contains('closing')) closeLightbox();
  else if ($('seat-modal').classList.contains('over') && $('seat-modal').classList.contains('open') && !$('seat-modal').classList.contains('closing')) closeEl('seat-modal'); // kursi dari kartu member: tutup kursi dulu, kartu tetap
  else if (!escHooks.some(h => h())) closeEl('seat-modal');
}
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') return trapTab(e);
  if (lbRoot.classList.contains('open') && !lbRoot.classList.contains('closing') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); lbGo(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (e.key !== 'Escape') return;
  escClose();
});

