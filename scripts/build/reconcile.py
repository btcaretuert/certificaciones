#!/usr/bin/env python3
"""Reconciles the master map against the content collection already in the repo.

The collection's titles came from the owner's spreadsheet, where several entries
were renamed by hand ("Scrum Master" for "Certified ScrumMaster (CSM)",
"Monta un Cluster Hadoop..." for the course's real title). Exact matching
therefore under-reports; this compares on token overlap and only flags an entry
as genuinely absent when nothing in the map comes close.
"""
import json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STOP = {"de", "la", "el", "los", "las", "y", "a", "en", "para", "con", "del", "un",
        "una", "tu", "tus", "como", "the", "of", "to", "and", "for", "your", "in",
        "with", "get", "how", "que", "es", "por", "al"}


def toks(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\((?:19|20)\d{2}\)", " ", s)
    return {w for w in re.split(r"[^a-z0-9]+", s) if w and w not in STOP and len(w) > 1}


def jac(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0


# The spreadsheet renamed a number of courses, sometimes beyond what token
# overlap can bridge ("Scrum Master" for "Certified ScrumMaster (CSM)"). These
# pairings were checked one by one against the map; nothing is guessed.
ALIAS = {
    "como-gestionar-a-tu-jefe.yaml":                     "li-como-gestionar-a-tu-superior",
    "como-integrar-a-nuevos-empleados-a-la-empresa.yaml": "li-como-integrar-a-personas-nuevas-en-la-empresa-2015",
    "como-liderar-a-los-millennials.yaml":               "li-como-liderar-a-la-generacion-y-2017",
    "como-ser-mas-asertivo.yaml":                        "li-aprende-las-claves-de-la-asertividad",
    "fundamentos-y-consejos-para-nuevos-jefes.yaml":     "li-fundamentos-y-consejos-para-gerentes-principiantes-2015",
    "historias-y-narrativa-para-lideres.yaml":           "li-storytelling-para-el-liderazgo",
    "primeros-pasos-para-nuevos-jefes.yaml":             "li-primeros-pasos-en-el-liderazgo-de-equipos",
    "scrum-master.yaml":                                 "ext-certified-scrummaster",
    "como-dar-feedback-a-tus-empleados.yaml":            "li-como-dar-feedback-a-tu-personal",
    "como-dirigir-a-nuevos-directivos.yaml":             "li-como-dirigir-a-nuevos-dirigentes",
    "lean-it.yaml":                                      "ext-lean-it-association-foundation",
    "microsoft-power-automate-esencial-antes-microsoft-flow.yaml": "li-power-automate-esencial-2020",
    "transicion-de-jefe-a-lider.yaml":                   "li-transicion-de-responsable-a-lider-2017",
    "kubernetes-para-desarrolladores-esencial.yaml":     "li-kubernetes-para-desarrollo-de-aplicaciones-esencial",
    "superminds-artificial-intelligence-in-2019-2025-markets.yaml": "ud-superminds-the-future-of-artificial-intelligence-ai",
    "novedades-de-microsoft-office-365-aplicaciones-online.yaml": "li-novedades-de-office-microsoft-365-aplicaciones-online",
    "domina-las-aplicaciones-en-la-web-de-office-365.yaml": "li-domina-las-aplicaciones-complementarias-de-office-365-en-la-web",
    "monta-un-cluster-hadoop-big-data-desde-cero.yaml":  "ud-hadoop-big-data-desde-cero",
    "the-complete-dbt-data-build-tool-bootcamp-zero-to-hero.yaml": "ud-the-complete-dbt-bootcamp-zero-to-hero-certification-prep",
    "aprende-big-data-conceptos-basicos-para-it.yaml":   "li-aprende-big-data-conceptos-basicos-para-it",
    "big-data-estructurar-el-proyecto-desde-it.yaml":    "li-big-data-estructurar-el-proyecto-desde-it",
    "taller-starting-data-governance-dama-cmdp.yaml":    "otr-taller-starting-data-governance",
    "proteccion-de-datos.yaml":                          "otr-proteccion-de-datos-personales",
    "seguridad-informatica-analisis-de-riesgos.yaml":    "otr-tecnico-en-seguridad-informatica-analisis-de-riesgos",
    "seguridad-informatica-servidores.yaml":             "otr-tecnico-en-seguridad-informatica-servidores",
    "associate-cloud-engineer.yaml":                     "ext-associate-cloud-engineer-certification",
    "cloud-digital-leader.yaml":                         "ext-cloud-digital-leader-certification",
    "generative-ai-leader.yaml":                         "ext-generative-ai-leader-certification",
    "devops-fundamentals.yaml":                          "ext-dasa-devops-fundamentals",
    "ethical-hacking-crash-course-2020.yaml":            "ud-ethical-hacking-crash-course",
    "gcp-for-beginner-become-a-google-cloud-digital-leader.yaml": "ud-gcp-for-beginners-become-a-google-cloud-digital-leader",
    "gitlab-ci-pipelines-ci-cd-and-devops-for-beginners.yaml": "ud-gitlab-ci-cd-pipelines-ci-cd-and-devops-for-beginners",
    "okr-goal-setting-101-achieve-more-goals-than-ever-faster.yaml": "ud-okr-goal-setting-101-achieve-more-goals-in-2026-than-ever",
    "splunk-2020-beginner-to-architect.yaml":            "ud-splunk-beginner-to-architect-2026",
    "gestion-de-equipos-remotos.yaml":                   "li-gestion-de-equipos-remotos",
    "conviertete-en-un-especialista-en-big-data-para-it.yaml": "li-conviertete-en-especialista-en-big-data-para-it",
    "recursos-humanos-como-entrevistar-a-candidatos-de-trabajo.yaml": "li-recursos-humanos-como-entrevistar-aspirantes",
}

d = json.load(open(ROOT / "data/mapa-certificados.json", encoding="utf-8"))
por_id = {r["id"]: r for r in d}
cands = []
for r in d:
    for t in (r.get("titulo"), r.get("titulo_en"), r.get("slug")):
        if t:
            cands.append((toks(t), r))

rows = []
for p in sorted((ROOT / "src/content/certificates").glob("*.yaml")):
    txt = p.read_text(encoding="utf-8")
    m = re.search(r'^title:\s*"?(.*?)"?\s*$', txt, re.M)
    title = m.group(1) if m else p.stem
    vis = re.search(r'^visibility:\s*"?(\w+)"?', txt, re.M)
    tt = toks(title)
    if p.name in ALIAS and ALIAS[p.name] in por_id:
        best, score = por_id[ALIAS[p.name]], 1.0
    else:
        best, score = None, 0.0
        for ct, r in cands:
            s = jac(tt, ct)
            if s > score:
                best, score = r, s
    rows.append({"ficha": p.name, "titulo": title,
                 "visibility": vis.group(1) if vis else None,
                 "match": best["titulo"] if best else None,
                 "match_id": best["id"] if best else None,
                 "score": round(score, 2)})

seguro = [r for r in rows if r["score"] >= 0.6]
dudoso = [r for r in rows if 0.34 <= r["score"] < 0.6]
sinmatch = [r for r in rows if r["score"] < 0.34]

json.dump(rows, open(ROOT / "data/reconciliacion.json", "w"),
          ensure_ascii=False, indent=1)
print(f"fichas: {len(rows)}   seguras: {len(seguro)}   dudosas: {len(dudoso)}   "
      f"sin correspondencia: {len(sinmatch)}")
if dudoso:
    print("\n-- revisar a mano --")
    for r in sorted(dudoso, key=lambda x: x["score"]):
        print(f"  {r['score']:.2f}  {r['titulo'][:46]:48} ~  {(r['match'] or '?')[:46]}")
if sinmatch:
    print("\n-- no está en el mapa --")
    for r in sinmatch:
        print(f"  {r['score']:.2f}  {r['titulo'][:60]}")

# and the other direction: map records with no entry in the collection
usados = {r["match_id"] for r in rows if r["score"] >= 0.34}
huerf = [r for r in d if r["id"] not in usados and r["programa"] != "PMI"]
print(f"\n-- en el mapa pero sin ficha: {len(huerf)} --")
for r in huerf[:40]:
    print(f"  {r['origen'][:18]:20} {(r['titulo'] or '?')[:56]}")
