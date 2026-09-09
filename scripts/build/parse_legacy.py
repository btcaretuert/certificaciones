#!/usr/bin/env python3
"""Parses the 2019-2022 LinkedIn Learning downloads kept in Drive.

These use a different layout from today's reprints: Spanish labels, no duration,
no skills, and a 28-character base64url certificate number that does NOT resolve
at linkedin.com/learning/certificates/. That id is a legacy identifier with no
derivable relationship to the current 64-hex share token (tested exhaustively);
the only way to obtain the modern token is to download the certificate again.
Kept here because it is the key that ties a Drive file to a course.
"""
import json, re, subprocess, sys, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MESES = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7,
         "ago": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dic": 12,
         "jan": 1, "apr": 4, "aug": 8, "dec": 12}

ID_RE = re.compile(r"(?:N[uú]mero|ID) del certificado:\s*([A-Za-z0-9_-]{20,32})")
FECHA_RE = re.compile(
    r"(Curso|Ruta de aprendizaje|Itinerario de aprendizaje)\s+completad[oa]\s+el\s+"
    r"([a-z]{3,4})\.?\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{2}):(\d{2})(AM|PM)", re.I)
# the 2019 exports use a shorter form that also carries the duration
FECHA2_RE = re.compile(
    r"(Curso|Ruta de aprendizaje|Itinerario de aprendizaje)\s+completad[oa]\s+el\s+"
    r"(\d{1,2})-([a-z]{3,4})\.?-(\d{4})"
    r"(?:\s*[•·]\s*((?:\d+\s*h)?\s*(?:\d+\s*min)?))?", re.I)
DUR_RE = re.compile(r"(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?")
PDU_RE = re.compile(r"PDUs/ContactHours:\s*([\d.]+)")
ACT_RE = re.compile(r"Actividad #:\s*(\S+)")


def parse(p: Path):
    raw = subprocess.run(["pdftotext", "-layout", str(p), "-"],
                         capture_output=True, text=True).stdout
    lines = [l.strip() for l in raw.splitlines() if l.strip()]
    flat = re.sub(r"\s+", " ", raw)
    rec = {"archivo": str(p.relative_to(ROOT)), "bytes": p.stat().st_size,
           "sha256": hashlib.sha256(p.read_bytes()).hexdigest()[:16]}

    m = ID_RE.search(flat)
    rec["id_legado"] = m.group(1) if m else None

    f = FECHA_RE.search(flat)
    if f:
        kind, mon, day, year, hh, mm, ap = f.groups()
        rec["tipo"] = "curso" if kind.lower() == "curso" else "itinerario"
        mon_n = MESES.get(mon.lower().rstrip("."))
        h = int(hh) % 12 + (12 if ap.upper() == "PM" else 0)
        rec["fecha"] = f"{year}-{mon_n:02d}-{int(day):02d}" if mon_n else None
        rec["hora_utc"] = f"{h:02d}:{mm}"
    else:
        rec["tipo"] = rec["fecha"] = rec["hora_utc"] = None
        f2 = FECHA2_RE.search(flat)
        if f2:
            kind, day, mon, year, dur = f2.groups()
            rec["tipo"] = "curso" if kind.lower() == "curso" else "itinerario"
            mon_n = MESES.get(mon.lower().rstrip("."))
            rec["fecha"] = f"{year}-{mon_n:02d}-{int(day):02d}" if mon_n else None
            if dur:
                h = re.search(r"(\d+)\s*h", dur)
                mi = re.search(r"(\d+)\s*min", dur)
                rec["duracion_min"] = ((int(h.group(1)) * 60 if h else 0)
                                       + (int(mi.group(1)) if mi else 0)) or None

    # title sits between the greeting and the "completado el" line
    try:
        g = next(i for i, l in enumerate(lines) if l.startswith("¡Felicidades"))
        c = next(i for i, l in enumerate(lines[g:], g) if "completad" in l)
        rec["titulo"] = " ".join(lines[g + 1:c]).strip() or None
    except StopIteration:
        rec["titulo"] = None

    rec.setdefault("duracion_min", None)
    pd = PDU_RE.search(flat)
    rec["pdus"] = float(pd.group(1)) if pd else None
    ac = ACT_RE.search(flat)
    rec["pmi_activity"] = ac.group(1) if ac else None
    rec["programa"] = "PMI" if rec["pdus"] is not None else "LinkedIn Learning"
    return rec


if __name__ == "__main__":
    folders = sys.argv[1:] or ["certs-src/_origen/Certs Linkedin",
                               "certs-src/_origen/Certs Linkedin Itinerarios"]
    out = []
    for fo in folders:
        for p in sorted((ROOT / fo).iterdir()):
            if p.is_file():
                out.append(parse(p))
    json.dump(out, open(ROOT / "data/legado.json", "w"), ensure_ascii=False, indent=1)
    print(f"{len(out)} archivos | con id: {sum(1 for r in out if r['id_legado'])} | "
          f"con titulo: {sum(1 for r in out if r['titulo'])} | "
          f"con fecha: {sum(1 for r in out if r['fecha'])} | "
          f"itinerarios: {sum(1 for r in out if r['tipo']=='itinerario')} | "
          f"PMI: {sum(1 for r in out if r['programa']=='PMI')}")
