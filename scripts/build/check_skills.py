#!/usr/bin/env python3
"""Cobertura del vocabulario de competencias sobre las fichas publicas.

Responde dos preguntas y nada mas: cuanto del corpus queda agrupado, y que
etiquetas quedan fuera. Lo segundo importa mas que lo primero: una etiqueta
sin mapear con muchos usos es un hueco del vocabulario, no del corpus.
"""
import glob, re, unicodedata, collections, sys
import yaml

def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").strip().lower())
    return "".join(c for c in s if not unicodedata.combining(c))

_voc = yaml.safe_load(open("src/data/skills.yaml"))
VOC = _voc["competencias"]
TECH = _voc.get("tecnologias", {})
for c in VOC:
    c["_match"] = {norm(x) for x in c.get("match", [])}
    c["_re"] = [re.compile(p) for p in c.get("patterns", [])]

def mapear(etiqueta):
    n = norm(etiqueta)
    return [c["slug"] for c in VOC
            if n in c["_match"] or any(r.search(n) for r in c["_re"])]

usos = collections.Counter()
por_comp = collections.Counter()
fichas_con = 0
fichas = 0
sin_mapear = collections.Counter()

for f in sorted(glob.glob("src/content/certificates/*.yaml")):
    d = yaml.safe_load(open(f)) or {}
    if d.get("visibility") != "public":
        continue
    fichas += 1
    comps = set()
    # las tecnologias tambien son senal: los 29 cursos de Udemy no traen
    # etiquetas de competencia y `tech` es lo unico estructurado que tienen.
    for tg in d.get("tech") or []:
        comps.update(TECH.get(tg, []))
    # los objetivos no son etiquetas, pero si son texto del emisor: sirven para
    # reconocer familias que ninguna etiqueta nombra, como el trabajo con IA.
    for o in d.get("objectives") or []:
        comps.update(mapear(o))
    for s in d.get("skills") or []:
        usos[s] += 1
        hit = mapear(s)
        if hit:
            comps.update(hit)
        else:
            sin_mapear[s] += 1
    if comps:
        fichas_con += 1
    for c in comps:
        por_comp[c] += 1

asig = sum(usos.values())
cub = asig - sum(sin_mapear.values())
print(f"fichas publicas: {fichas}   con al menos una competencia: {fichas_con} "
      f"({100*fichas_con/fichas:.0f} %)")
print(f"asignaciones: {asig}   mapeadas: {cub} ({100*cub/asig:.0f} %)   "
      f"etiquetas sin mapear: {len(sin_mapear)}")
print(f"\ncompetencias con uso ({len(por_comp)} de {len(VOC)}):")
for s, n in por_comp.most_common():
    print(f"  {n:4}  {s}")
vacias = [c['slug'] for c in VOC if c['slug'] not in por_comp]
if vacias:
    print(f"\nsin ninguna ficha: {', '.join(vacias)}")
print(f"\netiquetas sin mapear con mas de un uso:")
for s, n in sin_mapear.most_common():
    if n > 1:
        print(f"  {n:4}  {s}")
if "-v" in sys.argv:
    print("\ntodas las sin mapear:")
    for s, n in sorted(sin_mapear.items()):
        print(f"  {n:4}  {s}")
