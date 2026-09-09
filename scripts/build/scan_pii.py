#!/usr/bin/env python3
"""Scans every certificate PDF for personal data that must not be published.

Runs over the whole corpus, not a sample: certificates from external bodies are
the ones most likely to print a national ID number.
"""
import re, subprocess, sys, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATTERNS = {
    "rut_chileno": r"\b\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK]\b",
    "rut_etiquetado": r"RUT\s*:?\s*[\d.]{7,12}-?[\dkK]",
    "curp_mx": r"\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b",
    "correo": r"\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b",
    "telefono": r"\b(?:\+?56|\+?52)\s?9?\s?\d{4}\s?\d{4}\b",
    "direccion": r"\b(calle|avenida|av\.|pasaje|depto|departamento)\s+\w+\s+\d+",
}


def scan(p):
    try:
        t = subprocess.run(["pdftotext", "-layout", str(p), "-"],
                           capture_output=True, text=True, timeout=25).stdout
    except Exception as e:
        return {"archivo": str(p.relative_to(ROOT)), "error": str(e)[:60]}
    hits = {}
    for name, pat in PATTERNS.items():
        m = re.findall(pat, t, re.I)
        if m:
            hits[name] = sorted(set(m))[:3]
    return {"archivo": str(p.relative_to(ROOT)), "hallazgos": hits} if hits else None


if __name__ == "__main__":
    roots = [ROOT / "certs-src", ROOT / "input"]
    files = [p for r in roots for p in r.rglob("*") if p.is_file()]
    out = [h for h in (scan(p) for p in files) if h]
    json.dump(out, open(ROOT / "reports/pii-hallazgos.json", "w"),
              ensure_ascii=False, indent=1)
    print(f"archivos escaneados: {len(files)}   con hallazgos: {len(out)}")
    for h in out:
        print(f"  {h['archivo']}")
        for k, v in h.get("hallazgos", {}).items():
            print(f"      {k}: {v}")
