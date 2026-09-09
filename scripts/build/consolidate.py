#!/usr/bin/env python3
"""Builds the master certificate map.

One record per credential, joining five independent sources:

  1. the learning-history DOM       -> card order, duration label, thumbnail
  2. the LinkedIn Learning API      -> skills, level, lifecycle, instructors, description
  3. the freshly downloaded PDFs    -> title, exact date, duration, skills, 64-hex token
  4. the original Drive PDFs        -> the legacy 28-char id printed on 2019-2022 reprints
  5. Udemy's public API and Credly  -> everything outside LinkedIn

The card index is the join key across 1-3; the token joins 3 to the PDF files.
"""
import json, re, unicodedata, subprocess, hashlib
from pathlib import Path
from collections import defaultdict
import sys
sys.path.insert(0, str(Path(__file__).parent))
from vocab import TECH, AREA, TIPO_TECNICO, OVERRIDES_AREA

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/_raw"


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def slugify(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", norm(s))).strip("-")[:80]


def jload(p):
    return json.load(open(p, encoding="utf-8"))


def jlines(p):
    return [json.loads(l) for l in open(p, encoding="utf-8") if l.strip()]


def classify(title, skills, desc=""):
    """Scores every area by how many of its patterns the text hits, rather than
    taking the first area that matches at all. First-match let a single stray
    word decide: "Associate Cloud Engineer" landed in data because its skill list
    happens to mention SQL. The title counts double — it is the strongest signal.
    """
    t = (title or "").lower()
    hay = " ".join([t, t, " ".join(skills or []), desc or ""]).lower()
    tech = sorted({k for k, pats in TECH.items()
                   if any(re.search(p, hay) for p in pats)})
    for frag, area in OVERRIDES_AREA.items():
        if frag in t:
            tech_only = tech
            return tech_only, area
    best, score = None, 0
    for a, pats in AREA:
        n = sum(1 for p in pats if re.search(p, hay))
        n += 2 * sum(1 for p in pats if re.search(p, t))
        if n > score:
            best, score = a, n
    return tech, best


def horas(minutes=None, seconds=None):
    if seconds:
        return round(seconds / 3600, 2)
    if minutes:
        return round(minutes / 60, 2)
    return None


# ---------------------------------------------------------------- LinkedIn
def build_linkedin():
    cards = jload(RAW / "cards_dom.json")
    legacy = jload(RAW / "cards_final.json")           # same order, carries the old PDF match
    skills_d = jload(RAW / "dict_skills.json")
    # Estado real del enlace publico, comprobado por HTTP. La cosecha guardo
    # `publicShareEnabled` en su momento; despues se activaron 197 enlaces, asi
    # que ese campo quedo obsoleto. Manda la respuesta del servidor, no el
    # recuerdo de la cosecha.
    http_tok = jload(RAW / "enlaces_verificados.json") or {}
    authors_d = jload(RAW / "dict_authors.json")
    courses = {c["slug"]: c for c in jlines(RAW / "harvest_courses.jsonl")}
    paths = {p["slug"]: p for p in jlines(RAW / "harvest_paths.jsonl")}

    log_p = RAW / "download_log.jsonl"
    dl = {r["i"]: r for r in jlines(log_p)} if log_p.exists() else {}
    rp_p = ROOT / "data/reimpresos.json"
    reprints = jload(rp_p) if rp_p.exists() else []
    # PDFs the owner uploaded by hand also carry the modern token
    oc_p = ROOT / "data/otros_certs.json"
    if oc_p.exists():
        reprints = reprints + [r for r in jload(oc_p) if r.get("token")]
    # the 2019-2022 Drive corpus, indexed by normalised title + programme
    leg_p = ROOT / "data/legado.json"
    legacy_idx = defaultdict(list)
    for r in (jload(leg_p) if leg_p.exists() else []):
        legacy_idx[(norm(r["titulo"]), r["programa"])].append(r)
    by_token = defaultdict(list)
    for r in reprints:
        if r["token"]:
            by_token[r["token"]].append(r)

    out = []
    for i, card in enumerate(cards):
        links = card.get("links") or []
        cslug = next((h.replace("/learning/", "") for h in links
                      if re.fullmatch(r"/learning/[a-z0-9-]+", h, re.I)), None)
        pslug = next((h.replace("/learning/paths/", "") for h in links
                      if h.startswith("/learning/paths/")), None)
        api = courses.get(cslug, {}).get("course") if cslug else None
        if not api and pslug:
            api = paths.get(pslug, {}).get("path")
        kind = "itinerario" if pslug else "curso"

        d = dl.get(i, {})
        tokens = [t for t in (d.get("token") or "").split(",") if t]
        files = []
        for t in tokens:
            for r in by_token.get(t, []):
                files.append(r)

        # every certificate variant of this card becomes its own record
        certs = []
        if cslug and cslug in courses and courses[cslug].get("certs"):
            certs = courses[cslug]["certs"]
        elif tokens:
            certs = [{"shareId": t, "credentialingProgram": None,
                      "shareUrl": f"https://www.linkedin.com/learning/certificates/{t}",
                      "enabled": d.get("checked"), "earned": True} for t in tokens]

        if not certs:
            certs = [{"shareId": None, "credentialingProgram": None, "shareUrl": None,
                      "enabled": None, "earned": None}]

        for cert in certs:
            tok = cert.get("shareId")
            pdf = next((r for r in files if r["token"] == tok), None)
            prog = cert.get("program") or (pdf or {}).get("programa") or "LinkedIn Learning"
            sk_api = [skills_d.get(u, {}).get("name") for u in (api or {}).get("skills", [])]
            sk = [s for s in ((pdf or {}).get("competencias") or sk_api) if s]
            titulo = (pdf or {}).get("titulo") or (api or {}).get("localTitle") \
                or card.get("title")
            desc = (api or {}).get("shortDesc") or (api or {}).get("tagline") or ""
            tech, area = classify(f"{titulo} {card.get('title') or ''}", sk, desc)
            secs = (api or {}).get("durationSec")
            mins = (pdf or {}).get("duracion_min")

            rec = {
                "id": f"li-{slugify(titulo or card.get('title') or f'card{i}')}"
                      + ("-pmi" if prog == "PMI" else ""),
                "orden_historial": i,
                "origen": "LinkedIn Learning",
                "emisor": "LinkedIn Learning" if prog != "PMI"
                          else "Project Management Institute (PMI)",
                "programa": prog,
                "tipo": kind,
                "titulo": titulo,
                "titulo_en": card.get("title"),
                "slug": cslug or pslug,
                "url_curso": (f"https://www.linkedin.com/learning/{cslug}" if cslug
                              else f"https://www.linkedin.com/learning/paths/{pslug}" if pslug
                              else None),
                "urn": (api or {}).get("trackingUrn"),
                "credencial_id": tok,
                "verify_url": (f"https://www.linkedin.com/learning/certificates/{tok}"
                               if http_tok.get(tok) == 200 else cert.get("shareUrl")),
                "verificable_publico": (True if http_tok.get(tok) == 200
                                        else False if tok in http_tok
                                        else cert.get("enabled")),
                "obtenido": cert.get("earned"),
                "fecha": (pdf or {}).get("fecha"),
                "hora_utc": (pdf or {}).get("hora_utc"),
                "horas": horas(mins, secs),
                "duracion_etiqueta": card.get("dur"),
                "nivel": (api or {}).get("difficulty"),
                "idioma": ((api or {}).get("locale") or {}).get("language"),
                "competencias": sk,
                "tecnologias": tech,
                "area": area,
                "tipo_contenido": "tecnico" if area in TIPO_TECNICO else "transversal",
                "estado_curso": (api or {}).get("lifecycle"),
                "retirado": (api or {}).get("lifecycle") == "DEPRECATED",
                "videos": (api or {}).get("videos"),
                "evaluaciones": (api or {}).get("assessments"),
                "contenidos": (api or {}).get("totalContents"),
                "pdus_pmi": (pdf or {}).get("pdus"),
                "pmi_activity": (pdf or {}).get("pmi_activity"),
                "instructores": [
                    {"nombre": authors_d.get(u, {}).get("name"),
                     "slug": authors_d.get(u, {}).get("slug"),
                     "cargo": authors_d.get(u, {}).get("headline")}
                    for u in (api or {}).get("authors", [])],
                "descripcion": desc or None,
                "objetivos": (api or {}).get("objectives") or (api or {}).get("outcomes") or [],
                "miniatura": card.get("thumb"),
                "archivos": [],
            }
            if pdf:
                rec["archivos"].append({
                    "ruta": str(Path(pdf["archivo"]).relative_to(ROOT))
                            if Path(pdf["archivo"]).is_absolute() else pdf["archivo"],
                    "procedencia": "reimpreso 2026", "bytes": pdf["bytes"],
                    "sha256_16": pdf["sha256"]})
            # the original Drive download: matched on the Spanish title printed
            # inside the PDF, which is exact, rather than on the file name
            def sinaño(t):
                return norm(re.sub(r"\s*\((?:19|20)\d{2}\)\s*$", "", t or ""))
            cands = [titulo, (api or {}).get("localTitle"), card.get("title")]
            hits = []
            for c in cands:
                hits = legacy_idx.get((norm(c), prog), []) or legacy_idx.get((sinaño(c), prog), [])
                if hits:
                    break
            # Aqui hubo un respaldo posicional: si el emparejamiento por titulo
            # impreso fallaba, tomaba legacy[i] por indice de tarjeta y armaba la
            # ruta desde la columna de la hoja. Es el mismo join por posicion que
            # ya habia cruzado las aptitudes, y producia lo mismo: asociaciones
            # inventadas —a "Kubernetes para desarrolladores" le colgaba el PDF de
            # "Kubernetes para administradores IT"— sobre archivos que ademas no
            # existen. Las 11 que generaba apuntaban todas a rutas inexistentes y
            # ningun registro se queda sin archivo al quitarlo.
            for h in hits:
                rec["archivos"].append({
                    "ruta": h["archivo"], "procedencia": "descarga original",
                    "id_legado": h.get("id_legado"), "bytes": h.get("bytes"),
                    "coincidencia": "aproximada" if h.get("aprox") else "exacta"})
                rec.setdefault("id_legado", h.get("id_legado"))
                if not rec["fecha"]:
                    rec["fecha"] = h.get("fecha")
                if not rec["horas"] and h.get("duracion_min"):
                    rec["horas"] = horas(h["duracion_min"])
            out.append(rec)
    return out


# ------------------------------------------------------------------- Udemy
def build_udemy():
    out = []
    files = {p.name: p for p in (ROOT / "input/otros_certs").rglob("*.pdf")}
    files.update({p.name: p for p in (ROOT / "certs-src/_origen/Certs Udemy").glob("*")})
    files.update({p.name: p for p in (ROOT / "certs-src/_udemy_2026").glob("*")})
    for p in sorted((RAW / "udemy").glob("*.json")):
        d = jload(p)
        code = d.get("code")
        if not code:
            continue
        course = d.get("course") or {}
        title = course.get("title")
        info = course.get("content_info") or ""
        hrs = None
        m = re.search(r"([\d.,]+)\s*total hours", info)
        if m:
            hrs = float(m.group(1).replace(",", "."))
        elif re.search(r"(\d+)\s*total mins", info):
            hrs = round(int(re.search(r"(\d+)\s*total mins", info).group(1)) / 60, 2)
        cat = (course.get("primary_category") or {}).get("title")
        sub = (course.get("primary_subcategory") or {}).get("title")
        objetivos = [o for o in (course.get("objectives") or []) if o][:12]
        blurb = " ".join([course.get("headline") or "",
                          re.sub(r"<[^>]+>", " ", course.get("description") or "")[:1500],
                          " ".join(objetivos), cat or "", sub or ""])
        tech, area = classify(title, objetivos, blurb)
        tenant = (d.get("long_url") or "")
        biz = re.match(r"https://([a-z0-9-]+)\.udemy\.com", tenant)
        arch = [{"ruta": str(v.relative_to(ROOT)), "procedencia": "descarga original"}
                for k, v in files.items() if code in k]
        out.append({
            "id": f"ud-{slugify(title or code)}",
            "origen": "Udemy" + (" Business" if biz and biz.group(1) != "www" else ""),
            "emisor": "Udemy", "programa": "Udemy",
            "tipo": "curso",
            "titulo": title,
            "titulo_en": title,
            "slug": (course.get("url") or "").strip("/").replace("course/", "") or None,
            "url_curso": ("https://www.udemy.com" + course["url"]) if course.get("url") else None,
            "credencial_id": code,
            "verify_url": f"https://www.udemy.com/certificate/{code}/",
            "verificable_publico": True,
            "obtenido": True,
            "fecha": (d.get("completion_date") or "")[:10] or None,
            "horas": hrs,
            "duracion_etiqueta": info or None,
            # Udemy no publica etiquetas de competencia; lo que trae `objectives`
            # son frases de "lo que aprenderas", que sirven para clasificar y para
            # la ficha de detalle, pero no son facetas. Mezclarlas aqui metia 150
            # etiquetas de un solo uso en un vocabulario de 30.
            "competencias": [],
            "tecnologias": tech,
            "area": area,
            "categoria_emisor": " / ".join([x for x in (cat, sub) if x]) or None,
            "tipo_contenido": "tecnico" if area in TIPO_TECNICO else "transversal",
            "descripcion": course.get("headline") or None,
            "objetivos": objetivos,
            "instructores": [{"nombre": i.get("display_name"),
                              "cargo": i.get("job_title"),
                              "url": ("https://www.udemy.com" + i["url"]) if i.get("url") else None}
                             for i in course.get("visible_instructors", [])],
            "lecciones": course.get("num_published_lectures"),
            "tenant": biz.group(1) if biz else None,
            "imagen": d.get("image_url"),
            "pdf_emisor": d.get("pdf_url"),
            "archivos": arch,
        })
    return out


# --------------------------------------------------------------- externas
def build_externas():
    out = []
    cr = jload(RAW / "credly_p1.json")
    files = {p.name: p for p in (ROOT / "certs-src/_origen/Internacionales").glob("*")}
    # Reimpresiones oficiales que el dueno bajo de CertMetrics y del portal de
    # APMG el 2026-09-08. Cierran el unico hueco documental que quedaba —
    # Associate Cloud Engineer y Generative AI Leader solo tenian insignia de
    # Credly— y ademas reemplazan a las dos de APMG que estaban guardadas como
    # imagen, sin capa de texto: el numero de credencial ahora es legible.
    fmap = {
        "Associate Cloud Engineer Certification": "AssociateCloudEngineer20260908-20-ik5pux.pdf",
        "Generative AI Leader Certification": "GenerativeAILeader20260908-20-lqjcm1.pdf",
        "Cloud Digital Leader Certification": "CloudDigitalLeader20250908-32-xd6pww.pdf",
        "DASA DevOps Fundamentals": "DevOps-8eb79cedeedf.pdf",
        "Enterprise Big Data Professional": "EnterpriseBigDataProfessional20260908-20-qwftt7.pdf",
        "Lean IT Association Foundation": "Lean_IT_Association_Foundation_Badge20260908-20-6a45w3.pdf",
    }
    for b in cr.get("data", cr):
        t = b.get("badge_template", {})
        name = t.get("name")
        ent = (t.get("issuer", {}).get("entities") or [{}])[0].get("entity", {}) or {}
        sk = [s if isinstance(s, str) else s.get("name")
              for s in (t.get("skills") or [])]
        tech, area = classify(name, sk, t.get("description", "") or "")
        arch = []
        if fmap.get(name) and fmap[name] in files:
            arch = [{"ruta": str(files[fmap[name]].relative_to(ROOT)),
                     "procedencia": "descarga original"}]
        insignia = ROOT / "certs-src/_credly" / (name.replace(" ", "_") + ".png")
        if insignia.exists():
            arch.append({"ruta": str(insignia.relative_to(ROOT)),
                         "procedencia": "insignia Credly",
                         "bytes": insignia.stat().st_size})
        out.append({
            "id": f"ext-{slugify(name)}",
            "origen": ent.get("name") or "Credly",
            "emisor": ent.get("name"), "programa": "certificación",
            "tipo": "certificacion",
            "titulo": name, "titulo_en": name,
            "credencial_id": b.get("id"),
            "verify_url": f"https://www.credly.com/badges/{b.get('id')}",
            "verificable_publico": True, "obtenido": True,
            "fecha": b.get("issued_at_date", "")[:10] or None,
            "expira": b.get("expires_at_date"),
            "vigente": not b.get("expires_at_date") or b["expires_at_date"][:10] >= "2026-09-08",
            "horas": None,
            "competencias": [s for s in sk if s],
            "tecnologias": tech, "area": area,
            "tipo_contenido": "tecnico" if area in TIPO_TECNICO else "transversal",
            "oficial": True,
            "descripcion": (t.get("description") or "")[:400] or None,
            "imagen": t.get("image_url"),
            "archivos": arch,
        })

    # Scrum Alliance: no Credly badge, verified against the member profile
    out.append({
        "id": "ext-certified-scrummaster",
        "origen": "Scrum Alliance", "emisor": "Scrum Alliance",
        "programa": "certificación", "tipo": "certificacion",
        "titulo": "Certified ScrumMaster (CSM)", "titulo_en": "Certified ScrumMaster (CSM)",
        "credencial_id": "851698",
        "verify_url": "https://www.scrumalliance.org/community/profile/aretuert",
        "verificable_publico": True, "obtenido": True,
        "fecha": "2018-10-30", "expira": "2020-10-30", "vigente": False,
        "horas": None,
        "competencias": ["Scrum", "Agile Methodologies"],
        "tecnologias": ["agile"], "area": "liderazgo-gestion",
        "tipo_contenido": "transversal", "oficial": True,
        "descripcion": "Certificación vencida el 30 de octubre de 2020; no fue renovada.",
        "archivos": [{"ruta": "certs-src/_origen/Internacionales/ScrumAlliance_CSM_Certificate.pdf",
                      "procedencia": "descarga original"}],
    })
    return out


# ------------------------------------------------------------------ otros
def build_otros():
    """MOOCs and internal training. Their fields come from parse_otros.py, which
    reads the documents themselves — the filenames here are not trustworthy."""
    src = ROOT / "data/otros.json"
    if not src.exists():
        subprocess.run(["python3", str(Path(__file__).parent / "parse_otros.py")],
                       cwd=ROOT, check=True)
    rows = jload(src)
    out, seen = [], {}
    for r in rows:
        key = (norm(r["titulo"]), r.get("emisor"))
        if key in seen:                       # same credential, second copy on disk
            seen[key]["archivos"].append({"ruta": r["archivo"],
                                          "procedencia": "duplicado en Drive"})
            continue
        tech, area = classify(r["titulo"], [], r.get("notas") or "")
        rec = {
            "id": f"otr-{slugify(r['titulo'] or Path(r['archivo']).stem)}",
            "origen": r.get("emisor") or "Otros",
            "emisor": r.get("emisor"),
            "programa": "MOOC" if "Universidad" in (r.get("emisor") or "") else "curso",
            "tipo": "curso",
            "titulo": r["titulo"], "titulo_en": None,
            "credencial_id": r.get("credencial_id"),
            "verify_url": r.get("verify_url"),
            "verify_url_impresa": r.get("verify_url_impresa"),
            "verificable_publico": bool(r.get("verify_url")),
            "obtenido": True,
            "fecha": r.get("fecha"),
            "horas": r.get("horas"),
            "competencias": [],
            "tecnologias": tech, "area": area,
            "tipo_contenido": "tecnico" if area in TIPO_TECNICO else "transversal",
            "descripcion": r.get("notas"),
            "pii": r.get("pii") or [],
            "archivos": [],
        }
        # a certificate that prints personal data is published in its redacted
        # form; the original stays on disk but is never the file the site emits
        red = {x["original"]: x for x in
               (jload(ROOT / "data/redacciones.json")
                if (ROOT / "data/redacciones.json").exists() else [])}
        if r["archivo"] in red and red[r["archivo"]]["verificado"]:
            rec["archivos"].append({"ruta": red[r["archivo"]]["redactado"],
                                    "procedencia": "redactado para publicar",
                                    "publicable": True})
            rec["archivos"].append({"ruta": r["archivo"],
                                    "procedencia": "original con datos personales",
                                    "publicable": False})
        else:
            rec["archivos"].append({"ruta": r["archivo"],
                                    "procedencia": "descarga original",
                                    "bytes": r.get("bytes"), "publicable": True})
        seen[key] = rec
        out.append(rec)
    return out


def enlazar_pmi(recs):
    """Cuelga la variante PMI del curso padre en vez de dejarla como credencial
    aparte.

    Son 70 documentos reales, con identificador y URL propios, pero del MISMO
    curso: listarlos como fichas duplicaria cada titulo en el listado y en los
    filtros. Como distintivo del padre se conserva la acreditacion de un
    organismo externo —que pesa mas que un curso de plataforma— sin inflar el
    conteo ni las horas.

    La URL solo se copia si el enlace resuelve de verdad. Los PMI no entraron en
    el lote de activacion, asi que hoy 67 de 70 devuelven 404: un distintivo que
    dice "verificable" apuntando a un 404 es peor que no ponerlo.
    """
    por_id = {r["id"]: r for r in recs}
    n = 0
    for r in recs:
        if r.get("programa") == "PMI":
            continue
        v = por_id.get(f"{r['id']}-pmi")
        if not v:
            continue
        r["pmi_credencial_id"] = v.get("credencial_id")
        r["pmi_verify_url"] = v.get("verify_url") if v.get("verificable_publico") else None
        r["pmi_pdus"] = v.get("pdus_pmi")
        # El PDF del PMI es un documento distinto del de LinkedIn, con su propio
        # numero y su propio sello. Con 67 de 70 enlaces apagados es lo unico que
        # respalda esa acreditacion, asi que se publica.
        arch = sorted((a for a in (v.get("archivos") or []) if a.get("publicable", True)),
                      key=lambda a: (a.get("procedencia") != "reimpreso 2026", a["ruta"]))
        r["pmi_archivo"] = arch[0]["ruta"] if arch else None
        n += 1
    return n


if __name__ == "__main__":
    recs = build_linkedin() + build_udemy() + build_externas() + build_otros()
    n_pmi = enlazar_pmi(recs)
    (ROOT / "data").mkdir(exist_ok=True)
    json.dump(recs, open(ROOT / "data/mapa-certificados.json", "w"),
              ensure_ascii=False, indent=1)
    from collections import Counter
    print(f"registros: {len(recs)}")
    print("origen:", dict(Counter(r['origen'] for r in recs)))
    print("tipo:", dict(Counter(r['tipo'] for r in recs)))
    print("con verify_url:", sum(1 for r in recs if r.get('verify_url')))
    print("publicamente verificables:", sum(1 for r in recs if r.get('verificable_publico')))
    print("con archivo:", sum(1 for r in recs if r.get('archivos')))
    print("sin fecha:", sum(1 for r in recs if not r.get('fecha')))
    print("area:", dict(Counter(r.get('area') for r in recs)))
    print(f"cursos con variante PMI colgada: {n_pmi} "
          f"({sum(1 for r in recs if r.get('pmi_verify_url'))} con enlace activo, "
          f"{round(sum(float(r.get('pmi_pdus') or 0) for r in recs), 1)} PDU)")
