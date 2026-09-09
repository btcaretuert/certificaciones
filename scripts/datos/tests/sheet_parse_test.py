"""Prueba de regresion del parseo del XLSX.

Cifras verificadas a mano contra el Sheet real. Si el parser vuelve a romperse,
estos numeros lo delatan: un parseo mal hecho no falla, devuelve datos plausibles.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "migrate"))
import sheet  # noqa: E402

EXPECTED = {
    "filas": 249,
    "ocultos": 13,
    "con_enlace": 86,
    "enlaces": 99,
    "plataformas": {"International": 7, "Udemy": 27, "PMI": 50, "LinkedIn": 156, "MOOC": 9},
}


def run(xlsx: Path) -> int:
    rows, hidden = sheet.parse(xlsx)
    plat: dict[str, int] = {}
    for r in rows:
        plat[r.platform] = plat.get(r.platform, 0) + 1
    got = {
        "filas": len(rows),
        "ocultos": len(hidden),
        "con_enlace": sum(1 for r in rows if r.drive_urls),
        "enlaces": sum(len(r.drive_urls) for r in rows),
        "plataformas": plat,
    }
    fails = 0
    for k, want in EXPECTED.items():
        ok = got[k] == want
        fails += not ok
        print(f"  [{'OK ' if ok else 'MAL'}] {k}: {got[k]}" + ("" if ok else f"  != esperado {want}"))
    # La suma de plataformas debe cubrir todas las filas: ninguna sin clasificar.
    total = sum(plat.values())
    ok = total == len(rows)
    fails += not ok
    print(f"  [{'OK ' if ok else 'MAL'}] plataformas suman {total} == {len(rows)} filas")
    return fails


if __name__ == "__main__":
    sys.exit(1 if run(Path(sys.argv[1])) else 0)
