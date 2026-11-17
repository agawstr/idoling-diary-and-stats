/* assets/js/shared/share.js — Kartu bagikan (gambar kartu) + lembar bagikan
   Bagian dari kode bersama index.html & admin.html (dulu satu file shared.js). Dimuat berurutan sebagai skrip klasik
   (satu lingkup global yang sama); urutan muat ada di index.html dan admin.html dan diperiksa oleh scripts/check_assets.py. */
// ================= Kartu bagikan: gambar kartu + lembar bagikan =================
// Gaya kartu mengikuti web: latar gelap + cahaya merah muda/oranye, kaca, hati piksel (seperti layar muat), foto ala polaroid galeri.
const CARD_F = "Inter,-apple-system,'Segoe UI',Roboto,sans-serif", CARD_H = "Caveat,'Segoe Print','Bradley Hand',cursive";
const PAPER = { // kertas polaroid sama dengan galeri: 2-Shot krem, Chekicha merah muda
  ts: {paper: '#f6f0e6', paper2: '#eadfca', accent: '#b4235a', tape: 'rgba(255,210,63,.85)'},
  ck: {paper: '#f9eef1', paper2: '#efdde2', accent: '#c2185b', tape: 'rgba(255,128,168,.85)'}
};
const HEART_PX = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000'];
const pxHeart = (c, x, y, s, col) => { c.fillStyle = col; HEART_PX.forEach((row, j) => { for (let i = 0; i < 8; i++) if (row[i] === '1') c.fillRect(x + i * s, y + j * s, s, s); }); };
const cardFonts = () => Promise.race([Promise.all(['900 64px Inter', '800 30px Inter', '600 30px Inter', '700 40px Caveat'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 1500))]).catch(() => {}); // jangan menunggu lama kalau font gagal dimuat
const loadImg = src => new Promise(res => { const im = new Image(); if (/^https?:/i.test(src)) im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
const rrect = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
function fitTxt(c, txt, max, size, wt, fam = CARD_F, min = 22) { do { c.font = `${wt} ${size}px ${fam}`; size -= 2; } while (c.measureText(txt).width > max && size > min); }
function ellip(c, txt, max) { if (c.measureText(txt).width <= max) return txt; while (txt.length > 1 && c.measureText(txt + '…').width > max) txt = txt.slice(0, -1); return txt.trimEnd() + '…'; }
function lab(c, txt, x, y, font, col, align = 'left', ls = 4) { // teks kapital dengan jarak antarhuruf
  c.save(); c.font = font; c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic';
  if ('letterSpacing' in c) c.letterSpacing = ls + 'px';
  c.fillText(txt, align === 'center' && 'letterSpacing' in c ? x + ls / 2 : x, y); c.restore();
}
function cardBg(c, W, H, seed) { // latar: gradasi gelap, cahaya, titik halus, dan hati piksel acak (tetap sama untuk show yang sama)
  const bg = c.createLinearGradient(0, 0, W * .6, H); bg.addColorStop(0, '#2a0612'); bg.addColorStop(.55, '#150810'); bg.addColorStop(1, '#0d090d');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  [[.15, .05, .8, 'rgba(255,42,95,.42)'], [.98, .38, .6, 'rgba(255,140,0,.2)'], [.7, 1, .85, 'rgba(136,19,55,.55)'], [0, .82, .55, 'rgba(120,70,255,.2)']].forEach(([gx, gy, gr, col]) => {
    const g = c.createRadialGradient(W * gx, H * gy, 0, W * gx, H * gy, W * gr); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  });
  c.fillStyle = 'rgba(255,255,255,.05)';
  for (let y = 18; y < H; y += 36) for (let x = 18; x < W; x += 36) c.fillRect(x, y, 3, 3);
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  const rnd = () => (s = s * 48271 % 2147483647) / 2147483647;
  for (let i = 0; i < 18; i++) pxHeart(c, rnd() * (W - 60), rnd() * (H - 60), 3 + Math.floor(rnd() * 3), i % 3 ? 'rgba(255,42,95,.16)' : 'rgba(255,210,63,.15)');
}
function glass(c, x, y, w, h, r = 30) { // permukaan kaca seperti kartu di web
  const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(255,255,255,.17)'); g.addColorStop(1, 'rgba(255,255,255,.05)');
  c.save(); rrect(c, x, y, w, h, r); c.fillStyle = g; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.2)'; c.stroke();
  const hl = c.createLinearGradient(x, y, x, y + 40); hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  c.beginPath(); c.roundRect(x + 2, y + 2, w - 4, 40, [r, r, 0, 0]); c.fillStyle = hl; c.fill(); c.restore();
}
function coverDraw(c, im, x, y, w, h, fy = .2) {
  const s = Math.max(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
  c.drawImage(im, x + (w - dw) / 2, y + (h - dh) * fy, dw, dh);
}
function polaroid(c, o) { // o: {cx, cy, p (sisi foto), rot (derajat), k ('ts'|'ck'), img, name, tag}
  const p = o.p, pad = Math.round(p * .055), cap = Math.round(p * .26), W = p + pad * 2, H = pad + p + cap, K = PAPER[o.k] || PAPER.ts;
  c.save(); c.translate(o.cx, o.cy); c.rotate(o.rot * Math.PI / 180);
  c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 60; c.shadowOffsetY = 28;
  const g = c.createLinearGradient(0, -H / 2, 0, H / 2); g.addColorStop(0, K.paper); g.addColorStop(1, K.paper2);
  rrect(c, -W / 2, -H / 2, W, H, 10); c.fillStyle = g; c.fill();
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
  const px = -W / 2 + pad, py = -H / 2 + pad;
  c.save(); rrect(c, px, py, p, p, 4); c.clip();
  if (o.img) coverDraw(c, o.img, px, py, p, p, .2);
  else { c.fillStyle = '#2a0f18'; c.fillRect(px, py, p, p); pxHeart(c, -p * .12, py + p * .4, Math.round(p / 36), '#ff2a5f'); }
  const v = c.createLinearGradient(0, py + p * .7, 0, py + p); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.2)');
  c.fillStyle = v; c.fillRect(px, py, p, p); c.restore();
  const y0 = py + p; // keterangan tulisan tangan
  c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = '#2a1a1f';
  fitTxt(c, o.name || '', p - 20, Math.round(p * .115), 700, CARD_H, 24);
  c.fillText(o.name || '', 0, y0 + cap * .52);
  c.font = `800 ${Math.round(p * .04)}px ${CARD_F}`;
  const tw = c.measureText(o.tag).width + 40, th = Math.round(p * .075), ty = y0 + cap * .64;
  rrect(c, -tw / 2, ty, tw, th, th / 2); c.fillStyle = K.accent; c.fill();
  c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(o.tag, 0, ty + th / 2 + 1); c.textBaseline = 'alphabetic';
  c.save(); c.translate(0, -H / 2 + 4); c.rotate(-2.5 * Math.PI / 180); c.fillStyle = K.tape; c.fillRect(-p * .17, -22, p * .34, 44); c.restore(); // selotip
  c.restore();
}
// fmt: 'feed' (1080x1350, 4:5) atau 'story' (1080x1920, 9:16; isi tetap di zona aman Story Instagram)
async function drawShowCard(r, fmt) {
  await cardFonts();
  const story = fmt === 'story', W = 1080, H = story ? 1920 : 1350, dy = story ? 190 : 0;
  const pics = extras(r).filter(x => x.photo).slice(0, 2), imgs = await Promise.all(pics.map(x => loadImg(x.photo)));
  const p1 = story ? 560 : 470, gy = Math.round((p1 - 470) * 1.37), Y = v => v + dy + gy; // Y: posisi di bawah polaroid
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  cardBg(c, W, H, r.id);
  const all = [...records].sort(cmp).reverse(), n = all.findIndex(x => x.id === r.id) + 1, ms = n === 1 || n === 10 || n % 25 === 0;
  const mine = records.filter(x => x.seat === r.seat).sort((a, b) => a.date.localeCompare(b.date) || (SO[a.sesi] || 0) - (SO[b.sesi] || 0));
  const ord = mine.findIndex(x => x.id === r.id) + 1, tot = mine.length;
  const counts = {}; records.forEach(x => counts[x.seat] = (counts[x.seat] || 0) + 1);
  // header: hati piksel + nama web, lencana nomor show
  pxHeart(c, 70, 52 + dy, 5, '#ff2a5f');
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.font = `800 30px ${CARD_F}`; c.fillText(ellip(c, document.querySelector('h1').textContent, 560), 126, 70 + dy);
  const bt = (ms ? '★ ' : '') + 'SHOW KE-' + n;
  c.save(); if ('letterSpacing' in c) c.letterSpacing = '3px'; c.font = `800 24px ${CARD_F}`;
  const bw = c.measureText(bt).width + 56; rrect(c, W - 70 - bw, 40 + dy, bw, 60, 30);
  c.fillStyle = ms ? '#ffd23f' : 'rgba(255,255,255,.1)'; c.fill(); c.lineWidth = 2; c.strokeStyle = ms ? '#fff3b0' : 'rgba(255,255,255,.22)'; c.stroke();
  c.fillStyle = ms ? '#1a0f00' : '#fff'; c.textAlign = 'center'; c.fillText(bt, W - 70 - bw / 2, 71 + dy); c.restore();
  c.textBaseline = 'alphabetic';
  // inti kartu: polaroid (1 atau 2 foto) atau denah besar jika tidak ada foto
  const midY = 500 + dy + gy / 2;
  if (pics.length === 1) polaroid(c, {cx: W / 2, cy: midY, p: p1, rot: -2.5, k: pics[0].k, img: imgs[0], name: pics[0].member, tag: pics[0].label});
  else if (pics.length === 2) {
    const p2 = story ? 440 : 380;
    pics.forEach((x, i) => polaroid(c, {cx: W / 2 + (i ? 1 : -1) * p2 * .5, cy: midY + (i ? 14 : -10), p: p2, rot: i ? 4.5 : -5, k: x.k, img: imgs[i], name: x.member, tag: x.label}));
  } else {
    const hy = 160 + dy, hh = 650 + gy;
    glass(c, 70, hy, 940, hh, 40);
    lab(c, 'S T A G E', W / 2, hy + 62, `800 22px ${CARD_F}`, '#ff2a5f', 'center', 2);
    drawMiniMap(c, W / 2, hy + 90, 26, 3.5, counts, r.seat, 6);
    const sg = c.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0); sg.addColorStop(0, '#ffd23f'); sg.addColorStop(1, '#ff8c00');
    c.textAlign = 'center'; c.fillStyle = sg; c.font = `900 150px ${CARD_F}`; c.fillText(r.seat, W / 2, hy + 420 + (hh - 420) / 2 + 48);
  }
  // judul, tanggal, keterangan
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const title = r.setlist || '(tanpa setlist)'; fitTxt(c, title, W - 140, 76, 900);
  const tw = c.measureText(title).width, tg = c.createLinearGradient(W / 2 - tw / 2, 0, W / 2 + tw / 2, 0); tg.addColorStop(0, '#ff5c87'); tg.addColorStop(1, '#ffb347');
  c.shadowColor = 'rgba(255,42,95,.45)'; c.shadowBlur = 30; c.fillStyle = tg; c.fillText(title, W / 2, Y(915)); c.shadowBlur = 0;
  const d = new Date(r.date + 'T00:00:00'), tgl = isNaN(d) ? r.date : d.toLocaleDateString('id-ID', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
  c.fillStyle = '#e4e4e7'; c.font = `600 34px ${CARD_F}`; c.fillText(tgl + (r.sesi ? '  ·  ' + r.sesi : ''), W / 2, Y(975));
  let ly = 1030;
  extras(r).filter(x => !x.photo).forEach(x => { if (ly > 1050) return; c.fillStyle = '#34d399'; c.font = `700 32px ${CARD_F}`; c.fillText(ellip(c, `${x.label} dengan ${x.member}`, W - 160), W / 2, Y(ly)); ly += 46; });
  if (r.note && ly <= 1050) { c.fillStyle = '#ffb0c4'; fitTxt(c, `“${r.note}”`, W - 180, 46, 700, CARD_H, 28); c.fillText(ellip(c, `“${r.note}”`, W - 180), W / 2, Y(ly + 4)); }
  // panel bawah
  const py = Y(1090);
  glass(c, 70, py, 940, 190, 36);
  if (pics.length) {
    lab(c, 'KURSI', 112, py + 46, `800 22px ${CARD_F}`, '#a1a1aa', 'left', 5);
    const gs = c.createLinearGradient(112, 0, 340, 0); gs.addColorStop(0, '#ffd23f'); gs.addColorStop(1, '#ff8c00');
    c.textAlign = 'left'; c.fillStyle = gs; c.font = `900 100px ${CARD_F}`; c.fillText(r.seat, 108, py + 138);
    c.fillStyle = '#c9c9d1'; c.font = `600 24px ${CARD_F}`; c.fillText(`kunjungan ke-${ord} dari ${tot}`, 112, py + 174);
    drawMiniMap(c, 790, py + 27, 11, 1.5, counts, r.seat, 3);
  } else {
    lab(c, 'SESI', 112, py + 46, `800 22px ${CARD_F}`, '#a1a1aa', 'left', 5);
    c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = `900 70px ${CARD_F}`; c.fillText(r.sesi || '-', 110, py + 140);
    c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(540, py + 36, 2, 118);
    lab(c, 'DI KURSI INI', 586, py + 46, `800 22px ${CARD_F}`, '#a1a1aa', 'left', 5);
    c.fillStyle = '#ffd23f'; c.font = `900 70px ${CARD_F}`; c.fillText('ke-' + ord, 584, py + 140);
    const kw = c.measureText('ke-' + ord).width; c.fillStyle = '#c9c9d1'; c.font = `600 28px ${CARD_F}`; c.fillText(`dari ${tot}×`, 584 + kw + 14, py + 140);
  }
  if (!story && /^https?:/i.test(location.protocol)) { // alamat web di kaki kartu (hanya feed; Story punya zona bawah yang tertutup UI)
    c.textAlign = 'center'; c.fillStyle = '#9a9aa4'; c.font = `600 24px ${CARD_F}`; c.fillText(location.host, W / 2, 1322);
    const hw = c.measureText(location.host).width / 2;
    pxHeart(c, W / 2 - hw - 46, 1304, 3, '#ff2a5f'); pxHeart(c, W / 2 + hw + 22, 1304, 3, '#ff2a5f');
  }
  return cv;
}

// ---------- lembar bagikan: simpan, WhatsApp, X, Instagram, LINE ----------
const SH = {o: null, fmt: 'feed', blob: null, file: null, url: '', tok: 0};
const SH_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const shTouch = () => matchMedia('(pointer:coarse)').matches;
const shNative = () => !!(SH.file && navigator.share && navigator.canShare && navigator.canShare({files: [SH.file]}));
const shHint = t => { const h = $('sh-hint'); if (h) h.textContent = t || ''; };
const SH_ENC = encodeURIComponent;
const SH_APPS = { // url = tujuan di desktop / peramban tanpa dukungan kirim berkas (browser tidak bisa melampirkan gambar ke aplikasi lain)
  wa: {name: 'WhatsApp', url: t => 'https://wa.me/?text=' + SH_ENC(t)},
  'x-post': {name: 'X', url: t => 'https://x.com/intent/post?text=' + SH_ENC(t)},
  'x-dm': {name: 'DM di X', url: () => 'https://x.com/messages/compose'},
  'ig-story': {name: 'Story Instagram', url: () => 'https://www.instagram.com/'},
  'ig-dm': {name: 'DM Instagram', url: () => 'https://www.instagram.com/direct/inbox/'},
  line: {name: 'LINE', url: t => 'https://line.me/R/msg/text/?' + SH_ENC(t)}
};
const SH_SVG = {
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4m0 0L8 8m4-4l4 4M6 12v6.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>',
  wa: '<svg viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8l-1.2 4.2 4.3-1.1A8.5 8.5 0 1 0 12 3.5z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 8.5c.3 3.3 2.3 5.3 6.2 6.3l1-1.3-2-1-.9.8c-1-.4-1.9-1.3-2.3-2.3l.8-.9-1-2z" fill="#fff"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-linecap="round"><path d="M5 4.5l14 15" stroke-width="2.4"/><path d="M19 4.5L5 19.5" stroke-width="1.6"/></svg>',
  ig: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9"><rect x="4.5" y="4.5" width="15" height="15" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.7" cy="7.3" r="1.1" fill="#fff" stroke="none"/></svg>',
  line: '<svg viewBox="0 0 24 24"><path d="M12 4C7.6 4 4 6.9 4 10.5c0 3.2 2.8 5.8 6.6 6.4.3.1.6.2.7.5l-.1 1.5c0 .4.3.6.7.4 1.7-.9 5.4-3.4 7-5.6.9-1 1.1-1.8 1.1-2.7C20 6.9 16.4 4 12 4z" fill="#fff"/></svg>'
};
function shEnsure() {
  if ($('share-sheet')) return;
  const row = (ic, bg, name, sub, acts) => acts.length === 1 && !acts[0][2]
    ? `<button type="button" class="sh-row" data-a="${acts[0][0]}"><span class="sh-ic" style="background:${bg}">${SH_SVG[ic]}</span><span class="sh-tx"><b>${name}</b><span>${sub}</span></span></button>`
    : `<div class="sh-row"><span class="sh-ic" style="background:${bg}">${SH_SVG[ic]}</span><span class="sh-tx"><b>${name}</b><span>${sub}</span></span><span class="sh-chips">${acts.map(a => `<button type="button" class="sh-chip" data-a="${a[0]}">${a[1]}</button>`).join('')}</span></div>`;
  document.body.insertAdjacentHTML('beforeend', `<div class="overlay" id="share-sheet"><div class="modal sh-modal" role="dialog" aria-modal="true" aria-labelledby="sh-title">
    <div class="sheet-grip" aria-hidden="true"></div><button type="button" class="x" id="sh-close" aria-label="Tutup">&times;</button>
    <h3 id="sh-title" class="sh-title">Bagikan kartu</h3>
    <div class="sh-body">
      <div class="sh-left"><div class="sh-seg" id="sh-seg"><button type="button" data-f="feed" class="on">Feed 4:5</button><button type="button" data-f="story">Story 9:16</button></div>
        <div class="sh-prev" id="sh-prev"><img id="sh-img" alt="Pratinjau kartu"></div></div>
      <div class="sh-right"><div class="sh-list" id="sh-list" aria-busy="true">
        ${row('save', 'linear-gradient(135deg,#ff2a5f,#ff8c00)', 'Simpan', 'Ke galeri / perangkat', [['save', '', 0]])}
        ${row('share', 'linear-gradient(135deg,#7c5cff,#ff2a5f)', 'Bagikan', 'WhatsApp, Instagram, X, LINE, dll.', [['more', '', 0]]).replace('class="sh-row"', 'class="sh-row sh-only"')}
        ${row('wa', '#25d366', 'WhatsApp', 'Kirim ke chat', [['wa', '', 0]])}
        ${row('x', '#000', 'X', 'Post atau pesan', [['x-post', 'Post'], ['x-dm', 'DM']])}
        ${row('ig', 'linear-gradient(45deg,#feda75,#fa7e1e 30%,#d62976 60%,#4f5bd5)', 'Instagram', 'Story atau pesan', [['ig-story', 'Story'], ['ig-dm', 'DM']])}
        ${row('line', '#06c755', 'LINE', 'Kirim ke chat', [['line', '', 0]])}
      </div>
      <div class="sh-more"><button type="button" class="btn-s" data-a="copy">Salin gambar</button><button type="button" class="btn-s" data-a="more" hidden>Lainnya…</button></div>
      <p class="sh-hint" id="sh-hint" role="status" aria-live="polite"></p></div>
    </div></div></div>`);
  const sh = $('share-sheet'), m = sh.querySelector('.modal');
  sh.querySelectorAll('.sh-list > .sh-row:not(.sh-only):not(:first-child)').forEach(e => e.classList.add('sh-app')); // di HP/tablet hanya Simpan + Bagikan
  $('sh-close').addEventListener('click', () => closeEl('share-sheet'));
  sh.addEventListener('click', e => { if (e.target === sh) closeEl('share-sheet'); });
  $('sh-seg').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b || b.dataset.f === SH.fmt) return; SH.fmt = b.dataset.f; shRender(); });
  sh.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) shAct(b.dataset.a); });
  sheetDragClose(m, '.sheet-grip,.sh-title', 'share-sheet');
}
async function shRender() {
  const t = ++SH.tok, img = $('sh-img'), prev = $('sh-prev');
  $('sh-list').setAttribute('aria-busy', 'true'); img.classList.remove('ok'); prev.classList.remove('ld');
  [...$('sh-seg').children].forEach(b => b.classList.toggle('on', b.dataset.f === SH.fmt));
  prev.style.setProperty('--ar', SH.fmt === 'story' ? '9 / 16' : '4 / 5');
  shHint('Membuat kartu…');
  try {
    const cv = await SH.o.render(SH.fmt); if (t !== SH.tok) return;
    const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/png')); if (t !== SH.tok) return;
    if (SH.url) URL.revokeObjectURL(SH.url);
    SH.blob = blob; SH.url = URL.createObjectURL(blob);
    const name = typeof SH.o.file === 'function' ? SH.o.file(SH.fmt) : SH.o.file;
    try { SH.file = new File([blob], name, {type: 'image/png'}); } catch (e) { SH.file = null; }
    SH.name = name; img.src = SH.url; img.classList.add('ok'); prev.classList.add('ld');
    $('sh-list').removeAttribute('aria-busy');
    const nat = shTouch() && shNative();
    $('sh-list').classList.toggle('sh-simple', nat); $('share-sheet').querySelector('.sh-more').hidden = nat; $('share-sheet').querySelector('.sh-more [data-a=more]').hidden = !shNative();
    shHint(nat ? 'Pilih aplikasinya di daftar bagikan yang muncul.' : shTouch() ? 'Browser ini belum bisa mengirim gambar langsung ke aplikasi: gambar akan disalin, lalu tinggal ditempel.' : 'Di komputer, gambar disalin otomatis lalu aplikasinya dibuka. Tinggal tempel (Ctrl+V).');
  } catch (e) { if (t === SH.tok) shHint('Kartu gagal dibuat. Coba lagi.'); }
}
// o: {title, formats (tampilkan pilihan Feed/Story), file (nama / fungsi(fmt)), text, render(fmt) -> canvas}
function openShare(o) {
  shEnsure(); SH.o = o; SH.fmt = 'feed'; SH.blob = SH.file = null;
  $('sh-title').textContent = o.title || 'Bagikan kartu';
  $('sh-seg').hidden = !o.formats;
  openEl('share-sheet'); if (!shTouch()) $('sh-close').focus({preventScroll: true});
  shRender();
}
function shDownload() {
  const a = document.createElement('a'); a.download = SH.name; a.href = SH.url; document.body.appendChild(a); a.click(); a.remove();
}
async function shCopy(show) {
  try { await navigator.clipboard.write([new ClipboardItem({'image/png': SH.blob})]); if (show) shHint('Gambar disalin. Tempel di aplikasi tujuan.'); return true; }
  catch (e) { if (show) shHint('Browser ini belum bisa menyalin gambar. Pakai Simpan.'); return false; }
}
async function shAct(a) {
  if (!SH.blob || $('sh-list').getAttribute('aria-busy') === 'true') return;
  const text = typeof SH.o.text === 'function' ? SH.o.text(SH.fmt) : SH.o.text;
  if (a === 'copy') return shCopy(true);
  if (a === 'more') { try { await navigator.share({files: [SH.file], text}); } catch (e) {} return; }
  if (a === 'save') {
    if (SH_IOS && shTouch() && shNative()) { shHint('Pilih “Simpan Gambar” untuk menyimpannya ke Foto.'); try { await navigator.share({files: [SH.file]}); } catch (e) {} return; }
    shDownload(); shHint(shTouch() ? 'Tersimpan. Cek galeri atau folder Unduhan.' : 'Tersimpan di folder Unduhan.'); return;
  }
  const app = SH_APPS[a]; if (!app) return;
  if (shTouch() && shNative()) { shHint(`Pilih ${app.name} di daftar bagikan.`); try { await navigator.share({files: [SH.file], text}); } catch (e) {} return; }
  const copied = shCopy(false); // dimulai sekarang juga (masih dalam ketukan), lalu tab tujuan dibuka
  window.open(app.url(text), '_blank', 'noopener');
  if (await copied) shHint(`Gambar disalin. Tempel (Ctrl+V atau tahan lalu Tempel) di ${app.name}.`);
  else { shDownload(); shHint(`Gambar disimpan karena tidak bisa disalin. Lampirkan manual di ${app.name}.`); }
}
function shareCard(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  const site = /^https?:/i.test(location.protocol) ? '\n' + location.origin + location.pathname : '';
  openShare({
    title: 'Bagikan kartu show', formats: true,
    file: f => `show-${r.date}-${r.seat}${f === 'story' ? '-story' : ''}.png`,
    text: `${r.setlist || 'Show'} · ${fmtDate(r.date)} · Kursi ${r.seat}\n${document.querySelector('h1').textContent}${site}`,
    render: f => drawShowCard(r, f)
  });
}
$('modal-hist').addEventListener('click', e => {
  const b = e.target.closest('[data-share]');
  if (b) shareCard(+b.dataset.share);
});

