/* admin-storage.js — penyimpanan admin: IndexedDB dengan antarmuka seperti localStorage (const stor).
   Dimuat sebagai skrip klasik; setelah stor.ready selesai, admin-main.js dimuat. */
// ---------- Penyimpanan: IndexedDB (kuota besar) dengan antarmuka sama seperti localStorage ----------
// Data dibaca sekali ke memori, lalu setiap perubahan ditulis ke IndexedDB di belakang layar.
// Data lama di localStorage otomatis dipindah (hanya kunci "jkt48*"), lalu salinan lamanya dihapus.
const stor = (() => {
  const mem = new Map();
  let db = null, pending = 0, warned = false, hideT = 0;
  // lencana kecil: "Menyimpan…" selama ada penulisan yang belum selesai, lalu "Tersimpan"
  const badge = (txt, cls) => { let b = document.getElementById('stor-badge'); if (!b) { b = document.createElement('div'); b.id = 'stor-badge'; b.setAttribute('role', 'status'); b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;padding:6px 12px;border-radius:999px;font:600 12px system-ui,sans-serif;background:#1b1116;border:1px solid #3a2530;color:#e4e4e7;pointer-events:none'; document.body.appendChild(b); } clearTimeout(hideT); b.textContent = txt; b.style.color = cls === 'err' ? '#fca5a5' : cls === 'ok' ? '#86efac' : '#fde68a'; b.hidden = false; if (cls === 'ok') hideT = setTimeout(() => { b.hidden = true; }, 1800); };
  const warn = e => { badge('Gagal menyimpan', 'err'); if (!warned) { warned = true; alert('Gagal menyimpan ke penyimpanan browser (' + (e && e.message || e) + '). Unduh Backup lengkap (JSON) sekarang supaya data aman.'); } };
  // transaksi dibuka saat itu juga (tidak antre), supaya tetap diselesaikan browser walau halaman langsung di-refresh
  const write = fn => {
    let t;
    pending++; badge('Menyimpan…', 'wait');
    try { t = db.transaction('kv', 'readwrite'); fn(t.objectStore('kv')); } catch (e) { pending--; warn(e); return; }
    t.oncomplete = () => { if (--pending === 0) badge('✓ Tersimpan', 'ok'); };
    t.onerror = t.onabort = () => { pending--; warn(t.error); };
  };
  window.addEventListener('beforeunload', e => { if (pending > 0) { e.preventDefault(); e.returnValue = ''; } });
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel('jkt48_admin') : null;
  const tell = () => { try { chan && chan.postMessage('changed'); } catch (e) { /* abaikan */ } };
  if (chan) chan.onmessage = () => { // tab lain mengubah data: tab ini sekarang usang, jangan sampai menimpa
    if (document.getElementById('stale-bar')) return;
    const b = document.createElement('div'); b.id = 'stale-bar'; b.setAttribute('role', 'alert');
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;padding:10px 14px;background:#7c2d12;color:#fff;font:600 13px system-ui,sans-serif;text-align:center';
    b.innerHTML = 'Data diubah di tab lain. <button type="button" style="margin-left:8px;padding:4px 10px;border-radius:8px;border:0;font-weight:700">Muat ulang</button>';
    b.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(b);
  };
  const api = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem(k, v) {
      v = String(v); mem.set(k, v);
      if (db) { write(st => st.put(v, k)); tell(); }
      else window.localStorage.setItem(k, v); // cadangan bila IndexedDB tidak tersedia: perilaku lama (bisa melempar error saat penuh)
    },
    removeItem(k) { mem.delete(k); if (db) { write(st => st.delete(k)); tell(); } else window.localStorage.removeItem(k); },
    mode: 'localStorage',
    ready: (async () => {
      try {
        db = await new Promise((res, rej) => { const r = indexedDB.open('jkt48_admin', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        await new Promise((res, rej) => { const c = db.transaction('kv').objectStore('kv').openCursor(); c.onsuccess = () => { const x = c.result; if (x) { mem.set(x.key, x.value); x.continue(); } else res(); }; c.onerror = () => rej(c.error); });
        // migrasi dari localStorage: salin dulu, hapus salinan lama hanya setelah tertulis di IndexedDB
        const old = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('jkt48') && !mem.has(k)) old.push(k); }
        for (const k of old) { const v = localStorage.getItem(k); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); }); mem.set(k, v); localStorage.removeItem(k); }
        api.mode = 'indexedDB';
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      } catch (e) {
        console.error('IndexedDB tidak tersedia, memakai localStorage', e);
        db = null; mem.clear();
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('jkt48')) mem.set(k, localStorage.getItem(k)); }
      }
    })()
  };
  return api;
})();
// halaman utama dijalankan setelah penyimpanan siap (data sudah ada di memori)
stor.ready.then(() => { const s = document.createElement('script'); s.src = 'assets/js/admin-main.js'; document.body.appendChild(s); });
