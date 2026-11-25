/* admin-main.js — logika halaman admin (form, tabel, lineup, backup/restore, pengeluaran, impor).
   Dimuat oleh admin-storage.js setelah penyimpanan siap, sehingga data sudah ada di memori. */
const KEY = 'jkt48_theater_stats_v5';
const OLD_KEYS = ['jkt48_theater_stats_v4']; // migrasi otomatis dari versi lama

// ---------- Storage + migrasi ----------
function load() {
  for (const k of [KEY, ...OLD_KEYS]) {
    try {
      const raw = stor.getItem(k);
      if (!raw) continue;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const data = arr.map(sanitize);
        if (k !== KEY) stor.setItem(KEY, JSON.stringify(data));
        return data;
      }
    } catch (e) { console.error(e); }
  }
  return [];
}
records = load();
const save = () => { try { stor.setItem(KEY, JSON.stringify(records)); bumpDirty(); } catch (e) { alert('Gagal menyimpan (storage penuh?). Backup dulu lewat tombol Backup. ' + e.message); } };

// ---------- Pengingat backup: hitung perubahan sejak terakhir diunduh ----------
const DK = KEY + '_backup';
const bk = () => { try { return JSON.parse(stor.getItem(DK)) || {}; } catch (e) { return {}; } };
function bumpDirty() { const b = bk(); b.dirty = (b.dirty || 0) + 1; stor.setItem(DK, JSON.stringify(b)); renderBackup(); }
function markExported() { stor.setItem(DK, JSON.stringify({ at: Date.now(), dirty: 0 })); renderBackup(); }
function renderBackup() {
  const b = bk(), d = b.at ? Math.floor((Date.now() - b.at) / 864e5) : null, el = $('backup-note');
  const parts = [];
  if (b.dirty) parts.push(` ${b.dirty} perubahan belum diunduh`);
  parts.push(b.at ? `terakhir diunduh ${d ? d + ' hari lalu' : 'hari ini'}` : 'belum pernah diunduh ke data.json');
  el.textContent = records.length ? parts.join(' · ') : '';
  el.className = (b.dirty || !b.at || d >= 7) ? 'warn' : '';
  el.dataset.base = el.textContent;
  showStorage();
  backupBanner(b, d);
}
// Pengingat aktif: banner di bawah judul kalau banyak perubahan belum di-backup atau backup sudah lama. "Nanti" menyembunyikannya sampai besok.
function backupBanner(b, d) {
  const n = new Date(), today = n.getFullYear() + '-' + (n.getMonth() + 1) + '-' + n.getDate(), dirty = b.dirty || 0;
  let el = document.getElementById('bk-banner');
  const need = records.length && stor.getItem(DK + '_snooze') !== today && (dirty >= 10 || (dirty > 0 && (!b.at || d >= 14)));
  if (!need) { if (el) el.hidden = true; return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'bk-banner'; el.setAttribute('role', 'status');
    el.innerHTML = '<span></span><button type="button" class="btn" data-bk="now">Backup sekarang</button><button type="button" class="bk-later" data-bk="later">Nanti</button>';
    (document.querySelector('.head') || document.body).insertAdjacentElement('afterend', el);
    el.addEventListener('click', e => {
      const k = e.target.dataset.bk;
      if (k === 'now') $('btn-export').click();
      else if (k === 'later') { stor.setItem(DK + '_snooze', today); el.hidden = true; }
    });
  }
  el.firstChild.textContent = `${dirty} perubahan belum di-backup` + (b.at ? ` · backup terakhir ${d ? d + ' hari lalu' : 'hari ini'}` : ' · belum pernah di-backup');
  el.hidden = false;
}
// indikator pemakaian penyimpanan browser (perkiraan)
async function showStorage() {
  try {
    const e = await navigator.storage.estimate(), el = $('backup-note');
    if (!e || !e.quota || !el || !records.length) return;
    const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0);
    el.textContent = (el.dataset.base || '') + ` · ${stor.mode === 'indexedDB' ? 'IndexedDB' : 'localStorage'} · penyimpanan ${mb(e.usage)} MB dari ±${mb(e.quota)} MB`;
  } catch (err) { /* tidak didukung */ }
}

// ---------- Modal ----------
let askDone = null;
escHooks.push(() => askDone ? (askDone(false), true) : false);

// banner di dalam form (bukan modal): form dikunci sementara supaya isiannya tidak berubah selagi menunggu jawaban
function askInline(msg) {
  return new Promise(res => {
    const bn = $('sync-bn'), others = [...$('form').children].filter(c => c !== bn);
    $('sync-msg').textContent = msg;
    bn.hidden = false;
    others.forEach(c => { c.inert = true; });
    bn.scrollIntoView({ block: 'center', behavior: 'smooth' }); // 'center': di HP, bilah simpan & tab bawah menutupi tepi layar
    $('sync-ok').focus({ preventScroll: true });
    const done = v => { bn.hidden = true; others.forEach(c => { c.inert = false; }); bn.onkeydown = $('sync-ok').onclick = $('sync-no').onclick = null; res(v); };
    $('sync-ok').onclick = () => done(true); $('sync-no').onclick = () => done(false);
    bn.onkeydown = e => { if (e.key === 'Escape') done(false); };
  });
}
function ask(msg, okLabel = 'Ya') {
  return new Promise(res => {
    $('ask-msg').textContent = msg;
    $('ask-ok').textContent = okLabel;
    openEl('ask-modal');
    $('ask-ok').focus();
    askDone = v => { askDone = null; closeEl('ask-modal'); res(v); };
  });
}
$('ask-ok').addEventListener('click', () => askDone && askDone(true));
$('ask-no').addEventListener('click', () => askDone && askDone(false));
$('ask-modal').addEventListener('click', e => { if (e.target.id === 'ask-modal' && askDone) askDone(false); });

let page = 1, focusId = 0;
const PER = 25;
function renderTable() {
  const q = $('search').value.toLowerCase();
  const list = [...records]
    .sort(cmp)
    .filter(r => !taskF || TASKS[taskF].f(r))
    .filter(r => [r.seat, r.setlist, r.note, r.member, r.ckMember, r.date, r.sesi, r.tiket, (r.lineup || []).join(' ')].some(v => v.toLowerCase().includes(q)));
  if (focusId) { const fi = list.findIndex(r => r.id === focusId); if (fi >= 0) page = Math.floor(fi / PER) + 1; } // tampilkan halaman yang memuat data yang baru disimpan
  const pages = Math.max(1, Math.ceil(list.length / PER));
  page = Math.min(page, pages);
  $('pager').innerHTML = pages > 1
    ? `<button class="btn-s" data-pg="-1" ${page <= 1 ? 'disabled' : ''}>‹ Sebelumnya</button><span>Hal ${page}/${pages} · ${list.length} data</span><button class="btn-s" data-pg="1" ${page >= pages ? 'disabled' : ''}>Berikutnya ›</button>` : '';
  $('tbody').innerHTML = list.length ? list.slice((page - 1) * PER, page * PER).map(r => `
    <tr data-rid="${r.id}"${r.id === focusId ? ' class="flash"' : ''}>
      <td data-l="Kursi"><span class="seat-badge${SEATS.has(r.seat) ? '' : ' bad'}" ${SEATS.has(r.seat) ? '' : 'title="Kursi tidak ada di peta — edit supaya muncul"'}>${esc(r.seat)}</span></td>
      <td data-l="Setlist"><b>${esc(r.setlist)}</b>${(r.lineup || []).length ? luCell(r) : ''}</td>
      <td data-l="Tanggal">${esc(r.date)}${r.sesi ? ' · ' + r.sesi : ''}</td>
      <td data-l="Harga"${r.harga ? '' : ' class="nil"'}>${r.harga ? esc(rupiah(r.harga)) + (r.tiket ? '<br><small>' + esc(r.tiket) + '</small>' : '') : '-'}</td><td data-l="Keterangan"${r.note ? '' : ' class="nil"'}>${esc(r.note) || '-'}</td>
      <td data-l="2-Shot / Chekicha"${extras(r).length ? '' : ' class="nil"'}>${exCell(r)}</td>
      <td data-l="Aksi">
        <button class="act edit" data-act="edit" data-id="${r.id}">Edit</button>
        <button class="act dup" data-act="dup" data-id="${r.id}" title="Salin ke form sebagai data baru">Duplikat</button>
        <button class="act del" data-act="del" data-id="${r.id}">Hapus</button>
      </td>
    </tr>`).join('')
    : `<tr class="none"><td colspan="7"><div class="empty">${!records.length
      ? '<b>Belum ada riwayat</b>Catat show pertama Anda, atau pulihkan dari file backup.<div class="empty-act"><button type="button" class="btn main" data-empty="add">Tambah data pertama</button><button type="button" class="btn" data-empty="restore">Restore backup</button></div>'
      : `<b>Tidak ada yang cocok</b>${q ? 'Pencarian “' + esc($('search').value.trim()) + '” tidak menemukan data.' : 'Tidak ada data pada filter ini.'}<div class="empty-act"><button type="button" class="btn" data-empty="clear">Hapus pencarian &amp; filter</button></div>`}</div></td></tr>`;
  focusId = 0; // sorotan hanya untuk satu kali gambar
}

// saran otomatis (datalist) dari setlist & member yang pernah diinput
function renderLists() {
  const dl = (id, vals) => $(id).innerHTML = [...new Set(vals.filter(Boolean))].sort().map(v => `<option value="${esc(v)}">`).join('');
  dl('dl-setlist', records.map(r => r.setlist));
  dl('dl-member', records.flatMap(r => [...extras(r).map(x => x.member), ...(r.lineup || [])]));
  renderLineup();
}
const renderAll = () => { renderChart(); renderTable(); renderLists(); renderTodo(); renderTotals(); renderExpense(); renderAway(); renderSolo(); renderTsEv(); };

// ---------- Tab (gaya app: pil meluncur, geser tab, panah keyboard) ----------
(() => {
  const mqMobile = matchMedia('(max-width:768px)'), mqDesk = matchMedia('(min-width:1280px)');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(.32,.72,0,1)';
  const tabs = () => [...document.querySelectorAll('.tabbar .tab')];
  const viewOf = k => document.getElementById('view-' + k);
  let anim = null;
  const lite = () => perf.lite(); // tingkat performa dari shared/*.js: sama dengan index (HP / tablet sentuh / hemat data = ringan)
  const IN_MS = () => lite() ? 560 : 800, OUT_MS = () => lite() ? 300 : 440;
  function makeGhost(prev) { // tab lama tetap terlihat di tempatnya, lalu memudar keluar (bukan langsung hilang)
    const r = prev.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const top = Math.max(0, r.top);
    prev.classList.add('ghost');
    prev.style.cssText = `top:${top}px;left:${r.left}px;width:${r.width}px;height:${Math.max(0, innerHeight - top)}px`;
    return { el: prev, off: Math.max(0, -r.top) };
  }

  // kurva masuk item: berhenti tepat di posisi akhir (tanpa overshoot), supaya kartu tidak naik/turun sendiri setelah animasi selesai
  const POP = 'cubic-bezier(.32,.72,0,1)';
  const CASCADE = { // blok yang ikut masuk bertahap di tiap tab (hanya yang terlihat di layar)
    peta: '#story, #last .last-c, #stats .stat, #cover, #filters, #zoomctl, #seating-wrapper, #legend', // sama dengan index; isi tab Peta dirender skrip, jadi bukan hanya peta kursinya
    tiket: '#tt > *:not(.tt-cards), #tt .tt-cards > *',
    solo: '#tsev > *, #solo > *',
    biaya: '.ex-sub, #ex > *:not(.tt-cards), #ex .tt-cards > *, #away > *, #misc > *',
    crud: '.crud > .card'
  };
  /* Item masuk PER BARIS dari atas ke bawah, dalam satu baris dari kiri ke kanan (urutan mengikuti posisi nyata di layar).
     Hanya opacity + transform. Dikembalikan: daftar animasi supaya bisa dibatalkan kalau tab diketuk beruntun. */
  function cascade(view) {
    const sel = CASCADE[view.id.replace('view-', '')];
    if (!sel) return [];
    let items = [];
    for (const el of view.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!r.height || r.bottom < 0 || r.top > innerHeight) continue;
      items.push({ el, top: r.top, left: r.left });
      if (items.length >= (lite() ? 28 : 40)) break;
    }
    const set = new Set(items.map(it => it.el)); // elemen di dalam elemen yang sudah dianimasikan tidak perlu dobel
    items = items.filter(it => { for (let p = it.el.parentElement; p && p !== view; p = p.parentElement) if (set.has(p)) return false; return true; });
    items.sort((a, b) => a.top - b.top || a.left - b.left);
    const rows = [];
    items.forEach(it => { const l = rows[rows.length - 1]; if (l && Math.abs(it.top - l.top) < 14) l.items.push(it); else rows.push({ top: it.top, items: [it] }); });
    const L = lite(), rowStep = Math.min(L ? 80 : 105, (L ? 600 : 840) / Math.max(1, rows.length)), colStep = L ? 48 : 62, out = [];
    // transform diam elemen = patokan akhir animasi. Kalau elemen sedang dianimasikan CSS (mis. .card 'rise'), transform yang terbaca itu sementara:
    // dipakai sebagai patokan akhir, elemen berhenti di posisi geser lalu melompat saat animasi selesai. Jadi abaikan bila ada animasi berjalan.
    const base0 = new Map(items.map(it => { const t = it.el.getAnimations().length ? 'none' : getComputedStyle(it.el).transform; return [it.el, t && t !== 'none' ? ' ' + t : '']; }));
    rows.forEach((row, ri) => {
      const cs = row.items.length > 1 ? Math.min(colStep, rowStep * 0.8 / (row.items.length - 1)) : 0; // baris lebar: kolom terakhir tetap muncul sebelum baris di bawahnya
      row.items.sort((a, b) => a.left - b.left).forEach((it, ci) => {
        const b = base0.get(it.el);
        out.push(it.el.animate([{ opacity: 0, transform: 'translate3d(0,22px,0) scale(.94)' + b }, { opacity: 1, transform: b ? b.trim() : 'none' }],
          { duration: L ? 720 : 900, delay: (L ? 50 : 100) + ri * rowStep + ci * cs, easing: POP, fill: 'backwards' }));
      });
    });
    return out;
  }

  function afterSwitch(name) { // render yang dulu ada di switchTab
    if (name === 'peta') requestAnimationFrame(centerChart);
    if (name === 'tiket') renderTotals();
    if (name === 'biaya') { renderExpense(); renderAway(); }
    if (name === 'solo') { renderSolo(); renderTsEv(); }
  }

  // animasi keluar tab lama memakai fill:'forwards' (opacity 0). Kalau dibiarkan, efeknya menempel dan tab itu tampil kosong saat dibuka lagi.
  const unfill = el => { if (el) el.getAnimations().forEach(x => { try { if (x.effect.getTiming().fill === 'forwards') x.cancel(); } catch (e) { } }); };
  function switchTab(name, drag) {
    const list = tabs(), from = list.findIndex(t => t.classList.contains('on')), to = list.findIndex(t => t.dataset.tab === name);
    if (to < 0) return;
    if (anim) { try { anim.cancel(); } catch (e) { } anim = null; }
    const prevEl = from >= 0 && from !== to ? viewOf(list[from].dataset.tab) : null;
    const ghost = prevEl && !still() && !lite() && prevEl.classList.contains('active') ? makeGhost(prevEl) : null; // ukur SEBELUM kelas active berpindah
    document.querySelectorAll('.view.ghost').forEach(v => { if (!ghost || v !== ghost.el) { v.classList.remove('ghost'); v.style.cssText = ''; } });
    list.forEach((t, i) => { t.classList.toggle('on', i === to); t.setAttribute('aria-selected', i === to); });
    if (typeof moveInd === 'function') moveInd(); // pil meluncur ke tab baru
    document.querySelectorAll('.view').forEach(v => { if (v.id === 'view-' + name) unfill(v); v.classList.toggle('active', v.id === 'view-' + name); if (v.id !== 'view-' + name && !(ghost && v === ghost.el)) { v.style.transform = ''; v.style.opacity = ''; } });
    afterSwitch(name);
    const hd = document.querySelector('.head'), top = hd.getBoundingClientRect().bottom + scrollY - 8; // isi baru mulai dari bawah header
    if (scrollY > top && !mqDesk.matches) scrollTo({ top, behavior: 'instant' });
    if (ghost) ghost.el.scrollTop = ghost.off;
    const next = viewOf(name);
    const unGhost = () => { if (ghost) { ghost.el.classList.remove('ghost'); ghost.el.style.cssText = ''; unfill(ghost.el); } };
    if (to === from || from < 0 || !next) { unGhost(); return; }
    const track = list => { // satu "pegangan" untuk semua animasi tab ini, supaya ketukan beruntun / geser jari bisa membatalkannya
      const h = { cancel() { list.forEach(x => { try { x.cancel(); } catch (e) { } }); unGhost(); }, finished: Promise.allSettled(list.map(x => x.finished)) };
      anim = h; h.finished.then(() => { if (anim === h) anim = null; unGhost(); });
    };
    if (still()) { // "Kurangi Gerakan" aktif: tanpa geser/skala, tapi tetap pudar lembut (seperti iOS), bukan tiba-tiba muncul
      track([next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'backwards' })]);
      return;
    }
    const dir = to > from ? 1 : -1, off = mqDesk.matches ? 28 : (lite() || mqMobile.matches) ? 34 : 60;
    const items = cascade(next); // diukur sebelum animasi view dibuat
    const a = next.animate([{ opacity: 0, transform: mqDesk.matches ? `translate3d(0,${dir * off}px,0)` : `translate3d(${dir * off}px,0,0)` }, { opacity: 1, offset: .35 }, { opacity: 1, transform: 'none' }],
      { duration: IN_MS(), delay: lite() ? 30 : 60, easing: EASE, fill: 'backwards' });
    const outs = [];
    if (ghost) {
      const dragO = drag && drag.opacity != null ? drag.opacity : 1;
      outs.push(ghost.el.animate([{ opacity: dragO, transform: 'none' }, { opacity: 0, transform: mqDesk.matches ? `translate3d(0,${-dir * off * 0.6}px,0)` : `translate3d(${-dir * off * 0.6}px,0,0)` }],
        { duration: OUT_MS(), easing: 'cubic-bezier(.3,.6,.3,1)', fill: 'forwards' }));
    }
    track([a, ...items, ...outs]);
    if (window.liquid) window.liquid.watch(IN_MS() + 220, typeof toast === 'function' ? toast : null);
  }
  window.switchTab = switchTab;
  tabs().forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  /* merek + hint keyboard di sidebar (hanya tampil di laptop) */
  const tb = document.querySelector('.tabbar');
  const ico = document.querySelector('link[rel=icon]')?.href || '';
  tb.insertAdjacentHTML('afterbegin', `<div class="sb-brand" aria-hidden="true"><img src="${ico}" alt=""><b>Idoling<br>Admin</b></div>`);
  tb.insertAdjacentHTML('beforeend', '<div class="sb-keys" aria-hidden="true"><div><kbd>←</kbd><kbd>→</kbd>ganti tab</div><div><kbd>/</kbd>cari data</div><div><kbd>Ctrl</kbd><kbd>↵</kbd>simpan</div><div><kbd>Esc</kbd>tutup</div></div>');
  if (typeof moveInd === 'function') { moveInd(true); requestAnimationFrame(() => moveInd(true)); } // logo menggeser tab ke bawah: hitung ulang posisi pil

  /* keyboard: ← → ganti tab, / cari data, Ctrl+Enter simpan form */
  const typing = t => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && $('view-crud')?.classList.contains('active') && !document.querySelector('.overlay.open')) {
      e.preventDefault(); $('btn-submit')?.click(); return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (typing(e.target) || document.querySelector('.overlay.open')) return;
    if (e.key === '/') {
      const q = $('search'), crudTab = document.querySelector('.tab[data-tab="crud"]');
      if (!q || !crudTab) return;
      e.preventDefault();
      if (!crudTab.classList.contains('on')) crudTab.click();
      requestAnimationFrame(() => { q.focus(); q.select(); });
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.target.id === 'seating-wrapper') return;
    const list = tabs(), i = list.findIndex(b => b.classList.contains('on')), n = list[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (n) { e.preventDefault(); n.click(); }
  });

  /* geser jari di konten dihapus (sama seperti index): ganti tab lewat tab bar, termasuk tahan & geser pil (liquid.js) */
})();

// ---------- Toast & urungkan ----------
const toastEl = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toast', role: 'status' }));
let toastT = 0;
function toast(msg, action, ms = 2600) { // action: {label, fn}
  clearTimeout(toastT);
  toastEl.innerHTML = '<span></span>' + (action ? '<button type="button"></button>' : '');
  toastEl.firstChild.textContent = msg;
  if (action) {
    const b = toastEl.querySelector('button');
    b.textContent = action.label;
    b.addEventListener('click', () => { clearTimeout(toastT); toastEl.classList.remove('on'); action.fn(); });
  }
  void toastEl.offsetWidth;
  toastEl.classList.add('on');
  toastT = setTimeout(() => toastEl.classList.remove('on'), ms);
}
// hapus langsung, tanpa dialog; "Urungkan" memulihkan selama beberapa detik (toast terbaru menggantikan yang lama)
const undoToast = (what, restore) => toast('Dihapus: ' + what, { label: 'Urungkan', fn: restore }, 6500);

// ---------- Form ----------
const setMsg = t => { const m = $('msg'); m.textContent = t || ''; m.classList.remove('pulse'); if (t) { void m.offsetWidth; m.classList.add('pulse'); } };

// ---------- Lineup: member yang tampil di show ini ----------
let lineup = [];
const knownMembers = () => [...new Set([...records.flatMap(r => [...(r.lineup || []), r.member, r.ckMember]), ...solo.map(w => w.member), ...tickets.map(t => t.member)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
const luCanon = n => knownMembers().find(k => k.toLowerCase() === n.toLowerCase()) || n; // samakan huruf besar/kecil dengan nama yang sudah ada
let luUndo = null, luFbT = 0;
function luFb(text, undo) { // umpan balik kecil di bawah kolom lineup; "Urungkan" mengembalikan keadaan sebelum perubahan massal
  const el = $('lu-fb');
  clearTimeout(luFbT);
  if (!text) { el.hidden = true; el.textContent = ''; return; }
  el.innerHTML = esc(text) + (undo ? ' <button type="button" class="btn-s" id="lu-undo">Urungkan</button>' : '');
  el.hidden = false;
  luFbT = setTimeout(() => { el.hidden = true; }, 15000);
}
function luAdd(raw) {
  const snap = lineup.slice(), known = new Set(knownMembers());
  let added = 0, dup = 0, fresh = 0;
  String(raw || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')            // [Nama](url) -> Nama
    .replace(/^\s*anggota yang tampil\s*:?\s*$/gim, '')  // buang baris judul dari jkt48.com
    .split(/[,\n;]+/).map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean).forEach(n => {
      n = luCanon(n);
      if (lineup.some(x => x.toLowerCase() === n.toLowerCase())) { dup++; return; }
      lineup.push(n); added++;
      if (known.size && !known.has(n)) fresh++;
    });
  renderLineup();
  if (added > 1 || fresh || dup) { // satu nama biasa yang sudah dikenal tidak perlu diumumkan
    if (added > 1) luUndo = snap;
    luFb([added ? `${added} ditambahkan` : '', fresh ? `${fresh} nama baru (kuning, cek ejaannya)` : '', dup ? `${dup} sudah ada` : ''].filter(Boolean).join(' · '), added > 1);
  }
}
function luFormSrc() { // show lain yang sudah punya lineup, diurutkan: setlist sama + tanggal sama dulu
  const id = Number($('f-id').value) || 0, sl = $('f-setlist').value.trim().toLowerCase(), d = $('f-date').value, se = $('f-sesi').value;
  const seen = new Map();
  records.filter(r => r.id !== id && (r.lineup || []).length).forEach(r => {
    const k = r.date + '|' + r.sesi + '|' + r.setlist.toLowerCase();
    if (!seen.has(k)) seen.set(k, r);
  });
  const score = r => (r.date === d && r.sesi === se ? 4 : r.date === d ? 3 : 0) + (r.setlist.toLowerCase() === sl ? 2 : 0);
  return [...seen.values()].sort((a, b) => score(b) - score(a) || cmp(a, b));
}
function luCell(r) { // "12 member tampil" yang bisa diketuk (tooltip tidak ada di layar sentuh); member yang kamu temui ditandai
  const met = new Set(extras(r).map(x => x.member));
  return `<br><button type="button" class="lu-open" data-lu-open="${r.id}" aria-expanded="false">${r.lineup.length} member tampil ▾</button><div class="lu-list" hidden>${r.lineup.map(n => `<span${met.has(n) ? ' class="met" title="Kamu 2-Shot / Chekicha dengannya"' : ''}>${esc(n)}</span>`).join('')}</div>`;
}
function renderLineup() {
  const known = new Set(knownMembers()); // nama yang pernah tersimpan; kosong = data masih baru, tidak ditandai
  $('lu-chips').innerHTML = lineup.map((n, i) => {
    const nw = known.size && !known.has(n);
    return `<span class="lu-chip${nw ? ' new' : ''}"${nw ? ' title="Nama baru, belum pernah ada di data. Cek ejaan / nama lengkap."' : ''}>${esc(n)}<button type="button" data-lu-del="${i}" aria-label="Hapus ${esc(n)}">&times;</button></span>`;
  }).join('');
  $('dl-lineup').innerHTML = knownMembers().filter(n => !lineup.includes(n)).map(n => `<option value="${esc(n)}">`).join('');
  const q = $('lu-in').value.trim().toLowerCase(), rest = knownMembers().filter(n => !lineup.some(x => x === n) && (!q || n.toLowerCase().includes(q)));
  $('lu-pick-l').innerHTML = rest.map(n => `<button type="button" data-lu-add="${esc(n)}">+ ${esc(n)}</button>`).join('') || '<small class="lu-n">Tidak ada lagi.</small>';
  $('lu-pick-s').textContent = `Pilih dari daftar member (${rest.length})`;
  $('lu-n').textContent = lineup.length ? `${lineup.length} member tampil` + (lineup.length ? ' · ketuk × untuk menghapus' : '') : 'Belum diisi. Show ini akan masuk daftar "belum ada lineup".';
  $('lu-clear').hidden = lineup.length < 2;
  renderMPick();
  const src = luFormSrc();
  $('lu-copy').hidden = !src.length;
  if (src.length) {
    const cur = $('lu-src').value;
    $('lu-src').innerHTML = src.slice(0, 40).map(r => `<option value="${r.id}">${esc(fmtDate(r.date))}${r.sesi ? ' · ' + r.sesi : ''} · ${esc(r.setlist)} (${r.lineup.length} member)</option>`).join('');
    if (cur && src.some(r => String(r.id) === cur)) $('lu-src').value = cur;
  }
}
// chip pilih cepat di bawah kolom "2-Shot / Chekicha dengan": ketuk nama dari lineup, tanpa mengetik
function renderMPick() {
  for (const K of KINDS) {
    const box = $('mp-' + K.k), inp = $('m-' + K.k);
    if (!box || !inp) continue; // form tambahan belum dibuat
    const v = inp.value.trim().toLowerCase();
    box.hidden = !lineup.length;
    box.innerHTML = lineup.length ? '<small class="lu-n">Dari lineup:</small>' + lineup.map(n => `<button type="button" class="m-pick-b${n.toLowerCase() === v ? ' on' : ''}" data-mp="${K.k}" data-n="${esc(n)}">${esc(n)}</button>`).join('') : '';
  }
}
// otomatis: kalau lineup masih kosong dan sudah ada show lain di tanggal + sesi + setlist yang sama (mis. kursi lain), lineup-nya dipakai
function luAuto() {
  if (lineup.length || Number($('f-id').value)) return;
  const d = $('f-date').value, se = $('f-sesi').value, sl = $('f-setlist').value.trim().toLowerCase();
  if (!d || !sl) return;
  const m = luFormSrc().find(r => r.date === d && r.sesi === se && r.setlist.toLowerCase() === sl);
  if (m) { lineup = [...m.lineup]; renderLineup(); setMsg(`Lineup diisi otomatis dari show yang sama (${m.lineup.length} member).`); }
}
$('lu-in').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); luAdd($('lu-in').value); $('lu-in').value = ''; renderLineup(); } else if (e.key === 'Backspace' && !$('lu-in').value && lineup.length) { lineup.pop(); renderLineup(); } });
$('lu-in').addEventListener('input', e => {
  const v = $('lu-in').value;
  if (/[,\n;]/.test(v)) { luAdd(v); $('lu-in').value = ''; renderLineup(); } // tempel banyak nama sekaligus
  else if (e.inputType === 'insertReplacementText' || (!e.inputType && v)) { luAdd(v); $('lu-in').value = ''; renderLineup(); } // memilih dari saran
  else renderLineup();
});
$('lu-in').addEventListener('paste', e => { // kolom satu baris membuang baris baru saat menempel, jadi dibaca langsung dari clipboard
  const t = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (/[,\n;]/.test(t)) { e.preventDefault(); luAdd($('lu-in').value + ',' + t); $('lu-in').value = ''; renderLineup(); }
});
$('lu-in').addEventListener('change', () => { if ($('lu-in').value.trim()) { luAdd($('lu-in').value); $('lu-in').value = ''; renderLineup(); } });
$('lu-fg').addEventListener('click', e => {
  const del = e.target.closest('[data-lu-del]'), add = e.target.closest('[data-lu-add]');
  if (del) { lineup.splice(+del.dataset.luDel, 1); renderLineup(); }
  else if (add) luAdd(add.dataset.luAdd);
  else if (e.target.closest('#lu-clear')) { luUndo = lineup.slice(); lineup = []; renderLineup(); luFb('Lineup dikosongkan.', true); }
  else if (e.target.closest('#lu-undo') && luUndo) { lineup = luUndo; luUndo = null; renderLineup(); luFb(''); }
});
$('lu-cp').addEventListener('click', () => {
  const r = records.find(x => String(x.id) === $('lu-src').value);
  if (!r) return;
  const before = lineup.length; luAdd(r.lineup.join(','));
  setMsg(`${lineup.length - before} member ditambahkan dari ${fmtDate(r.date)}.`);
});
['f-setlist', 'f-date', 'f-sesi'].forEach(id => $(id).addEventListener('change', () => { renderLineup(); luAuto(); }));

$('extras').innerHTML = KINDS.map(K => `
  <div class="fg"><label for="f-${K.k}">${K.q}</label>
    <select id="f-${K.k}"><option value="Tidak">Tidak</option><option value="Ya">Ya</option></select></div>
  <div id="box-${K.k}" style="display:none">
    <div class="fg"><label for="t-${K.k}">Jenis ${K.name}</label>
      <select id="t-${K.k}">${K.types.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
    <div class="fg"><label for="m-${K.k}">${K.name} dengan</label>
      <input id="m-${K.k}" list="dl-member" placeholder="Nama Member" autocomplete="off"><div class="m-pick" id="mp-${K.k}" hidden></div></div>
    <div class="fg"><label for="p-${K.k}">Foto ${K.name} (Opsional)</label>
      <input type="file" id="p-${K.k}" accept="image/*">
      <div class="pprev" id="pv-${K.k}"><img id="pi-${K.k}" alt="Preview foto"><button type="button" class="btn" id="pr-${K.k}">Hapus foto</button></div></div>
  </div>`).join('');

$('extras').addEventListener('click', e => {
  const b = e.target.closest('[data-mp]');
  if (!b) return;
  const inp = $('m-' + b.dataset.mp);
  inp.value = b.dataset.n; inp.dispatchEvent(new Event('input', { bubbles: true }));
  renderMPick();
});
$('extras').addEventListener('input', e => { if (/^m-/.test(e.target.id || '')) renderMPick(); });

const cur = { ts: '', ck: '' };
function setPhoto(k, d) {
  cur[k] = d || '';
  $('p-' + k).value = '';
  $('pi-' + k).src = cur[k];
  $('pv-' + k).style.display = cur[k] ? 'flex' : 'none';
}
// Kompres foto (maks 900px, JPEG) supaya hemat stor
function compress(file, max = 900, q = 0.75) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Gambar tidak bisa dibaca')); };
    img.src = url;
  });
}
function toggleBox(k) {
  const on = $('f-' + k).value === 'Ya';
  $('box-' + k).style.display = on ? 'block' : 'none';
  if (!on) { $('m-' + k).value = ''; $('t-' + k).selectedIndex = 0; setPhoto(k, ''); }
  renderMPick();
}
const toggleAll = () => KINDS.forEach(K => toggleBox(K.k));
KINDS.forEach(K => {
  $('f-' + K.k).addEventListener('change', () => toggleBox(K.k));
  $('pr-' + K.k).addEventListener('click', () => setPhoto(K.k, ''));
  $('p-' + K.k).addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { setPhoto(K.k, await compress(f)); setMsg(''); }
    catch (err) { setPhoto(K.k, ''); setMsg(err.message + '. Coba format JPG/PNG.'); }
  });
});

const exCell = r => {
  const e = extras(r);
  return e.length ? e.map(x => `<div><span class="ts-ya">${esc(x.label)} (${esc(x.member) || '-'})</span>${x.photo ? `<img class="thumb" src="${esc(x.photo)}" data-photo alt="Foto">` : ''}</div>`).join('')
    : '<span class="ts-no">-</span>';
};

function resetForm(keep) { // keep === true: kosongkan kursi & keterangan saja, tanggal/setlist/sesi/harga/jenis tiket dipertahankan
  const k = keep === true ? ['f-setlist', 'f-date', 'f-sesi', 'f-harga', 'f-tiket'].map(id => [id, $(id).value]) : null;
  const kl = keep === true ? lineup.slice() : []; // "Simpan & lanjut": lineup sama dipakai untuk kursi berikutnya
  clearErrs();
  $('form').reset();
  lineup = kl; $('lu-in').value = ''; renderLineup();
  $('f-id').value = '';
  $('form-title').textContent = 'Tambah Riwayat Show';
  $('btn-submit').textContent = '+ Simpan Data';
  $('btn-cancel').style.display = 'none';
  $('btn-again').style.display = '';
  setMsg('');
  toggleAll();
  luFb(keep === true && kl.length ? `Lineup dari kursi sebelumnya dipakai lagi (${kl.length} member). Ubah kalau show ini berbeda.` : '');
  if (k) k.forEach(([id, v]) => { $(id).value = v; });
}

// error per kolom: garis merah + pesan di bawah kolom yang salah, lalu kolomnya difokuskan
function clearErrs() {
  document.querySelectorAll('#form .fg.err').forEach(g => { g.classList.remove('err', 'shake'); g.querySelector('.ferr')?.remove(); g.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid'); });
}
function fieldErr(id, msg) {
  const el = $(id), g = el.closest('.fg');
  clearErrs();
  g.classList.add('err'); el.setAttribute('aria-invalid', 'true');
  g.appendChild(Object.assign(document.createElement('small'), { className: 'ferr', textContent: msg }));
  el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
  void g.offsetWidth; g.classList.add('shake');
}
$('form').addEventListener('input', e => { // mulai mengetik = error kolom itu hilang
  const g = e.target.closest('.fg');
  if (g && g.classList.contains('err')) { g.classList.remove('err', 'shake'); g.querySelector('.ferr')?.remove(); e.target.removeAttribute('aria-invalid'); }
});
let keepNext = false;
$('btn-again').addEventListener('click', () => { keepNext = true; $('btn-submit').click(); });
$('btn-cancel').addEventListener('click', resetForm);

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const keep = keepNext; keepNext = false;
  setMsg(''); clearErrs();
  const id = Number($('f-id').value) || 0;
  if ($('lu-in').value.trim()) { luAdd($('lu-in').value); $('lu-in').value = ''; } // nama yang masih diketik ikut disimpan
  const seat = normSeat($('f-seat').value);
  const setlist = $('f-setlist').value.trim();
  const date = $('f-date').value;
  const note = $('f-note').value.trim();
  const sesi = $('f-sesi').value;
  const harga = Math.max(0, Number($('f-harga').value) || 0), tiket = $('f-tiket').value.trim();
  const ex = {};
  for (const K of KINDS) {
    const on = $('f-' + K.k).value === 'Ya';
    ex[K.f] = on ? 'Ya' : 'Tidak';
    ex[K.t] = on ? $('t-' + K.k).value : '';
    ex[K.m] = on ? $('m-' + K.k).value.trim() : '';
    ex[K.p] = on ? cur[K.k] : '';
  }

  if (!SEATS.has(seat)) return fieldErr('f-seat', 'Kursi tidak valid / tidak ada di peta. Contoh: A-19, B-7, J-23.');
  if (!setlist) return fieldErr('f-setlist', 'Setlist wajib diisi.');
  if (!date) return fieldErr('f-date', 'Tanggal wajib diisi.');
  for (const K of KINDS) if (ex[K.f] === 'Ya' && !ex[K.m]) return fieldErr('m-' + K.k, `Nama member ${K.name} wajib diisi.`);

  const dup = records.some(r => r.id !== id && r.seat === seat && r.date === date &&
    r.setlist.toLowerCase() === setlist.toLowerCase() && r.sesi === sesi);
  if (dup && !await ask('Data dengan kursi, setlist, tanggal, dan sesi yang sama sudah ada. Tetap simpan?', 'Tetap simpan')) return;

  // member 2-Shot/Chekicha pasti tampil di show itu: kalau lineup sudah diisi tapi dia belum ada, tambahkan otomatis.
  // Lineup kosong dibiarkan kosong (jangan sampai jadi lineup "1 member" yang mengubah mode statistik).
  const addedLu = [];
  if (lineup.length) for (const K of KINDS) {
    if (ex[K.f] !== 'Ya') continue;
    const n = luCanon(ex[K.m]);
    if (n && !lineup.some(x => x.toLowerCase() === n.toLowerCase()) && !addedLu.includes(n)) { lineup.push(n); addedLu.push(n); }
  }
  const rec = { id: id || Date.now(), seat, setlist, date, sesi, note, harga, tiket, ...ex, lineup: [...lineup] };

  // kursi lain di show yang sama (tanggal + sesi + setlist) harus punya lineup yang sama; kalau beda, tawarkan menyamakan.
  // Lineup kosong tidak pernah menimpa lineup yang sudah terisi.
  const luKey = a => (a || []).map(x => String(x).toLowerCase()).sort().join('|');
  const differ = !rec.lineup.length ? [] : records.filter(r => r.id !== rec.id && r.date === date && (r.sesi || '') === (sesi || '')
    && r.setlist.toLowerCase() === setlist.toLowerCase() && luKey(r.lineup) !== luKey(rec.lineup));
  const prevLu = differ.map(r => [r.id, [...(r.lineup || [])]]); // lineup kursi lain sebelum disamakan (untuk Urungkan)
  let synced = 0;
  if (differ.length) {
    const seats = differ.slice(0, 6).map(r => r.seat).join(', ') + (differ.length > 6 ? ', …' : '');
    if (await askInline(`Lineup kursi ${seat} berbeda dengan ${differ.length} kursi lain di show yang sama (${seats}). Samakan lineup-nya?`)) {
      differ.forEach(r => { r.lineup = [...rec.lineup]; });
      synced = differ.length;
    }
  }
  const knownBefore = records.length ? new Set(knownMembers().map(n => n.toLowerCase())) : null;
  const freshNames = knownBefore ? [...new Set([...lineup, ...KINDS.filter(K => ex[K.f] === 'Ya').map(K => ex[K.m])].filter(n => n && !knownBefore.has(n.toLowerCase())))] : [];
  const prevCopy = id ? JSON.parse(JSON.stringify(records.find(r => r.id === id) || null)) : null; // keadaan sebelum diedit (untuk Urungkan)
  if (id) {
    const i = records.findIndex(r => r.id === id);
    if (i !== -1) records[i] = rec; else records.push(rec);
  } else records.push(rec);

  save();
  resetForm(keep && !id);
  if (keep && !id) $('f-seat').focus();
  focusId = rec.id; // baris ini menyala sebentar & halamannya dibuka
  renderAll();
  toast((id ? 'Diperbarui: ' : 'Tersimpan: ') + rec.seat + ' · ' + rec.setlist + (addedLu.length ? ' · masuk lineup: ' + addedLu.join(', ') : '') + (synced ? ' · lineup disamakan ke ' + synced + ' kursi lain' : '') + (freshNames.length ? ' · nama baru (cek ejaan): ' + freshNames.slice(0, 2).join(', ') + (freshNames.length > 2 ? '…' : '') : ''),
    prevCopy
      ? {
        label: 'Urungkan', fn: () => { // kembalikan data & lineup kursi lain yang ikut disamakan
          const i = records.findIndex(r => r.id === prevCopy.id);
          if (i !== -1) records[i] = prevCopy;
          prevLu.forEach(([rid, lu]) => { const r = records.find(x => x.id === rid); if (r) r.lineup = lu; });
          save(); renderAll(); toast('Perubahan dibatalkan: ' + prevCopy.seat + ' · ' + prevCopy.setlist);
        }
      }
      : { label: 'Lihat', fn: () => { const tr = $('tbody').querySelector(`tr[data-rid="${rec.id}"]`); if (!tr) return; tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); tr.classList.remove('flash'); void tr.offsetWidth; tr.classList.add('flash'); } },
    prevCopy ? 6500 : 2600);
});

// ---------- Aksi tabel & peta ----------
$('tbody').addEventListener('click', e => {
  const b = e.target.closest('[data-lu-open]');
  if (!b) return;
  const l = b.nextElementSibling;
  l.hidden = !l.hidden; b.setAttribute('aria-expanded', String(!l.hidden));
  b.textContent = b.textContent.replace(/[▾▴]$/, l.hidden ? '▾' : '▴');
});
$('tbody').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const rec = records.find(r => r.id === id);
  if (!rec) return;

  if (btn.dataset.act === 'edit') {
    $('f-id').value = rec.id;
    $('f-seat').value = rec.seat;
    $('f-setlist').value = rec.setlist;
    $('f-date').value = rec.date;
    $('f-sesi').value = rec.sesi;
    $('f-note').value = rec.note;
    $('f-harga').value = rec.harga || '';
    $('f-tiket').value = rec.tiket || '';
    lineup = [...(rec.lineup || [])]; $('lu-in').value = ''; renderLineup();
    KINDS.forEach(K => {
      $('f-' + K.k).value = rec[K.f];
      toggleBox(K.k);
      if (rec[K.f] === 'Ya') {
        $('t-' + K.k).value = rec[K.t] || 'roulette';
        $('m-' + K.k).value = rec[K.m];
        setPhoto(K.k, rec[K.p]);
      }
    });
    $('form-title').textContent = 'Edit Data Riwayat';
    $('btn-submit').textContent = 'Update Data';
    $('btn-cancel').style.display = 'block';
    $('btn-again').style.display = 'none';
    setMsg('');
    $('form').scrollIntoView({ behavior: 'smooth' });
  } else if (btn.dataset.act === 'dup') {
    resetForm();
    $('f-setlist').value = rec.setlist;
    $('f-sesi').value = rec.sesi;
    $('f-harga').value = rec.harga || '';
    $('f-tiket').value = rec.tiket || '';
    lineup = [...(rec.lineup || [])]; $('lu-in').value = ''; renderLineup();
    $('form').scrollIntoView({ behavior: 'smooth' });
    $('f-seat').focus({ preventScroll: true });
    toast('Disalin dari ' + rec.setlist + ' — isi kursi & tanggal');
  } else {
    const at = records.findIndex(r => r.id === id);
    records = records.filter(r => r.id !== id);
    if ($('f-id').value === String(id)) resetForm(); // sedang diedit: jangan simpan ulang sebagai data baru
    save();
    renderAll();
    undoToast(rec.seat + ' · ' + rec.setlist, () => { if (!records.some(r => r.id === id)) records.splice(Math.min(at, records.length), 0, rec); save(); renderAll(); });
  }
});

$('tbody').addEventListener('click', e => {
  const b = e.target.closest('[data-empty]');
  if (!b) return;
  if (b.dataset.empty === 'add') { $('f-seat').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('f-seat').focus({ preventScroll: true }); }
  else if (b.dataset.empty === 'restore') $('btn-import').click();
  else { $('search').value = ''; if (typeof taskF !== 'undefined') taskF = ''; page = 1; renderTable(); if (typeof renderTodo === 'function') renderTodo(); }
});

let searchT;
$('search').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(() => { page = 1; renderTable(); }, 200); });
$('pager').addEventListener('click', e => { const b = e.target.closest('[data-pg]'); if (b) { page += Number(b.dataset.pg); renderTable(); } });

// ---------- Backup / Restore ----------
const dl = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
// Backup lengkap: foto tetap di dalam JSON (dipakai untuk Restore)
$('btn-export').addEventListener('click', () => {
  dl(new Blob([JSON.stringify({ records, tickets, prices, away, solo, misc }, null, 2)], { type: 'application/json' }), 'backup-lengkap.json');
  markExported();
});

// ZIP tanpa kompresi (JPEG sudah terkompres), ditulis manual tanpa library
// thumbnail JPEG (lebar maks. 320 px) untuk galeri; foto penuh tetap disimpan terpisah
async function thumbBytes(dataUrl, w = 320) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const s = Math.min(1, w / img.width), c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
  return new Uint8Array(await blob.arrayBuffer());
}
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = u => { let c = -1; for (const b of u) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], cen = [];
  const n16 = n => [n & 255, (n >>> 8) & 255], n32 = n => [...n16(n), ...n16(n >>> 16)];
  let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
    const common = [20, 0, 0, 8, 0, 0, 0, 0, 0x21, 0, ...n32(crc), ...n32(sz), ...n32(sz), ...n16(nm.length), 0, 0];
    parts.push(new Uint8Array([0x50, 0x4b, 3, 4, ...common]), nm, f.data);
    cen.push(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, ...common, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...n32(off)]), nm);
    off += 30 + nm.length + sz;
  }
  const cs = cen.reduce((a, p) => a + p.length, 0);
  return new Blob([...parts, ...cen, new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...n16(files.length), ...n16(files.length), ...n32(cs), ...n32(off), 0, 0])], { type: 'application/zip' });
}
// Paket publish: data.json tanpa base64 + folder photos/ berisi foto sebagai file
const POK = KEY + '_pub';
const pubOpts = () => { try { return JSON.parse(stor.getItem(POK)) || {}; } catch (e) { return {}; } };
['tickets', 'photos', 'mask'].forEach(k => {
  const el = $('po-' + k), o = pubOpts();
  if (k in o) el.checked = o[k];
  el.addEventListener('change', () => { const x = pubOpts(); x[k] = el.checked; stor.setItem(POK, JSON.stringify(x)); });
});
$('btn-zip').addEventListener('click', async () => {
  const btn = $('btn-zip'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Menyiapkan foto…';
  try {
    const files = [];
    const opt = { tickets: $('po-tickets').checked, photos: $('po-photos').checked, mask: $('po-mask').checked, blur: $('po-blur').checked };
    const mask = n => n ? n.split(/\s+/).map(w => w[0].toUpperCase()).join('.') + '.' : '';
    const pub = [];
    for (const r of records) {
      const o = { ...r };
      o.harga = 0; // harga hanya untuk admin: data.json publik tidak boleh memuatnya (tetap ada di backup lengkap)
      if (opt.mask) o.lineup = (o.lineup || []).map(mask);
      for (const K of KINDS) {
        if (opt.mask) o[K.m] = mask(o[K.m]);
        if (!opt.photos) { o[K.p] = ''; continue; }
        const m = String(o[K.p] || '').match(/^data:image\/(\w+);base64,(.*)$/s);
        if (!m) continue;
        const base = `${r.id}-${K.k}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
        files.push({ name: 'photos/' + base, data: Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) });
        try { files.push({ name: 'photos/t/' + base, data: await thumbBytes(o[K.p]) }); } catch (e) { /* tanpa thumbnail: galeri memakai foto penuh */ }
        o[K.p] = 'photos/' + base;
      }
      pub.push(o);
    }
    const soloPub = [];
    for (const w of solo) { // sesi lepas ikut dipublikasikan; foto jadi file + thumbnail seperti foto riwayat
      const o = { ...w };
      if (opt.mask) o.member = mask(o.member);
      const m = opt.photos ? String(o.photo || '').match(/^data:image\/(\w+);base64,(.*)$/s) : null;
      if (!opt.photos) o.photo = '';
      else if (m) {
        const base = `solo-${w.id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
        files.push({ name: 'photos/' + base, data: Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) });
        try { files.push({ name: 'photos/t/' + base, data: await thumbBytes(o.photo) }); } catch (e) { /* tanpa thumbnail */ }
        o.photo = 'photos/' + base;
      }
      soloPub.push(o);
    }
    const tkPub = [];
    if (opt.tickets) for (const t of tickets) { // foto 2-Shot event jadi file + thumbnail
      const o = { ...t };
      const m = opt.photos ? String(o.photo || '').match(/^data:image\/(\w+);base64,(.*)$/s) : null;
      if (!opt.photos) o.photo = '';
      else if (m) {
        const base = `tk-${String(t.k || t.tx || tkPub.length).replace(/[^\w-]/g, '_')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
        files.push({ name: 'photos/' + base, data: Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) });
        try { files.push({ name: 'photos/t/' + base, data: await thumbBytes(o.photo) }); } catch (e) { /* tanpa thumbnail */ }
        o.photo = 'photos/' + base;
      }
      tkPub.push(o);
    }
    files.unshift({ name: 'data.json', data: new TextEncoder().encode(JSON.stringify({ records: pub, solo: soloPub, tickets: opt.tickets ? tkPub.map(t => ({ ...t, tx: undefined, ...(opt.mask ? { member: mask(t.member) } : {}), ...(opt.blur && BLUR_CATS.includes(tcat(t)) ? { bought: 1 } : {}) })) : [], updated: new Date().toISOString().slice(0, 10) }, null, 1)) });
    dl(makeZip(files), 'data-publish.zip');
    markExported();
  } finally { btn.disabled = false; btn.textContent = label; }
});
$('btn-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    const arr = Array.isArray(json) ? json : json.records;
    if (!Array.isArray(arr)) throw new Error('Format bukan array');
    const full = !Array.isArray(json);
    const ids = new Set(records.map(r => r.id));
    const incoming = arr.map(sanitize);
    // id kembar di dalam file yang sama juga dilewati (ids.add mengembalikan Set = truthy)
    const fresh = incoming.filter(r => !ids.has(r.id) && ids.add(r.id));
    // show yang sudah ada tapi lineup-nya masih kosong: isi dari backup (lineup yang sudah terisi tidak pernah ditimpa)
    const byId = new Map(records.map(r => [r.id, r]));
    const fill = incoming.filter(b => { const c = byId.get(b.id); return c && !c.lineup.length && b.lineup.length; });
    // Hitung dulu semua yang akan berubah TANPA menyentuh data: menekan Batal tidak boleh mengubah apa pun.
    const newBy = (cur, list, clean, ok) => { const have = new Set(cur.map(w => w.id)); return list.map(clean).filter(w => ok(w) && !have.has(w.id)); };
    const freshMisc = full && Array.isArray(json.misc) ? newBy(misc, json.misc, cleanMisc, w => w.date || miscByName(w.kind)) : [];
    const freshAway = full && Array.isArray(json.away) ? newBy(away, json.away, cleanAway, w => w.date) : [];
    const freshSolo = full && Array.isArray(json.solo) ? newBy(solo, json.solo, sanitizeSolo, w => w.date) : [];
    const tkIn = full && Array.isArray(json.tickets) ? json.tickets.length : 0;
    const newPrices = full && json.prices && json.prices.base ? { base: { ...DEF_PRICES.base, ...json.prices.base }, over: Array.isArray(json.prices.over) ? json.prices.over : [] } : null;
    const pricesChanged = !!newPrices && JSON.stringify(newPrices) !== JSON.stringify(prices);
    const parts = [];
    if (fresh.length) parts.push(`${fresh.length} show`);
    if (fill.length) parts.push(`lineup ${fill.length} show diisi`);
    if (tkIn) parts.push(`${tkIn} tiket (digabung per kunci)`);
    if (freshSolo.length) parts.push(`${freshSolo.length} sesi solo`);
    if (freshMisc.length) parts.push(`${freshMisc.length} catatan pengeluaran`);
    if (freshAway.length) parts.push(`${freshAway.length} catatan Away`);
    if (pricesChanged) parts.push('daftar harga DIGANTI dengan yang ada di file');
    if (!parts.length) { toast('Tidak ada yang baru di file ini.'); return; }
    if (!await ask(`Gabungkan dari file ini: ${parts.join(', ')}? (data lain yang id-nya sama dilewati; setelahnya bisa diurungkan)`, 'Gabungkan')) return;

    const snap = JSON.parse(JSON.stringify({ records, tickets, solo, misc, away, prices })); // untuk Urungkan
    if (tkIn) mergeTickets(json.tickets);
    if (pricesChanged) { prices = newPrices; savePrices(); }
    if (freshMisc.length) { misc.push(...freshMisc); saveMisc(); }
    if (freshAway.length) { away.push(...freshAway); saveAway(); }
    if (full && (Array.isArray(json.away) || Array.isArray(json.misc))) moveOffair();
    if (freshSolo.length) { solo.push(...freshSolo); saveSolo(); }
    fill.forEach(b => { byId.get(b.id).lineup = [...b.lineup]; });
    records.push(...fresh);
    save();
    renderAll(); renderMisc();
    toast('Digabungkan: ' + parts.join(', '), {
      label: 'Urungkan', fn: () => {
        records = snap.records; tickets = snap.tickets; solo = snap.solo; misc = snap.misc; away = snap.away; prices = snap.prices;
        save(); saveTickets(); saveSolo(); saveMisc(); saveAway(); savePrices();
        renderAll(); renderMisc(); toast('Penggabungan dibatalkan.');
      }
    }, 12000);
  } catch (err) {
    alert('File tidak valid: ' + err.message);
  }
});

// ---------- Impor dari jkt48.com ----------
let jkNew = [];
$('btn-jk').addEventListener('click', () => {
  $('jk-code').value = jkCode();
  openEl('jk-modal');
  $('jk-in').focus();
});
$('jk-close').addEventListener('click', () => closeEl('jk-modal'));
$('jk-modal').addEventListener('click', e => { if (e.target.id === 'jk-modal') closeEl('jk-modal'); });
escHooks.push(() => $('jk-modal').classList.contains('open') ? (closeEl('jk-modal'), true) : false);
$('jk-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('jk-code').value); $('jk-copy').textContent = 'Tersalin ✓'; }
  catch (e) { $('jk-code').select(); }
});
const jkHash = s => { let x = 5381; for (const c of s) x = ((x << 5) + x + c.charCodeAt(0)) | 0; return (x >>> 0).toString(36); };
const rafRank = r => { const c = raffleOf(r); return c === 'win' ? 3 : c === 'lose' ? 2 : c ? 1 : 0; };
const localDay = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
function jkCode() { // kode Console; mode "baru saja" memakai tanggal impor terakhir dikurangi 30 hari (untuk menangkap status terpakai/kalah yang berubah)
  let since = '';
  try {
    const last = stor.getItem('jkt48_last_import');
    if ($('jk-new').checked && last && tickets.length) { const d = new Date(last + 'T00:00:00'); d.setDate(d.getDate() - 30); since = localDay(d); }
  } catch (e) { }
  return $('jk-src').textContent.trim().replace('__SINCE__', since);
}
$('jk-new').addEventListener('change', () => { $('jk-code').value = jkCode(); });
let jkTk = [];
$('jk-parse').addEventListener('click', () => {
  let rows;
  try {
    const j = JSON.parse($('jk-in').value);
    rows = Array.isArray(j) ? j : (j.tickets || j.data);
    if (!Array.isArray(rows)) throw 0;
  } catch (e) { $('jk-out').textContent = 'Format tidak dikenali. Tempel hasil dari kode Console (atau respons API mentah).'; return; }
  const merged = new Map(), list0 = [];
  for (const t of rows) { // terima hasil kode Console, hasil versi lama, atau respons API mentah
    const rawTx = Array.isArray(t.transaction_numbers) ? t.transaction_numbers.join(',') : null, base = t.reference_code ? t.reference_code + '|' + t.date : '';
    const n = {
      k: t.k || (base ? jkHash(base + '|' + (rawTx ?? '')) : ''),
      type: String(t.type || t.ticket_type || 'SHOW').toUpperCase(), date: String(t.date || ''), name: String(t.name || '').trim(),
      start: String(t.start || t.start_time || ''), used: +(t.used ?? t.used_count) || 0, raffle: String(t.raffle ?? t.raffle_status ?? '').toUpperCase(),
      member: String(t.member ?? t.member_name ?? ''), lane: String(t.lane ?? t.lane_label ?? ''), session: String(t.session ?? t.session_label ?? ''), bought: +(t.bought ?? t.bought_count) || 1,
      tx: String(t.tx || (rawTx !== null ? jkHash(rawTx) : '')),
      kl: Array.isArray(t.kl) ? t.kl : (base ? [jkHash(base), ...[1, 2, 3, 4].map(i => jkHash(base + '#' + i))] : [])
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) continue;
    const old = n.k && merged.get(n.k);
    if (old) { old.used = Math.max(old.used, n.used); if (rafRank(n.raffle) > rafRank(old.raffle)) old.raffle = n.raffle; }
    else { list0.push(n); if (n.k) merged.set(n.k, n); }
  }
  jkTk = list0.map(n => { const s = sanitizeTicket(n); s._kl = n.kl; return s; });
  const all = $('jk-all').checked, seen = new Set(), list = [];
  for (const t of list0) {
    if (t.type !== 'SHOW' || (!t.used && !all)) continue;
    const h = parseInt(t.start.slice(0, 2));
    const x = { date: t.date, setlist: t.name, sesi: isNaN(h) ? '' : h < 17 ? 'Siang' : 'Malam' };
    const key = x.date + '|' + x.sesi;
    if (seen.has(key)) continue;
    seen.add(key);
    // sudah ada jika tanggal sama dan (sesi sama atau setlist sama)
    x.dup = records.some(r => r.date === x.date && (r.sesi === x.sesi || r.setlist.toLowerCase() === x.setlist.toLowerCase()));
    list.push(x);
  }
  list.sort((a, b) => b.date.localeCompare(a.date));
  jkNew = list.filter(x => !x.dup);
  const ls = lotteryStats(jkTk), ev = jkTk.filter(t => t.type !== 'SHOW').length, evUsed = jkTk.filter(t => t.type === 'EVENT' && t.used > 0).length, tk = $('jk-tk').checked && jkTk.length;
  $('jk-out').innerHTML = `<p><b>${list.length}</b> show teater terpakai${evUsed ? ` (belum termasuk ${evUsed} tiket event terpakai, mis. JKT48 School)` : ''}: <b>${jkNew.length}</b> baru, ${list.length - jkNew.length} sudah ada.<br>Tiket: <b>${jkTk.length}</b> (exclusive &amp; event: ${ev}) · Lotre: ${ls.win} menang / ${ls.lose} kalah</p>` +
    list.slice(0, 150).map(x => `<div class="jk-r${x.dup ? ' dup' : ''}"><span>${esc(fmtDate(x.date))}</span><span>${esc(x.sesi)}</span><span>${esc(x.setlist)}</span><i>${x.dup ? 'sudah ada' : 'baru'}</i></div>`).join('');
  $('jk-add').disabled = !(jkNew.length || tk);
  $('jk-add').textContent = `Tambahkan ${jkNew.length} show` + (tk ? ` + ${jkTk.length} tiket` : '');
});
const tkey = t => t.k || [t.type, t.date, t.name, t.start, t.member, t.lane, t.session].join('|');
function mergeTickets(list) { // kunci sama = diperbarui, sisanya ditambah; tiket lama (kunci tanpa transaksi) diambil alih satu per satu
  const m = new Map(tickets.map(t => [tkey(t), t])), claimed = new Set();
  list.map(x => { const s = sanitizeTicket(x); s._kl = x._kl || x.kl || []; return s; }).filter(t => t.date).forEach(t => {
    let o = m.get(tkey(t));
    if (!o && t.tx && t._kl.length) { // migrasi: tiket yang disimpan sebelum nomor transaksi dipakai
      const lg = tickets.find(x => !x.tx && !claimed.has(x) && t._kl.includes(tkey(x)) && x.start === t.start && x.member === t.member && x.lane === t.lane && x.session === t.session);
      if (lg) { claimed.add(lg); o = lg; m.delete(tkey(lg)); }
    }
    if (o && o.cat && !t.cat) t.cat = o.cat;
    if (o && o.status && !t.status) t.status = o.status;
    if (o && o.photo && !t.photo) t.photo = o.photo; // impor ulang dari jkt48.com tidak menghapus foto yang sudah diunggah
    if (!o && !t.cat) { const sib = tickets.find(x => x.cat && tname(x) === tname(t)); if (sib) t.cat = sib.cat; } // seri yang sama: pakai kategori yang sudah kamu atur
    delete t._kl;
    m.set(tkey(t), t);
  });
  tickets = [...m.values()];
  try { stor.setItem(KEY + '_tickets', JSON.stringify(tickets)); } catch (e) { alert('Gagal menyimpan data tiket (penyimpanan penuh?)'); }
  bumpDirty();
}
try { tickets = (JSON.parse(stor.getItem(KEY + '_tickets')) || []).map(sanitizeTicket); } catch (e) { tickets = []; }
$('jk-add').addEventListener('click', () => {
  const now = Date.now(), n = jkNew.length, nt = $('jk-tk').checked ? jkTk.length : 0;
  jkNew.forEach((x, i) => records.push(sanitize({ id: now + i, seat: '?', setlist: x.setlist, date: x.date, sesi: x.sesi }, i)));
  if (nt) { mergeTickets(jkTk); try { stor.setItem('jkt48_last_import', localDay(new Date())); } catch (e) { } }
  save(); renderAll();
  jkNew = []; jkTk = []; $('jk-add').disabled = true; $('jk-out').textContent = ''; $('jk-in').value = '';
  closeEl('jk-modal');
  alert(`${n} show dan ${nt} tiket ditambahkan.` + (n ? ' Kursi show baru masih "?" karena data tiket tidak memuat kursi. Cari "?" di tabel lalu isi lewat tombol edit; sebelum itu belum tampil di halaman publik.' : ''));
});

// ---------- Kategori tiket (diatur per nama tiket) ----------
function persistTickets() {
  try { stor.setItem(KEY + '_tickets', JSON.stringify(tickets)); } catch (e) { alert('Gagal menyimpan data tiket (penyimpanan penuh?)'); }
  bumpDirty(); renderTodo(); renderTotals(); renderExpense();
}
function renderCats() {
  const groups = new Map();
  tickets.filter(t => t.type !== 'SHOW').forEach(t => { const k = tname(t); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const unk = g => tcat(g[1][0]) === 'Belum dikategorikan' ? 0 : 1;
  const rows = [...groups].sort((a, b) => unk(a) - unk(b) || a[0].localeCompare(b[0]));
  $('cat-list').innerHTML = rows.length ? rows.map(([k, ts]) => `<div class="cat-r"><span class="cat-n">${esc(k)}<small>${ts.length} tiket · sekarang: ${esc(tcat(ts[0]))}</small></span>
    <select data-name="${esc(k)}" aria-label="Kategori ${esc(k)}"><option value="">Otomatis (${esc(autoCat(ts[0]))})</option>${TK_CATS.map(c => `<option${c === ts[0].cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>`).join('')
    : '<div class="empty">Belum ada tiket event. Impor dulu dari jkt48.com.</div>';
}
function renderRefs() {
  const today = new Date().toISOString().slice(0, 10);
  const c = tickets.filter(t => t.type === 'SHOW' && !t.raffle && !t.used && t.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  $('ref-list').innerHTML = c.length ? c.map(t => `<div class="cat-r"><span class="cat-n">${esc(t.name)}<small>${esc(fmtDate(t.date))} · ${esc(t.start)}</small></span>
    <select data-k="${esc(tkey(t))}" aria-label="Status ${esc(t.name)} ${esc(t.date)}"><option value="">Belum diberi keterangan</option><option value="refund"${t.status === 'refund' ? ' selected' : ''}>Dibatalkan &amp; di-refund</option></select></div>`).join('')
    : '<div class="empty">Tidak ada tiket menang yang tidak terpakai.</div>';
}
$('ref-list').addEventListener('change', e => {
  const s = e.target.closest('select[data-k]'), t = s && tickets.find(x => tkey(x) === s.dataset.k);
  if (t) { t.status = s.value; persistTickets(); }
});
$('btn-cat').addEventListener('click', () => { renderCats(); renderRefs(); openEl('cat-modal'); });
$('cat-close').addEventListener('click', () => closeEl('cat-modal'));
$('cat-modal').addEventListener('click', e => { if (e.target.id === 'cat-modal') closeEl('cat-modal'); });
escHooks.push(() => $('cat-modal').classList.contains('open') ? (closeEl('cat-modal'), true) : false);
$('cat-list').addEventListener('change', e => {
  const s = e.target.closest('select[data-name]');
  if (!s) return;
  tickets.forEach(t => { if (t.type !== 'SHOW' && tname(t) === s.dataset.name) t.cat = s.value; });
  persistTickets(); renderCats();
});

// ---------- Daftar tugas: data yang masih perlu dilengkapi ----------
let taskF = '';
const TASKS = {
  noSeat: { label: n => `${n} show belum punya kursi`, f: r => !SEATS.has(r.seat) },
  noSesi: { label: n => `${n} show tanpa sesi (siang/malam)`, f: r => !r.sesi },
  noPhoto: { label: n => `${n} 2-Shot/Chekicha tanpa foto`, f: r => (r.twoshot === 'Ya' && !r.photo) || (r.chekicha === 'Ya' && !r.ckPhoto) },
  noLineup: { label: n => `${n} show belum ada lineup`, f: r => !(r.lineup || []).length },
  noMember: { label: n => `${n} 2-Shot/Chekicha tanpa nama member`, f: r => (r.twoshot === 'Ya' && !r.member) || (r.chekicha === 'Ya' && !r.ckMember) }
};
function renderTodo() {
  const chips = Object.entries(TASKS).map(([k, t]) => [k, records.filter(t.f).length, t.label]).filter(([, n]) => n)
    .map(([k, n, l]) => `<button type="button" class="todo-c${taskF === k ? ' on' : ''}" data-task="${k}">${esc(l(n))}</button>`);
  const today = new Date().toISOString().slice(0, 10);
  const nu = tickets.filter(t => t.type !== 'SHOW' && tcat(t) === 'Belum dikategorikan').length;
  const nr = tickets.filter(t => t.type === 'SHOW' && !t.raffle && !t.used && t.date <= today && !t.status).length;
  if (nu) chips.push(`<button type="button" class="todo-c" data-open="cat">${nu} tiket belum dikategorikan</button>`);
  if (nr) chips.push(`<button type="button" class="todo-c" data-open="cat">${nr} tiket menang tanpa keterangan (dipakai / refund?)</button>`);
  $('todo').innerHTML = chips.length
    ? `<b>Perlu dilengkapi:</b> ${chips.join('')}${taskF ? '<button type="button" class="btn-s" data-task="">Tampilkan semua</button>' : ''}`
    : '<span class="todo-ok">✓ Semua data sudah lengkap</span>';
}
$('todo').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.open) { renderCats(); renderRefs(); openEl('cat-modal'); return; }
  taskF = taskF === b.dataset.task ? '' : b.dataset.task; // klik lagi = lepas
  page = 1; $('search').value = '';
  renderTable(); renderTodo();
  $('search').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ---------- Total tiket Video Call, 2-Shot, dan MNG (hanya terlihat di admin) ----------
let ttYear = '', ttKind = ''; // ttKind: '' = gabungan, atau 'vc' | 'ts' | 'mg' = satu jenis saja
const TT_KINDS = [
  { k: 'vc', label: 'Video Call', color: '#a78bfa' },
  { k: 'ts', label: '2-Shot', color: '#ff2a5f' },
  { k: 'mg', label: 'MNG', color: '#ffb347' }
];
const PKG = /greet\s*&\s*2[- ]?shot/i; // tiket paket "Meet and Greet & 2-Shot" dihitung sebagai MNG
const ticketKind = t => tcat(t) === 'Video Call' ? 'vc' : (/2[- ]?shot/i.test(t.name) && !PKG.test(t.name)) ? 'ts' : 'mg';
const ttRows = () => tickets.filter(t => t.type !== 'SHOW' && BLUR_CATS.includes(tcat(t)) && raffleOf(t.raffle) !== 'lose'); // entri undian yang kalah bukan tiket yang dibeli
const ttSum = a => a.reduce((x, t) => x + t.bought, 0);
const ttAgg = a => ({ vc: ttSum(a.filter(t => ticketKind(t) === 'vc')), ts: ttSum(a.filter(t => ticketKind(t) === 'ts')), mg: ttSum(a.filter(t => ticketKind(t) === 'mg')) });
const ttTot = v => v.vc + v.ts + v.mg;
const ttSmall = v => `VC ${v.vc} · 2S ${v.ts} · MNG ${v.mg}`;
const stackBar = (parts, max) => { // parts: [warna, nilai, label, teks]
  const t = parts.reduce((x, p) => x + p[1], 0);
  return `<div class="tt-bw"><div class="tt-bar" style="width:${max ? t / max * 100 : 0}%">${parts.filter(p => p[1]).map(p => `<i style="flex:${p[1]};background:${p[0]}" title="${esc(p[2] || '')}: ${esc(p[3] ?? p[1])}"></i>`).join('')}</div></div>`;
};
const ttBar = (v, max) => stackBar(TT_KINDS.map(K => [K.color, v[K.k], K.label]), max);

function renderTotals() {
  const el = $('tt');
  if (!el) return;
  const base = ttRows();
  if (!base.length) { el.innerHTML = '<div class="empty">Belum ada data tiket Video Call / 2-Shot / MNG. Impor dulu dari jkt48.com.</div>'; return; }
  const years = [...new Set(base.map(t => t.date.slice(0, 4)))].sort().reverse();
  if (ttYear && !years.includes(ttYear)) ttYear = '';
  const today = new Date().toISOString().slice(0, 10), inK = t => !ttKind || ticketKind(t) === ttKind;
  const evY = ttYear ? base.filter(t => t.date.startsWith(ttYear)) : base; // satu tahun, semua jenis (untuk kartu jenis)
  const ev = evY.filter(inK), all = base.filter(inK);                       // + filter jenis (untuk hero, tahun, bulan, member)
  const AY = ttAgg(evY), A = ttAgg(ev), total = ttTot(A), totY = ttTot(AY);
  const pct = n => total ? Math.round(n / total * 100) : 0, pctY = n => totY ? Math.round(n / totY * 100) : 0;
  const upN = ttSum(ev.filter(t => t.date > today)), shown = ttKind ? TT_KINDS.filter(K => K.k === ttKind) : TT_KINDS;
  const kLabel = ttKind ? ' · ' + TT_KINDS.find(K => K.k === ttKind).label : '';

  const card = (K, i) => {
    const a = evY.filter(t => ticketKind(t) === K.k), ser = new Set(a.map(tname)).size, up = ttSum(a.filter(t => t.date > today));
    const sub = K.k === 'vc' ? '' : `Event ${ttSum(a.filter(t => tcat(t) === '2S & MnG Event'))} · Theater Sementara ${ttSum(a.filter(t => tcat(t) === '2S & MnG Theater Sementara'))}`;
    const pk = K.k === 'mg' ? ttSum(a.filter(t => PKG.test(t.name))) : 0;
    return `<button type="button" class="tt-c${ttKind === K.k ? ' on' : ''}" data-k="${K.k}" style="--c:${K.color};--i:${i}" aria-pressed="${ttKind === K.k}"><b>${AY[K.k]}</b><span class="tl">${K.label}</span>
      <small>${pctY(AY[K.k])}% dari total · ${a.length} sesi · ${ser} seri${sub ? '<br>' + sub : ''}${pk ? `<br>termasuk ${pk} tiket paket MNG + 2-Shot` : ''}${up ? `<br>${up} mendatang` : ''}<br><em class="tt-hint">${ttKind === K.k ? 'klik lagi untuk gabungan' : 'klik untuk lihat terpisah'}</em></small></button>`;
  };

  const yMax = Math.max(1, ...years.map(y => ttTot(ttAgg(all.filter(t => t.date.startsWith(y))))));
  const yRows = years.map(y => { const v = ttAgg(all.filter(t => t.date.startsWith(y))); return `<div class="tt-r"><span class="nm">${esc(y)}</span>${ttBar(v, yMax)}<span class="tot">${ttTot(v)}</span></div>`; }).join('');

  const months = {};
  ev.forEach(t => { (months[t.date.slice(0, 7)] = months[t.date.slice(0, 7)] || []).push(t); });
  const mKeys = Object.keys(months).sort().reverse(), moMax = Math.max(1, ...mKeys.map(k => ttTot(ttAgg(months[k]))));
  const moHtml = mKeys.map(k => {
    const list = months[k], v = ttAgg(list), by = {};
    list.forEach(t => { const n = t.member || 'Tanpa nama member'; (by[n] = by[n] || []).push(t); });
    const rows = Object.entries(by).map(([n, x]) => [n, ttAgg(x), [...new Set(x.map(tname))]]).sort((p, q) => ttTot(q[1]) - ttTot(p[1])), lMax = Math.max(1, ttTot(rows[0][1]));
    return `<details class="tt-m"><summary><span class="nm">${esc(MON_ID[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4))}${k > today.slice(0, 7) ? ' <em>mendatang</em>' : ''}<small>${ttSmall(v)} · ${rows.length} member</small></span>${ttBar(v, moMax)}<span class="tot">${ttTot(v)}</span></summary>
      <div class="tt-ml">${rows.map(([n, x, series]) => `<div class="tt-r" title="${esc(series.join(', '))}"><span class="nm">${esc(n)}<small>${ttSmall(x)}</small></span>${ttBar(x, lMax)}<span class="tot">${ttTot(x)}</span></div>`).join('')}</div></details>`;
  }).join('');

  const mem = {};
  ev.forEach(t => { if (t.member) (mem[t.member] = mem[t.member] || []).push(t); });
  const mList = Object.entries(mem).map(([n, a]) => [n, ttAgg(a)]).sort((a, b) => ttTot(b[1]) - ttTot(a[1])).slice(0, 12), mMax = mList.length ? ttTot(mList[0][1]) : 1;
  const mRows = mList.map(([n, v]) => `<div class="tt-r"><span class="nm">${esc(n)}<small>${ttSmall(v)}</small></span>${ttBar(v, mMax)}<span class="tot">${ttTot(v)}</span></div>`).join('');

  el.innerHTML = `<p class="tt-note">Halaman ini hanya ada di admin. Di halaman publik, jumlah tiket VC, 2-Shot, dan MNG tampil diblur. Entri undian yang kalah tidak dihitung.</p>
    <div class="tt-years">${[['', 'Gabungan'], ...TT_KINDS.map(K => [K.k, K.label])].map(([k, l]) => `<button type="button" class="tt-y tt-k${k === ttKind ? ' on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="tt-years">${['', ...years].map(y => `<button type="button" class="tt-y${y === ttYear ? ' on' : ''}" data-y="${y}">${y || 'Semua tahun'}</button>`).join('')}</div>
    <div class="tt-hero"><div class="tt-big"><b>${total}</b><span>total tiket${kLabel}${ttYear ? ' ' + ttYear : ''}</span>${upN ? `<small>termasuk ${upN} mendatang</small>` : ''}</div>
      <div style="margin-top:14px">${ttBar(A, total)}</div>
      <div class="tt-legend">${shown.map(K => `<span><i style="background:${K.color}"></i>${K.label} ${A[K.k]} (${pct(A[K.k])}%)</span>`).join('')}</div></div>
    <div class="tt-cards">${TT_KINDS.map(card).join('')}</div>
    <div><h3 class="tt-h">Per tahun</h3>${yRows}</div>
    <div><h3 class="tt-h">Per bulan · klik bulan untuk melihat member</h3>${moHtml}</div>
    <div><h3 class="tt-h">Per member${ttYear ? ' (' + ttYear + ')' : ''} · 12 teratas</h3>${mRows || '<div class="empty">Tidak ada data</div>'}</div>`;
}
$('tt').addEventListener('click', e => {
  const y = e.target.closest('[data-y]'), k = e.target.closest('[data-k]');
  if (y) ttYear = y.dataset.y;
  else if (k) ttKind = ttKind === k.dataset.k ? '' : k.dataset.k;
  else return;
  renderTotals();
});

// ---------- Pengeluaran: dihitung dari data yang sudah diinput + daftar harga ----------
// pengeluaran lain yang dicatat manual: Livestream, Merch, Konser, Off-Air
const MISC = [ // names: pilihan nama (tanpa tanggal); tanpa names = pakai tanggal dan nama bebas
  { k: 'live', label: 'Livestream & App', icon: '', color: '#f472b6', groups: [['Livestream', ['IDN', 'Showroom', 'Saweria']], ['App', ['X', 'PM']]] },
  { k: 'fanbase', label: 'Fanbase', icon: '', color: '#38bdf8', groups: [['Fanbase', ['Kas']]] },
  { k: 'project', label: 'Project', icon: '', color: '#c084fc', groups: [['Project', ['SSK', 'RH', 'STS']]] },
  { k: 'merch', label: 'Merch', icon: '', color: '#fb923c', nodate: true, ph: 'mis. photopack, lightstick, kaos' },
  { k: 'gift', label: 'Gift', icon: '', color: '#f87171', member: true, ph: 'Nama member' },
  { k: 'konser', label: 'Konser', icon: '', color: '#facc15', ph: 'mis. tiket konser, tiket festival' },
  { k: 'offair', label: 'Off-Air', icon: '', color: '#2dd4bf', ph: 'mis. nama event off-air' }
];
const miscNames = M => (M.groups || []).flatMap(g => g[1]);
const miscByName = k => { const M = MISC.find(x => x.k === k); return !!(M.groups || M.nodate || M.member); }; // true = tanpa tanggal
const EX_ITEMS = [
  { k: 'theater', label: 'Tiket theater', g: 'theater', base: 200000, unit: 'show' },
  { k: 'ts_roulette', label: '2-Shot Roulette', g: 'ts', base: 100000, unit: 'sesi' },
  { k: 'ts_bday', label: 'Birthday 2-Shot', g: 'ts', base: 250000, unit: 'sesi' },
  { k: 'ck_roulette', label: 'Chekicha', g: 'ck', base: 150000, unit: 'sesi' },
  { k: 'ck_bday', label: 'Birthday Chekicha', g: 'ck', base: 250000, unit: 'sesi' },
  { k: 'ts_event', label: '2-Shot Event', g: 'ts', base: 180000, unit: 'tiket' },
  { k: 'mng', label: 'MNG', g: 'mng', base: 50000, unit: 'tiket' },
  { k: 'vc', label: 'Video Call', g: 'vc', base: 120000, unit: 'tiket' }
];
const EX_GROUPS = [
  { g: 'theater', label: 'Tiket theater', color: '#ff8c00' }, { g: 'ts', label: '2-Shot', color: '#ff2a5f' }, { g: 'ck', label: 'Chekicha', color: '#34d399' },
  { g: 'mng', label: 'MNG', color: '#ffd23f' }, { g: 'vc', label: 'Video Call', color: '#a78bfa' }, { g: 'away', label: 'Away', color: '#22d3ee' },
  ...MISC.map(M => ({ g: 'm_' + M.k, label: M.label, color: M.color }))
];
const EX_ITEM = Object.fromEntries(EX_ITEMS.map(i => [i.k, i]));
const exItem = k => EX_ITEM[k] || (k.startsWith('misc:') ? { label: MISC.find(M => M.k === k.slice(5)).label, g: 'm_' + k.slice(5), unit: 'catatan' } : null) || { label: 'Away · ' + k.slice(5), g: 'away', unit: 'entri' }; // k = "away:Kategori"
const PRK = 'jkt48_prices_v1';
const DEF_PRICES = { base: Object.fromEntries(EX_ITEMS.map(i => [i.k, i.base])), over: [{ m: '2026-10', k: 'ts_event', p: 200000 }, { m: '2026-10', k: 'mng', p: 60000 }] }; // Okt 2026 harganya berbeda
let prices = (() => {
  try { const s = JSON.parse(stor.getItem(PRK)); if (s && s.base && Array.isArray(s.over)) return { base: { ...DEF_PRICES.base, ...s.base }, over: s.over }; } catch (e) { }
  return JSON.parse(JSON.stringify(DEF_PRICES));
})();
const savePrices = () => { try { stor.setItem(PRK, JSON.stringify(prices)); } catch (e) { } bumpDirty(); };
const priceOf = (k, m) => { const o = prices.over.find(x => x.k === k && x.m === m); return o ? o.p : prices.base[k]; }; // harga khusus bulan itu, kalau tidak ada pakai harga dasar
let exYear = '', exOpen = false;
function expenseLines() {
  const L = [], add = (date, k, q) => { if (!date || !q) return; const m = date.slice(0, 7), p = priceOf(k, m); L.push({ m, k, q, p, amt: q * p }); };
  records.forEach(r => {
    add(r.date, 'theater', 1);
    if (r.twoshot === 'Ya') add(r.date, r.tsType === 'birthday' ? 'ts_bday' : 'ts_roulette', 1);
    if (r.chekicha === 'Ya') add(r.date, r.ckType === 'birthday' ? 'ck_bday' : 'ck_roulette', 1);
  });
  ttRows().forEach(t => add(t.date, { vc: 'vc', ts: 'ts_event', mg: 'mng' }[ticketKind(t)], t.bought));
  solo.forEach(w => add(w.date, soloKey(w), 1)); // sesi lepas: harga mengikuti daftar harga (dan penyesuaian per bulan)
  misc.forEach(w => { if (w.amount) L.push({ m: w.date ? w.date.slice(0, 7) : '', k: 'misc:' + w.kind, q: 1, p: w.amount, amt: w.amount, trip: '', nm: w.name }); }); // m kosong = tanpa tanggal
  away.forEach(w => { if (w.date && w.amount) L.push({ m: w.date.slice(0, 7), k: 'away:' + w.cat, q: 1, p: w.amount, amt: w.amount, trip: w.trip }); }); // catatan Away
  return L;
}
function renderExpense() {
  const el = $('ex');
  if (!el) return;
  const lines = expenseLines();
  if (!lines.length) { el.innerHTML = '<div class="empty">Belum ada data untuk dihitung.</div>'; return; }
  const years = [...new Set(lines.filter(l => l.m).map(l => l.m.slice(0, 4)))].sort().reverse();
  if (exYear && !years.includes(exYear)) exYear = '';
  const L = exYear ? lines.filter(l => l.m.startsWith(exYear)) : lines;
  const amt = a => a.reduce((x, l) => x + l.amt, 0), qty = a => a.reduce((x, l) => x + l.q, 0), total = amt(L), nm = new Set(L.filter(l => l.m).map(l => l.m)).size, undated = amt(L.filter(l => !l.m));
  const gOf = l => exItem(l.k).g, pct = n => total ? Math.round(n / total * 100) : 0;
  const gParts = a => EX_GROUPS.map(G => { const v = amt(a.filter(l => gOf(l) === G.g)); return [G.color, v, G.label, rupiah(v)]; });
  const gColor = I => EX_GROUPS.find(G => G.g === I.g).color;
  const cards = EX_ITEMS.map(I => [I, L.filter(l => l.k === I.k)]).filter(x => x[1].length).map(([I, a], i) => {
    const ps = [...new Set(a.map(l => l.p))];
    return `<div class="tt-c" style="--c:${gColor(I)};--i:${i}"><b class="ex-n">${rupiah(amt(a))}</b><span class="tl">${I.label}</span><small>${qty(a)} ${I.unit} × ${ps.length > 1 ? 'harga campuran' : rupiah(ps[0])}<br>${pct(amt(a))}% dari total</small></div>`;
  }).join('');
  const awL = L.filter(l => l.k.startsWith('away:'));
  const awayCard = awL.length ? `<div class="tt-c" style="--c:#22d3ee;--i:9"><b class="ex-n">${rupiah(amt(awL))}</b><span class="tl">Away (fansfar)</span><small>${awL.length} catatan · ${new Set(awL.map(l => l.trip || '—')).size} perjalanan<br>${pct(amt(awL))}% dari total</small></div>` : '';
  const miscCards = MISC.map(M => [M, L.filter(l => l.k === 'misc:' + M.k)]).filter(x => x[1].length).map(([M, a], i) => `<div class="tt-c" style="--c:${M.color};--i:${10 + i}"><b class="ex-n">${rupiah(amt(a))}</b><span class="tl">${M.icon} ${M.label}</span><small>${(M.groups || M.member) ? [...a.reduce((mp, l) => mp.set(l.nm, (mp.get(l.nm) || 0) + l.amt), new Map())].map(([n, v]) => esc(n) + ' ' + rupiah(v)).join(' · ') : a.length + ' catatan'}<br>${pct(amt(a))}% dari total</small></div>`).join('');
  const byM = {};
  L.filter(l => l.m).forEach(l => (byM[l.m] = byM[l.m] || []).push(l));
  const mKeys = Object.keys(byM).sort().reverse(), mMax = Math.max(1, ...mKeys.map(k => amt(byM[k])));
  const moHtml = mKeys.map(k => {
    const a = byM[k], rows = new Map();
    a.forEach(l => { const aw = l.k.includes(':'), key = aw ? l.k : l.k + '|' + l.p, r = rows.get(key) || { k: l.k, p: l.p, q: 0, amt: 0, aw }; r.q += l.q; r.amt += l.amt; rows.set(key, r); });
    const lines2 = [...rows.values()].sort((x, y) => y.amt - x.amt).map(r => `<div class="ex-l"><span>${exItem(r.k).label}</span><span>${r.aw ? r.q + ' catatan' : r.q + ' ' + exItem(r.k).unit + ' × ' + rupiah(r.p)}</span><b>${rupiah(r.amt)}</b></div>`).join('');
    return `<details class="tt-m ex-m"><summary><span class="nm">${esc(MON_ID[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4))}<small>${rows.size} jenis</small></span>${stackBar(gParts(a), mMax)}<span class="tot">${rupiah(amt(a))}</span></summary><div class="tt-ml">${lines2}</div></details>`;
  }).join('');
  const editor = `<details class="ex-prices"${exOpen ? ' open' : ''}><summary>Daftar harga</summary>
    <div class="ex-grid">${EX_ITEMS.map(I => `<label class="ex-pr"><span>${I.label} <small>/ ${I.unit}</small></span><input type="number" min="0" step="1000" data-pk="${I.k}" value="${prices.base[I.k]}"></label>`).join('')}</div>
    <h4 class="tt-h">Penyesuaian harga per bulan</h4>
    ${prices.over.map((o, i) => `<div class="ex-ov"><input type="month" data-oi="${i}" data-of="m" value="${esc(o.m)}"><select data-oi="${i}" data-of="k">${EX_ITEMS.map(I => `<option value="${I.k}"${I.k === o.k ? ' selected' : ''}>${I.label}</option>`).join('')}</select><input type="number" min="0" step="1000" data-oi="${i}" data-of="p" value="${o.p}"><button type="button" class="btn-s" data-odel="${i}" aria-label="Hapus penyesuaian">✕</button></div>`).join('') || '<p class="tt-note">Belum ada penyesuaian.</p>'}
    <button type="button" class="btn-s" data-oadd="1">＋ Tambah penyesuaian</button></details>`;
  el.innerHTML = `<p class="tt-note">Hanya terlihat di admin. Theater = jumlah show di riwayat (termasuk JKT48 School). 2-Shot dan Chekicha = sesi yang dicatat di riwayat dan di tab Sesi Lepas. 2-Shot Event, MNG, dan Video Call = jumlah tiket per sesi (tanpa undian yang kalah). Bulan mengikuti tanggal acara. Away, Livestream &amp; App, Fanbase, Project, Merch, Gift, Konser, dan Off-Air = catatan di sub-tab masing-masing (Livestream &amp; App, Fanbase, Project, Merch, dan Gift tanpa tanggal, jadi tidak masuk rincian per bulan).</p>
    <div class="tt-years">${['', ...years].map(y => `<button type="button" class="tt-y${y === exYear ? ' on' : ''}" data-ey="${y}">${y || 'Semua tahun'}</button>`).join('')}</div>
    <div class="tt-hero"><div class="tt-big"><b class="ex-big">${rupiah(total)}</b><span>total pengeluaran${exYear ? ' ' + exYear : ''}</span><small>rata-rata ${rupiah(nm ? (total - undated) / nm : 0)} per bulan (${nm} bulan)${undated ? ` · belum termasuk ${rupiah(undated)} tanpa tanggal (Livestream &amp; App, Fanbase, Project, Merch, Gift)` : ''}</small></div>
      <div style="margin-top:14px">${stackBar(gParts(L), total)}</div>
      <div class="tt-legend">${gParts(L).filter(p => p[1]).map(p => `<span><i style="background:${p[0]}"></i>${p[2]} ${p[3]} (${pct(p[1])}%)</span>`).join('')}</div></div>
    <div class="tt-cards">${cards}${awayCard}${miscCards}</div>
    <div><h3 class="tt-h">Per bulan · klik untuk rincian</h3>${moHtml}</div>
    ${editor}`;
}
$('ex').addEventListener('click', e => {
  const y = e.target.closest('[data-ey]'), d = e.target.closest('[data-odel]'), ad = e.target.closest('[data-oadd]');
  if (y) exYear = y.dataset.ey;
  else if (d) { prices.over.splice(+d.dataset.odel, 1); savePrices(); exOpen = true; }
  else if (ad) { prices.over.push({ m: new Date().toISOString().slice(0, 7), k: 'ts_event', p: prices.base.ts_event }); savePrices(); exOpen = true; }
  else return;
  renderExpense();
});
$('ex').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.pk) prices.base[t.dataset.pk] = Math.max(0, +t.value || 0);
  else if (t.dataset.oi !== undefined) { const o = prices.over[+t.dataset.oi]; o[t.dataset.of] = t.dataset.of === 'p' ? Math.max(0, +t.value || 0) : t.value; }
  else return;
  savePrices(); exOpen = true; renderExpense();
});
$('ex').addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('ex-prices')) exOpen = e.target.open; }, true);

// ---------- Livestream / Merch / Konser / Off-Air: catatan pengeluaran manual ----------
const MISK = 'jkt48_misc_v1';
const cleanMisc = w => ({
  id: Number(w.id) || Date.now() + Math.floor(Math.random() * 1000), date: /^\d{4}-\d{2}-\d{2}/.test(w.date || '') ? String(w.date).slice(0, 10) : '', kind: MISC.some(M => M.k === w.kind) ? w.kind : 'merch',
  name: String(w.name || '').trim().slice(0, 100), amount: Math.max(0, Math.round(Number(w.amount) || 0)), note: String(w.note || '').trim().slice(0, 200)
});
let misc = (() => { try { const s = JSON.parse(stor.getItem(MISK)); if (Array.isArray(s)) return s.map(cleanMisc).filter(w => w.date || miscByName(w.kind)); } catch (e) { } return []; })();
const saveMisc = () => { try { stor.setItem(MISK, JSON.stringify(misc)); } catch (e) { alert('Gagal menyimpan catatan (penyimpanan penuh?)'); } bumpDirty(); };
let miscKind = 'live', miscEdit = 0, miscLast = '';
// catatan Away yang bertanda "off-air" dipindah ke Off-Air supaya tidak terhitung dua kali
function moveOffair() {
  const hit = away.filter(w => /off[\s-]?air/i.test(w.note + ' ' + w.trip));
  if (!hit.length) return 0;
  const ids = new Set(misc.map(w => w.id));
  hit.forEach(w => { if (!ids.has(w.id)) misc.push(cleanMisc({ id: w.id, date: w.date, kind: 'offair', name: w.note.replace(/\s*\(?\s*off[\s-]?air\s*\)?\s*/ig, ' ').trim() || w.note, amount: w.amount, note: w.trip ? 'Dipindah dari Away · ' + w.trip : 'Dipindah dari Away' })); });
  away = away.filter(w => !hit.includes(w));
  saveMisc(); saveAway();
  return hit.length;
}
let offairMoved = 0; // diisi setelah data Away dimuat (lihat di bawah)
function renderMisc() {
  const el = $('misc');
  if (!el) return;
  const M = MISC.find(x => x.k === miscKind), byName = miscByName(M.k), today = new Date().toISOString().slice(0, 10);
  const all = misc.filter(w => w.kind === M.k), years = byName ? [] : [...new Set(all.map(w => w.date.slice(0, 4)))].sort().reverse();
  const list = (exYear && !byName ? all.filter(w => w.date.startsWith(exYear)) : all).slice().sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.id - x.id), total = list.reduce((s, w) => s + w.amount, 0);
  const ed = misc.find(w => w.id === miscEdit) || { date: miscLast || today, name: M.groups ? miscNames(M)[0] : '', amount: '', note: '' };
  const names = [...new Set([...miscNames(M), ...all.map(w => w.name).filter(Boolean)])]; // nama lama di luar pilihan tetap bisa dipilih
  const dateF = byName ? '' : `<label>Tanggal<input type="date" id="mi-date" value="${esc(ed.date)}"></label>`;
  const sel = M.groups ? `<label>Nama<select id="mi-name">${M.groups.map(g => `<optgroup label="${esc(g[0])}">${g[1].map(n => `<option${n === ed.name ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')}${names.filter(n => !miscNames(M).includes(n)).map(n => `<option${n === ed.name ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`
    : M.member ? `<label>Member yang di-gift<input id="mi-name" list="mi-members" placeholder="Nama member" value="${esc(ed.name)}" autocomplete="off"><datalist id="mi-members">${[...new Set([...records.flatMap(r => [r.member, r.ckMember]), ...tickets.map(t => t.member), ...solo.map(w => w.member), ...names].filter(Boolean))].sort().map(m => `<option value="${esc(m)}">`).join('')}</datalist></label>`
      : `${dateF}<label>Nama<input id="mi-name" placeholder="${esc(M.ph || '')}" value="${esc(ed.name)}" autocomplete="off"></label>`;
  const perName = (M.groups || M.member) ? `<div class="tt-cards">${names.map((n, i) => { const a = list.filter(w => w.name === n); return `<div class="tt-c" style="--c:${M.color};--i:${i}"><b class="ex-n">${rupiah(a.reduce((s, w) => s + w.amount, 0))}</b><span class="tl">${esc(n)}</span><small>${a.length} catatan</small></div>`; }).join('')}</div>` : '';
  el.innerHTML = `<p class="tt-note">Hanya terlihat di admin. Catat pengeluaran ${esc(M.label)} di sini${byName ? ' (tanpa tanggal)' : ''}; totalnya otomatis masuk ke sub-tab Ringkasan. <b>Disimpan di browser ini saja</b>, jadi ikut Backup lengkap (JSON).${offairMoved && M.k === 'offair' ? ` ${offairMoved} catatan off-air dipindah otomatis dari Away.` : ''}</p>
    <div class="aw-form">
      ${sel}
      <label>${M.member ? 'Harga (Rp)' : 'Jumlah (Rp)'}<input type="number" id="mi-amt" min="0" step="1000" inputmode="numeric" placeholder="150000" value="${ed.amount}"></label>
      <label class="aw-wide">Catatan (opsional)<input id="mi-note" value="${esc(ed.note)}" autocomplete="off"></label>
      <div class="aw-act">${miscEdit ? '<button type="button" class="btn-s" data-micancel="1">Batal</button>' : ''}<button type="button" class="btn" data-misave="1">${miscEdit ? 'Simpan perubahan' : '＋ Tambah'}</button></div></div>
    ${byName ? '' : `<div class="tt-years">${['', ...years].map(y => `<button type="button" class="tt-y${y === exYear ? ' on' : ''}" data-ey="${y}">${y || 'Semua tahun'}</button>`).join('')}</div>`}
    <div class="tt-hero"><div class="tt-big"><b class="ex-big">${rupiah(total)}</b><span>total ${esc(M.label)}${exYear && !byName ? ' ' + exYear : ''}</span><small>${list.length} catatan</small></div></div>
    ${perName}
    <div><h3 class="tt-h">Semua catatan ${esc(M.label)}</h3>${list.map(w => `<div class="aw-row"><span>${w.date ? esc(fmtDate(w.date)) : '—'}</span><span class="aw-m"><i style="background:${M.color}"></i>${esc(w.name) || '-'}${w.note ? `<small>${esc(w.note)}</small>` : ''}</span><b>${rupiah(w.amount)}</b><span class="aw-b"><button type="button" class="btn-s" data-miedit="${w.id}" aria-label="Ubah">✎</button><button type="button" class="btn-s" data-midel="${w.id}" aria-label="Hapus">✕</button></span></div>`).join('') || '<div class="empty">Belum ada catatan.</div>'}</div>`;
}
$('misc').addEventListener('click', async e => {
  const q = s => e.target.closest(s), M = MISC.find(x => x.k === miscKind);
  if (q('[data-ey]')) { exYear = q('[data-ey]').dataset.ey; renderMisc(); renderExpense(); }
  else if (q('[data-misave]')) {
    const byName = miscByName(M.k), date = byName ? '' : $('mi-date').value, amount = Math.round(Number($('mi-amt').value) || 0);
    if (!byName && !date) return alert('Isi tanggalnya dulu.');
    if (M.member && !$('mi-name').value.trim()) return alert('Isi nama member yang di-gift.');
    if (amount <= 0) return alert('Isi jumlah pengeluarannya (lebih dari 0).');
    const rec = cleanMisc({ id: miscEdit || Date.now(), date, kind: miscKind, name: $('mi-name').value, amount, note: $('mi-note').value }), i = misc.findIndex(w => w.id === rec.id);
    if (i >= 0) misc[i] = rec; else misc.push(rec);
    if (rec.date) miscLast = rec.date; miscEdit = 0;
    saveMisc(); renderMisc(); renderExpense(); $('mi-amt').focus();
  } else if (q('[data-micancel]')) { miscEdit = 0; renderMisc(); }
  else if (q('[data-miedit]')) { miscEdit = Number(q('[data-miedit]').dataset.miedit); renderMisc(); $('mi-amt').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else if (q('[data-midel]')) {
    const id = Number(q('[data-midel]').dataset.midel), w = misc.find(x => x.id === id);
    if (w) {
      const at = misc.findIndex(x => x.id === id);
      misc = misc.filter(x => x.id !== id); if (miscEdit === id) miscEdit = 0; saveMisc(); renderMisc(); renderExpense();
      undoToast(`${M.label} ${w.name} ${rupiah(w.amount)}`, () => { if (!misc.some(x => x.id === id)) misc.splice(Math.min(at, misc.length), 0, w); saveMisc(); renderMisc(); renderExpense(); });
    }
  }
});
$('misc').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.aw-form input')) { e.preventDefault(); $('misc').querySelector('[data-misave]').click(); } });

// ---------- Away: pengeluaran saat fansfar (transportasi, penginapan, dll) ----------
const AWAY_CATS = [
  { c: 'Transportasi', color: '#60a5fa' }, { c: 'Penginapan', color: '#a78bfa' }, { c: 'Makan & minum', color: '#34d399' },
  { c: 'Belanja / merch', color: '#ffb347' }, { c: 'Lainnya', color: '#9a9aa4' }
];
const AWK = 'jkt48_away_v1';
const cleanAway = w => ({
  id: Number(w.id) || Date.now() + Math.floor(Math.random() * 1000), date: String(w.date || '').slice(0, 10), trip: String(w.trip || '').trim().slice(0, 80),
  cat: AWAY_CATS.some(x => x.c === w.cat) ? w.cat : 'Lainnya', amount: Math.max(0, Math.round(Number(w.amount) || 0)), note: String(w.note || '').trim().slice(0, 200)
});
let away = (() => { try { const s = JSON.parse(stor.getItem(AWK)); if (Array.isArray(s)) return s.map(cleanAway).filter(w => w.date); } catch (e) { } return []; })();
const saveAway = () => { try { stor.setItem(AWK, JSON.stringify(away)); } catch (e) { alert('Gagal menyimpan catatan Away (penyimpanan penuh?)'); } bumpDirty(); };
let awayEdit = 0, awayLast = { date: '', trip: '' }; // awayLast: tanggal & perjalanan terakhir, supaya input beruntun lebih cepat
offairMoved = moveOffair(); // pindahkan catatan off-air dari Away ke Off-Air (sekali jalan, aman diulang)

function renderAway() {
  const el = $('away');
  if (!el) return;
  const today = new Date().toISOString().slice(0, 10), sumA = a => a.reduce((s, w) => s + w.amount, 0), catColor = c => AWAY_CATS.find(x => x.c === c).color;
  const years = [...new Set(away.map(w => w.date.slice(0, 4)))].sort().reverse();
  const list = (exYear ? away.filter(w => w.date.startsWith(exYear)) : away).slice().sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id), total = sumA(list);
  const ed = away.find(w => w.id === awayEdit) || { date: awayLast.date || today, trip: awayLast.trip, cat: AWAY_CATS[0].c, amount: '', note: '' };
  const trips = [...new Set(away.map(w => w.trip).filter(Boolean))];
  const form = `<div class="aw-form">
    <label>Tanggal<input type="date" id="aw-date" value="${esc(ed.date)}"></label>
    <label>Perjalanan<input id="aw-trip" list="aw-trips" placeholder="mis. Surabaya, Yogyakarta" value="${esc(ed.trip)}" autocomplete="off"><datalist id="aw-trips">${trips.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
    <label>Kategori<select id="aw-cat">${AWAY_CATS.map(x => `<option${x.c === ed.cat ? ' selected' : ''}>${esc(x.c)}</option>`).join('')}</select></label>
    <label>Jumlah (Rp)<input type="number" id="aw-amt" min="0" step="1000" inputmode="numeric" placeholder="150000" value="${ed.amount}"></label>
    <label class="aw-wide">Catatan (opsional)<input id="aw-note" placeholder="mis. kereta PP, hotel 2 malam" value="${esc(ed.note)}" autocomplete="off"></label>
    <div class="aw-act">${awayEdit ? '<button type="button" class="btn-s" data-acancel="1">Batal</button>' : ''}<button type="button" class="btn" data-asave="1">${awayEdit ? 'Simpan perubahan' : '＋ Tambah pengeluaran'}</button></div></div>`;
  const catTot = AWAY_CATS.map(x => { const v = sumA(list.filter(w => w.cat === x.c)); return [x.color, v, x.c, rupiah(v)]; });
  const byTrip = {};
  list.forEach(w => { const k = w.trip || 'Tanpa nama perjalanan'; (byTrip[k] = byTrip[k] || []).push(w); });
  const tList = Object.entries(byTrip).map(([n, w]) => { const ds = w.map(x => x.date).sort(); return { n, w, t: sumA(w), d1: ds[0], d2: ds[ds.length - 1] }; }).sort((x, y) => y.d2.localeCompare(x.d2));
  const tMax = Math.max(1, ...tList.map(x => x.t));
  const tHtml = tList.map(x => `<div class="tt-r aw-t"><span class="nm">${esc(x.n)}<small>${esc(x.d1 === x.d2 ? fmtDate(x.d1) : fmtDate(x.d1) + ' – ' + fmtDate(x.d2))} · ${x.w.length} catatan</small></span>${stackBar(AWAY_CATS.map(c => { const v = sumA(x.w.filter(w => w.cat === c.c)); return [c.color, v, c.c, rupiah(v)]; }), tMax)}<span class="tot">${rupiah(x.t)}</span></div>`).join('');
  const rows = list.map(w => `<div class="aw-row"><span>${esc(fmtDate(w.date))}</span><span class="aw-m"><i style="background:${catColor(w.cat)}"></i>${esc(w.cat)}${w.trip ? ' · ' + esc(w.trip) : ''}${w.note ? `<small>${esc(w.note)}</small>` : ''}</span><b>${rupiah(w.amount)}</b><span class="aw-b"><button type="button" class="btn-s" data-aedit="${w.id}" aria-label="Ubah catatan">✎</button><button type="button" class="btn-s" data-adel="${w.id}" aria-label="Hapus catatan">✕</button></span></div>`).join('');
  el.innerHTML = `<p class="tt-note">Hanya terlihat di admin. Catat pengeluaran saat fansfar (transportasi, penginapan, makan, belanja, dll). Tiket show, 2-Shot, Chekicha, MNG, dan Video Call tidak perlu dicatat di sini karena sudah dihitung otomatis. Total Away ikut masuk ke sub-tab Ringkasan. <b>Disimpan di browser ini saja</b>: untuk membukanya di perangkat lain, unduh Backup lengkap (JSON) lalu Restore di sana.</p>
    ${form}
    <div class="tt-years">${['', ...years].map(y => `<button type="button" class="tt-y${y === exYear ? ' on' : ''}" data-ey="${y}">${y || 'Semua tahun'}</button>`).join('')}</div>
    <div class="tt-hero"><div class="tt-big"><b class="ex-big">${rupiah(total)}</b><span>total Away${exYear ? ' ' + exYear : ''}</span><small>${list.length} catatan · ${tList.filter(x => x.n !== 'Tanpa nama perjalanan').length} perjalanan</small></div>
      <div style="margin-top:14px">${stackBar(catTot, total)}</div>
      <div class="tt-legend">${catTot.filter(p => p[1]).map(p => `<span><i style="background:${p[0]}"></i>${esc(p[2])} ${p[3]} (${Math.round(p[1] / total * 100)}%)</span>`).join('') || '<span>Belum ada catatan</span>'}</div></div>
    ${tHtml ? `<div><h3 class="tt-h">Per perjalanan</h3>${tHtml}</div>` : ''}
    <div><h3 class="tt-h">Semua catatan</h3>${rows || '<div class="empty">Belum ada catatan Away.</div>'}</div>`;
}
$('away').addEventListener('click', async e => {
  const q = s => e.target.closest(s);
  const y = q('[data-ey]');
  if (y) { exYear = y.dataset.ey; renderAway(); renderExpense(); return; }
  if (q('[data-asave]')) {
    const date = $('aw-date').value, amount = Math.round(Number($('aw-amt').value) || 0);
    if (!date) return alert('Isi tanggalnya dulu.');
    if (amount <= 0) return alert('Isi jumlah pengeluarannya (lebih dari 0).');
    const rec = cleanAway({ id: awayEdit || Date.now(), date, trip: $('aw-trip').value, cat: $('aw-cat').value, amount, note: $('aw-note').value });
    const i = away.findIndex(w => w.id === rec.id);
    if (i >= 0) away[i] = rec; else away.push(rec);
    awayLast = { date: rec.date, trip: rec.trip }; awayEdit = 0;
    saveAway(); renderAway(); renderExpense(); $('aw-amt').focus();
  } else if (q('[data-acancel]')) { awayEdit = 0; renderAway(); }
  else if (q('[data-aedit]')) { awayEdit = Number(q('[data-aedit]').dataset.aedit); renderAway(); $('aw-date').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else if (q('[data-adel]')) {
    const id = Number(q('[data-adel]').dataset.adel), w = away.find(x => x.id === id);
    if (w) {
      const at = away.findIndex(x => x.id === id);
      away = away.filter(x => x.id !== id); if (awayEdit === id) awayEdit = 0;
      saveAway(); renderAway(); renderExpense();
      undoToast(`Away ${w.cat} ${rupiah(w.amount)}`, () => { if (!away.some(x => x.id === id)) away.splice(Math.min(at, away.length), 0, w); saveAway(); renderAway(); renderExpense(); });
    }
  }
});
$('away').addEventListener('keydown', e => { // Enter di kolom isian = simpan
  if (e.key === 'Enter' && e.target.closest('.aw-form input')) { e.preventDefault(); $('away').querySelector('[data-asave]').click(); }
});
document.querySelectorAll('.ex-t').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.ex-t').forEach(x => x.classList.toggle('on', x === b));
  const x = b.dataset.ext, isM = MISC.some(M => M.k === x);
  $('ex').hidden = x !== 'sum'; $('away').hidden = x !== 'away'; $('misc').hidden = !isM;
  if (isM) { miscKind = x; miscEdit = 0; renderMisc(); } else if (x === 'away') renderAway(); else renderExpense();
}));

// ---------- Sesi lepas: Chekicha / 2-Shot di luar menonton theater ----------
const SOLO_KEY = 'jkt48_solo_v1';
solo = (() => { try { const s = JSON.parse(stor.getItem(SOLO_KEY)); if (Array.isArray(s)) return s.map(sanitizeSolo).filter(w => w.date); } catch (e) { } return []; })();
const saveSolo = () => { try { stor.setItem(SOLO_KEY, JSON.stringify(solo)); } catch (e) { alert('Gagal menyimpan (penyimpanan penuh?). Unduh Backup lengkap dulu, lalu kurangi foto lama.'); } bumpDirty(); };
const soloKey = w => (w.kind === 'ck' ? 'ck_' : 'ts_') + (w.type === 'birthday' ? 'bday' : 'roulette');
const soloLabel = w => KINDS.find(k => k.k === w.kind).short[w.type];
// ---------- Foto 2-Shot event: pilih event dari data tiket, cukup unggah fotonya ----------
// semua tiket kategori 2S & MnG (festival M&G biasanya sudah termasuk 2-Shot walau namanya tidak menyebut), yang kalah undian disembunyikan
const tsEvTag = t => PKG.test(t.name) ? 'Paket M&G + 2-Shot' : /2[- ]?shot/i.test(t.name) ? '2-Shot' : /photocard/i.test(t.name) ? 'Photocard' : 'Meet & Greet';
const tsEvList = () => tickets.filter(t => t.type !== 'SHOW' && ['2S & MnG Event', '2S & MnG Theater Sementara'].includes(tcat(t)) && raffleOf(t.raffle) !== 'lose')
  .sort((a, b) => b.date.localeCompare(a.date) || (b.start || '').localeCompare(a.start || '') || (a.member || '').localeCompare(b.member || ''));
let tsevFilter = 'all';
function saveTickets() {
  try { stor.setItem(KEY + '_tickets', JSON.stringify(tickets)); } catch (e) { alert('Gagal menyimpan foto (penyimpanan penuh?). Unduh Backup lengkap dulu, lalu kurangi foto lama.'); }
  bumpDirty();
}
function renderTsEv() {
  const el = $('tsev');
  if (!el) return;
  const all = tsEvList(), done = all.filter(t => t.photo).length;
  const list = tsevFilter === 'todo' ? all.filter(t => !t.photo) : tsevFilter === 'ts' ? all.filter(t => /2[- ]?shot/i.test(t.name)) : all;
  el.innerHTML = `<div class="tsev-h"><h3 class="tt-h" style="margin:0">Foto 2-Shot Event · ${done}/${all.length} sudah ada foto</h3>
    <select id="tsev-f" aria-label="Filter"><option value="all"${tsevFilter === 'all' ? ' selected' : ''}>Semua event</option><option value="todo"${tsevFilter === 'todo' ? ' selected' : ''}>Belum ada foto</option><option value="ts"${tsevFilter === 'ts' ? ' selected' : ''}>Yang bernama 2-Shot saja</option></select></div>
    <p class="tt-note" style="margin:0 0 8px">Semua tiket kategori 2-Shot &amp; Meet &amp; Greet ditampilkan (festival M&amp;G biasanya sudah termasuk 2-Shot). Tanggal, member, dan nama event diambil dari data tiket. Tinggal unggah fotonya; foto langsung muncul di tab Galeri setelah dipublikasikan.</p>
    ${list.map(t => `<div class="tsev-row">${t.photo ? `<img src="${esc(t.photo)}" alt="Foto" data-photo>` : '<span class="so-ph"></span>'}
      <span><b>${esc(t.member) || '-'}</b><small>${esc(fmtDate(t.date))}${t.start ? ' · ' + esc(t.start) : ''}${t.session ? ' · ' + esc(t.session) : ''}</small><small>${esc(tname(t))} · <i>${tsEvTag(t)}</i></small></span>
      <span class="aw-b"><label class="btn-s tsev-up">${t.photo ? 'Ganti foto' : 'Unggah foto'}<input type="file" accept="image/*" data-tkfile="${esc(tkey(t))}" aria-label="Unggah foto"></label>${t.photo ? `<button type="button" class="btn-s" data-tkrm="${esc(tkey(t))}">Hapus foto</button>` : ''}</span></div>`).join('') || `<div class="empty">${all.length ? 'Semua event sudah punya foto ' : 'Belum ada tiket 2-Shot. Impor tiket dulu di tab Total Tiket.'}</div>`}`;
}
$('tsev').addEventListener('change', async e => {
  if (e.target.id === 'tsev-f') { tsevFilter = e.target.value; return renderTsEv(); }
  const key = e.target.dataset.tkfile, file = e.target.files && e.target.files[0];
  if (!key || !file) return;
  const t = tickets.find(x => tkey(x) === key);
  if (!t) return;
  try { t.photo = await compress(file); } catch (err) { return alert(err.message); }
  saveTickets(); renderTsEv();
});
$('tsev').addEventListener('click', async e => {
  const b = e.target.closest('[data-tkrm]');
  if (!b) return;
  const t = tickets.find(x => tkey(x) === b.dataset.tkrm);
  if (t && t.photo) {
    const old = t.photo;
    t.photo = ''; saveTickets(); renderTsEv();
    toast('Foto dihapus', { label: 'Urungkan', fn: () => { if (!t.photo) { t.photo = old; saveTickets(); renderTsEv(); } } }, 6500);
  }
});

let soloEdit = 0, soloPhoto = '', soloDraft = null;
const soloForm = () => ({ date: $('so-date').value, kind: $('so-kind').value, type: $('so-type').value, member: $('so-member').value.trim(), setlist: $('so-setlist').value.trim(), note: $('so-note').value.trim() });
function renderSolo() {
  const el = $('solo');
  if (!el) return;
  const today = new Date().toISOString().slice(0, 10), ed = soloDraft || solo.find(w => w.id === soloEdit) || { date: today, kind: 'ck', type: 'roulette', member: '', setlist: '', note: '' };
  const members = [...new Set([...records.flatMap(r => [r.member, r.ckMember]), ...tickets.map(t => t.member), ...solo.map(w => w.member)].filter(Boolean))].sort();
  const setlists = [...new Set([...records.map(r => r.setlist), ...tickets.filter(t => t.type === 'SHOW').map(t => t.name)].filter(Boolean))].sort();
  const price = w => priceOf(soloKey(w), (w.date || today).slice(0, 7));
  const list = solo.slice().sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id), total = list.reduce((s, w) => s + price(w), 0);
  const opt = (v, l, cur) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`;
  el.innerHTML = `<p class="tt-note">Catat Chekicha atau 2-Shot yang kamu lakukan <b>di luar menonton theater</b> (di tanggal show, tapi tidak sedang nonton). Yang dicatat di sini ikut tampil di Galeri publik dan di jumlah 2-Shot / Chekicha, dan harganya otomatis masuk ke Pengeluaran. Chekicha yang kamu lakukan saat menonton tetap dicatat di riwayat show. Setlist hari itu opsional: kalau diisi, tetap tercantum di keterangan foto bersama tanda "di luar show".</p>
    <div class="aw-form">
      <label>Tanggal<input type="date" id="so-date" value="${esc(ed.date)}"></label>
      <label>Jenis<select id="so-kind">${opt('ck', 'Chekicha', ed.kind)}${opt('ts', '2-Shot', ed.kind)}</select></label>
      <label>Tipe<select id="so-type">${opt('roulette', 'Roulette', ed.type)}${opt('birthday', 'Birthday', ed.type)}</select></label>
      <label>Member<input id="so-member" list="so-members" placeholder="Nama member" value="${esc(ed.member)}" autocomplete="off"><datalist id="so-members">${members.map(m => `<option value="${esc(m)}">`).join('')}</datalist></label>
      <label class="aw-wide">Setlist hari itu (opsional)<input id="so-setlist" list="so-setlists" placeholder="terisi otomatis kalau ada show di tanggal itu" value="${esc(ed.setlist || '')}" autocomplete="off"><datalist id="so-setlists">${setlists.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
      <label class="aw-wide">Foto (opsional)<input type="file" id="so-file" accept="image/*">${soloPhoto ? `<span class="so-prev"><img src="${soloPhoto}" alt="Pratinjau foto"><button type="button" class="btn-s" data-sorm="1">Hapus foto</button></span>` : ''}</label>
      <label class="aw-wide">Catatan (opsional)<input id="so-note" placeholder="mis. event, momen, hasil foto" value="${esc(ed.note || '')}" autocomplete="off"></label>
      <div class="aw-act"><span class="tt-note" id="so-price" style="margin-right:auto"></span>${soloEdit ? '<button type="button" class="btn-s" data-socancel="1">Batal</button>' : ''}<button type="button" class="btn" data-sosave="1">${soloEdit ? 'Simpan perubahan' : '＋ Tambah'}</button></div></div>
    <div><h3 class="tt-h">Semua sesi lepas · ${list.length} sesi · ${rupiah(total)}</h3>${list.map(w => `<div class="so-row">${w.photo ? `<img src="${esc(w.photo)}" alt="Foto" data-photo>` : '<span class="so-ph"></span>'}<span><b>${esc(soloLabel(w))}</b>${w.member ? ' dengan ' + esc(w.member) : ''}<small>${esc(fmtDate(w.date))}${w.setlist ? ' · ' + esc(w.setlist) : ''}${w.note ? ' · ' + esc(w.note) : ''}</small></span><b class="so-p">${rupiah(price(w))}</b><span class="aw-b"><button type="button" class="btn-s" data-soedit="${w.id}" aria-label="Ubah">✎</button><button type="button" class="btn-s" data-sodel="${w.id}" aria-label="Hapus">✕</button></span></div>`).join('') || '<div class="empty">Belum ada sesi lepas.</div>'}</div>`;
  soloPrice();
}
function soloPrice() { // harga otomatis menurut jenis, tipe, dan bulan
  const el = $('so-price'), f = soloForm();
  if (el && f.date) el.textContent = `Harga otomatis: ${rupiah(priceOf(soloKey(f), f.date.slice(0, 7)))} (${soloLabel(f)})`;
}
$('solo').addEventListener('change', async e => {
  if (e.target.id === 'so-file') {
    const file = e.target.files[0];
    if (!file) return;
    soloDraft = soloForm();
    try { soloPhoto = await compress(file); } catch (err) { alert(err.message); }
    renderSolo();
  } else if (['so-date', 'so-kind', 'so-type'].includes(e.target.id)) {
    if (e.target.id === 'so-date' && !$('so-setlist').value) { // isi setlist otomatis dari show / tiket pada tanggal itu
      const d = $('so-date').value, hit = records.find(r => r.date === d) || tickets.find(t => t.type === 'SHOW' && t.date === d);
      if (hit) $('so-setlist').value = hit.setlist || hit.name;
    }
    soloPrice();
  }
});
$('solo').addEventListener('click', async e => {
  const q = s => e.target.closest(s);
  if (q('[data-sorm]')) { soloDraft = soloForm(); soloPhoto = ''; renderSolo(); }
  else if (q('[data-sosave]')) {
    const f = soloForm();
    if (!f.date) return alert('Isi tanggalnya dulu.');
    const rec = sanitizeSolo({ id: soloEdit || Date.now(), ...f, photo: soloPhoto }, 0), i = solo.findIndex(w => w.id === rec.id);
    if (i >= 0) solo[i] = rec; else solo.push(rec);
    soloEdit = 0; soloPhoto = ''; soloDraft = null;
    saveSolo(); renderSolo(); renderExpense();
  } else if (q('[data-socancel]')) { soloEdit = 0; soloPhoto = ''; soloDraft = null; renderSolo(); }
  else if (q('[data-soedit]')) {
    const w = solo.find(x => x.id === Number(q('[data-soedit]').dataset.soedit));
    if (!w) return;
    soloEdit = w.id; soloPhoto = w.photo; soloDraft = { date: w.date, kind: w.kind, type: w.type, member: w.member, setlist: w.setlist, note: w.note };
    renderSolo(); $('so-date').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (q('[data-sodel]')) {
    const id = Number(q('[data-sodel]').dataset.sodel), w = solo.find(x => x.id === id);
    if (w) {
      const at = solo.findIndex(x => x.id === id);
      solo = solo.filter(x => x.id !== id); if (soloEdit === id) { soloEdit = 0; soloPhoto = ''; soloDraft = null; }
      saveSolo(); renderSolo(); renderExpense();
      undoToast(`${soloLabel(w)} ${fmtDate(w.date)}`, () => { if (!solo.some(x => x.id === id)) solo.splice(Math.min(at, solo.length), 0, w); saveSolo(); renderSolo(); renderExpense(); });
    }
  }
});

// ---------- Init ----------
renderAll(); renderBackup();
requestAnimationFrame(centerChart);
window.Splash && Splash.mark('ready'); // layar muat (assets/js/splash.js) menutup sendiri setelah tampil minimal sebentar
