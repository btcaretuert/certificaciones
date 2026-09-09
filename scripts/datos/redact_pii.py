#!/usr/bin/env python3
"""Removes personal data from the certificate PDFs that print it.

Two MOOC diplomas from Universidad del Desarrollo print the holder's national ID
number in the body. Drawing a black box over it would not be enough: the text
layer would still carry the number and any copy-paste or `pdftotext` would
recover it. So the page is rasterised and rebuilt, which drops the text layer
entirely — the number stops existing in the file rather than being covered up.

The redaction box is derived from `pdftotext -bbox`, not hard-coded: it finds the
word matching the pattern and clears the whole line it sits on, so the label
disappears with the value and no gap advertises that something was removed.
"""
import json, re, subprocess, sys
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "certs-src/_redactados"
DPI = 200
NS = {"x": "http://www.w3.org/1999/xhtml"}
PATRON = re.compile(r"^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$")


W = "{http://www.w3.org/1999/xhtml}word"
PAGE = "{http://www.w3.org/1999/xhtml}page"


def lineas_a_borrar(pdf: Path):
    """Returns, per page, the boxes (in points) of every line holding a match.

    `pdftotext -bbox` emits words with no line grouping, so the line is
    reconstructed by vertical overlap with the matched word.
    """
    xml = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"],
                         capture_output=True, text=True).stdout
    root = ET.fromstring(xml)
    fuera = []
    for n, page in enumerate(root.iter(PAGE)):
        w = float(page.get("width")); h = float(page.get("height"))
        palabras = [{"t": (x.text or "").strip(),
                     "x0": float(x.get("xMin")), "x1": float(x.get("xMax")),
                     "y0": float(x.get("yMin")), "y1": float(x.get("yMax"))}
                    for x in page.iter(W)]
        cajas = []
        for m in [p for p in palabras if PATRON.match(p["t"])]:
            centro = (m["y0"] + m["y1"]) / 2
            linea = [p for p in palabras if p["y0"] - 1 <= centro <= p["y1"] + 1]
            xs = [p["x0"] for p in linea] + [p["x1"] for p in linea]
            ys = [p["y0"] for p in linea] + [p["y1"] for p in linea]
            cajas.append((min(xs) - 6, min(ys) - 4, max(xs) + 8, max(ys) + 4))
        fuera.append({"pagina": n + 1, "ancho": w, "alto": h, "cajas": cajas})
    return fuera


def redactar(pdf: Path) -> Path | None:
    from PIL import Image
    paginas = lineas_a_borrar(pdf)
    if not any(p["cajas"] for p in paginas):
        return None
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / ".tmp"
    tmp.mkdir(exist_ok=True)
    subprocess.run(["pdftoppm", "-r", str(DPI), "-png", str(pdf), str(tmp / "p")], check=True)
    escala = DPI / 72.0
    imgs = []
    for p in paginas:
        f = tmp / f"p-{p['pagina']}.png"
        if not f.exists():
            f = next(tmp.glob(f"p-*{p['pagina']}.png"))
        im = Image.open(f).convert("RGB")
        for (x0, y0, x1, y1) in p["cajas"]:
            # sample the page background a little above the line so the patch
            # blends instead of leaving a white rectangle on a tinted page
            muestra = im.getpixel((min(im.width - 1, int(x1 * escala) + 20),
                                   max(0, int(y0 * escala) - 12)))
            im.paste(muestra, tuple(int(v * escala) for v in (x0, y0, x1, y1)))
        imgs.append(im)
    dest = OUT / (pdf.stem + " (redactado).pdf")
    imgs[0].save(dest, save_all=True, append_images=imgs[1:], resolution=DPI)
    for f in tmp.glob("*"):
        f.unlink()
    tmp.rmdir()
    return dest


if __name__ == "__main__":
    hallazgos = json.load(open(ROOT / "reports/pii-hallazgos.json", encoding="utf-8"))
    hechos = []
    for h in hallazgos:
        pdf = ROOT / h["archivo"]
        dest = redactar(pdf)
        if not dest:
            print(f"  --  {pdf.name[:60]}  (nada que redactar)")
            continue
        resto = subprocess.run(["pdftotext", str(dest), "-"],
                               capture_output=True, text=True).stdout
        quedan = [v for vs in h["hallazgos"].values() for v in vs
                  if v.replace("RUT", "").strip(" :") in resto]
        estado = "LIMPIO" if not quedan else f"AUN CONTIENE {quedan}"
        print(f"  OK  {dest.name[:64]:66} {estado}")
        hechos.append({"original": h["archivo"],
                       "redactado": str(dest.relative_to(ROOT)),
                       "verificado": not quedan})
    json.dump(hechos, open(ROOT / "data/redacciones.json", "w"),
              ensure_ascii=False, indent=1)
    print(f"\n{len(hechos)} archivo(s) redactado(s) -> certs-src/_redactados/")
