#!/usr/bin/env python3
"""Test tambahan (Playwright + Chromium headless) untuk hal yang tidak dicakup smoke/layout/lineup test:

  1. Keamanan : data.json tidak memuat harga/kode transaksi; halaman publik membuang harga walau datanya ada
  2. Offline  : service worker aktif, foto ter-cache, halaman tetap jalan saat offline + indikator offline
  3. Jaringan lambat : shell memakai salinan cache setelah NET_TIMEOUT, tidak menunggu server yang macet
  4. Performa : splash cepat saat sudah ada cache; tidak ada unduhan ganda file aset di sesi yang dikendalikan SW
  5. Logika murni : tally/seatTie, lotteryStats, normSeat, tanggal perbandingan periode
  6. Aksesibilitas dasar : semua tombol bernama, semua gambar beralt, target sentuh minimum

Jalankan lokal:  pip install playwright && playwright install chromium
                 python scripts/extra_test.py
"""
import collections, http.server, json, re, socketserver, sys, tempfile, threading, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
fails = []


def check(ok, msg):
    print(("ok     " if ok else "ERROR  ") + msg)
    if not ok:
        fails.append(msg)


# ---------- server uji: menghitung request dan bisa dibuat lambat untuk path tertentu ----------
hits = collections.Counter()
slow = {}  # path -> detik tunda
flags = {'nostore': False}  # True: server melarang cache supaya cache memori Chromium tidak melewati service worker


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def log_message(self, *a, **k):
        pass

    def end_headers(self):
        if flags['nostore']:
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        hits[path] += 1
        if path in slow:
            time.sleep(slow[path])
        try:
            super().do_GET()
        except (BrokenPipeError, ConnectionResetError):
            pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


srv = Server(("127.0.0.1", 0), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{srv.server_port}"
URL = BASE + "/index.html"

data = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
sw_src = (ROOT / "sw.js").read_text(encoding="utf-8")
VERSION = re.search(r"const VERSION = '([^']+)'", sw_src).group(1)
PHOTO = re.search(r"const PHOTO_CACHE = '([^']+)'", sw_src).group(1)
photo_refs = set()


def walk(o):
    if isinstance(o, str):
        if re.fullmatch(r"photos/[\w.-]+", o):
            photo_refs.add(o)
    elif isinstance(o, list):
        [walk(x) for x in o]
    elif isinstance(o, dict):
        [walk(x) for x in o.values()]


walk(data)

# ============ 1. Keamanan: file data ============
recs = data["records"]
check(all(not r.get("harga") for r in recs), f"data.json: tidak ada harga tiket di {len(recs)} record")
check(not any("tx" in t and t["tx"] for t in data["tickets"]), "data.json: tidak ada kode transaksi (tx) di tiket")
check(not ({"away", "misc", "prices"} & set(data)), "data.json: tidak ada bagian khusus backup lokal")

with sync_playwright() as p:
    b = p.chromium.launch()

    # ============ 2. Offline + service worker ============
    # profil persisten: SW + cache bertahan walau browser ditutup-dibuka lagi (dipakai di tes jaringan lambat)
    profile = tempfile.mkdtemp(prefix="idoling-pw-")
    MOB = dict(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    ctx = p.chromium.launch_persistent_context(profile, **MOB)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL)
    pg.evaluate("navigator.serviceWorker.ready.then(() => true)")
    pg.wait_for_timeout(1200)
    want = len(photo_refs) * 2  # foto penuh + thumbnail
    got = 0
    for _ in range(60):  # maks 30 dtk menunggu pra-unduh foto di background
        got = pg.evaluate(f"caches.open('{PHOTO}').then(c => c.keys()).then(k => k.length)")
        if got >= want:
            break
        pg.wait_for_timeout(500)
    check(got >= want, f"SW: semua foto (thumbnail + penuh) ter-cache otomatis ({got}/{want})")
    check(pg.evaluate(f"caches.has('shell-{VERSION}')"), f"SW: cache shell-{VERSION} ada")

    # leak di sisi halaman publik: walau data berisi harga, halaman membuangnya
    leak = pg.evaluate("sanitize({seat:'A-5', date:'2026-01-01', harga: 150000, tiket:'Reguler'}).harga")
    check(leak == 0, f"halaman publik membuang harga dari data mentah (harga -> {leak})")

    # muat ulang agar SW mengendalikan halaman, lalu hitung unduhan aset
    pg.reload(); pg.wait_for_timeout(1500)
    check(pg.evaluate("!!navigator.serviceWorker.controller"), "SW mengendalikan halaman setelah muat ulang")
    hits.clear()
    pg.reload(); pg.wait_for_timeout(2500)
    js_hits = {k: v for k, v in hits.items() if k.startswith("/assets/js/") or k.startswith("/assets/css/")}
    check(all(v <= 1 for v in js_hits.values()), f"tidak ada unduhan ganda file aset saat SW aktif {dict((k, v) for k, v in js_hits.items() if v > 1) or ''}")
    check(hits["/data.json"] <= 2, f"data.json diminta maksimal sekali oleh halaman + sekali oleh SW ({hits['/data.json']}x)")

    # splash cepat ketika salinan data sudah ada (kunjungan kedua)
    t0 = time.time()
    pg.goto(URL, wait_until="commit")
    pg.wait_for_function("!document.getElementById('splash')", timeout=8000)
    dt_splash = time.time() - t0
    check(dt_splash < 2.2, f"splash menutup < 2,2 dtk saat sudah ada cache ({dt_splash:.2f} dtk)")

    # offline
    pg.wait_for_timeout(500)
    ctx.set_offline(True)
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(3200)
    seats = pg.evaluate("document.querySelectorAll('.seat').length")
    check(seats == 250, f"OFFLINE: peta tetap tergambar ({seats} kursi)")
    st = pg.evaluate("document.getElementById('status').textContent")
    check("offline" in st.lower(), f"OFFLINE: ada indikator offline yang jelas -> {st!r}")
    pg.click(".tab[data-tab=gal]"); pg.wait_for_timeout(1500)
    ok_imgs = pg.evaluate("[...document.querySelectorAll('#gallery img')].filter(i => i.complete && i.naturalWidth > 0).length")
    check(ok_imgs > 0, f"OFFLINE: foto galeri tampil dari cache ({ok_imgs} gambar)")
    pg.click(".tab[data-tab=tl]"); pg.wait_for_timeout(800)
    check(pg.evaluate("document.querySelectorAll('#timeline .tl-card, #timeline [data-seat], #timeline button').length") > 0, "OFFLINE: riwayat tampil")
    ctx.set_offline(False)
    pg.wait_for_timeout(1500)
    st2 = pg.evaluate("document.getElementById('status').textContent")
    check("offline" not in st2.lower(), f"kembali online: indikator offline hilang -> {st2!r}")
    check(not errs, f"tanpa error JS selama skenario SW/offline {errs[:2] or ''}")

    # ============ 3. Jaringan lambat ============
    # Browser ditutup-dibuka lagi: renderer baru tidak punya cache memori, jadi request aset pasti lewat SW. SW + Cache Storage tetap ada.
    ctx.close()
    ctx = p.chromium.launch_persistent_context(profile, **MOB)
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    flags["nostore"] = True
    slow["/assets/css/app.css"] = 5.0
    hits.clear()
    t0 = time.time()
    pg.goto(URL, wait_until="load")
    dt_slow = time.time() - t0
    check(hits["/assets/css/app.css"] >= 1, f"JARINGAN LAMBAT: jalur server lambat benar-benar terkena ({hits['/assets/css/app.css']} request)")
    check(3.3 <= dt_slow < 4.6, f"JARINGAN LAMBAT: SW menunggu NET_TIMEOUT (~3,5 dtk) lalu memakai cache, tidak menunggu 5 dtk ({dt_slow:.2f} dtk)")
    pg.wait_for_timeout(1500)
    check(pg.evaluate("document.querySelectorAll('.seat').length") == 250, "JARINGAN LAMBAT: peta tetap tergambar dari salinan cache")
    slow.clear(); flags["nostore"] = False
    ctx.close()

    # ============ 4. Logika murni + aksesibilitas dasar (SW diblokir supaya deterministik) ============
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, service_workers="block")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(2600)

    R = lambda js: pg.evaluate(js)
    check(R("normSeat('a 05')") == "A-5" and R("normSeat('J-23')") == "J-23", "normSeat menormalkan 'a 05' -> A-5")
    check(R("fmtDate('2026-09-25')") == "25 Sep 2026", "fmtDate memformat tanggal Indonesia")
    check(R("raffleOf('WIN')") == "win" and R("raffleOf('LOST')") == "lose" and R("raffleOf('')") == "", "raffleOf memetakan status lotre")
    check(R("tally([{s:'B-3'},{s:'B-9'}], r => r.s, seatTie)[0]") == "B-9", "tie-break kursi favorit: nomor paling kanan menang")
    check(R("tally([{s:'B-3'},{s:'A-3'}], r => r.s, seatTie)[0]") == "A-3", "tie-break kursi favorit: baris paling depan menang")
    check(R("tally([{s:'B-3'},{s:'B-3'},{s:'A-1'}], r => r.s, seatTie)[1]") == 2, "tally menghitung jumlah tertinggi")
    ls = R("(() => { const s = lotteryStats([{type:'SHOW',raffle:'WIN'},{type:'SHOW',raffle:'LOSE'},{type:'SHOW',raffle:''},{type:'EXCLUSIVE',raffle:''}]); return {w:s.win,l:s.lose,i:s.inferred,t:s.total,p:Math.round(s.pct*10)/10}; })()")
    check(ls == {"w": 2, "l": 1, "i": 1, "t": 3, "p": 66.7}, f"lotteryStats: menang diperkirakan, EXCLUSIVE tidak dihitung -> {ls}")
    check(R("autoCat({name:'JKT48 Video Call - 12th Mar', type:'EVENT'})") == "Video Call", "autoCat mengenali Video Call")
    check(R("cmpAdd('2026-01-31', 1)") == "2026-02-01", "cmpAdd lintas bulan")
    check(R("cmpDays('2026-01-01', '2026-01-31')") == 31, "cmpDays menghitung kedua ujung")
    check(R("[cmpLast(2026, 2), cmpLast(2028, 2)]") == [28, 29], "cmpLast: Februari biasa dan kabisat")

    # aksesibilitas dasar di semua tab
    NAME_JS = """() => [...document.querySelectorAll('button, [role=button], a[href], select, input:not([type=hidden])')]
      .filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden')
      .filter(e => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || (e.textContent || '').trim() ||
                     (e.labels && e.labels.length) || e.getAttribute('placeholder') || e.id && document.querySelector('label[for=' + e.id + ']')))
      .map(e => e.tagName + '.' + e.className).slice(0, 6)"""
    IMG_JS = "() => [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).map(i => i.className || i.src.slice(-30)).slice(0, 6)"
    TAP_JS = """() => [...document.querySelectorAll('button, [role=button], a[href], select')]
      .filter(e => !e.closest('.seat, #chart') && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden')
      .filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e, '::after'); const slop = cs.content !== 'none' && cs.position === 'absolute' ? 1 : 0; return !slop && Math.min(r.width, r.height) < 28; })
      .map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)).slice(0, 8)"""
    unnamed, noalt, tiny = [], [], []
    for t in ["main", "tl", "gal", "ev"]:
        pg.click(f".tab[data-tab={t}]"); pg.wait_for_timeout(900)
        unnamed += pg.evaluate(NAME_JS); noalt += pg.evaluate(IMG_JS); tiny += pg.evaluate(TAP_JS)
    check(not unnamed, f"semua kontrol punya nama yang bisa dibaca screen reader {unnamed[:4] or ''}")
    check(not noalt, f"semua <img> punya atribut alt {noalt[:4] or ''}")
    check(not tiny, f"tidak ada kontrol sentuh < 28px tanpa area sentuh tambahan {tiny[:4] or ''}")
    check(pg.evaluate("document.documentElement.lang") == "id", "<html lang='id'> terpasang")
    check(pg.evaluate("!!document.querySelector('meta[name=description]')"), "meta description ada")
    check(pg.evaluate("!!document.querySelector('[role=main], main')"), "ada landmark utama (main)")
    # ---- Lightbox: animasi tutup (kontrol memudar + foto mendarat sama bentuk, SUDUT, dan ukuran dengan thumbnail) ----
    # Catatan: membandingkan dengan getBoundingClientRect() saja TIDAK cukup. Polaroid galeri dimiringkan (figure.gi rotate), dan kotak pembatas
    # elemen miring lebih besar dari bentuk aslinya; persegi lurus seukuran kotak itu punya kotak pembatas yang sama, jadi lolos padahal menonjol.
    LB_CLOSE = """async (how) => { const root = document.getElementById('lightbox'), lb = document.getElementById('lb-img'), q = i => document.getElementById(i), th = lbSrc;
      if (how === 'back') history.back(); else root.click();
      await new Promise(r => setTimeout(r, 450));   // foto terbang 380 ms
      const rc = lb.getBoundingClientRect(), cs = getComputedStyle(lb), M = new DOMMatrix(cs.transform);
      const mm = /inset\\(([^)]*?)(?: round [^)]*)?\\)/.exec(cs.clipPath), n = mm ? mm[1].trim().split(/\\s+/).map(parseFloat) : [0];
      const [T, R, B, L] = n.length === 1 ? [n[0],n[0],n[0],n[0]] : n.length === 2 ? [n[0],n[1],n[0],n[1]] : n.length === 3 ? [n[0],n[1],n[2],n[1]] : n;
      const deg = m => Math.atan2(m.b, m.a) * 180 / Math.PI, ang = deg(M), sx = Math.hypot(M.a, M.b), sy = Math.hypot(M.c, M.d);
      const vw = (lb.offsetWidth - L - R) * sx, vh = (lb.offsetHeight - T - B) * sy, ox = (L - R) / 2, oy = (T - B) / 2;
      const cx = rc.left + rc.width / 2 + (M.a * ox + M.c * oy), cy = rc.top + rc.height / 2 + (M.b * ox + M.d * oy);
      const gi = th.closest('.gi'), G = gi ? new DOMMatrix(getComputedStyle(gi).transform) : new DOMMatrix(), tcs = getComputedStyle(th), tr = th.getBoundingClientRect();
      const tw = parseFloat(tcs.width) * Math.hypot(G.a, G.b), tH = parseFloat(tcs.height) * Math.hypot(G.c, G.d);
      return {gang: deg(G), dAng: Math.abs(ang - deg(G)), dW: Math.abs(vw - tw), dH: Math.abs(vh - tH), bbox: [rc.width, tr.width],
              dC: Math.hypot(cx - (tr.left + tr.width / 2), cy - (tr.top + tr.height / 2)),
              chrome: Math.max(+getComputedStyle(q('lb-x')).opacity, +getComputedStyle(q('lb-cap')).opacity, +getComputedStyle(q('lb-next')).opacity),
              stillOpen: getComputedStyle(root).display !== 'none'}; }"""
    pg.click(".tab[data-tab=gal]"); pg.wait_for_timeout(1200)
    for how in ("back", "tap"):
        pg.evaluate("document.querySelector('#gallery img[data-photo]').scrollIntoView({block:'center'})"); pg.wait_for_timeout(500)
        pg.click("#gallery img[data-photo]"); pg.wait_for_timeout(1500)
        r = pg.evaluate(LB_CLOSE, how)
        check(abs(r["gang"]) > 1, f"lightbox tutup via {how}: kartu yang diuji memang miring ({r['gang']:.2f}°), jadi tes ini benar-benar menguji rotasi")
        check(r["dAng"] < 0.3, f"lightbox tutup via {how}: foto mendarat dengan sudut yang sama dengan kartu miring (selisih {r['dAng']:.2f}°)")
        check(r["dW"] < 1.5 and r["dH"] < 1.5, f"lightbox tutup via {how}: ukuran asli sama dengan thumbnail, bukan kotak pembatas (selisih {r['dW']:.2f}×{r['dH']:.2f}px)")
        check(r["dC"] < 1.5, f"lightbox tutup via {how}: titik pusat sama dengan thumbnail (selisih {r['dC']:.2f}px)")
        check(r["chrome"] < 0.05 and r["stillOpen"], f"lightbox tutup via {how}: tombol/keterangan sudah memudar saat foto mendarat, overlay masih ada (opasitas {r['chrome']:.2f})")
        pg.wait_for_timeout(700)
    # buka lagi setelah menutup: kontrol harus kembali terlihat dan tidak ada sisa clip-path dari animasi tutup
    pg.evaluate("document.querySelectorAll('#gallery img[data-photo]')[1].click()"); pg.wait_for_timeout(1500)
    again = pg.evaluate("({clip: getComputedStyle(document.getElementById('lb-img')).clipPath, x: +getComputedStyle(document.getElementById('lb-x')).opacity, cap: +getComputedStyle(document.getElementById('lb-cap')).opacity})")
    check(again["clip"] == "none" and again["x"] == 1 and again["cap"] == 1, f"lightbox dibuka lagi: tanpa sisa clip-path, kontrol terlihat penuh {again}")
    pg.evaluate("escClose()"); pg.wait_for_timeout(900)
    check(not errs, f"tanpa error JS di tes logika/aksesibilitas {errs[:2] or ''}")
    ctx.close()
    b.close()

print()
if fails:
    print(f"{len(fails)} pemeriksaan GAGAL")
    sys.exit(1)
print("semua pemeriksaan tambahan lolos")
