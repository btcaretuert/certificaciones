#!/usr/bin/env python3
"""Reads the MOOC and internal-training PDFs, which — unlike LinkedIn's — have no
common layout. Filenames here are unreliable ("Alejandro Retuert.pdf" is really a
Data Governance workshop), so every field comes from the document text.
"""
import json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MESES = {m: i for i, m in enumerate(
    "enero febrero marzo abril mayo junio julio agosto septiembre "
    "octubre noviembre diciembre".split(), 1)}


def text(p):
    return subprocess.run(["pdftotext", "-layout", str(p), "-"],
                          capture_output=True, text=True).stdout


def fecha_es(s):
    m = re.search(r"(\d{1,2})\s+de\s+([a-záé]+)\s+de\s+(\d{4})", s, re.I)
    if m and m.group(2).lower() in MESES:
        return f"{m.group(3)}-{MESES[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{2})[/-](\d{2})[/-](\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.search(r"(\d{2})-(\d{2})-(\d{4})", s)
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def parse(p):
    t = text(p)
    flat = re.sub(r"\s+", " ", t)
    r = {"archivo": str(p.relative_to(ROOT)), "bytes": p.stat().st_size,
         "titulo": None, "emisor": None, "fecha": None, "horas": None,
         "verify_url": None, "credencial_id": None, "pii": [], "notas": None}

    # Fundación Carlos Slim — capacitateparaelempleo.org, publicly verifiable
    m = re.search(r"capacitateparaelempleo\.org/verifica/([a-z0-9]+)", flat)
    if m:
        r["emisor"] = "Capacítate para el Empleo (Fundación Carlos Slim)"
        r["credencial_id"] = m.group(1)
        # The URL is printed on the diploma but the route no longer verifies:
        # checked 2026-09-08, a real folio and an invented one both render the
        # site's home page and fire no verification request.
        r["verify_url"] = None
        r["verify_url_impresa"] = f"https://capacitateparaelempleo.org/verifica/{m.group(1)}/"
        r["notas"] = ("El portal del emisor ya no resuelve el folio: comprobado el "
                      "2026-09-08, un folio válido y uno inventado devuelven la misma "
                      "portada. El folio queda como identificador, no como verificación.")
        ti = re.search(r"completó y aprobó los estudios de\s+(.+?)\s+Ciudad de México", flat)
        r["titulo"] = re.sub(r"\s*/\s*", " / ", ti.group(1)).strip() if ti else None
        r["fecha"] = fecha_es(flat)
        return r

    # Universidad del Desarrollo MOOC — carries the holder's national ID number
    if "Universidad del Desarrollo" in flat:
        r["emisor"] = "Universidad del Desarrollo"
        ti = re.search(r"Massive Online Open Course\)\s+(.+?)\s+Dictado por", flat)
        r["titulo"] = ti.group(1).strip(" .") if ti else None
        d = re.search(r"Fecha Término:\s*(\d{2}/\d{2}/\d{4})", flat)
        r["fecha"] = fecha_es(d.group(1)) if d else None
        h = re.search(r"Duración:\s*(\d+)\s*horas", flat)
        r["horas"] = int(h.group(1)) if h else None
        prof = re.search(r"Dictado por:\s*(.+?)\s+Carrera", flat)
        cod = re.search(r"c[oó]digo de\s*validaci[oó]n:?\s*([0-9A-F]{8,16})", flat, re.I)
        if cod:
            r["credencial_id"] = cod.group(1)
            # the portal printed on the diploma (diplomadosmoocs.com) no longer
            # resolves: NXDOMAIN, and Wayback holds no snapshot of it
            r["verify_url_impresa"] = "http://www.diplomadosmoocs.com/validar"
        partes = [f"Dictado por {prof.group(1)}" if prof else None,
                  ("El portal de validación impreso en el diploma "
                   "(diplomadosmoocs.com) ya no existe: el dominio no resuelve y "
                   "no hay copia en Wayback. El código queda como identificador."
                   ) if cod else None]
        r["notas"] = " ".join(x for x in partes if x) or None
        if re.search(r"RUT\s*:?\s*[\d.]+-[\dkK]", flat):
            r["pii"].append("RUT en el cuerpo del certificado")
        return r

    # Pontificia Universidad Católica — MOOC with its own validation portal
    if "PONTIFICIA UNIVERSIDAD" in flat.upper():
        r["emisor"] = "Pontificia Universidad Católica de Chile"
        ti = re.search(r"\(MOOC\)\s+(.+?)\s+realizado en la plataforma", flat)
        r["titulo"] = ti.group(1).strip() if ti else None
        h = re.search(r"Duración\s*:\s*(\d+)\s*horas", flat)
        r["horas"] = int(h.group(1)) if h else None
        cod = re.search(r"c[oó]digo de verificaci[oó]n\s+([0-9a-f]{6,})", flat, re.I)
        if cod:
            r["credencial_id"] = cod.group(1)
            # comprobado el 2026-09-08: la ruta no responde (HTTP 000), igual que
            # el resto de portales propios de emisores chilenos de esa epoca
            r["verify_url"] = None
            r["verify_url_impresa"] = "http://www.claseejecutiva.cl/siliconvalley/validar"
        d = re.search(r"Santiago de Chile,\s*(.+?)(?:\s{2,}|$)", flat)
        r["fecha"] = fecha_es(d.group(1)) if d else None
        r["notas"] = ("Verificación por código en claseejecutiva.cl, que hoy no "
                      "responde en esa ruta. El código queda como identificador.")
        return r

    # PreparaCDMP workshop
    if "PreparaCDMP" in flat or "Prepara CDMP" in flat:
        r["emisor"] = "PreparaCDMP"
        ti = re.search(r"Por su participación en el\s+(.+?)\s+Realizado", flat)
        r["titulo"] = ti.group(1).strip() if ti else None
        d = re.search(r"Realizado los días\s+(.+?\d{4})", flat)
        r["fecha"] = fecha_es(d.group(1)) if d else None
        return r

    # Axity internal LMS
    if "sabacloud" in flat.lower():
        r["emisor"] = "Axity (formación interna)"
        ti = re.search(r"Alejandro Retuert\s+(.+?)\s+https", flat)
        r["titulo"] = ti.group(1).strip() if ti else None
        r["fecha"] = fecha_es(flat)
        r["notas"] = "LMS corporativo; el enlace exige sesión y no sirve como verificación pública."
        return r

    r["notas"] = "formato no reconocido"
    return r


if __name__ == "__main__":
    out = []
    for folder in ["certs-src/_origen/Certs MOOC", "certs-src/_origen/Datos y Varios"]:
        for p in sorted((ROOT / folder).glob("*")):
            if p.is_file():
                out.append(parse(p))
    json.dump(out, open(ROOT / "data/otros.json", "w"), ensure_ascii=False, indent=1)
    for r in out:
        print(f"{'OK ' if r['titulo'] else '-- '}{(r['titulo'] or '?')[:48]:50} "
              f"{(r['emisor'] or '?')[:34]:36} {r['fecha'] or '?':11} "
              f"{'verif' if r['verify_url'] else '     '} {'PII!' if r['pii'] else ''}")
