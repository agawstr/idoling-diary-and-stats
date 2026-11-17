/* assets/js/shared/members.js — Statistik per member
   Bagian dari kode bersama index.html & admin.html (dulu satu file shared.js). Dimuat berurutan sebagai skrip klasik
   (satu lingkup global yang sama); urutan muat ada di index.html dan admin.html dan diperiksa oleh scripts/check_assets.py. */
// ================= Statistik per member =================
// Semua pertemuan (2-Shot + Chekicha, termasuk sesi lepas) dengan satu member, dari seluruh data (tidak terpengaruh filter).
function memberStats(name) {
  const m = {name, ts: 0, ck: 0, shows: [], solo: 0, ev: 0, dates: [], photos: []};
  records.forEach(r => {
    const x = extras(r).filter(e => e.member === name);
    if (!x.length) return;
    m.shows.push(r);
    x.forEach(e => { m[e.k]++; m.dates.push(r.date); if (e.photo) m.photos.push({src: e.photo, date: r.date, label: e.label, setlist: r.setlist, seat: r.seat, sesi: r.sesi}); });
  });
  solo.filter(w => w.member === name).forEach(w => {
    m[w.kind]++; m.solo++; m.dates.push(w.date);
    if (w.photo) m.photos.push({src: w.photo, date: w.date, label: w.kind === 'ts' ? '2-Shot' : 'Chekicha', setlist: w.setlist || 'Di luar show'});
    if (w.setlist) m.shows.push({setlist: w.setlist, seat: '', date: w.date, solo: 1});
  });
  m.ev = tickets.filter(t => t.type !== 'SHOW' && t.used > 0 && t.member === name).length;
  // kemunculan: show tempat dia tampil (lineup) ATAU bertemu 2-Shot/Chekicha; hanya show asli (bukan sesi lepas)
  m.appear = records.filter(r => (r.lineup || []).includes(name) || extras(r).some(x => x.member === name));
  m.lineupN = records.filter(r => (r.lineup || []).includes(name)).length;
  m.hasLineup = records.some(r => (r.lineup || []).length);
  m.appSeats = Object.entries(m.appear.reduce((o, r) => (r.seat && (o[r.seat] = (o[r.seat] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1] || seatTie(a[0], b[0]));
  m.appSetlists = Object.entries(m.appear.reduce((o, r) => (r.setlist && (o[r.setlist] = (o[r.setlist] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  m.span = [...m.dates, ...m.appear.map(r => r.date)].filter(Boolean).sort();
  m.dates.sort(); m.photos.sort((a, b) => b.date.localeCompare(a.date));
  m.setlists = Object.entries(m.shows.reduce((o, r) => (r.setlist && (o[r.setlist] = (o[r.setlist] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  m.seats = Object.entries(m.shows.reduce((o, r) => (r.seat && (o[r.seat] = (o[r.seat] || 0) + 1), o), {})).sort((a, b) => b[1] - a[1] || seatTie(a[0], b[0]));
  return m;
}
// semua member yang pernah muncul (lineup, 2-Shot, Chekicha, sesi lepas): [nama, jumlah ditampilkan, pernah bertemu?]
// jumlah = berapa kali ditonton tampil (lineup atau bertemu); kalau belum ada lineup sama sekali, jumlah pertemuan 2-Shot/Chekicha
function memberNames() {
  const app = {}, met = {}, hasLineup = records.some(r => (r.lineup || []).length);
  records.forEach(r => {
    const names = new Set(extras(r).map(x => x.member).filter(Boolean));
    names.forEach(n => met[n] = (met[n] || 0) + 1);
    [...names, ...(r.lineup || [])].forEach(n => app[n] = (app[n] || 0) + 1);
    new Set([...(r.lineup || [])].filter(n => names.has(n))).forEach(n => app[n]--); // yang ada di lineup DAN bertemu dihitung sekali
  });
  solo.forEach(w => { if (w.member) met[w.member] = (met[w.member] || 0) + 1; });
  const all = new Set([...Object.keys(app), ...Object.keys(met)]);
  return [...all].map(n => [n, hasLineup ? (app[n] || met[n] || 0) : (met[n] || 0), met[n] || 0]); // [nama, angka utama, berapa kali bertemu (2-Shot/Chekicha/sesi lepas)]
}
// foto terbaru tiap member (2-Shot / Chekicha, termasuk sesi lepas) untuk avatar di chip
function memberAvatars() {
  const av = {};
  const put = (n, src, date) => { if (n && src && (!av[n] || date > av[n].date)) av[n] = {src, date: date || ''}; };
  records.forEach(r => extras(r).forEach(e => put(e.member, e.photo, r.date)));
  solo.forEach(w => put(w.member, w.photo, w.date));
  return av;
}
const memInit = n => (String(n).trim().match(/[A-Za-z0-9\u00C0-\uFFFF]/) || ['?'])[0].toUpperCase();
const memCache = {sig: '', nodes: new Map()};
let memQ = '', memSort = 'top', memMode = 'all'; // memMode: 'all' (semua yang tampil) | 'met' (pernah bertemu) | 'unmet' (belum bertemu)
$('mchart').insertAdjacentHTML('afterend', `<section id="mem-sec"><h2 class="sec" id="mem-h">Per member <small class="hint" style="display:inline">· ketuk nama untuk statistiknya</small></h2>
  <div id="mem-bar"><span class="mem-qw" id="mem-qw"><input type="search" id="mem-q" placeholder="Cari member…" aria-label="Cari member" autocomplete="off"><span id="mem-qn" class="mem-qn" aria-hidden="true"></span><button type="button" id="mem-qx" class="mem-qx" aria-label="Hapus pencarian" hidden><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg></button></span><button type="button" class="btn-s" id="mem-sort" aria-label="Ubah urutan"></button></div>
  <div id="mem-mode" class="mem-mode" role="group" aria-label="Member yang ditampilkan" hidden><i class="seg-ind" aria-hidden="true"></i><button type="button" data-mode="all" aria-pressed="true">Semua member</button><button type="button" data-mode="met" aria-pressed="false">Pernah 2‑Shot/<wbr>Chekicha</button><button type="button" data-mode="unmet" aria-pressed="false">Belum bertemu</button></div>
  <p id="mem-n" class="mem-n" aria-live="polite"></p><p id="mem-key" class="mem-key"></p><div id="mem-list"></div></section>`);
// tinggi daftar member dianimasikan: saat hasil cari berkurang, halaman memendek perlahan (layar turun/naik mulus, tidak mendadak terlempar ke atas);
// saat kata dihapus dan hasil bertambah, halaman memanjang perlahan.
function renderMembers(anim, fast) { // fast = ganti saklar: tanpa animasi tinggi (menghindari layout berulang tiap frame)
  const box = $('mem-list');
  if (!box) return;
  if (calm() || fast) { clearTimeout(box._ht); box.style.height = box.style.transition = ''; return renderMembersCore(anim); }
  const h0 = box.offsetHeight; // tinggi saat ini (bisa sedang di tengah animasi sebelumnya)
  clearTimeout(box._ht); box.style.transition = 'none'; box.style.height = '';
  renderMembersCore(anim);
  const h1 = box.offsetHeight;
  if (!h0 || Math.abs(h0 - h1) < 2) { box.style.transition = ''; return; }
  box.style.height = h0 + 'px'; void box.offsetHeight;
  // makin jauh selisih tingginya, makin lama (dan makin lembut: ease-in-out) supaya layar tidak "melesat" ke atas/bawah
  const dur = Math.round(Math.min(900, Math.max(450, 350 + Math.abs(h0 - h1) * .4)));
  box.style.transition = `height ${dur}ms cubic-bezier(.32,.72,0,1)`;
  box.style.height = h1 + 'px';
  box._ht = setTimeout(() => { box.style.height = ''; box.style.transition = ''; }, dur + 80);
}
function renderMembersCore(anim) {
  const box = $('mem-list');
  if (!box) return;
  // rekam posisi chip lama (untuk animasi geser/masuk/keluar saat mengetik di pencarian atau ganti urutan)
  const fx = anim && !calm();
  const oldPos = new Map(), ghosts = [];
  if (fx) {
    const br = box.getBoundingClientRect();
    box.querySelectorAll('.mem-chip').forEach(el => {
      const r = el.getBoundingClientRect();
      oldPos.set(el.dataset.mem, r);
      if (r.bottom > 0 && r.top < innerHeight) ghosts.push({n: el.dataset.mem, node: el.cloneNode(true), l: r.left - br.left + box.scrollLeft, t: r.top - br.top + box.scrollTop, w: r.width, h: r.height});
    });
  }
  const all = memberNames(), hasLineup = records.some(r => (r.lineup || []).length);
  const mode = hasLineup ? memMode : 'all'; // saklar hanya berarti kalau lineup sudah ada
  const inMode = m => mode === 'all' || (mode === 'unmet' ? m === 0 : m > 0); // met = pernah 2-Shot/Chekicha, unmet = sering tampil tapi belum pernah bertemu
  const q = memQ.trim().toLowerCase(), avs = memberAvatars();
  const list = all.filter(([n, , m]) => inMode(m) && (!q || n.toLowerCase().includes(q)))
    .sort((a, b) => memSort === 'az' ? a[0].localeCompare(b[0]) : b[1] - a[1] || a[0].localeCompare(b[0]));
  $('mem-h').hidden = $('mem-bar').hidden = $('mem-key').hidden = !all.length;
  $('mem-mode').hidden = !all.length || !hasLineup;
  $('mem-mode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  const sb = $('mem-sort'), stxt = memSort === 'az' ? 'A–Z' : 'Terbanyak';
  if (!sb.firstElementChild) sb.innerHTML = '<span class="ms-l"></span>';
  if (sb.firstElementChild.textContent !== stxt) sb.firstElementChild.textContent = stxt;
  $('mem-key').innerHTML = hasLineup && mode === 'unmet'
    ? '<span class="lg-i"><b class="lg-a">8</b> kali ditonton tampil, belum pernah 2-Shot / Chekicha</span><span class="lg-i lg-n">Diurutkan dari yang paling sering kamu lihat di panggung</span>'
    : hasLineup
    ? '<span class="lg-i"><b class="lg-a">8</b> kali ditonton (tampil di show)</span><span class="lg-i"><b class="lg-m">3</b> di antaranya 2-Shot / Chekicha</span><span class="lg-i lg-n">Kotak berwarna = pernah 2-Shot/Chekicha · yang redup belum</span>'
    : 'Angka = jumlah 2-Shot + Chekicha. Isi lineup di admin untuk menghitung semua member yang tampil.';
  box.classList.toggle('lu', hasLineup);
  const pool = all.filter(([, , m]) => inMode(m)).length; // jumlah sebelum pencarian
  $('mem-n').hidden = !all.length;
  $('mem-n').textContent = !all.length ? '' : q && list.length !== pool ? `${list.length} dari ${pool} member` : `${pool} member`;
  { const w = $('mem-qw'); if (w) { w.classList.toggle('has-q', !!memQ); $('mem-qx').hidden = !memQ; $('mem-qn').textContent = q ? `${list.length}/${pool}` : ''; } } // hitungan hasil + tombol hapus langsung di kolom cari
  // chip dibuat SEKALI per versi data lalu dipakai ulang (foto avatar tidak di-decode ulang tiap ganti saklar / urutan / pencarian)
  const sig = hasLineup + '|' + all.map(x => x.join(':')).join(',') + '|' + Object.keys(avs).map(k => k + '=' + avs[k].src).join(',');
  if (memCache.sig !== sig) { memCache.sig = sig; memCache.nodes = new Map(); }
  const chipEl = ([n, c, m]) => {
    let el = memCache.nodes.get(n);
    if (el) return el;
    const pct = c ? Math.min(100, Math.round(m / c * 100)) : 0;
    const ttl = hasLineup ? ` title="${esc(`Ditonton ${c}× · 2-Shot/Chekicha ${m}×` + (m ? ` (${pct}%)` : ''))}"` : '';
    const a = avs[n];
    const ava = a ? `<img class="mem-avs" src="${esc(thumbOf(a.src))}" data-full="${esc(a.src)}" onerror="this.onerror=null;this.src=this.dataset.full" alt="" width="28" height="28" loading="lazy" decoding="async">` : `<span class="mem-avs ph" aria-hidden="true">${esc(memInit(n))}</span>`;
    const t = document.createElement('template');
    t.innerHTML = `<button type="button" class="mem-chip av${m && hasLineup ? ' met' : ''}" data-mem="${esc(n)}"${ttl}>${ava}<span class="mem-cn">${esc(n)}</span><span class="mem-nums"><b>${c}</b>${hasLineup && m ? `<b class="mm">${m}</b>` : ''}</span>${hasLineup && m ? `<span class="mem-rt" style="width:${pct}%"></span>` : ''}</button>`;
    el = t.content.firstElementChild;
    memCache.nodes.set(n, el);
    return el;
  };
  if (list.length) box.replaceChildren(...list.map(chipEl));
  else {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = !all.length ? 'Belum ada data member' : mode === 'unmet' && !q ? 'Semua member yang pernah tampil sudah pernah kamu temui' : 'Tidak ada member yang cocok';
    box.replaceChildren(e);
  }
  if (!fx || !oldPos.size) return;
  // chip yang masih ada: meluncur dari posisi lama; chip baru: muncul membesar; chip yang hilang: memudar (hantu)
  let ei = 0;
  const now = new Set();
  box.querySelectorAll('.mem-chip').forEach(el => {
    now.add(el.dataset.mem);
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const o = oldPos.get(el.dataset.mem);
    if (o) {
      const dx = o.left - r.left, dy = o.top - r.top;
      if (dx || dy) el.animate([{transform: `translate3d(${dx}px,${dy}px,0)`}, {transform: 'none'}], {duration: 520, easing: lbEase});
    } else {
      el.animate([{opacity: 0, transform: 'scale(.88)'}, {opacity: 1, transform: 'none'}], {duration: 420, delay: Math.min(ei++, 10) * 20, easing: lbEase, fill: 'backwards'});
    }
  });
  ghosts.filter(g => !now.has(g.n)).slice(0, 24).forEach(g => {
    const n = g.node;
    n.style.cssText = `position:absolute;left:${g.l}px;top:${g.t}px;width:${g.w}px;height:${g.h}px;margin:0;pointer-events:none;z-index:0`;
    n.setAttribute('aria-hidden', 'true'); n.tabIndex = -1; n.removeAttribute('data-mem');
    box.appendChild(n);
    n.animate([{opacity: 1, transform: 'none'}, {opacity: 0, transform: 'scale(.9)'}], {duration: 240, easing: 'ease-out', fill: 'forwards'}).onfinish = () => n.remove();
  });
  const em = box.querySelector('.empty');
  if (em) em.animate([{opacity: 0, transform: 'translateY(6px)'}, {opacity: 1, transform: 'none'}], {duration: 360, easing: lbEase});
}
// pil geser di saklar "Semua member / Pernah 2-Shot/Chekicha": melar ke tujuan lalu mengecil (efek cair), seperti pil di tab bar
function segMove(anim) {
  const box = $('mem-mode'), ind = box.querySelector('.seg-ind'), on = box.querySelector('[aria-pressed=true]');
  if (!ind || !on || !on.offsetWidth) return;
  const x = on.offsetLeft, w = on.offsetWidth, prev = segMove.p, T = v => `translate3d(${v}px,0,0)`;
  ind.style.top = on.offsetTop + 'px'; ind.style.height = on.offsetHeight + 'px';
  segMove.p = {x, w};
  ind.getAnimations().forEach(a => a.cancel());
  ind.style.transform = T(x); ind.style.width = w + 'px';
  if (!anim || !prev || calm() || (prev.x === x && prev.w === w)) return;
  const lo = Math.min(prev.x, x), hi = Math.max(prev.x + prev.w, x + w);
  ind.animate([{transform: T(prev.x), width: prev.w + 'px'}, {transform: T(lo), width: (hi - lo) + 'px', offset: .45}, {transform: T(x), width: w + 'px'}], {duration: 1100, easing: lbEase});
}
if (window.ResizeObserver) new ResizeObserver(() => segMove(false)).observe($('mem-mode')); // muncul / ukuran berubah: pasang tanpa animasi
const memSwap = () => { // chip pertama masuk bertahap: hanya opacity + transform, tanpa baca layout (jauh lebih ringan dari liquid.swap)
  if (calm()) return;
  [...$('mem-list').children].slice(0, 14).forEach((el, i) => el.animate([{opacity: 0, transform: 'translate3d(0,10px,0)'}, {opacity: 1, transform: 'none'}], {duration: 320, delay: i * 16, easing: lbEase, fill: 'backwards'}));
};
$('mem-q').addEventListener('input', e => { memQ = e.target.value; renderMembers(true); });
$('mem-qx').addEventListener('click', () => { memQ = ''; $('mem-q').value = ''; renderMembers(true); $('mem-q').focus(); });
$('mem-mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b && b.dataset.mode !== memMode) { memMode = b.dataset.mode; renderMembers(false, true); segMove(true); memSwap(); const mm = $('mem-mode'); if (mm.getBoundingClientRect().top < 110) mm.scrollIntoView({block: 'start', behavior: 'instant'}); } // daftar memendek: jangan biarkan layar tertinggal di tengah
 });
$('mem-sort').addEventListener('click', () => {
  // tombol melar/menyusut mulus ke lebar label baru (search bar ikut karena flex:1), label baru memudar masuk, chip meluncur ke urutan baru
  const btn = $('mem-sort'), w0 = btn.offsetWidth;
  memSort = memSort === 'az' ? 'top' : 'az';
  renderMembers(true);
  if (calm()) return;
  const w1 = btn.offsetWidth;
  if (w0 !== w1) btn.animate([{width: w0 + 'px'}, {width: w1 + 'px'}], {duration: 460, easing: lbEase});
  btn.firstElementChild.animate([{opacity: 0, transform: 'translateY(7px) scale(.92)'}, {opacity: 1, transform: 'none'}], {duration: 380, easing: lbEase});
});
$('lightbox').insertAdjacentHTML('beforebegin', `<div class="overlay" id="mem-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mem-title">
  <button class="x" id="mem-close" aria-label="Tutup">&times;</button><h3 id="mem-title" style="margin:0"></h3><div class="mem-body" id="mem-body"></div></div></div>`);
const seatBlock = (title, list) => list.length ? `<h4 class="mem-h">${title}</h4><div class="mem-seats">${list.map(([n, c], i) => `<button type="button" class="seat-badge tl-s" data-seat="${esc(n)}"${i >= 10 ? ' data-x hidden' : ''}>${esc(n)}${c > 1 ? ` ×${c}` : ''}</button>`).join('')}${list.length > 10 ? `<button type="button" class="mem-more" data-more aria-expanded="false">+${list.length - 10} lainnya</button>` : ''}</div>` : '';
// selisih hari dari hari ini ke tanggal ISO (null kalau tanggal tidak valid)
const daysSince = iso => { const d = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso + 'T00:00:00')) / 864e5); return isNaN(d) ? null : d; };
const agoTxt = d => d === null ? '' : d < 0 ? `${-d} hari lagi` : d === 0 ? 'hari ini' : d < 60 ? `${d} hari lalu` : d < 730 ? `${Math.round(d / 30.4)} bulan lalu` : `${(d / 365).toFixed(1).replace('.0', '')} tahun lalu`;
function openMember(name) {
  const m = memberStats(name);
  if (!m.ts && !m.ck && !m.ev && !m.appear.length) return;
  const met = m.ts + m.ck, sd = m.span, span = sd.length ? (sd[0] === sd[sd.length - 1] ? fmtDate(sd[0]) : `${fmtDate(sd[0])} – ${fmtDate(sd[sd.length - 1])}`) : '';
  const cell = (l, v, sub) => `<div class="stat"><div class="sv" data-cu="${v}">${v}</div><div class="sl">${l}</div>${sub ? `<div class="ss">${esc(sub)}</div>` : ''}</div>`;
  const cells = [...(m.hasLineup ? [cell('Ditonton', m.appear.length, m.appear.length && met ? `${met} dengan 2-Shot/Chekicha` : '')] : []), cell('2-Shot', m.ts), cell('Chekicha', m.ck), ...(m.hasLineup ? [] : [cell('Total pertemuan', met)]), ...(m.ev ? [cell('Hadir di event', m.ev)] : [])];
  const av = m.photos[0];
  $('mem-title').innerHTML = (av ? `<img class="mem-av" src="${esc(thumbOf(av.src))}" data-full="${esc(av.src)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="" data-cap="${esc(name)}" data-sub="${esc([av.label, av.setlist, fmtDate(av.date)].filter(Boolean).join(' · '))}" decoding="async">` : '')
    + `<span class="mem-nm"><span>${esc(name)}</span>${span ? `<small title="Dari show pertama sampai terakhir yang tercatat bersama dia (tampil atau bertemu)">${esc(span)}</small>` : ''}</span>`;
  const lastMet = m.dates.length ? m.dates[m.dates.length - 1] : '', lastApp = m.appear.length ? m.appear.map(r => r.date).filter(Boolean).sort().pop() : '';
  const recency = [
    lastMet ? `<div class="mem-lr"><span>Terakhir bertemu (2-Shot / Chekicha)</span><b>${esc(fmtDate(lastMet))}<small>${esc(agoTxt(daysSince(lastMet)))}</small></b></div>` : '',
    m.hasLineup && lastApp && lastApp !== lastMet ? `<div class="mem-lr"><span>Terakhir kamu lihat dia tampil</span><b>${esc(fmtDate(lastApp))}<small>${esc(agoTxt(daysSince(lastApp)))}</small></b></div>` : '',
    m.hasLineup && !met && m.appear.length ? '<div class="mem-lr"><span>Belum pernah 2-Shot / Chekicha dengannya</span></div>' : ''
  ].join('');
  $('mem-body').innerHTML = `<div class="mem-grid c${cells.length}">${cells.join('')}</div>${recency ? `<div class="mem-last">${recency}</div>` : ''}`
    + ((sl => sl.length ? `<h4 class="mem-h">Setlist yang paling sering bareng</h4>` + sl.slice(0, 3).map(([n, c]) => `<div class="mem-r"><span class="mem-rn">${esc(n)}</span><i class="mem-rb"><u style="width:${c / sl[0][1] * 100}%"></u></i><b>${c}×</b></div>`).join('') : '')(m.hasLineup ? m.appSetlists : m.setlists))
    + seatBlock('Kursi saat 2-Shot / Chekicha', m.seats)
    + (m.hasLineup ? seatBlock('Kursi saat dia tampil', m.appSeats) : '')
    + (m.photos.length ? `<h4 class="mem-h">Foto · ${m.photos.length}</h4><div class="mem-ph">${m.photos.map(p => `<img src="${esc(thumbOf(p.src))}" data-full="${esc(p.src)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="${esc(p.label)} dengan ${esc(name)}, ${esc(fmtDate(p.date))}" data-cap="${esc(p.label)} dengan ${esc(name)}" data-sub="${esc([p.setlist, fmtDate(p.date), p.sesi, p.seat ? 'Kursi ' + p.seat : ''].filter(Boolean).join(' · '))}" decoding="async" loading="lazy">`).join('')}</div>` : '');
  $('mem-body').scrollTop = 0;
  openEl('mem-modal');
  countUp($('mem-body'), true);
  $('mem-close').focus({preventScroll: true});
}
$('mem-close').addEventListener('click', () => closeEl('mem-modal'));
$('mem-modal').addEventListener('click', e => {
  if (e.target.id === 'mem-modal') return closeEl('mem-modal');
  const mo = e.target.closest('button[data-more]'); // "+8 lainnya": tampilkan semua kursi
  if (mo) {
    const xs = [...mo.parentElement.querySelectorAll('[data-x]')];
    mo.remove();
    xs.forEach((x, i) => { x.hidden = false; if (!calm()) x.animate([{opacity: 0, transform: 'scale(.6)'}, {opacity: 1, transform: 'none'}], {duration: 520, delay: Math.min(i, 14) * 30, easing: lbEase, fill: 'backwards'}); });
    return;
  }
  const b = e.target.closest('[data-seat]'); // ketuk kursi: tutup statistik member lalu buka riwayat kursi
  if (!b) return;
  const sm = $('seat-modal');
  sm.classList.add('over'); openSeat(b.dataset.seat); // riwayat kursi dibuka DI ATAS kartu member; ditutup = kembali ke kartu
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-mem],[data-member]');
  if (b) openMember(b.dataset.mem || b.dataset.member);
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.stat[data-member]')) { e.preventDefault(); openMember(e.target.dataset.member); }
});
escHooks.push(() => { if ($('mem-modal').classList.contains('open') && !$('mem-modal').classList.contains('closing')) { closeEl('mem-modal'); return true; } return false; });


