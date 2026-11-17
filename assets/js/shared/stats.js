/* assets/js/shared/stats.js — Statistik, filter, legenda, cakupan setlist, simpan PNG
   Bagian dari kode bersama index.html & admin.html (dulu satu file shared.js). Dimuat berurutan sebagai skrip klasik
   (satu lingkup global yang sama); urutan muat ada di index.html dan admin.html dan diperiksa oleh scripts/check_assets.py. */
// ================= Statistik, filter, legenda, setlist, PNG =================
const filter = {setlist: '', member: '', from: '', to: '', row: ''};
// ?tab=tl|gal|ev membuka tab itu saat halaman dimuat (dipakai shortcut ikon PWA); dibaca sekarang karena syncUrl() menulis ulang query
const START_TAB = (t => ['main', 'tl', 'gal', 'ev'].includes(t) ? t : '')(new URLSearchParams(location.search).get('tab'));
// filter dibaca dari URL (?setlist=..&member=..&from=YYYY-MM-DD&to=..) supaya hasilnya bisa dibagikan
new URLSearchParams(location.search).forEach((v, k) => {
  if (!Object.keys(filter).includes(k)) return;
  filter[k] = (k === 'from' || k === 'to') && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? '' : v;
});
if (!/^[A-J]$/.test(filter.row)) filter.row = ''; // validasi ?row=
function syncUrl() {
  const q = new URLSearchParams();
  for (const k in filter) if (filter[k]) q.set(k, filter[k]);
  try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch (e) {} // file:// bisa menolak
}
const isFiltered = () => Object.values(filter).some(Boolean);
// skip: dimensi filter yang diabaikan (supaya grafik tetap menampilkan pilihan lain yang bisa diklik)
// member "ada" di sebuah show kalau tampil di lineup ATAU bertemu 2-Shot/Chekicha (sama dengan statistik Per member)
const hasMember = (r, name) => (r.lineup || []).includes(name) || extras(r).some(x => x.member === name);
const matchF = (r, skip = []) => (skip.includes('setlist') || !filter.setlist || r.setlist === filter.setlist)
  && (!filter.member || hasMember(r, filter.member))
  && (skip.includes('date') || ((!filter.from || r.date >= filter.from) && (!filter.to || r.date <= filter.to)))
  && (skip.includes('row') || !filter.row || r.seat[0] === filter.row);
const viewEx = skip => { // saat putar ulang: hanya N show pertama menurut tanggal
  const l = records.filter(r => matchF(r, skip));
  return replayN === null ? l : l.sort((a, b) => cmp(b, a)).slice(0, replayN);
};
const view = () => viewEx([]);
// jumlah sesi lepas yang lolos filter aktif (filter setlist/baris tidak berlaku untuk sesi lepas, jadi ikut disembunyikan)
const soloView = kind => solo.filter(s => (!kind || s.kind === kind) && !filter.setlist && !filter.row && (!filter.member || s.member === filter.member) && (!filter.from || s.date >= filter.from) && (!filter.to || s.date <= filter.to));
const soloIn = kind => soloView(kind).length; // record yang lolos semua filter (dipakai peta)

// warna heatmap: makin sering makin terang.
// Ambang menyesuaikan data (setHeatScale): kalau kunjungan terbanyak <= 5, tiap jumlah dapat warna sendiri
// yang jaraknya jelas; kalau lebih, dipakai ambang tetap 1 / 2 / 3 / 5 / 8.
const HEAT_COLORS = [
  {bg:'#5c2e0c', fg:'#ffd9b0', bd:'#8a4b1a'},
  {bg:'#8f4a0a', fg:'#fff0dd', bd:'#b8620a'},
  {bg:'#c96a00', fg:'#fff',    bd:'#e07a00'},
  {bg:'#ff8c00', fg:'#000',    bd:'#ffaa00'},
  {bg:'#ffd23f', fg:'#000',    bd:'#fff3b0'}];
const HEAT_STATIC_MIN = [1, 2, 3, 5, 8];
const HEAT_PICK = {1: [2], 2: [1, 4], 3: [1, 3, 4], 4: [0, 2, 3, 4], 5: [0, 1, 2, 3, 4]}; // kunjungan terbanyak -> indeks warna
let HEAT = HEAT_COLORS.map((c, i) => ({...c, min: HEAT_STATIC_MIN[i]})), heatExact = false;
function setHeatScale(max) {
  const pick = HEAT_PICK[max];
  heatExact = !!pick;
  HEAT = pick ? pick.map((ci, k) => ({...HEAT_COLORS[ci], min: k + 1})) : HEAT_COLORS.map((c, i) => ({...c, min: HEAT_STATIC_MIN[i]}));
}
const heat = c => HEAT.filter(h => c >= h.min).pop();
const heatLabel = (h, i) => heatExact ? `${h.min}×` : HEAT[i + 1] ? (HEAT[i + 1].min - 1 > h.min ? `${h.min}–${HEAT[i + 1].min - 1}×` : `${h.min}×`) : `${h.min}+×`;

// kontainer disisipkan lewat JS supaya index & admin otomatis sama
const wrapEl = $('seating-wrapper');
wrapEl.insertAdjacentHTML('beforebegin', `<div id="last"></div><div id="stats"></div><div id="cover"></div><div id="cover-sl" hidden></div>
  <div id="filters">
    <select id="flt-setlist" aria-label="Filter setlist"></select>
    <input type="search" id="flt-member" list="dl-flt-member" placeholder="Semua member" aria-label="Filter member (ketik untuk mencari)" autocomplete="off"><datalist id="dl-flt-member"></datalist>
    <label class="fld" id="fld-from"><span class="fl">Mulai tanggal</span><span class="fv" aria-hidden="true">Pilih tanggal</span><input type="date" id="flt-from"></label>
    <label class="fld" id="fld-to"><span class="fl">Sampai tanggal</span><span class="fv" aria-hidden="true">Pilih tanggal</span><input type="date" id="flt-to"></label>
    <button type="button" class="btn-s" id="flt-reset">Reset</button><span id="flt-info"></span>
  </div>`);
wrapEl.insertAdjacentHTML('afterend', `<div id="legend"></div>
  <h2 class="sec">Total kunjungan per setlist <button type="button" class="info-btn" aria-label="Keterangan" aria-expanded="false">ⓘ</button><small class="hint" hidden>· klik batang untuk memfilter peta</small></h2><div id="sl-chart"></div>
  <h2 class="sec">Sebaran per baris <button type="button" class="info-btn" aria-label="Keterangan" aria-expanded="false">ⓘ</button><small class="hint" hidden>· klik batang untuk memfilter peta</small></h2><div id="rchart"></div><div id="rsum"></div>
  <h2 class="sec">Kalender kehadiran <button type="button" class="info-btn" aria-label="Keterangan" aria-expanded="false">ⓘ</button><small class="hint" hidden>· klik tanggal yang berwarna untuk memfilter peta</small></h2><div id="cal-nav"></div><div id="cal"></div>
  <h2 class="sec" id="mc-h">Kunjungan per bulan</h2><div id="mchart"></div>`);
function syncDates() { // tandai kolom tanggal yang kosong supaya tampil tulisan "Pilih tanggal"
  [['from', 'fld-from'], ['to', 'fld-to']].forEach(([k, id]) => { $('flt-' + k).value = filter[k]; $(id).classList.toggle('empty', !filter[k]); });
}
syncDates();
const heatLegend = () => HEAT.map((h, i) =>
  `<span class="lg"><i style="background:${h.bg};border-color:${h.bd}"></i>${heatLabel(h, i)}</span>`).join('');
$('legend').innerHTML = 'Jumlah kunjungan: <span id="lg-scale">' + heatLegend() + '</span>' +
  '<button type="button" class="btn-s" id="png-btn">Simpan peta (PNG)</button><button type="button" class="btn-s" id="rp-btn">Putar ulang</button><button type="button" class="btn-s" id="wrap-btn">Wrapped</button>';

// semua member yang bisa difilter: tampil di lineup ATAU bertemu 2-Shot/Chekicha
const filterMembers = () => [...new Set(records.flatMap(r => [...extras(r).map(x => x.member), ...(r.lineup || [])]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
function renderFilters() {
  const opts = (id, vals, ph) => {
    const cur = filter[id.slice(4)];
    $(id).innerHTML = `<option value="">${ph}</option>` + (cur && !vals.includes(cur) ? [...vals, cur] : vals).map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  };
  opts('flt-setlist', [...new Set(records.map(r => r.setlist).filter(Boolean))].sort(), 'Semua setlist');
  $('dl-flt-member').innerHTML = filterMembers().map(n => `<option value="${esc(n)}">`).join('');
  if (document.activeElement !== $('flt-member')) $('flt-member').value = filter.member; // jangan menimpa ketikan yang sedang berjalan
  $('filters').classList.toggle('on', isFiltered()); // HP: tombol Reset di tengah saat tidak ada filter, geser ke kiri (animasi) saat ada
  $('flt-info').textContent = isFiltered() ? `${filter.row ? 'Baris ' + filter.row + ' · ' : ''}${view().length} dari ${records.length} show cocok` : '';
}
$('filters').addEventListener('change', e => {
  const k = {'flt-setlist': 'setlist', 'flt-member': 'member', 'flt-from': 'from', 'flt-to': 'to'}[e.target.id];
  if (!k) return;
  if (k === 'member') { // nama persis, atau potongan nama yang hanya cocok dengan satu member ("Cit" -> Citra); selain itu dipakai apa adanya (hasilnya 0)
    const raw = e.target.value.trim(), v = raw.toLowerCase(), fm = filterMembers(), part = fm.filter(n => n.toLowerCase().includes(v));
    filter.member = !v ? '' : fm.find(n => n.toLowerCase() === v) || (part.length === 1 ? part[0] : raw);
    e.target.value = filter.member;
  } else filter[k] = e.target.value;
  syncDates(); renderChart();
});
$('filters').addEventListener('input', e => { // tombol × pada kolom cari mengosongkan filter tanpa menunggu 'change'
  if (e.target.id === 'flt-member' && !e.target.value && filter.member) { filter.member = ''; renderChart(); }
});
$('flt-reset').addEventListener('click', () => {
  Object.keys(filter).forEach(k => filter[k] = '');
  $('flt-from').value = $('flt-to').value = ''; $('fld-from').classList.add('empty'); $('fld-to').classList.add('empty');
  renderChart();
});

// seri: pilih baris paling depan (A = dekat panggung), lalu nomor paling kanan
const seatTie = (a, b) => a[0].localeCompare(b[0]) || parseInt(b.slice(2)) - parseInt(a.slice(2));
function renderStats() {
  const by = (fn, tie) => tally(view(), fn, tie);
  // x = atribut tambahan kartu; n/fmt = angka mentah + format (mis. 'rp') supaya kartu berisi teks (Rp ...) ikut berhitung
  const card = (l, v, s, x = '', n = null, fmt = '') => `<div class="stat"${x}><div class="sv${String(v).length > 9 ? ' sm' : ''}"${typeof v === 'number' ? ` data-n="${v}"` : n !== null ? ` data-n="${n}" data-fmt="${fmt}"` : ''}>${esc(v)}</div><div class="sl">${l}</div>${s ? `<div class="ss">${/^\d+×$/.test(s) ? `<span data-cu="${parseInt(s)}" data-suf="×">${esc(s)}</span>` : esc(s)}</div>` : ''}</div>`;
  const st = top => top ? [top[0], top[1] + '×'] : ['-', ''];
  const paid = view().filter(r => r.harga > 0), tot = paid.reduce((a, r) => a + r.harga, 0);
  $('stats').innerHTML = [
    card('Total show', view().length),
    card('Kursi favorit', ...st(by(r => r.seat, seatTie))),
    card('Baris favorit', ...st(by(r => r.seat[0], (a, b) => a.localeCompare(b)))),
    card('2-Shot', view().filter(r => r.twoshot === 'Ya').length + soloIn('ts'), soloIn('ts') ? 'termasuk ' + soloIn('ts') + ' di luar show' : ''),
    card('Chekicha', view().filter(r => r.chekicha === 'Ya').length + soloIn('ck'), soloIn('ck') ? 'termasuk ' + soloIn('ck') + ' di luar show' : ''),
    (t => card('Member terbanyak', ...st(t), t ? ` data-member="${esc(t[0])}" role="button" tabindex="0" title="Ketuk untuk statistik ${esc(t[0])}"` : ''))(tally([...view().flatMap(r => extras(r).map(x => x.member)), ...soloView().map(w => w.member)], m => m)), // pertemuan di show + sesi lepas, sama dengan kartu 2-Shot/Chekicha
    ...(tot ? [card('Total biaya', rupiah(tot), '', '', tot, 'rp'), card('Rata-rata / show', rupiah(tot / paid.length), `dari ${paid.length} show berbayar`, '', Math.round(tot / paid.length), 'rp')] : [])
  ].join('');
}

// bar horizontal: total kunjungan per setlist (klik = filter peta)
function renderSetlists() {
  const o = {};
  // ikut filter member & tanggal; filter setlist sendiri diabaikan supaya setlist lain tetap terlihat
  records.filter(r => matchF(r, ['setlist'])).forEach(r => { const k = r.setlist || '(tanpa setlist)'; o[k] = (o[k] || 0) + 1; });
  const rows = Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = rows.length ? rows[0][1] : 1;
  $('sl-chart').innerHTML = rows.length ? rows.map(([k, n], i) => `
    <button type="button" style="--i:${Math.min(i, 14)}" class="sl-row${filter.setlist === k ? ' on' : ''}" data-setlist="${esc(k)}" title="Klik untuk filter peta">
      <span class="sl-n">${esc(k)}</span><span class="sl-bar"><i style="width:${n / max * 100}%"></i></span><span class="sl-c">${n}×</span>
    </button>`).join('') : '<div class="empty">Belum ada data</div>';
}
$('sl-chart').addEventListener('click', e => {
  const b = e.target.closest('[data-setlist]');
  if (!b) return;
  filter.setlist = filter.setlist === b.dataset.setlist ? '' : b.dataset.setlist;
  renderChart();
});

// simpan peta sebagai PNG (digambar langsung di canvas, tanpa library)
function savePng() {
  const S = 2, cw = 38, ch = 46, g = 5, rp = 52, bg = 20, pad = 28, top = 88;
  const bw = [0, 1, 2, 3].map(j => Math.max(...LAYOUT.map(r => r[j].length)) * (cw + g) - g);
  const W = bw.reduce((a, b) => a + b) + bg * 3 + pad * 2, H = top + LAYOUT.length * rp + pad;
  const cv = document.createElement('canvas');
  cv.width = W * S; cv.height = H * S;
  const c = cv.getContext('2d');
  c.scale(S, S);
  c.fillStyle = '#0d090d'; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ff2a5f'; c.font = '900 20px sans-serif'; c.fillText(document.querySelector('h1').textContent, W / 2, 26);
  c.fillStyle = '#a1a1aa'; c.font = '600 13px sans-serif'; c.fillText(`Total riwayat show: ${view().length}`, W / 2, 48);
  c.fillStyle = '#380816'; c.fillRect(pad, 62, W - pad * 2, 18);
  c.fillStyle = '#ff2a5f'; c.font = '900 11px sans-serif'; c.fillText('S T A G E', W / 2, 71);
  const counts = {};
  view().forEach(r => counts[r.seat] = (counts[r.seat] || 0) + 1);
  let x0 = pad;
  for (let j = 0; j < 4; j++) {
    LAYOUT.forEach((row, i) => {
      const w = row[j].length * (cw + g) - g, y = top + i * rp;
      row[j].forEach((code, k) => {
        const x = (j % 2 ? x0 : x0 + bw[j] - w) + k * (cw + g), n = counts[code], h = n ? heat(n) : null;
        c.beginPath(); c.roundRect(x, y, cw, ch, 6);
        c.fillStyle = h ? h.bg : '#1e050c'; c.fill();
        c.strokeStyle = h ? h.bd : '#3d0815'; c.stroke();
        c.fillStyle = h ? h.fg : '#f43f5e'; c.font = '700 11px sans-serif';
        c.fillText(code, x + cw / 2, y + (n ? 15 : ch / 2));
        if (n) { c.font = '900 14px sans-serif'; c.fillText(n + '×', x + cw / 2, y + 32); }
      });
    });
    x0 += bw[j] + bg;
  }
  const a = document.createElement('a');
  a.download = 'peta-kursi.png'; a.href = cv.toDataURL('image/png'); a.click();
}
$('png-btn').addEventListener('click', savePng);

// focus trap: Tab tidak keluar dari modal yang sedang terbuka
function trapTab(e) {
  const ov = topOverlay();
  if (!ov) return;
  const f = [...ov.querySelectorAll('button,[href],input,select,textarea')].filter(el => !el.disabled && el.offsetParent !== null);
  if (!f.length) return e.preventDefault();
  const first = f[0], last = f[f.length - 1], cur = document.activeElement;
  if (!ov.contains(cur) || (e.shiftKey && cur === first)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
}

