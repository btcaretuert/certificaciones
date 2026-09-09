#!/usr/bin/env python3
"""Miniatura de la primera pagina de cada certificado publicable.

Solo mira fichas `visibility: public` y, dentro de ellas, solo los archivos
marcados publicables: el original con RUT no debe llegar nunca a una imagen.
La miniatura se nombra con el slug de `pdf`, que es la clave que usa
emit-assets para resolver el activo.
"""
import subprocess, sys, tempfile, os
from pathlib import Path
import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FICHAS = ROOT / "src/content/certificates"
SALIDA = ROOT / "certs-src/_thumbs"
ANCHO = 640

# los redactados van primero: si una ficha ofrece original y redactado, la
# imagen tiene que salir del redactado
def elegir(fichero_yaml):
    d = yaml.safe_load(fichero_yaml.read_text(encoding="utf-8")) or {}
    if d.get("visibility") != "public":
        return None
    fuentes = [f for f in (d.get("source_files") or []) if (ROOT / f).exists()]
    if not fuentes:
        return None
    # el documento manda sobre la insignia: 4 de las 6 certificaciones oficiales
    # tienen PDF y badge de Credly, y el badge no es el certificado.
    fuentes.sort(key=lambda f: ("_redactados" not in f, not f.lower().endswith(".pdf"), f))
    slug = d.get("pdf") or fichero_yaml.stem
    return slug, ROOT / fuentes[0]


def render(pdf: Path, destino: Path) -> bool:
    # 6 certificaciones oficiales y 2 de Udemy solo existen como imagen; no hay
    # nada que rasterizar, se redimensionan tal cual.
    if pdf.suffix.lower() in (".png", ".jpg", ".jpeg"):
        return guardar(Image.open(pdf), destino)
    with tempfile.TemporaryDirectory() as tmp:
        base = os.path.join(tmp, "p")
        r = subprocess.run(
            ["pdftoppm", "-jpeg", "-r", "72", "-f", "1", "-l", "1", str(pdf), base],
            capture_output=True,
        )
        salidas = sorted(Path(tmp).glob("p*.jpg"))
        if r.returncode != 0 or not salidas:
            return False
        return guardar(Image.open(salidas[0]), destino)


def guardar(im: Image.Image, destino: Path) -> bool:
    # las insignias de Credly son PNG con transparencia: se aplanan sobre
    # blanco antes de convertir, o el fondo sale negro en WebP.
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        fondo = Image.new("RGB", im.size, (255, 255, 255))
        fondo.paste(im, mask=im.split()[-1])
        im = fondo
    else:
        im = im.convert("RGB")
    if im.width > ANCHO:
        alto = max(1, round(im.height * ANCHO / im.width))
        im = im.resize((ANCHO, alto), Image.LANCZOS)
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino, "WEBP", quality=78, method=5)
    return True


def main():
    forzar = "--force" in sys.argv
    ok = saltadas = fallos = 0
    for f in sorted(FICHAS.glob("*.yaml")):
        par = elegir(f)
        if not par:
            continue
        slug, pdf = par
        destino = SALIDA / f"{slug}.webp"
        if destino.exists() and not forzar:
            saltadas += 1
            continue
        if render(pdf, destino):
            ok += 1
        else:
            fallos += 1
            print(f"  fallo: {f.name} <- {pdf}", file=sys.stderr)
    print(f"miniaturas: {ok} nuevas, {saltadas} ya estaban, {fallos} fallos")
    tam = sum(p.stat().st_size for p in SALIDA.glob("*.webp")) if SALIDA.exists() else 0
    print(f"peso total: {tam/1024/1024:.1f} MB en {len(list(SALIDA.glob('*.webp')))} archivos")


if __name__ == "__main__":
    main()
