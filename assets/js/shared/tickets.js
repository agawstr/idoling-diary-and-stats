/* assets/js/shared/tickets.js — Sorot cahaya peta, kartu "terakhir nonton", tiket/lotre/event
   Bagian dari kode bersama index.html & admin.html (dulu satu file shared.js). Dimuat berurutan sebagai skrip klasik
   (satu lingkup global yang sama); urutan muat ada di index.html dan admin.html dan diperiksa oleh scripts/check_assets.py. */
// ================= Sorot cahaya peta & kartu "terakhir nonton" =================
const stg = $('stage-container');
stg.addEventListener('mousemove', e => { // posisi dalam persen supaya aman dari efek zoom
  if (!canHover.matches) return;
  const b = stg.getBoundingClientRect();
  stg.style.setProperty('--mx', (e.clientX - b.left) / b.width * 100 + '%');
  stg.style.setProperty('--my', (e.clientY - b.top) / b.height * 100 + '%');
  stg.style.setProperty('--sp', 1);
});
stg.addEventListener('mouseleave', () => stg.style.setProperty('--sp', 0));

function renderLast() {
  const r = [...records].sort(cmp)[0], el = $('last');
  if (!r) { el.innerHTML = ''; return; }
  const d = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(r.date + 'T00:00:00')) / 864e5);
  const ago = isNaN(d) ? '' : d < 0 ? `${-d} hari lagi` : d === 0 ? 'Hari ini' : `${d} hari yang lalu`;
  const ph = extras(r).find(x => x.photo);
  el.innerHTML = `<div class="last-c">
    ${ph ? `<div class="last-ph"><img src="${esc(thumbOf(ph.photo))}" data-full="${esc(ph.photo)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="Foto show terakhir" data-cap="${esc(ph.label)} dengan ${esc(ph.member)}" data-sub="${esc([r.setlist, fmtDate(r.date), r.sesi, 'Kursi ' + r.seat].filter(Boolean).join(' · '))}"></div>` : `<div class="last-s">${esc(r.seat)}</div>`}
    <div class="last-b"><span class="last-l">Terakhir nonton</span><b>${esc(r.setlist) || '(tanpa setlist)'}</b>
      <span>${esc(fmtDate(r.date))}${r.sesi ? ' · ' + esc(r.sesi) : ''} · Kursi <button type="button" class="seat-badge tl-s" data-seat="${esc(r.seat)}">${esc(r.seat)}</button></span></div>
    <div class="last-a">${esc(ago)}</div></div>`;
}
$('last').addEventListener('click', e => {
  const b = e.target.closest('[data-seat]');
  if (b) openSeat(b.dataset.seat);
});

// ================= Tiket, lotre, & event (EXCLUSIVE / EVENT) =================
let tickets = []; // diisi halaman: index dari data.json, admin dari localStorage
// nama kategori lama -> baru, supaya pilihan manual yang sudah tersimpan tidak rusak ('' = kembali otomatis)
const CAT_OLD = {'Meet & Greet (Event)': '2S & MnG Event', '2-Shot (Event)': '2S & MnG Event', 'Meet & Greet Theater Sementara': '2S & MnG Theater Sementara', '2-Shot Theater Sementara': '2S & MnG Theater Sementara', 'Event OFC / School': ''};
const fixCat = c => Object.hasOwn(CAT_OLD, c) ? CAT_OLD[c] : c;
const sanitizeTicket = t => {
  t = t || {};
  const up = s => String(s ?? '').trim();
  return {
    k: up(t.k), type: ['SHOW', 'EXCLUSIVE', 'EVENT'].includes(t.type) ? t.type : 'EVENT',
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : '', name: up(t.name), start: up(t.start).slice(0, 5),
    used: Math.max(0, Number(t.used) || 0), raffle: up(t.raffle).toUpperCase(),
    member: up(t.member), lane: up(t.lane), session: up(t.session), bought: Math.max(1, Number(t.bought) || 1), cat: fixCat(up(t.cat)), status: up(t.status), tx: up(t.tx).slice(0, 12),
    photo: okPhoto(t.photo) ? t.photo : '' // foto 2-Shot event (opsional), diunggah dari admin tanpa input tanggal lagi
  };
};
const raffleOf = s => !s ? '' : /WIN|WON|MENANG/.test(s) ? 'win' : /LOSE|LOST|KALAH/.test(s) ? 'lose' : 'other';
function lotteryStats(list) { // persentase menang = menang / (menang + kalah); status lain tidak dihitung
  const s = {win: 0, lose: 0, other: 0, raw: {}, by: {}};
  // kelompok lotre: show teater (termasuk Theater Event seperti JKT48 School) dan kategori event lain
  const grp = t => (t.type === 'SHOW' || tcat(t) === 'Theater Event') ? 'Show teater' : tcat(t);
  list.forEach(t => {
    const c = raffleOf(t.raffle);
    if (!c) return;
    s[c]++;
    (s.by[grp(t)] = s.by[grp(t)] || {win: 0, lose: 0, other: 0})[c]++;
    if (c === 'other') s.raw[t.raffle] = (s.raw[t.raffle] || 0) + 1;
  });
  // jkt48.com hanya memberi status kalah (LOSE). Di jenis yang punya lotre, tiket tanpa status dihitung menang (perkiraan).
  // hanya kelompok yang punya entri kalah yang diperkirakan; tiket Exclusive (video call, M&G) tidak dihitung sebagai lotre
  const lt = new Set(list.filter(t => raffleOf(t.raffle)).map(grp));
  s.inferred = 0;
  list.forEach(t => {
    if (raffleOf(t.raffle) || t.type === 'EXCLUSIVE' || !lt.has(grp(t))) return;
    s.win++; s.inferred++;
    (s.by[grp(t)] = s.by[grp(t)] || {win: 0, lose: 0, other: 0}).win++;
  });
  s.total = s.win + s.lose + s.other;
  s.pct = s.win + s.lose ? s.win / (s.win + s.lose) * 100 : 0;
  return s;
}

// kategori tiket: ditebak dari nama (data jkt48.com tidak punya kolom kategori); bisa diatur manual lewat t.cat
// kategori yang jumlah tiketnya disembunyikan di halaman publik (hanya terlihat di admin)
const BLUR_CATS = ['Video Call', '2S & MnG Event', '2S & MnG Theater Sementara'];
const TK_CATS = ['Video Call', '2S & MnG Event', '2S & MnG Theater Sementara', 'OFC Event', 'Theater Event', 'Belum dikategorikan'];
const VC_NAMES = /cheerful little wishes|think donut|heart & harmony|code journal|cake a wish|the first snow|youthful days|we are love/i;
function autoCat(t) {
  const n = (t.name || '').toLowerCase();
  if (/video call|digital photobook|theater sementara/.test(n) || VC_NAMES.test(n)) return 'Video Call'; // tiket bernama "Theater Sementara" ternyata video call
  if (/ofc event/.test(n)) return 'OFC Event';
  if (t.type === 'EVENT') return 'Theater Event'; // sisa tiket berjenis EVENT (mis. JKT48 School)
  if (/team passion/.test(n)) return '2S & MnG Theater Sementara'; // M&G dan 2-Shot Team Passion (Yogyakarta)
  if (/2[- ]?shot|meet\s*(and|&)\s*greet/.test(n)) return '2S & MnG Event';
  if (/ - \d{1,2}(st|nd|rd|th) [a-z]{3}/.test(n)) return 'Video Call'; // pola nama seri video call (tebakan)
  return 'Belum dikategorikan';
}
const tcat = t => t.cat || (t.type === 'SHOW' ? 'Show Teater' : autoCat(t));
const tname = t => t.name.replace(/\s*[-,]\s*\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3,}(\s+\d{4})?\s*$/, '').trim() || t.name; // nama tanpa tanggal

// hubungkan riwayat show dengan tiket lotre di tanggal & sesi yang sama
function lotInfo(r) {
  const ts = tickets.filter(t => (t.type === 'SHOW' || tcat(t) === 'Theater Event') && t.date === r.date && (!r.sesi || (parseInt(t.start) < 17 ? 'Siang' : 'Malam') === r.sesi));
  if (!ts.length) return '';
  const lose = ts.filter(t => raffleOf(t.raffle) === 'lose').length, win = ts.length - lose;
  if (!ts.some(t => t.type === 'SHOW')) return `Lotre: ${win} menang${lose ? ` · ${lose} kalah` : ''}`; // event teater (mis. JKT48 School)
  // aturan: menang OFC = tidak boleh daftar General; kalah OFC lalu daftar General = ada 2 entri; hanya 1 entri kalah = cuma daftar OFC
  return '' + (win && !lose ? 'Menang di OFC' : win ? 'Kalah di OFC → menang di General' : lose >= 2 ? 'Kalah di OFC & General' : 'Kalah di OFC (tidak daftar General)');
}

// statistik alur lotre show teater per slot (tanggal + jam + setlist): OFC dulu, lalu General bagi yang kalah
function lotFlowStats() {
  const m = new Map();
  tickets.filter(t => t.type === 'SHOW').forEach(t => {
    const k = t.date + '|' + t.start + '|' + t.name, o = m.get(k) || {win: 0, lose: 0};
    raffleOf(t.raffle) === 'lose' ? o.lose++ : o.win++;
    m.set(k, o);
  });
  const s = {n: m.size, ofcWin: 0, genWin: 0, genLose: 0, ofcOnly: 0};
  m.forEach(o => { if (o.win && !o.lose) s.ofcWin++; else if (o.win) s.genWin++; else if (o.lose >= 2) s.genLose++; else s.ofcOnly++; });
  s.genTry = s.genWin + s.genLose; s.ofcLose = s.n - s.ofcWin; s.got = s.ofcWin + s.genWin;
  return s;
}
const lotHtml = r => { const t = lotInfo(r); return t ? `<div class="lt">${esc(t)}</div>` : ''; };
let evCat = '', evLimit = 12, rkAll = false;
const EV_PAGE = 12; // jumlah seri per tampilan
let dataLoaded = false; // false selama data masih dimuat
function renderTicketsRaw() {
  const box = $('lot');
  if (!box) return;
  $('ev-tab').hidden = dataLoaded && !tickets.length; // tetap tampil selama data dimuat; disembunyikan hanya jika data.json memang tanpa tiket
  const ls = lotteryStats(tickets), done = ls.win + ls.lose;
  // tiket event teater (JKT48 School dll.) ikut kelompok "Show teater" di kartu atas; beri tahu supaya selisih 48 vs 45 jelas
  const te = tickets.filter(t => t.type !== 'SHOW' && tcat(t) === 'Theater Event'), tw = te.length ? lotteryStats(te) : null;
  const teNote = tw && tw.win + tw.lose ? `<p class="lot-n">Angka "Show teater" memasukkan ${tw.win} menang dan ${tw.lose} kalah dari tiket event teater (${[...new Set(te.map(tname))].map(esc).join(', ')}). Alur OFC → General dan rincian per setlist hanya menghitung tiket show.</p>` : '';
  const refs = tickets.filter(t => t.status === 'refund'); // menang undian tapi show dibatalkan & di-refund
  const names = {SHOW: 'Show teater', EXCLUSIVE: 'Exclusive / M&G', EVENT: 'Event'};
  const card = (l, v, s, c = '', n = null, fmt = '') => `<div class="stat${c}"><div class="sv"${typeof v === 'number' ? ` data-cu="${v}"` : n !== null ? ` data-cu="${n}" data-fmt="${fmt}"` : ''}>${esc(v)}</div><div class="sl">${l}</div>${s ? `<div class="ss">${esc(s)}</div>` : ''}</div>`;
  const sh = ls.by['Show teater'], shDone = sh ? sh.win + sh.lose : 0;
  const bs = {}; // lotre per setlist (tiket show)
  tickets.filter(t => t.type === 'SHOW').forEach(t => { const o = bs[t.name] || (bs[t.name] = {win: 0, lose: 0}); raffleOf(t.raffle) === 'lose' ? o.lose++ : o.win++; });
  const bsList = Object.entries(bs).map(([n, o]) => [n, o, o.win + o.lose])
    .sort((a, b) => b[1].win - a[1].win || b[1].win / b[2] - a[1].win / a[2] || b[2] - a[2] || a[0].localeCompare(b[0])); // menang terbanyak dulu; seri: persentase, lalu jumlah percobaan
  const maxWin = Math.max(1, ...bsList.map(x => x[1].win)); // bar = jumlah menang dibanding yang tertinggi, jadi sejalan dengan urutan
  const bsHtml = bsList.length ? '<h3 class="sec2">Lotre per setlist</h3>' + bsList.map(([n, o, d]) => {
    const p = o.win / d * 100;
    return `<div class="ls-r"><span class="ls-n">${esc(n)}</span><span class="ls-b"><i style="width:${o.win / maxWin * 100}%"></i></span><span class="ls-c">${o.win} menang · ${o.lose} kalah (${Math.round(p)}%)</span></div>`;
  }).join('') : '';
  const fl = lotFlowStats(), pc = (a, b) => b ? Math.round(a / b * 100) : 0;
  const flowHtml = fl.n ? '<h3 class="sec2">Alur lotre show teater: OFC → General</h3>' + [
    ['Tahap OFC', pc(fl.ofcWin, fl.n), `${fl.ofcWin} menang dari ${fl.n} show (${pc(fl.ofcWin, fl.n)}%)`],
    ['Tahap General', pc(fl.genWin, fl.genTry), `${fl.genWin} menang dari ${fl.genTry} yang didaftar (${pc(fl.genWin, fl.genTry)}%)`],
    ['Dapat tiket', pc(fl.got, fl.n), `${fl.got} dari ${fl.n} show (${pc(fl.got, fl.n)}%)`]
  ].map(([l, p, t0], i, _a, t = String(t0).replace(/\d+/g, n => `<b data-n="${n}">${n}</b>`)) => `<div class="lot-r fl" style="--i:${i}"><span>${l}</span><span class="sl-bar"><i style="width:${p}%"></i></span><span>${t}</span></div>`).join('') +
    `<p class="lot-n">${fl.ofcLose} show kalah di OFC: ${fl.genTry} lanjut daftar General (${fl.genWin} menang, ${fl.genLose} kalah) dan ${fl.ofcOnly} hanya mendaftar sekali di OFC.</p>` : '';
  const shPct = shDone ? sh.win / shDone * 100 : 0;
  const shCard = shDone ? `<div class="stat main"><div class="ring" style="--p:${shPct.toFixed(1)}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rb" cx="18" cy="18" r="15.9"/><circle class="rf" cx="18" cy="18" r="15.9" pathLength="100"/></svg><span data-cu="${shPct.toFixed(1)}" data-fmt="pct1">${shPct.toFixed(1).replace(/\.0$/, '')}%</span></div><div class="sl">Persentase menang (show teater)</div><div class="ss">${sh.win} dari ${shDone} yang sudah diundi${tw && tw.win + tw.lose ? ' · termasuk ' + (tw.win + tw.lose) + ' tiket event teater' : ''}</div></div>` : '';
  box.innerHTML = !ls.total ? '<div class="empty">Belum ada data lotre</div>' :
    `<div class="lot-cards">${shCard}${card('Entri lotre', ls.total)}${card(ls.inferred ? 'Menang (perkiraan)' : 'Menang', ls.win, refs.length ? `${refs.length} dibatalkan & di-refund` : '')}${card('Kalah', ls.lose)}${card('Persentase menang (semua jenis)', done ? ls.pct.toFixed(1) + '%' : '-', done ? `${ls.win} dari ${done} yang sudah diundi` : '', '', done ? ls.pct : null, 'pct1')}</div>` +
    Object.entries(ls.by).map(([ty, b]) => {
      const d = b.win + b.lose, p = d ? b.win / d * 100 : 0;
      return `<div class="lot-r"><span>${names[ty] || esc(ty)}</span><span class="sl-bar"><i style="width:${p}%"></i></span><span>${b.win ? b.win + ' menang' : '0 menang terdeteksi'} · ${b.lose} kalah${d && b.win ? ` (${p.toFixed(0)}%)` : ''}</span></div>`;
    }).join('') + flowHtml + bsHtml +
    teNote +
    (ls.inferred ? '<p class="lot-n">Menang dihitung dari tiket tanpa status kalah pada show/event yang punya lotre, karena jkt48.com tidak memberi status menang. Tiket yang dibeli langsung tanpa lotre ikut terhitung.</p>' : '') +
    (refs.length ? `<p class="lot-n">Menang undian tapi dibatalkan dan di-refund: ${refs.map(t => esc(fmtDate(t.date) + ' ' + t.name)).join(', ')}.</p>` : '') +
    (ls.other ? `<p class="lot-n">Status lain (belum diundi / tidak dikenali): ${Object.entries(ls.raw).map(([k, n]) => `${esc(k)} ×${n}`).join(', ')}</p>` : '');
  // kumpulkan semua catatan kecil ke satu bagian yang bisa dibuka (hemat tempat)
  const notes = [...box.querySelectorAll('.lot-n')];
  if (notes.length) {
    const d = document.createElement('details');
    d.className = 'lot-notes';
    d.innerHTML = `<summary>ⓘ Catatan perhitungan (${notes.length})</summary>`;
    notes.forEach(n => d.appendChild(n));
    box.appendChild(d);
  }

  const ev = tickets.filter(t => t.type !== 'SHOW');
  if (dataLoaded) $('ev-tab').textContent = `Tiket & Event (${ev.length})`;
  const td = new Date().toISOString().slice(0, 10);
  const sel = $('ev-member'), cur = sel.value, st = $('ev-status').value;
  sel.innerHTML = '<option value="">Semua member</option>' + [...new Set(ev.map(t => t.member).filter(Boolean))].sort().map(m => `<option${m === cur ? ' selected' : ''}>${esc(m)}</option>`).join('');

  // kartu kategori = ringkasan sekaligus filter
  const stat = {};
  ev.forEach(t => { const c = tcat(t), o = stat[c] || (stat[c] = {n: 0, s: new Set()}); o.n++; o.s.add(tname(t)); });
  const cards = [['', 'Semua', ev.length, new Set(ev.map(tname)).size], ...TK_CATS.filter(c => stat[c]).map(c => [c, c, stat[c].n, stat[c].s.size])], cn = cards.length;
  $('ev-cats').style.setProperty('--cols', cn <= 4 ? cn : cn === 5 ? 5 : cn % 3 === 0 ? 3 : 4); // mis. 6 kartu = 3 x 2, 7 kartu = 4 + 3
  $('ev-cats').innerHTML = cards
    .map(([k, l, n, z]) => `<button type="button" class="ev-c${k === evCat ? ' on' : ''}" data-cat="${esc(k)}" aria-pressed="${k === evCat}"><b data-cu="${n}">${n}</b><span>${esc(l)}</span><small>${z} seri</small></button>`).join('');

  // kelompokkan tiket per seri (kategori + nama tanpa tanggal)
  const grouper = arr => {
    const m = new Map();
    arr.forEach(t => { const k = tcat(t) + '|' + tname(t); if (!m.has(k)) m.set(k, {name: tname(t), cat: tcat(t), items: []}); m.get(k).items.push(t); });
    return [...m.values()].map(g => { g.items.sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start)); g.last = g.items[0].date; return g; })
      .sort((a, b) => b.last.localeCompare(a.last));
  };
  // status per tiket; "tidak terpakai" tidak ditampilkan untuk Video Call (statusnya tidak diperbarui jkt48)
  const chipOf = t => {
    const c = raffleOf(t.raffle);
    return t.date > td ? '<span class="chip soon">Mendatang</span>' : t.used > 0 ? '<span class="chip ok">Hadir</span>' : c === 'lose' ? '<span class="chip lose">Kalah lotre</span>'
      : c === 'win' ? '<span class="chip win">Menang lotre</span>' : tcat(t) === 'Video Call' ? '' : '<span class="chip no">Tidak terpakai</span>';
  };
  const groupHtml = (g, i = 0) => {
    const nx = g.items.filter(t => t.date > td).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0];
    const cdl = nx ? ` · <span class="cd-live" data-t="${nx.date}T${nx.start || '00:00:00'}"></span>` : '';
    const n = g.items.length, usd = g.items.filter(t => t.used > 0).length, up = g.items.filter(t => t.date > td).length, mem = {};
    g.items.forEach(t => { if (t.member) mem[t.member] = (mem[t.member] || 0) + 1; });
    const ms = Object.entries(mem).sort((a, b) => b[1] - a[1]), first = g.items[n - 1].date;
    const range = first === g.last ? fmtDate(g.last) : `${fmtDate(first)} – ${fmtDate(g.last)}`;
    const chip = up ? `<span class="chip soon">Mendatang${up < n ? ` ${up}/${n}` : ''}</span>` : usd ? `<span class="chip ok">Hadir${usd < n ? ` ${usd}/${n}` : ''}</span>`
      : g.items.every(t => raffleOf(t.raffle) === 'lose') ? '<span class="chip lose">Kalah lotre</span>' : g.cat === 'Video Call' ? '' : '<span class="chip no">Tidak terpakai</span>';
    return `<details class="ev-g" data-k="${esc(g.cat + '|' + g.name)}" style="--i:${Math.min(i, 14)}"><summary>
      <div class="tl-d"><b>${esc(g.last.slice(8))}</b><span>${MON_ID[+g.last.slice(5, 7) - 1]} ${esc(g.last.slice(2, 4))}</span></div>
      <div class="tl-b"><b>${esc(g.name)}</b><div class="hn">${esc(g.cat)} · ${n} sesi · ${esc(range)}${cdl}</div>
        ${ms.length ? `<div class="mchips">${ms.slice(0, 5).map(([m, c]) => `<span class="mchip">${esc(m)}${c > 1 ? ' ×' + c : ''}</span>`).join('')}${ms.length > 5 ? `<span class="mchip">+${ms.length - 5}</span>` : ''}</div>` : ''}</div>
      ${chip}</summary>
      <div class="ev-d">${g.items.map(t => `<div class="ev-t"><span>${esc(fmtDate(t.date))}${t.start ? ' · ' + esc(t.start.slice(0, 5)) : ''}</span><span>${esc([t.member, t.lane, t.session].filter(Boolean).join(' · ')) || '–'}${BLUR_CATS.includes(tcat(t)) ? ' · <span class="blur-n" aria-hidden="true">88</span> tiket' : (t.bought > 1 ? ' · ' + t.bought + ' tiket' : '')}</span>${chipOf(t)}</div>`).join('')}</div></details>`;
  };

  const upc = grouper(ev.filter(t => t.date > td)); // tiket mendatang selalu di paling atas
  $('ev-up').innerHTML = upc.length ? '<h3 class="sec2">Mendatang</h3>' + upc.map(groupHtml).join('') : '';

  const scope = ev.filter(t => t.date <= td && (!evCat || tcat(t) === evCat));
  const mc = {}, mt = {};
  scope.forEach(t => { if (t.member) { mc[t.member] = (mc[t.member] || 0) + 1; mt[t.member] = (mt[t.member] || 0) + t.bought; } });
  const rankAll = Object.entries(mc).sort((a, b) => b[1] - a[1]), rank = rkAll ? rankAll : rankAll.slice(0, 5), mx = rankAll.length ? rankAll[0][1] : 1;
  $('ev-rank').innerHTML = rank.length ? `<h3 class="sec2">Peringkat member${evCat ? ' · ' + esc(evCat) : ''}</h3>` + rank.map(([m, c], i) =>
    `<button type="button" style="--i:${i}" class="rk${m === cur ? ' on' : ''}" data-m="${esc(m)}"><span class="rn">${i + 1}</span><span class="rm">${esc(m)}</span><span class="sl-bar"><i style="width:${c / mx * 100}%"></i></span><span class="rc">${c} sesi</span></button>`).join('') + (rankAll.length > 5 ? `<button type="button" class="btn-s" id="ev-rkmore">${rkAll ? 'Tampilkan 5 teratas' : `Lihat semua (${rankAll.length})`}</button>` : '') : '';

  const list = scope.filter(t => (!cur || t.member === cur) && (!st || t.used > 0));
  const groups = grouper(list);
  $('ev-info').textContent = `${groups.length} seri · ${list.length} sesi`;
  flipRender($('ev-list'), '.ev-g', it => it.dataset.k, () => { $('ev-list').innerHTML = groups.length ? groups.slice(0, evLimit).map(groupHtml).join('') : '<div class="empty">Tidak ada tiket yang cocok</div>'; });
  $('ev-more').hidden = groups.length <= evLimit;
  $('ev-more').textContent = `Tampilkan ${Math.max(0, Math.min(EV_PAGE, groups.length - evLimit))} lagi (sisa ${Math.max(0, groups.length - evLimit)})`;
  tickCountdown();
}

const resetEv = () => { evLimit = EV_PAGE; renderTickets(); };
['ev-member', 'ev-status'].forEach(id => $(id)?.addEventListener('change', resetEv));
$('ev-cats')?.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { evCat = b.dataset.cat; resetEv(); } });
$('ev-rank')?.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { const m = $('ev-member'); m.value = m.value === b.dataset.m ? '' : b.dataset.m; resetEv(); } });
$('ev-more')?.addEventListener('click', () => { evLimit += EV_PAGE; renderTickets(); });
$('ev-rank')?.addEventListener('click', e => { if (e.target.closest('#ev-rkmore')) { rkAll = !rkAll; renderTickets(); } });

