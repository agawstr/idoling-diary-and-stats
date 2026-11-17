/* assets/js/shared/subtabs.js — Sub-tab Peta/Ringkasan/Grafik/Member (HP/tablet)
   Bagian dari kode bersama index.html & admin.html (dulu satu file shared.js). Dimuat berurutan sebagai skrip klasik
   (satu lingkup global yang sama); urutan muat ada di index.html dan admin.html dan diperiksa oleh scripts/check_assets.py. */
// ================= Sub-tab tab Peta & Statistik (HP / tablet; di laptop dua kolom, chip disembunyikan lewat CSS) =================
// Satu bagian tampil sekali waktu (Peta / Ringkasan / Grafik / Member): halaman jauh lebih pendek dan ringan.
(() => {
  const view = $('view-main'), first = document.querySelector('#legend + h2.sec');
  if (!view) return;
  if (first) first.id = 'ch-h';
  const J = [['Peta', 'map'], ['Ringkasan', 'sum'], ['Grafik', 'chart'], ['Member', 'mem']];
  // tandai tiap anak langsung view dengan bagiannya (urutan DOM: ringkasan -> filter+peta+legenda -> grafik -> member)
  let part = 'sum';
  [...view.children].forEach(k => {
    if (k.id === 'filters') part = 'map';
    if (k.id === 'mem-sec') part = 'mem';
    k.dataset.s = part;
    if (k.id === 'legend') part = 'chart';
  });
  const qs = new URLSearchParams(location.search).get('sec');
  let cur = J.some(([, k]) => k === qs) ? qs : 'map';
  const nav = document.createElement('nav');
  nav.id = 'jump'; nav.className = 'jump'; nav.setAttribute('aria-label', 'Bagian halaman');
  nav.innerHTML = J.map(([t], i) => `<button type="button" class="btn-s" data-j="${i}">${t}</button>`).join('');
  view.prepend(nav);
  const btns = [...nav.children];
  const inSplit = () => !!view.querySelector(':scope > #split');
  const paint = () => {
    view.dataset.sec = cur;
    btns.forEach((b, i) => { const on = J[i][1] === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); on ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current'); });
  };
  paint();
  function setSec(k) {
    if (k === cur || inSplit()) return;
    cur = k; paint();
    // mulai dari atas bagian baru (tepat di bawah chip yang menempel)
    const y = view.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(nav).top) || 0) - 12;
    if (scrollY > y) scrollTo({top: Math.max(0, y), behavior: 'instant'});
    if (k === 'map' && typeof centerChart === 'function') requestAnimationFrame(centerChart); // peta baru terlihat: ukur ulang
    if (!calm()) [...view.children].filter(e => e.dataset.s === k && e.offsetHeight).slice(0, 6).forEach((el, i) => el.animate([{opacity: 0, transform: 'translate3d(0,10px,0)'}, {opacity: 1, transform: 'none'}], {duration: 320, delay: i * 30, easing: lbEase, fill: 'backwards'}));
    dispatchEvent(new Event('scroll')); // panel kaca di belakang chip menghitung ulang
  }
  nav.addEventListener('click', e => { const b = e.target.closest('[data-j]'); if (b) setSec(J[b.dataset.j][1]); });
  // aksi yang efeknya ada di peta (filter dari grafik / kalender, "Sorot yang belum"): pindah ke Peta supaya hasilnya terlihat
  view.addEventListener('click', e => {
    if (e.target.closest('#cov-btn')) { setTimeout(() => setSec('map'), 0); return; }
    if (!e.target.closest('#sl-chart,#rchart,#cal')) return;
    const f0 = JSON.stringify(filter);
    setTimeout(() => { if (JSON.stringify(filter) !== f0) setSec('map'); }, 0);
  }, true);
  let raf = 0;
  const mb = $('mem-bar');
  const scroller = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowY; if (o === 'auto' || o === 'scroll') return e; } return null; };
  const stuckOf = el => { // menempel = tepinya sudah sampai batas atas wadah gulir (halaman, atau kolom kanan di laptop)
    if (!el || !el.offsetHeight) return false;
    const sc = scroller(el), base = sc ? sc.getBoundingClientRect().top : 0;
    return el.getBoundingClientRect().top <= base + (parseFloat(getComputedStyle(el).top) || 0) + 1;
  };
  const mark = () => {
    raf = 0;
    if (mb) mb.classList.toggle('stuck', stuckOf(mb)); // latar baru muncul saat bar benar-benar menempel
    nav.classList.toggle('stuck', stuckOf(nav));
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(mark); }, {passive: true, capture: true}); // capture: kolom kanan laptop menggulung sendiri
  addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(mark); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(mark); }).observe(view); // layout berpindah (satu kolom <-> dua kolom)
  mark(); setTimeout(mark, 800); setTimeout(mark, 3000);
})();

// HP: panel kaca tunggal di belakang chip lompat + bar cari (tinggi mengikuti baris yang sedang menempel)
(() => {
  const root = document.documentElement, mq = matchMedia('(max-width:768px)'), touchTab = matchMedia('(min-width:769px) and (hover:none) and (pointer:coarse)');
  const bg = document.body.appendChild(Object.assign(document.createElement('div'), {id: 'bars-bg', ariaHidden: 'true'}));
  let raf = 0, on = false, isWide = false;
  // posisi nempel yang sebenarnya (px): ambil dari `top` terhitung milik chip, bukan dari --stick (nilai calc(env()) tidak bisa di-parseFloat)
  const stickPx = () => { const j = document.querySelector('.jump'); return j ? (parseFloat(getComputedStyle(j).top) || 0) : 0; };
  const sync = () => {
    raf = 0;
    const j = document.querySelector('.jump'), m = $('mem-bar');
    let show = false;
    if (gone()) return;
    let wide = false;
    if (j && j.offsetHeight) {
      const st = stickPx(), jh = j.offsetHeight, vw = root.clientWidth;
      root.style.setProperty('--jh', jh + 'px');
      if (j.getBoundingClientRect().top <= st + .5) {
        show = true;
        const hasM = m && !m.hidden, mr = hasM ? m.getBoundingClientRect() : null;
        wide = !!(hasM && mr.top <= st + jh + .5); // bar cari ikut menempel -> panel melebar & menyatu
        let L, W, T = st, H = jh, R = '26px';
        if (!wide) { // hanya chip: panel ramping, pinggirannya dekat Ringkasan & Member
          const bs = j.querySelectorAll('.btn-s');
          if (bs.length) {
            const a = bs[0].getBoundingClientRect(), z = bs[bs.length - 1].getBoundingClientRect(), pad = 12;
            L = Math.max(8, a.left - pad); W = Math.min(vw - 8, z.right + pad) - L;
          } else { const r = j.getBoundingClientRect(); L = r.left; W = r.width; }
          H = mq.matches ? jh - 2 : jh + 2;
          if (mq.matches) T = st + 4; // HP: kartu melayang, ada jarak tipis dari header
        } else {
          H = Math.max(jh, mr.bottom - st);
          if (mq.matches) { L = 8; W = vw - 16; T = st + 4; H -= 4; R = '24px'; } // HP: kartu kaca melengkung semua sisi, lebar layar dikurangi 8px kiri-kanan
          else if (touchTab.matches) { L = 0; W = vw; T = 0; H += st; R = '0 0 28px 28px'; }
          else { L = mr.left - 10; W = mr.width + 20; R = '22px'; }
        }
        if (!on) bg.style.transition = 'none'; // baru muncul: pasang ukuran langsung (tanpa meluncur dari ukuran lama), lalu fade/skala masuk
        const set = (k, v) => bg.style.setProperty(k, v);
        set('--bl', Math.round(L) + 'px'); set('--bw', Math.round(W) + 'px'); set('--bt', Math.round(T) + 'px');
        set('--bh', Math.round(H) + 'px'); set('--br', R);
        if (!on) { void bg.offsetWidth; bg.style.transition = ''; }
      }
    }
    if (wide !== isWide) { isWide = wide; root.classList.toggle('bars-wide', wide); }
    root.classList.toggle('bars-wide', wide && !mq.matches); // header HP tetap melengkung sendiri (tidak menyatu)
    if (show !== on) { on = show; root.classList.toggle('bars-on', show); }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(sync); };
  addEventListener('scroll', kick, {passive: true});
  addEventListener('resize', kick);
  mq.addEventListener('change', kick); touchTab.addEventListener('change', kick);
  // pindah tab: Peta & Statistik disembunyikan -> panel kaca harus ikut hilang (sebelumnya baru dicek saat menggulir, jadi tertinggal di tab lain)
  const vm = $('view-main');
  // tab Peta & Statistik disembunyikan: panel hilang SEKETIKA (tanpa fade), sebelum frame berikutnya digambar
  const gone = () => { const g = !!(vm && vm.hidden); root.classList.toggle('bars-kill', g); if (g && (on || isWide)) { on = isWide = false; root.classList.remove('bars-on', 'bars-wide'); } return g; };
  if (vm && window.MutationObserver) new MutationObserver(() => { gone(); kick(); }).observe(vm, {attributes: true, attributeFilter: ['hidden', 'class', 'style']});
  document.addEventListener('click', e => { if (e.target.closest('.tab')) { setTimeout(gone, 0); kick(); setTimeout(kick, 120); setTimeout(kick, 480); } }, true);
  addEventListener('hashchange', kick); addEventListener('pageshow', kick);
  sync(); setTimeout(sync, 600);
})();
