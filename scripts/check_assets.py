#!/usr/bin/env python3
"""Cek konsistensi daftar aset (tanpa build, jadi daftarnya ada di beberapa tempat dan harus sinkron).

  1. Semua aset lokal yang dirujuk index.html / admin.html benar-benar ada
  2. Urutan skrip assets/js/shared/*.js sama persis di index.html dan admin.html (urutan = urutan eksekusi!)
  3. Tidak ada file di assets/js/shared/ yang yatim (tidak dimuat siapa pun)
  4. Semua aset yang dimuat index.html ada di daftar SHELL sw.js (supaya jalan offline); semua isi SHELL ada di disk
  5. Ikon di manifest.webmanifest ada

Jalankan lokal:  python scripts/check_assets.py
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
bad = []


def err(m):
    bad.append(m)
    print("ERROR  " + m)


def refs(html):
    js = re.findall(r'<script[^>]+src="([^"]+)"', html)
    css = re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html)
    local = lambda xs: [x for x in xs if not x.startswith(("http:", "https:", "//"))]
    return local(js), local(css)


pages = {}
for name in ("index.html", "admin.html"):
    js, css = refs((ROOT / name).read_text(encoding="utf-8"))
    pages[name] = (js, css)
    for f in js + css:
        if not (ROOT / f.split("?")[0]).exists():
            err(f"{name} merujuk {f} tapi file tidak ada")

shared = lambda js: [x for x in js if x.startswith("assets/js/shared/")]
si, sa = shared(pages["index.html"][0]), shared(pages["admin.html"][0])
if si != sa:
    err("urutan skrip assets/js/shared/ berbeda antara index.html dan admin.html:\n  index: %s\n  admin: %s" % (si, sa))
on_disk = sorted(str(p.relative_to(ROOT)).replace("\\", "/") for p in (ROOT / "assets/js/shared").glob("*.js"))
for f in on_disk:
    if f not in si:
        err(f"{f} ada di disk tetapi tidak dimuat index.html (file yatim, atau lupa ditambahkan)")

sw = (ROOT / "sw.js").read_text(encoding="utf-8")
m = re.search(r"const SHELL = \[(.*?)\];", sw, re.S)
shell = re.findall(r"'([^']+)'", m.group(1)) if m else []
if not shell:
    err("tidak menemukan daftar SHELL di sw.js")
for f in shell:
    if f != "./" and not (ROOT / f).exists():
        err(f"sw.js SHELL berisi {f} tapi file tidak ada")
need = [x.split("?")[0] for x in pages["index.html"][0] + pages["index.html"][1]]
for f in need:
    if f not in shell:
        err(f"{f} dimuat index.html tetapi tidak ada di SHELL sw.js (tidak akan tersedia offline)")

man = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
for ic in man.get("icons", []):
    if not (ROOT / ic["src"]).exists():
        err(f"manifest: ikon {ic['src']} tidak ada")

if bad:
    sys.exit(1)
print(f"ok     {len(si)} skrip shared sinkron (index = admin), {len(shell)} item SHELL, {len(need)} aset index tersedia offline")
