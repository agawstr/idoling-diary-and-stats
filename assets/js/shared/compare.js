/* assets/js/shared/compare.js — Bandingkan periode
   Bagian dari kode bersama index.html & admin.html (dulu satu file shared.js). Dimuat berurutan sebagai skrip klasik
   (satu lingkup global yang sama); urutan muat ada di index.html dan admin.html dan diperiksa oleh scripts/check_assets.py. */
// ================= Bandingkan periode (index + admin) =================
// Dua periode berdampingan: total show, kursi, kursi baru, 2-Shot, Chekicha, favorit (plus biaya, hanya di admin).
// Tidak ikut filter peta. "Samakan jumlah hari" memotong kedua periode sama panjang, supaya tahun/bulan berjalan tetap adil.
const CMP = {preset: 'year', same: true, ca: null, cb: null, sig: ''};
const cmpPad = n => String(n).padStart(2, '0');
const cmpToday = () => todayStr(); // satu sumber 'hari ini' (extras.js), ikut ?today= supaya periode bisa diuji
const cmpObj = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
const cmpAdd = (s, n) => { const d = cmpObj(s); d.setUTCDate(d.getUTCDate() + n); return `${d.getUTCFullYear()}-${cmpPad(d.getUTCMonth() + 1)}-${cmpPad(d.getUTCDate())}`; };
const cmpDays = (a, b) => Math.round((cmpObj(b) - cmpObj(a)) / 864e5) + 1; // jumlah hari, kedua ujung dihitung
const cmpLast = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // hari terakhir bulan m (1-12)
function cmpPeriods() {
  const t = cmpToday(), y = +t.slice(0, 4), m = +t.slice(5, 7);
  let a, b;
  if (CMP.preset === 'year') { a = [`${y - 1}-01-01`, `${y - 1}-12-31`]; b = [`${y}-01-01`, `${y}-12-31`]; }
  else if (CMP.preset === 'month') {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    a = [`${py}-${cmpPad(pm)}-01`, `${py}-${cmpPad(pm)}-${cmpLast(py, pm)}`]; b = [`${y}-${cmpPad(m)}-01`, `${y}-${cmpPad(m)}-${cmpLast(y, m)}`];
  } else if (CMP.preset === 'd90') { a = [cmpAdd(t, -179), cmpAdd(t, -90)]; b = [cmpAdd(t, -89), t]; }
  else { a = CMP.ca; b = CMP.cb; }
  if (!a || !b || !cmpObj(a[0]) || !cmpObj(a[1]) || !cmpObj(b[0]) || !cmpObj(b[1])) return null;
  if (a[0] > a[1]) a = [a[1], a[0]];
  if (b[0] > b[1]) b = [b[1], b[0]];
  if (CMP.same) {
    const end = p => p[0] <= t && p[1] > t ? t : p[1]; // periode yang belum selesai dihitung sampai hari ini
    const n = Math.min(cmpDays(a[0], end(a)), cmpDays(b[0], end(b)));
    if (n > 0) { a = [a[0], cmpAdd(a[0], n - 1)]; b = [b[0], cmpAdd(b[0], n - 1)]; }
  }
  return {a, b};
}
function cmpLabel(p) {
  const [f, t] = p, y = f.slice(0, 4), mo = +f.slice(5, 7);
  if (f === `${y}-01-01` && t === `${y}-12-31`) return 'Tahun ' + y;
  if (f.slice(0, 7) === t.slice(0, 7) && f.slice(8) === '01' && +t.slice(8) === cmpLast(+y, mo)) return `${MON_ID[mo - 1]} ${y}`;
  return y === t.slice(0, 4) ? `${+f.slice(8)} ${MON_ID[mo - 1]} – ${fmtDate(t)}` : `${fmtDate(f)} – ${fmtDate(t)}`;
}
function cmpStats(p, first) {
  const [f, t] = p, rs = records.filter(r => r.date >= f && r.date <= t), ss = solo.filter(s => s.date >= f && s.date <= t);
  const seats = [...new Set(rs.map(r => r.seat))], top = x => x ? {k: x[0], n: x[1]} : null;
  const paid = rs.filter(r => r.harga > 0), cost = paid.reduce((a, r) => a + r.harga, 0);
  return {
    show: rs.length, seats: seats.length, fresh: seats.filter(s => first[s] >= f && first[s] <= t).length, // kursi yang pertama kali ditempati di periode ini
    ts: rs.filter(r => r.twoshot === 'Ya').length + ss.filter(s => s.kind === 'ts').length,
    ck: rs.filter(r => r.chekicha === 'Ya').length + ss.filter(s => s.kind === 'ck').length,
    cost, avg: paid.length ? cost / paid.length : 0,
    seat: top(tally(rs, r => r.seat, seatTie)), row: top(tally(rs, r => r.seat[0], (a, b) => a.localeCompare(b))),
    setlist: top(tally(rs, r => r.setlist)), member: top(tally([...rs.flatMap(r => extras(r).map(x => x.member)), ...ss.map(s => s.member)], m => m))
  };
}
const cmpFmt = (n, rp) => rp ? rupiah(n) : String(Math.round(n));
function cmpDelta(a, b, rp, neutral) {
  const d = b - a;
  if (!d) return '<span class="cmp-d eq">sama</span>';
  return `<span class="cmp-d ${neutral ? 'ne' : d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲ +' : '▼ −'}${cmpFmt(Math.abs(d), rp)}${a ? ` (${Math.round(Math.abs(d) / a * 100)}%)` : ' (baru)'}</span>`;
}
function renderCompare() {
  const box = $('cmp');
  if (!box) return;
  box.querySelectorAll('[data-cp]').forEach(b => { const on = b.dataset.cp === CMP.preset; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('cmp-cust').hidden = CMP.preset !== 'custom';
  $('cmp-same').checked = CMP.same;
  const P = cmpPeriods(), out = $('cmp-out');
  const put = html => { if (html === CMP.sig) return; CMP.sig = html; out.innerHTML = html; }; // sama persis dengan sebelumnya: jangan gambar ulang (animasi tidak berulang tiap filter peta berubah)
  if (!P) return put('<div class="empty">Isi kedua rentang tanggal untuk membandingkan.</div>');
  const first = {};
  records.forEach(r => { if (!first[r.seat] || r.date < first[r.seat]) first[r.seat] = r.date; });
  const A = cmpStats(P.a, first), B = cmpStats(P.b, first), la = cmpLabel(P.a), lb = cmpLabel(P.b);
  if (![A, B].some(x => x.show || x.ts || x.ck)) return put(`<div class="empty">Belum ada catatan di ${esc(la)} maupun ${esc(lb)}.</div>`);
  const num = [['Total show', 'show'], ['Kursi berbeda', 'seats'], ['Kursi baru', 'fresh', 'pertama kali ditempati'], ['2-Shot', 'ts'], ['Chekicha', 'ck']];
  if (PRICES_VISIBLE) num.push(['Total biaya', 'cost', '', 1], ['Rata-rata / show', 'avg', '', 1]);
  const txt = [['Kursi favorit', 'seat', ''], ['Baris favorit', 'row', 'Baris '], ['Setlist terbanyak', 'setlist', ''], ['Member terbanyak', 'member', '']];
  const cell = (x, pre) => x ? `${esc(pre + x.k)}<small>${x.n}×</small>` : '–';
  const d = B.show - A.show;
  const sum = `${esc(lb)}: ${B.show} show` + (d ? `, ${Math.abs(d)} ${d > 0 ? 'lebih banyak' : 'lebih sedikit'} dari ${esc(la)}` : `, sama dengan ${esc(la)}`) + (B.fresh ? ` · ${B.fresh} kursi baru` : '') + '.';
  let i = 0;
  const rows = [`<div class="cmp-r cmp-h"><span class="cmp-l"></span><span class="cmp-v a"><small>Pembanding</small>${esc(la)}</span><span class="cmp-v b"><small>Utama</small>${esc(lb)}</span><span class="cmp-d">Selisih</span></div>`]
    .concat(num.map(([l, k, sub, ne]) => {
      const rp = k === 'cost' || k === 'avg', mx = Math.max(A[k], B[k], 1);
      return `<div class="cmp-r" style="--i:${++i}"><span class="cmp-l">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="cmp-v a">${cmpFmt(A[k], rp)}</span><span class="cmp-v b">${cmpFmt(B[k], rp)}</span>${cmpDelta(A[k], B[k], rp, ne)}<span class="cmp-bars" aria-hidden="true"><i class="a" style="--w:${A[k] / mx * 100}%"></i><i class="b" style="--w:${B[k] / mx * 100}%"></i></span></div>`;
    }), txt.map(([l, k, pre]) => `<div class="cmp-r cmp-t" style="--i:${++i}"><span class="cmp-l">${l}</span><span class="cmp-v a">${cell(A[k], pre)}</span><span class="cmp-v b">${cell(B[k], pre)}</span></div>`));
  put(`<p class="cmp-sum">${sum}</p><div class="cmp-card" role="group" aria-label="Perbandingan ${esc(la)} dan ${esc(lb)}">${rows.join('')}</div>`);
}
$('mem-sec').insertAdjacentHTML('beforebegin', `<h2 class="sec" id="cmp-h">Bandingkan periode <small class="hint" style="display:inline">· tidak ikut filter peta</small></h2>
  <section id="cmp">
    <div class="cmp-pre" role="group" aria-label="Pilih periode">
      <button type="button" class="gk on" data-cp="year" aria-pressed="true">Tahun ini vs lalu</button>
      <button type="button" class="gk" data-cp="month" aria-pressed="false">Bulan ini vs lalu</button>
      <button type="button" class="gk" data-cp="d90" aria-pressed="false">90 hari terakhir</button>
      <button type="button" class="gk" data-cp="custom" aria-pressed="false">Kustom</button>
    </div>
    <div id="cmp-cust" hidden>
      <fieldset><legend>Pembanding</legend><input type="date" id="cmp-a0" aria-label="Pembanding: mulai"><input type="date" id="cmp-a1" aria-label="Pembanding: sampai"></fieldset>
      <fieldset><legend>Utama</legend><input type="date" id="cmp-b0" aria-label="Utama: mulai"><input type="date" id="cmp-b1" aria-label="Utama: sampai"></fieldset>
    </div>
    <label class="cmp-same"><input type="checkbox" id="cmp-same" checked><span>Samakan jumlah hari<small>Periode yang belum selesai (tahun atau bulan berjalan) dibandingkan dengan rentang yang sama panjang.</small></span></label>
    <div id="cmp-out" aria-live="polite"></div>
  </section>`);
const cmpSyncInputs = () => { ['a0', 'a1', 'b0', 'b1'].forEach(k => { const p = k[0] === 'a' ? CMP.ca : CMP.cb; $('cmp-' + k).value = p ? p[+k[1]] : ''; }); };
$('cmp').addEventListener('click', e => {
  const b = e.target.closest('[data-cp]');
  if (!b || b.dataset.cp === CMP.preset) return;
  if (b.dataset.cp === 'custom') { const P = cmpPeriods(); if (P) { CMP.ca = P.a; CMP.cb = P.b; } cmpSyncInputs(); } // isian awal = periode yang sedang tampil
  CMP.preset = b.dataset.cp;
  renderCompare();
});
$('cmp-same').addEventListener('change', e => { CMP.same = e.target.checked; renderCompare(); });
['a0', 'a1', 'b0', 'b1'].forEach(k => $('cmp-' + k).addEventListener('change', () => {
  CMP.ca = [$('cmp-a0').value, $('cmp-a1').value]; CMP.cb = [$('cmp-b0').value, $('cmp-b1').value];
  renderCompare();
}));

