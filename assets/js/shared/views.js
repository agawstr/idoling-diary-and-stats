/* assets/js/shared/views.js — Kalender, galeri, Wrapped, riwayat (timeline), cakupan kursi, putar ulang, sebaran baris
   Bagian dari kode bersama index.html & admin.html (dulu satu file shared.js). Dimuat berurutan sebagai skrip klasik
   (satu lingkup global yang sama); urutan muat ada di index.html dan admin.html dan diperiksa oleh scripts/check_assets.py. */
// ================= Animasi, kalender, galeri, Wrapped =================
let introDone = false, intro = false;
const rowLabels = () => `<div class="row-labels" aria-hidden="true">${Object.keys(COUNTS).map((l, i) => `<div class="seat-row" style="--r:${i}">${l}</div>`).join('')}</div>`;

function tally(list, fn, tie) {
  const o = {};
  list.forEach(r => [].concat(fn(r)).forEach(k => k && (o[k] = (o[k] || 0) + 1)));
  return Object.entries(o).sort((a, b) => b[1] - a[1] || (tie ? tie(a[0], b[0]) : 0))[0];
}

// format angka untuk animasi hitung: '' = bilangan bulat, 'rp' = Rp 1.234.567, 'pct1' = 58.3%
const fmtNum = (n, f) => f === 'rp' ? rupiah(Math.round(n)) : f === 'pct1' ? n.toFixed(1) + '%' : String(Math.round(n));
// angka naik dari 0. Penanda: data-n (kartu statistik, ikut dianimasikan lagi saat filter berubah) atau data-cu (hanya hitung naik);
// data-fmt = format, data-suf = akhiran (mis. ×). Teks akhir dikembalikan persis seperti aslinya di frame terakhir.
function countUp(root, zero) {
  if (calm()) return;
  root.querySelectorAll('[data-n],[data-cu]').forEach(el => {
    const n = parseFloat(el.dataset.n ?? el.dataset.cu), f = el.dataset.fmt || '', suf = el.dataset.suf || '', fin = el.textContent;
    if (isNaN(n)) return;
    if (document.hidden) { el.textContent = fin; return; } // rAF berhenti di tab latar: jangan tinggalkan angka di 0
    const t0 = performance.now(), d = n > 99999 ? 1400 : 1100;
    const step = t => {
      const p = Math.min(1, (t - t0) / d);
      el.textContent = p >= 1 ? fin : fmtNum(n * (1 - Math.pow(1 - p, 3)), f) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    if (zero) el.textContent = fmtNum(0, f) + suf;
    requestAnimationFrame(step);
  });
}

// placeholder berkilau selagi data dimuat
function skeleton() {
  $('stats').innerHTML = '<div class="stat sk"></div>'.repeat(6);
  $('sl-chart').innerHTML = '<div class="sk" style="height:30px;margin:6px 0"></div>'.repeat(5);
  if ($('lot')) $('lot').innerHTML = '<div class="lot-cards">' + '<div class="stat sk"></div>'.repeat(4) + '</div>'; // tab Tiket & Event
  if ($('ev-list')) $('ev-list').innerHTML = '<div class="sk" style="height:64px;margin:8px 0"></div>'.repeat(4);
  if ($('ev-cats')) $('ev-cats').innerHTML = '<div class="sk" style="height:84px"></div>'.repeat(4);
}

// kalender kehadiran per hari (ikut filter)
let calYear = 0, calYears = [];
function renderCal() {
  calYears = [...new Set(records.map(r => r.date.slice(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort();
  if (!calYears.length) { $('cal-nav').innerHTML = ''; $('mchart').innerHTML = ''; $('cal').innerHTML = '<div class="empty">Belum ada data</div>'; return; }
  if (!calYears.includes(String(calYear))) calYear = +calYears[calYears.length - 1];
  const i = calYears.indexOf(String(calYear));
  $('wrap-btn').textContent = `Wrapped ${calYear}`;
  $('cal-nav').innerHTML = `<button type="button" class="btn-s" data-cy="-1" ${i <= 0 ? 'disabled' : ''}>‹</button><b>${calYear}</b><button type="button" class="btn-s" data-cy="1" ${i >= calYears.length - 1 ? 'disabled' : ''}>›</button>`;
  const cnt = {};
  viewEx(['date']).forEach(r => cnt[r.date] = (cnt[r.date] || 0) + 1);
  const d = new Date(calYear, 0, 1), pad = d.getDay(); // kolom dimulai hari Minggu
  const weeks = Math.ceil((pad + Math.round((new Date(calYear + 1, 0, 1) - d) / 864e5)) / 7);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  let cells = '<i class="cd e"></i>'.repeat(pad), labels = '';
  for (let idx = pad; d.getFullYear() === calYear; d.setDate(d.getDate() + 1), idx++) {
    if (d.getDate() === 1) labels += `<span style="left:${Math.floor(idx / 7) / weeks * 100}%">${mon[d.getMonth()]}</span>`; // label tepat di minggu pertama bulan
    const k = `${calYear}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, n = cnt[k] || 0;
    cells += `<i class="cd${n ? ' on' + Math.min(n, 3) : ''}${filter.from && filter.to && k >= filter.from && k <= filter.to ? ' sel' : ''}"${n ? ` data-d="${k}" role="button" tabindex="0" aria-label="${fmtDate(k)}" style="--d:${Math.floor(idx / 7)}"` : ''} title="${fmtDate(k)}${n ? ': ' + n + ' show' : ''}"></i>`;
  }
  $('cal').innerHTML = `<div class="cal-m">${labels}</div><div class="cal-g" style="--w:${weeks}">${cells}</div>`;
  // kunjungan per bulan di tahun yang sama (ikut filter)
  const mc = Array(12).fill(0), ms = Array(12).fill(0);
  viewEx(['date']).forEach(r => { if (r.date.startsWith(calYear + '-')) { mc[+r.date.slice(5, 7) - 1]++; ms[+r.date.slice(5, 7) - 1] += r.harga; } });
  const mx = Math.max(...mc, 1), mkey = i => calYear + '-' + String(i + 1).padStart(2, '0');
  const hOpen = !!$('mc-h').querySelector('.hint:not([hidden])'); // pertahankan keadaan buka/tutup saat digambar ulang
  $('mc-h').innerHTML = `Kunjungan per bulan (${calYear}) <button type="button" class="info-btn" aria-label="Keterangan" aria-expanded="${hOpen}">ⓘ</button><small class="hint"${hOpen ? '' : ' hidden'}>· klik batang bulan untuk memfilter peta</small>`;
  $('mchart').innerHTML = mc.map((n, i) => `<div class="mc${filter.from === mkey(i) + '-01' && filter.to.startsWith(mkey(i)) ? ' on' : ''}"${n ? ` data-mo="${mkey(i)}" role="button" tabindex="0"` : ''} style="--i:${i}" title="${mon[i]}: ${n} show${ms[i] ? ' · ' + rupiah(ms[i]) : ''}"><span class="mc-n">${n || ''}</span><div class="mc-b"><i style="height:${n / mx * 100}%"></i></div><span class="mc-l">${mon[i]}</span></div>`).join('');
}
$('cal-nav').addEventListener('click', e => {
  const b = e.target.closest('[data-cy]');
  if (!b) return;
  calYear = +calYears[calYears.indexOf(String(calYear)) + Number(b.dataset.cy)];
  withAnim(renderCal); // bar bulan ikut naik/turun
  slideCal(Number(b.dataset.cy));
});

// galeri foto 2-Shot / Chekicha (hanya jika halaman punya #gallery)
function renderGallery() {
  const g = $('gallery');
  if (!g) return;
  const soloItems = solo.filter(w => w.photo).map(w => { const K = KINDS.find(k => k.k === w.kind); return {label: K.short[w.type], icon: K.icon, member: w.member, photo: w.photo, k: w.kind, solo: true, r: {id: w.id, date: w.date, sesi: '', setlist: w.setlist || 'Di luar show'}}; });
  // foto 2-Shot event: tanggal, member, dan nama event diambil dari data tiket yang sudah ada
  const evItems = tickets.filter(t => t.photo).map((t, i) => ({label: '2-Shot Event', icon: '', member: t.member, photo: t.photo, k: 'ev', ev: true, r: {id: i, date: t.date, sesi: '', setlist: tname(t)}}));
  const items = [...records.flatMap(r => extras(r).filter(x => x.photo).map(x => ({...x, r}))), ...soloItems, ...evItems].sort((a, b) => cmp(a.r, b.r));
  const sel = $('g-member'), cur = sel.value;
  const inK = x => !galKind || x.k === galKind; // sub-tab Galeri: Semua / 2-Shot / 2-Shot Event / Chekicha
  const mem = [...new Set(items.filter(inK).map(x => x.member).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Semua member</option>' + mem.map(m => `<option${m === cur ? ' selected' : ''}>${esc(m)}</option>`).join('');
  const list = items.filter(x => inK(x) && (!cur || !mem.includes(cur) || x.member === cur));
  if ($('g-kinds')) $('g-kinds').innerHTML = [['', 'Semua'], ['ts', '2-Shot'], ['ev', '2-Shot Event'], ['ck', 'Chekicha']].map(([k, l]) => `<button type="button" class="gk${k === galKind ? ' on' : ''}" data-gk="${k}">${l} <b>${items.filter(x => !k || x.k === k).length}</b></button>`).join('');
  $('g-info').textContent = `${list.length} foto`;
  if ($('g-tab') && dataLoaded) $('g-tab').textContent = `Galeri (${items.length})`;
  // isi galeri tidak bergantung pada filter peta: kalau daftarnya sama persis, jangan bangun ulang.
  // (membangun ulang = <img> baru = foto memudar ulang + diunduh/decode ulang tepat saat tab dibuka)
  const sig = galKind + '|' + cur + '|' + list.map(x => [x.photo, x.k, x.member, x.label, x.r.setlist, x.r.date, x.r.id].join('~')).join('|');
  if (sig === renderGallery.sig && g.firstElementChild) return;
  renderGallery.sig = sig;
  g.innerHTML = list.length ? list.map((x, i) => `<figure class="gi${i < 8 ? ' a' : ''}" data-k="${esc(x.k)}" style="--i:${Math.min(i, 9)};--t:${(i * 37 % 9) - 4}deg"><div class="gi-ph"><img src="${esc(thumbOf(x.photo))}" data-full="${esc(x.photo)}" onerror="this.onerror=null;this.src=this.dataset.full" data-photo alt="${esc(x.label)} dengan ${esc(x.member)}" data-cap="${esc(x.label)} dengan ${esc(x.member) || '-'}" data-sub="${esc([x.r.setlist, fmtDate(x.r.date), x.r.sesi, x.solo ? 'di luar show' : ''].filter(Boolean).join(' · '))}" loading="lazy" decoding="async"></div>
    <figcaption><b class="gi-n">${esc(x.member) || '-'}</b><span class="gi-tag">${esc(x.label)}</span><span class="gi-m">${esc(x.r.setlist)}</span><time class="gi-d">${esc(fmtDate(x.r.date))}</time>${x.solo ? '<span class="gi-x">di luar show</span>' : ''}</figcaption></figure>`).join('')
    : '<div class="empty">Belum ada foto</div>';
}
$('g-member')?.addEventListener('change', renderGallery);
$('gallery')?.addEventListener('load', e => { if (e.target.tagName !== 'IMG') return; e.target.classList.add('ld'); e.target.closest('.gi-ph')?.classList.add('ok'); }, true); // foto memudar masuk setelah selesai dimuat; .ok mematikan placeholder

// peta mini di canvas: counts = kode->jumlah (warna heatmap), hl = kursi yang disorot (opsional)
function drawMiniMap(c, cx, y0, cw, g, counts, hl, rad = 5) {
  const gap = 18, ch = cw * 1.1;
  const bw = [0, 1, 2, 3].map(j => Math.max(...LAYOUT.map(r => r[j].length)) * (cw + g) - g);
  let x0 = cx - (bw.reduce((a, b) => a + b) + gap * 3) / 2, spot = null;
  for (let j = 0; j < 4; j++) {
    LAYOUT.forEach((row, i) => {
      const w = row[j].length * (cw + g) - g, y = y0 + i * (ch + g);
      row[j].forEach((code, k) => {
        const x = (j % 2 ? x0 : x0 + bw[j] - w) + k * (cw + g), n = counts[code], h = n ? heat(n) : null;
        if (code === hl) { spot = {x, y}; return; } // kursi yang disorot digambar terakhir, di atas yang lain
        c.beginPath(); c.roundRect(x, y, cw, ch, rad);
        c.globalAlpha = hl ? .5 : 1; c.fillStyle = h ? h.bg : '#2a0f18'; c.fill(); c.globalAlpha = 1;
      });
    });
    x0 += bw[j] + gap;
  }
  if (spot) {
    const e = Math.max(2, cw * .18);
    c.save(); c.beginPath(); c.roundRect(spot.x - e, spot.y - e, cw + e * 2, ch + e * 2, rad + e);
    c.shadowColor = '#ff8c00'; c.shadowBlur = 36; c.fillStyle = '#ffd23f'; c.fill(); c.shadowBlur = 0;
    c.lineWidth = Math.max(2, cw * .12); c.strokeStyle = '#fff'; c.stroke(); c.restore();
  }
}
// kartu "Wrapped" untuk tahun yang dipilih di kalender, disimpan sebagai PNG
async function wrapped() {
  if (!calYear) return alert('Belum ada data untuk dibuat Wrapped.');
  const y = String(calYear), rs = records.filter(r => r.date.startsWith(y));
  if (!rs.length) return alert('Tidak ada show di tahun ' + y + '.');
  const t = (fn, tie) => tally(rs, fn, tie) || ['-', 0];
  const rows = [
    ['KURSI FAVORIT', ...t(r => r.seat, seatTie)],
    ['SETLIST TERBANYAK', ...t(r => r.setlist)],
    ['MEMBER TERATAS', ...t(r => extras(r).map(x => x.member))],
    ['BARIS FAVORIT', ...t(r => r.seat[0], (a, b) => a.localeCompare(b))]
  ];
  await cardFonts();
  const counts = {};
  rs.forEach(r => counts[r.seat] = (counts[r.seat] || 0) + 1);
  const W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  cardBg(c, W, H, +y);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.roundRect(W / 2 - 240, 50, 480, 56, 28); c.fill();
  c.fillStyle = '#e4e4e7'; c.font = `700 24px ${CARD_F}`; c.fillText('T H E A T E R   W R A P P E D', W / 2, 86);
  const gt = c.createLinearGradient(W / 2 - 320, 0, W / 2 + 320, 0);
  gt.addColorStop(0, '#ff2a5f'); gt.addColorStop(1, '#ffb347');
  c.fillStyle = gt; c.shadowColor = 'rgba(255,42,95,.6)'; c.shadowBlur = 40;
  c.font = `900 210px ${CARD_F}`; c.fillText(y, W / 2, 290);
  c.shadowBlur = 0;
  c.fillStyle = '#fff'; c.font = `800 44px ${CARD_F}`;
  c.fillText(`${rs.length} show · ${Object.keys(counts).length} kursi berbeda`, W / 2, 358);
  c.fillStyle = '#ff2a5f'; c.font = `800 20px ${CARD_F}`; c.fillText('S T A G E', W / 2, 410);
  drawMiniMap(c, W / 2, 428, 26, 3, counts, null);
  rows.forEach(([label, val, n], i) => {
    const x = 90 + (i % 2) * 460, yy = 780 + Math.floor(i / 2) * 200;
    glass(c, x, yy, 440, 180, 28);
    c.textAlign = 'left';
    c.fillStyle = '#a1a1aa'; c.font = `700 22px ${CARD_F}`; c.fillText(label, x + 30, yy + 48);
    c.fillStyle = '#fff'; fitFont(c, String(val), 380, 46, 800); c.fillText(val, x + 30, yy + 108);
    c.fillStyle = '#ff8c00'; c.font = `900 34px ${CARD_F}`; c.fillText(n ? n + '×' : '', x + 30, yy + 155);
  });
  const paid = rs.reduce((a, r) => a + (r.harga || 0), 0);
  c.textAlign = 'center'; c.fillStyle = '#e4e4e7'; c.font = `700 32px ${CARD_F}`;
  c.fillText(`${rs.filter(r => r.twoshot === 'Ya').length} 2-Shot  ·  ${rs.filter(r => r.chekicha === 'Ya').length} Chekicha${paid ? '  ·  ' + rupiah(paid) : ''}`, W / 2, 1230);
  c.fillStyle = '#9a9aa4'; c.font = `600 26px ${CARD_F}`; c.fillText(document.querySelector('h1').textContent, W / 2, 1300);
  openShare({title: `Bagikan Wrapped ${y}`, formats: false, file: `wrapped-${y}.png`,
    text: `Theater Wrapped ${y}: ${rs.length} show · ${Object.keys(counts).length} kursi berbeda\n${document.querySelector('h1').textContent}${/^https?:/i.test(location.protocol) ? '\n' + location.origin + location.pathname : ''}`,
    render: async () => cv});
}
$('wrap-btn').addEventListener('click', wrapped);

// ================= Riwayat (timeline) & cakupan kursi =================
let showUnv = false;
function renderCover() {
  const got = new Set(view().map(r => r.seat).filter(s => SEATS.has(s))).size, tot = SEATS.size, pct = Math.round(got / tot * 100);
  $('cover').innerHTML = `<div class="cov-t"><b>Kursi terisi <span data-cu="${got}">${got}</span> dari ${tot}</b><span data-cu="${pct}" data-suf="%">${pct}%</span></div>
    <div class="cov-bar"><i style="width:${pct}%"></i></div>
    <div class="cov-s"><span>${tot - got} kursi belum pernah ditempati</span>
    <button type="button" class="btn-s" id="cov-btn" aria-pressed="${showUnv}">${showUnv ? 'Tampilkan semua' : 'Sorot yang belum'}</button></div>`;
}
$('cover').addEventListener('click', e => {
  if (e.target.closest('#cov-btn')) { showUnv = !showUnv; renderChart(); }
});
// Cakupan setlist: berapa setlist resmi yang sudah ditonton (mengikuti filter, sama seperti Cakupan kursi); hanya tampil kalau daftar setlist ada
let covSlOpen = false;
function renderCoverSl() {
  const el = $('cover-sl');
  if (!el) return;
  const master = sanitizeSetlists(setlistMaster);
  el.hidden = !master.length;
  if (!master.length) { el.innerHTML = ''; return; }
  const seen = new Set(view().map(r => String(r.setlist || '').trim().toLowerCase()).filter(Boolean));
  const miss = master.filter(n => !seen.has(n.toLowerCase())), got = master.length - miss.length, pct = Math.round(got / master.length * 100);
  el.innerHTML = `<div class="cov-t"><b>Setlist ditonton <span data-cu="${got}">${got}</span> dari ${master.length}</b><span data-cu="${pct}" data-suf="%">${pct}%</span></div>
    <div class="cov-bar"><i style="width:${pct}%"></i></div>
    <div class="cov-s"><span>${miss.length ? `${miss.length} setlist belum pernah ditonton` : 'Semua setlist sudah pernah ditonton'}</span>
    ${miss.length ? `<button type="button" class="btn-s" id="covsl-btn" aria-expanded="${covSlOpen}" aria-controls="covsl-l">${covSlOpen ? 'Sembunyikan' : 'Lihat yang belum'}</button>` : ''}</div>
    ${miss.length ? `<div class="covsl-l" id="covsl-l"${covSlOpen ? '' : ' hidden'}>${miss.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : ''}`;
}
$('cover-sl').addEventListener('click', e => {
  if (!e.target.closest('#covsl-btn')) return;
  covSlOpen = !covSlOpen;
  const b = $('covsl-btn'), l = $('covsl-l');
  b.setAttribute('aria-expanded', covSlOpen); b.textContent = covSlOpen ? 'Sembunyikan' : 'Lihat yang belum';
  if (l) l.hidden = !covSlOpen;
});

function renderTimeline() {
  const el = $('timeline');
  if (!el) return;
  const all = [...records].sort(cmp);
  if ($('t-tab') && dataLoaded) $('t-tab').textContent = `Riwayat (${all.length})`;
  const q = ($('tl-q')?.value || '').trim().toLowerCase();
  const hay = r => [r.setlist, r.seat, r.date, r.sesi, r.note, ...extras(r).flatMap(x => [x.member, x.label]), ...(r.lineup || [])].join(' ').toLowerCase();
  const list = q ? all.filter(r => q.split(/\s+/).every(w => hay(r).includes(w))) : all; // semua kata harus cocok
  if ($('tl-info')) $('tl-info').textContent = q ? `${list.length} dari ${all.length} show` : '';
  const mon = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const numOf = new Map(all.slice().reverse().map((r, i) => [r.id, i + 1])); // nomor urut show sepanjang masa
  const perMon = {}; list.forEach(r => { const k = r.date.slice(0, 7); perMon[k] = (perMon[k] || 0) + 1; });
  let cur = '', curY = '', html = '', cnt = 0, grp = false; // tiap bulan dibungkus .tl-g: header bulan menempel hanya selama bulannya terlihat, lalu didorong keluar oleh bulan berikutnya (tidak bertumpuk)
  for (const r of list) {
    const ym = r.date.slice(0, 7), n = numOf.get(r.id), ms = n === 1 || n === 10 || n % 25 === 0; // milestone
    if (r.date.slice(0, 4) !== curY) { curY = r.date.slice(0, 4); if (grp) { html += '</div>'; grp = false; } html += `<div class="tl-yh">${esc(curY) || '–'}</div>`; }
    if (ym !== cur) {
      cur = ym;
      if (grp) html += '</div>';
      html += '<div class="tl-g">'; grp = true;
      html += `<h3 class="tl-mh"><span>${/^\d{4}-\d{2}$/.test(ym) ? mon[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4) : 'Tanpa tanggal'}</span><small>${perMon[ym]} show</small></h3>`;
    }
    const ex = extras(r), lt = lotInfo(r), ci = cnt++;
    html += `<div class="tl-i${ms ? ' ms' : ''}${ci < 8 ? ' a' : ''}" data-id="${r.id}" data-seat="${esc(r.seat)}" style="--i:${Math.min(ci, 8)}">
      <div class="tl-d"><b>${esc(r.date.slice(8)) || '–'}</b><span>${esc(r.sesi)}</span></div>
      <div class="tl-b"><div class="tl-t">${esc(r.setlist) || '(tanpa setlist)'}</div>
        ${ms || ex.length || lt || r.harga ? `<div class="tl-chips">${ms ? `<span class="tc star">Show ke-${n}</span>` : ''}${ex.map(x => `<span class="tc ${x.k}">${esc(x.label)}${x.member ? ' · ' + esc(x.member) : ''}</span>`).join('')}${lt ? `<span class="tc lot">${esc(lt)}</span>` : ''}${r.harga ? `<span class="tc">${esc(rupiah(r.harga))}${r.tiket ? ' · ' + esc(r.tiket) : ''}</span>` : ''}</div>` : ''}
        ${r.note ? `<div class="tl-n">“${esc(r.note)}”</div>` : ''}</div>
      <button type="button" class="seat-badge tl-s" data-seat="${esc(r.seat)}" aria-label="Lihat kursi ${esc(r.seat)}">${esc(r.seat)}</button></div>`;
  }
  if (grp) html += '</div>';
  flipRender(el, '.tl-i', it => it.dataset.id, () => { el.innerHTML = html || (q ? `<div class="empty">Tidak ada show yang cocok dengan “${esc($('tl-q').value.trim())}”<br><button type="button" class="btn-s" data-tlclear>Hapus pencarian</button></div>` : '<div class="empty">Belum ada riwayat</div>'); });
}
$('timeline')?.addEventListener('click', e => {
  const b = e.target.closest('[data-seat]'); // seluruh kartu bisa diketuk
  if (b) openSeat(b.dataset.seat);
});

let tlT; // jeda singkat supaya tidak render ulang di setiap ketikan
$('tl-q')?.addEventListener('input', () => { clearTimeout(tlT); tlT = setTimeout(renderTimeline, 150); });
$('timeline')?.addEventListener('click', e => { if (e.target.closest('[data-tlclear]')) { const i = $('tl-q'); i.value = ''; i.dispatchEvent(new Event('input', {bubbles: true})); } });

// ================= Putar ulang, sebaran baris, biaya, kartu per show =================
const rupiah = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
let replayN = null, replayT = 0;
function stopReplay() {
  clearInterval(replayT); replayN = null;
  $('rp-btn').textContent = 'Putar ulang';
  renderChart();
}
function replay() { // peta terisi satu per satu sesuai urutan tanggal
  if (replayN !== null) return stopReplay();
  const list = records.filter(r => matchF(r)).sort((a, b) => cmp(b, a));
  if (!list.length) return;
  replayN = 0;
  replayT = setInterval(() => {
    if (++replayN > list.length) return stopReplay();
    renderChart();
    $('rp-btn').textContent = `Stop ${replayN}/${list.length} · ${fmtDate(list[replayN - 1].date)}`;
    if (replayN === 10 || replayN % 25 === 0) { $('rp-btn').textContent = '' + $('rp-btn').textContent; burst($('chart').querySelector(`[data-seat="${list[replayN - 1].seat}"]`)); }
  }, Math.min(400, Math.max(60, 4000 / list.length)));
}
$('rp-btn').addEventListener('click', replay);

function renderRows() {
  const c = {}, keys = Object.keys(COUNTS);
  viewEx(['row']).forEach(r => { const k = r.seat[0]; c[k] = (c[k] || 0) + 1; });
  const mx = Math.max(...keys.map(k => c[k] || 0), 1), sum = ks => ks.reduce((a, k) => a + (c[k] || 0), 0);
  $('rchart').innerHTML = keys.map((k, i) => `<div class="mc${filter.row === k ? ' on' : ''}"${c[k] ? ` data-row="${k}" role="button" tabindex="0"` : ''} style="--i:${i}" title="Baris ${k}: ${c[k] || 0} kali"><span class="mc-n">${c[k] || ''}</span><div class="mc-b"><i style="height:${(c[k] || 0) / mx * 100}%"></i></div><span class="mc-l">${k}</span></div>`).join('');
  $('rsum').textContent = `Depan (A–E): ${sum(keys.slice(0, 5))}× · Belakang (F–J): ${sum(keys.slice(5))}×`;
}

function fitFont(c, txt, max, size, wt) {
  do { c.font = `${wt} ${size}px ${CARD_F}`; size -= 2; } while (c.measureText(txt).width > max && size > 20);
}
