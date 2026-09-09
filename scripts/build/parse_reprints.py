#!/usr/bin/env python3
"""Parses the freshly downloaded LinkedIn Learning certificate PDFs.

Each reprint is self-describing: it carries the title in the certificate's own
language, the exact completion timestamp, the duration, the skills LinkedIn
attributes to the course, and the 64-hex certificate ID that resolves at
linkedin.com/learning/certificates/<id> once sharing is enabled.
"""
import json, re, subprocess, sys, hashlib
from pathlib import Path

MONTHS = {m: i for i, m in enumerate(
    "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}

DATE_RE = re.compile(
    r"([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\s+at\s+(\d{2}):(\d{2})(AM|PM)\s+UTC"
    r"(?:\s*[•·]\s*(.+?))?\s*$", re.M)
ID_RE = re.compile(r"Certificate ID:\s*([0-9a-f]{64})", re.S)
# 2019-2022 downloads print a 28-char base64url legacy id under a Spanish label
ID_LEGACY_RE = re.compile(
    r"(?:ID del certificado|N[uú]mero del certificado|Certificate ID)\s*:?\s*"
    r"([A-Za-z0-9_-]{28})\b")
PDU_RE = re.compile(r"PDUs/ContactHours:\s*([\d.]+)")
ACT_RE = re.compile(r"Activity #:\s*(\S+)")
KIND_RE = re.compile(r"(Course|Learning Path)\s+completed by\s+(.+)")


def duration_minutes(text):
    if not text:
        return None
    h = re.search(r"(\d+)\s*hour", text)
    m = re.search(r"(\d+)\s*minute", text)
    total = (int(h.group(1)) * 60 if h else 0) + (int(m.group(1)) if m else 0)
    return total or None


def parse(path: Path):
    raw = subprocess.run(["pdftotext", "-layout", str(path), "-"],
                         capture_output=True, text=True).stdout
    lines = [l.strip() for l in raw.splitlines()]
    rec = {"archivo": str(path), "bytes": path.stat().st_size,
           "sha256": hashlib.sha256(path.read_bytes()).hexdigest()[:16]}

    flat = raw.replace("\n", " ")
    m = ID_RE.search(flat)
    rec["token"] = m.group(1) if m else None
    if not rec["token"]:
        m2 = ID_LEGACY_RE.search(flat)
        rec["id_legado"] = m2.group(1) if m2 else None
    else:
        rec["id_legado"] = None

    k = KIND_RE.search(raw) or re.search(
        r"(Curso|Ruta de aprendizaje|Itinerario)\s+completad[oa] por\s+(.+)", raw)
    rec["tipo"] = ("itinerario" if k and k.group(1) == "Learning Path"
                   else "curso" if k else None)
    rec["titular"] = k.group(2).strip() if k else None

    d = DATE_RE.search(raw)
    if d:
        mon, day, year, hh, mm, ap, dur = d.groups()
        hh = int(hh) % 12 + (12 if ap == "PM" else 0)
        rec["fecha"] = f"{year}-{MONTHS[mon]:02d}-{int(day):02d}"
        rec["hora_utc"] = f"{hh:02d}:{mm}"
        rec["duracion_min"] = duration_minutes(dur)
    else:
        rec["fecha"] = rec["hora_utc"] = rec["duracion_min"] = None

    # title: everything above the "completed by" line, minus the LinkedIn header
    if k:
        idx = next(i for i, l in enumerate(lines) if "completed by" in l)
        head = [l for l in lines[:idx] if l and l not in ("LinkedIn", "Learning")]
        rec["titulo"] = " ".join(head).strip() or None
    else:
        rec["titulo"] = None

    # skills sit between "Top skills covered" and the signature line
    try:
        s = next(i for i, l in enumerate(lines) if "Top skills covered" in l)
        e = next(i for i, l in enumerate(lines[s:], s) if "Head of Learning" in l)
        rec["competencias"] = [c.strip() for l in lines[s + 1:e]
                               for c in re.split(r"\s{3,}", l) if c.strip()]
    except StopIteration:
        rec["competencias"] = []

    p = PDU_RE.search(raw)
    rec["pdus"] = float(p.group(1)) if p else None
    a = ACT_RE.search(raw)
    rec["pmi_activity"] = a.group(1) if a else None
    rec["programa"] = "PMI" if rec["pdus"] is not None else "LinkedIn Learning"
    return rec


if __name__ == "__main__":
    root = Path(sys.argv[1] if len(sys.argv) > 1
                else "certs-src/_reimpresos")
    out = [parse(p) for p in sorted(root.glob("*.pdf"))]
    json.dump(out, open(sys.argv[2] if len(sys.argv) > 2
                        else "data/reimpresos.json", "w"),
              ensure_ascii=False, indent=1)
    ok = sum(1 for r in out if r["token"])
    print(f"{len(out)} PDFs  |  con token: {ok}  |  "
          f"con fecha: {sum(1 for r in out if r['fecha'])}  |  "
          f"itinerarios: {sum(1 for r in out if r['tipo']=='itinerario')}  |  "
          f"PMI: {sum(1 for r in out if r['programa']=='PMI')}")
