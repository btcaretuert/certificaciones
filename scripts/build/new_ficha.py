#!/usr/bin/env python3
"""Crea la ficha de un registro del mapa que todavia no la tiene.

`sync_content.py` solo actualiza fichas existentes; crear es otra operacion y
es deliberadamente explicita: una ficha nueva nace `visibility: public` solo
porque el dueno la nombro, nunca por barrido automatico.
"""
import json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "src/content/certificates"
ALIAS_AREA = {"datos-analitica": "datos-y-analitica",
              "cloud-infraestructura": "cloud-e-infraestructura",
              "desarrollo-herramientas": "desarrollo-y-herramientas",
              "liderazgo-gestion": "liderazgo-y-gestion",
              "comunicacion-efectividad": "comunicacion-y-efectividad",
              "negocio-innovacion": "negocio-e-innovacion"}
PLAT = {"LinkedIn Learning": "LinkedIn", "Udemy": "Udemy", "Udemy Business": "Udemy"}


def slugify(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def esc(v):
    if v is None or v == "":
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return json.dumps(str(v), ensure_ascii=False)


def lista(xs):
    return "[" + ", ".join(json.dumps(str(x), ensure_ascii=False) for x in xs) + "]"


def ficha(r, slug):
    area = ALIAS_AREA.get(r.get("area"), r.get("area") or "sin-clasificar")
    tipo = r.get("tipo_contenido") or "transversal"
    tech = r.get("tecnologias") or []
    arch = [a["ruta"] for a in (r.get("archivos") or []) if a.get("publicable", True)]
    tiene_pdf = any(Path(ROOT / a).suffix.lower() == ".pdf" for a in arch)
    campos = [
        ("title", esc(r.get("titulo"))), ("issuer", esc(r.get("emisor"))),
        ("platform", esc(PLAT.get(r.get("origen"), "MOOC"))),
        ("area", esc(area)), ("domain", esc("sin-clasificar")),
        ("tech", lista(tech)), ("type", esc(tipo)),
        ("official", esc(bool(r.get("oficial")))),
        ("skills", lista((r.get("competencias") or [])[:8])),
        ("issued", esc(r.get("fecha"))), ("hours", esc(r.get("horas"))),
        ("credential_id", esc(r.get("credencial_id"))),
        ("verify_url", esc(r.get("verify_url"))),
        ("pdf", esc(slug if tiene_pdf else None)),
        ("thumb", esc(slug if arch else None)),
        ("weight", "1"), ("featured", "false"),
        ("visibility", esc("public")),
        ("curation_note", '""'), ("curation_flag", "false"),
        ("manual_fields", "[]"), ("auto_snapshot", "null"),
        ("classification_confidence", esc("low")),
        ("classification_signals", '""'),
        ("classification_rules_version", '""'),
        ("needs_review", "true"), ("extracted_fields", "[]"),
        ("verified_public", esc(bool(r.get("verificable_publico")))),
        ("program", esc(r.get("programa"))), ("course_urn", esc(r.get("urn"))),
        ("course_url", esc(r.get("url_curso"))), ("level", esc(r.get("nivel"))),
        ("language", esc(r.get("idioma"))), ("retired", esc(bool(r.get("retirado")))),
        ("instructors", lista([i.get("nombre") for i in (r.get("instructores") or [])
                               if i.get("nombre")])),
        ("summary", esc((r.get("descripcion") or "")[:300] or None)),
        ("source_files", lista(arch)),
        ("expires", esc((r.get("expira") or "")[:10] or None)),
        ("active", esc(r.get("vigente")) if r.get("expira") else "null"),
        ("objectives", lista([o[:300] for o in (r.get("objetivos") or [])[:12]])),
    ]
    return "".join(f"{k}: {v}\n" for k, v in campos)


regs = json.load(open(ROOT / "data/mapa-certificados.json"))
por_titulo = {(r.get("titulo") or "").strip().lower(): r for r in regs}
creadas = 0
for titulo in [l.strip() for l in sys.stdin if l.strip()]:
    r = por_titulo.get(titulo.lower())
    if not r:
        print(f"  NO ESTA EN EL MAPA: {titulo}")
        continue
    slug = slugify(r["titulo"])
    p = DEST / f"{slug}.yaml"
    if p.exists():
        print(f"  ya existe: {slug}")
        continue
    p.write_text(ficha(r, slug), encoding="utf-8")
    print(f"  creada: {slug}")
    creadas += 1
print(f"fichas creadas: {creadas}")
