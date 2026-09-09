#!/usr/bin/env python3
"""Enriches src/content/certificates/*.yaml from the master map.

Rules, in order of importance:
  1. Curation is never touched. visibility, curation_note, curation_flag, weight
     and featured are copied through verbatim. The machine never promotes an
     entry to public and never writes private.
  2. Anything listed in manual_fields is left alone.
  3. A field is only written when the entry has no value for it, unless
     --overwrite is passed for the harvested fields, which are authoritative
     (they come from the issuer's own API or from the certificate PDF).

Run with --dry to see the diff without writing.
"""
import json, re, sys
import yaml
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DRY = "--dry" in sys.argv
OVER = "--overwrite" in sys.argv

mapa = {r["id"]: r for r in json.load(open(ROOT / "data/mapa-certificados.json",
                                           encoding="utf-8"))}
recon = json.load(open(ROOT / "data/reconciliacion.json", encoding="utf-8"))

PLATAFORMA = {
    "LinkedIn Learning": "LinkedIn", "Udemy": "Udemy", "Udemy Business": "Udemy",
    "Google Cloud": "International", "APMG International": "International",
    "Scrum Alliance": "International",
}


def yaml_scalar(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return '"' + str(v).replace("\\", "\\\\").replace('"', '\\"') + '"'


def yaml_list(v):
    if not v:
        return "[]"
    return "[" + ", ".join(yaml_scalar(x) for x in v) + "]"


# `key:` followed by indented "- item" lines is a block sequence: the value is
# those lines, not the empty remainder of the key line. Replacing only the key
# line leaves the items orphaned and the file stops being valid YAML.
BLOQUE = re.compile(r"^(?:[ \t]+[-#].*|[ \t]+\S.*)$")


# Campos que NO se curan a mano: son estado medido, no criterio. La regla de
# "nunca sobrescribir un valor existente" protege las competencias escritas a
# mano en la hoja, pero aplicada a estos volvia el dato permanentemente obsoleto:
# `verified_public: false` sobrevivia a la activacion de los 197 enlaces.
# `manual_fields` sigue mandando por encima de esto: si el dueno lo fija, se fija.
MEDIDOS = {"verified_public", "verify_url", "retired", "expires", "active", "source_files", "kind",
           "pmi_credential_id", "pmi_verify_url", "pmi_pdus", "pmi_pdf", "pmi_source_file",
           "course_urn", "course_url", "level", "language", "hours"}


def set_field(txt, key, value, manual, force):
    """Replaces a top-level field, honouring manual_fields and block sequences."""
    if key in manual:
        return txt, False
    if key in MEDIDOS:
        force = True
    lines = txt.splitlines()
    nuevo = f"{key}: {value}"
    idx = next((i for i, l in enumerate(lines)
                if re.match(rf"^{re.escape(key)}:(?:[ \t]|$)", l)), None)
    if idx is None:
        return txt.rstrip() + "\n" + nuevo + "\n", True

    fin = idx + 1
    while fin < len(lines) and BLOQUE.match(lines[fin]):
        fin += 1
    inline = lines[idx].split(":", 1)[1].strip()
    tenia_bloque = fin > idx + 1
    actual = inline if not tenia_bloque else "<bloque>"
    vacio = actual in ("", "null", '""', "[]", "0")
    # never blank out a value that is already there: several entries carry
    # skills typed by hand in the spreadsheet that the platforms do not report
    if value.strip() in ("null", "[]", '""') and not vacio:
        return txt, False
    if not vacio and not force:
        return txt, False
    if actual == value.strip():
        return txt, False
    lines[idx:fin] = [nuevo]
    return "\n".join(lines) + "\n", True


# 0.6 is the threshold above which the token overlap is unambiguous. Between
# 0.34 and 0.6 the pairing is plausible but has produced real mistakes (the
# spreadsheet renamed courses, and two different Big Data courses share most of
# their words), so those are reported for a human to confirm, never written.
UMBRAL = 0.6
cambios, saltados, tocados = 0, 0, 0
detalle, dudosos = [], []
for row in recon:
    if not row["match_id"] or row["score"] < UMBRAL:
        saltados += 1
        if row["match_id"] and row["score"] >= 0.34:
            dudosos.append(row)
        continue
    r = mapa.get(row["match_id"])
    if not r:
        saltados += 1
        continue
    p = ROOT / "src/content/certificates" / row["ficha"]
    txt = p.read_text(encoding="utf-8")
    try:
        actual_yaml = yaml.safe_load(txt) or {}
    except Exception:
        actual_yaml = {}

    def union(key, nuevos):
        """Lists are merged, not replaced: the spreadsheet's hand-typed skills and
        the platform's own labels are both real, and neither is a superset."""
        previos = actual_yaml.get(key) or []
        if not isinstance(previos, list):
            previos = []
        vistos, out = set(), []
        for x in list(previos) + list(nuevos or []):
            k = str(x).strip().lower()
            if x and k not in vistos:
                vistos.add(k)
                out.append(x)
        return out

    mm = re.search(r"^manual_fields:\s*\[(.*?)\]", txt, re.M)
    manual = {x.strip().strip('"\'') for x in (mm.group(1).split(",") if mm else []) if x.strip()}

    campos = [
        ("issuer", yaml_scalar(r.get("emisor") or r.get("origen"))),
        ("platform", yaml_scalar(PLATAFORMA.get(r["origen"], "MOOC"))),
        ("official", yaml_scalar(bool(r.get("oficial")))),
        ("issued", yaml_scalar(r.get("fecha"))),
        ("hours", yaml_scalar(r.get("horas"))),
        ("credential_id", yaml_scalar(r.get("credencial_id"))),
        ("verify_url", yaml_scalar(r.get("verify_url"))),
        ("tech", yaml_list(union("tech", r.get("tecnologias")))),
        ("skills", yaml_list(union("skills", (r.get("competencias") or [])[:8])[:20])),
        # fields the collection did not have before
        ("verified_public", yaml_scalar(r.get("verificable_publico"))),
        ("program", yaml_scalar(r.get("programa"))),
        ("kind", yaml_scalar(r.get("tipo"))),
        ("course_urn", yaml_scalar(r.get("urn"))),
        ("course_url", yaml_scalar(r.get("url_curso"))),
        ("level", yaml_scalar(r.get("nivel"))),
        ("language", yaml_scalar(r.get("idioma"))),
        ("retired", yaml_scalar(bool(r.get("retirado")))),
        # certifications expire; a portfolio that hides it is worse than one that
        # says it plainly, because the issuer's own page will say it anyway
        # la acreditacion PMI del mismo curso, como distintivo y no como ficha
        ("pmi_credential_id", yaml_scalar(r.get("pmi_credencial_id"))),
        ("pmi_verify_url", yaml_scalar(r.get("pmi_verify_url"))),
        ("pmi_pdus", yaml_scalar(r.get("pmi_pdus"))),
        ("pmi_pdf", yaml_scalar(f"{row['ficha'][:-5]}-pmi" if r.get("pmi_archivo") else None)),
        ("pmi_source_file", yaml_scalar(r.get("pmi_archivo"))),
        ("expires", yaml_scalar(r.get("expira")[:10] if r.get("expira") else None)),
        ("active", yaml_scalar(r.get("vigente")) if r.get("expira") else "null"),
        ("instructors", yaml_list(union("instructors",
                                        [i.get("nombre") for i in (r.get("instructores") or [])
                                         if i.get("nombre")]))),
        ("summary", yaml_scalar((r.get("descripcion") or "")[:300] or None)),
        # "lo que aprenderas" de Udemy. Vivio un tiempo dentro de `skills` y eso
        # metio 143 frases de un solo uso en el vocabulario de competencias; aqui
        # es contenido de la ficha de detalle, que es lo que siempre fue.
        ("objectives", yaml_list([o[:300] for o in (r.get("objetivos") or [])[:12]])),
        # only files cleared for publication reach the collection: the originals
        # that still carry personal data stay in the map and out of the site
        ("source_files", yaml_list([a["ruta"] for a in (r.get("archivos") or [])
                                    if a.get("publicable", True)])),
    ]
    n = 0
    for k, v in campos:
        txt, ch = set_field(txt, k, v, manual, OVER)
        n += ch
    if n:
        tocados += 1
        cambios += n
        detalle.append((row["ficha"], n, r["id"]))
        if not DRY:
            p.write_text(txt, encoding="utf-8")

print(f"fichas tocadas: {tocados}   campos escritos: {cambios}   sin correspondencia: {saltados}"
      + ("   [DRY RUN]" if DRY else ""))
for f, n, i in detalle[:12]:
    print(f"   {n:2} campos  {f[:52]:54} <- {i}")
if len(detalle) > 12:
    print(f"   … y {len(detalle)-12} más")
if dudosos:
    print(f"\nsin escribir, confirmar a mano ({len(dudosos)}):")
    for r in sorted(dudosos, key=lambda x: x["score"]):
        print(f"   {r['score']:.2f}  {r['titulo'][:44]:46} ~ {(r['match'] or '?')[:44]}")
