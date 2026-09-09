#!/usr/bin/env python3
"""Human-readable coverage report over data/mapa-certificados.json."""
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
d = json.load(open(ROOT / "data/mapa-certificados.json", encoding="utf-8"))

# El area de la ficha manda sobre la del clasificador cuando el dueno la reviso
# (`manual_fields: [area]`). Sin esto el reporte describiria una distribucion
# que el sitio no muestra: 45 fichas se revisaron a mano y en 20 el resultado no
# coincide con lo que produce el clasificador.
def _areas_revisadas():
    import yaml
    rec = ROOT / "data/reconciliacion.json"
    fichas = ROOT / "src/content/certificates"
    if not rec.exists() or not fichas.exists():
        return {}
    fuera = {}
    for fila in json.load(open(rec, encoding="utf-8")):
        f = fichas / fila["ficha"]
        if not f.exists() or not fila.get("match_id"):
            continue
        y = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        if "area" in (y.get("manual_fields") or []) and y.get("area"):
            fuera[fila["match_id"]] = y["area"]
    return fuera


_rev = _areas_revisadas()
_ALIAS = {"datos-y-analitica": "datos-analitica",
          "cloud-e-infraestructura": "cloud-infraestructura",
          "desarrollo-y-herramientas": "desarrollo-herramientas",
          "liderazgo-y-gestion": "liderazgo-gestion",
          "comunicacion-y-efectividad": "comunicacion-efectividad",
          "negocio-e-innovacion": "negocio-innovacion"}
for _r in d:
    if _r["id"] in _rev:
        _r["area"] = _ALIAS.get(_rev[_r["id"]], _rev[_r["id"]])
if _rev:
    # `tipo_contenido` se deriva del area; si el area cambia y este no, el
    # reporte se contradice consigo mismo en la misma pagina.
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from vocab import TIPO_TECNICO
    for _r in d:
        if _r["id"] in _rev:
            _r["tipo_contenido"] = "tecnico" if _r["area"] in TIPO_TECNICO else "transversal"
    print(f"areas tomadas de la ficha revisada: {len(_rev)}")

AREAS = {
    "datos-analitica": "Datos y analítica",
    "cloud-infraestructura": "Cloud e infraestructura",
    "desarrollo-herramientas": "Desarrollo y herramientas",
    "liderazgo-gestion": "Liderazgo y gestión",
    "comunicacion-efectividad": "Comunicación y efectividad",
    "negocio-innovacion": "Negocio e innovación",
}


def pct(n, t):
    return f"{100*n/t:.0f}%" if t else "-"


L = []
w = L.append
w("# Mapa de certificados\n")
w(f"Generado sobre {len(d)} registros. Un registro es **una credencial**: un curso con "
  "certificado de LinkedIn y certificado PMI cuenta dos veces, porque son dos documentos "
  "con identificadores y URLs de verificación distintas.\n")

w("## Cobertura\n")
w("| | registros | con archivo | con fecha | con horas | verificable en público |")
w("|---|---:|---:|---:|---:|---:|")
por_origen = defaultdict(list)
for r in d:
    por_origen[r["origen"]].append(r)
for o, rs in sorted(por_origen.items(), key=lambda x: -len(x[1])):
    n = len(rs)
    w(f"| {o} | {n} | {sum(1 for r in rs if r['archivos'])} | "
      f"{sum(1 for r in rs if r['fecha'])} | {sum(1 for r in rs if r['horas'])} | "
      f"{sum(1 for r in rs if r.get('verificable_publico'))} |")
n = len(d)
w(f"| **Total** | **{n}** | **{sum(1 for r in d if r['archivos'])}** | "
  f"**{sum(1 for r in d if r['fecha'])}** | **{sum(1 for r in d if r['horas'])}** | "
  f"**{sum(1 for r in d if r.get('verificable_publico'))}** |\n")

w("## Horas, sin contar dos veces\n")
w("Las horas son la **duración del contenido**, no tiempo cronometrado: es lo que "
  "declara el emisor y lo que imprime el propio certificado. Es la misma unidad que "
  "usa LinkedIn en su historial, así que la cifra es comparable con la que muestra "
  "la plataforma.\n")
# every credential except PMI duplicates and itineraries, which double-count
cursos = [r for r in d if r["tipo"] != "itinerario" and r["programa"] != "PMI"]
itin = [r for r in d if r["tipo"] == "itinerario"]
hc = sum(r["horas"] or 0 for r in cursos)
hi = sum(r["horas"] or 0 for r in itin)
por_plataforma = {}
for r in cursos:
    por_plataforma.setdefault(r["origen"], 0)
    por_plataforma[r["origen"]] += r["horas"] or 0
w(f"- Cursos y certificaciones: **{hc:.0f} h** en {len(cursos)} credenciales.")
for o, h in sorted(por_plataforma.items(), key=lambda x: -x[1]):
    if h:
        w(f"  - {o}: {h:.0f} h")
w(f"- Itinerarios: {hi:.0f} h en {len(itin)}, que **agrupan cursos ya contados arriba**.")
w(f"- Cifra publicable: **{hc:.0f} h**. Sumar las dos daría {hc+hi:.0f} h, que sería "
  "contar el mismo contenido dos veces.")
w("- Las variantes PMI se excluyen del total: son el mismo curso con un segundo "
  "certificado, no horas adicionales.\n")

w("## Distribución por área\n")
w("| Área | credenciales | % | horas |")
w("|---|---:|---:|---:|")
ca = Counter(r["area"] for r in cursos)
for a, c in ca.most_common():
    h = sum(r["horas"] or 0 for r in cursos if r["area"] == a)
    w(f"| {AREAS.get(a, a or '(sin área)')} | {c} | {pct(c, len(cursos))} | {h:.0f} |")
tec = [r for r in cursos if r["tipo_contenido"] == "tecnico"]
ht = sum(r["horas"] or 0 for r in tec)
w(f"\nBloque técnico: **{len(tec)} de {len(cursos)}** credenciales ({pct(len(tec), len(cursos))}), "
  f"pero **{ht:.0f} de {hc:.0f} horas** ({pct(ht, hc)}).")
w("\nEsa brecha es el argumento para contar horas y no cursos: lo técnico son cursos largos "
  f"({ht/max(len(tec),1):.1f} h de media) y lo transversal son cursos de una hora "
  f"({(hc-ht)/max(len(cursos)-len(tec),1):.1f} h de media). Ordenar por volumen de "
  "credenciales entierra justamente el bloque que un reclutador técnico busca.\n")

w("## Tecnologías con más respaldo\n")
tc = Counter(t for r in cursos for t in (r.get("tecnologias") or []))
w("| Tecnología | credenciales | horas |")
w("|---|---:|---:|")
for t, c in tc.most_common(22):
    h = sum(r["horas"] or 0 for r in cursos if t in (r.get("tecnologias") or []))
    w(f"| {t} | {c} | {h:.0f} |")
w("")

w("## Formación pagada por el empleador\n")
ten = defaultdict(list)
for r in d:
    if r.get("tenant") and r["tenant"] != "www":
        ten[r["tenant"]].append(r)
if ten:
    w("Udemy Business deja rastro del tenant en `long_url`, así que se puede separar "
      "lo que costeó una empresa de lo que se pagó por cuenta propia. Ambas verifican "
      "igual en `udemy.com`.\n")
    for t, rs in sorted(ten.items(), key=lambda x: -len(x[1])):
        hs = sum(r["horas"] or 0 for r in rs)
        años = sorted({(r["fecha"] or "?")[:4] for r in rs})
        w(f"- **{t}**: {len(rs)} certificados, {hs:.0f} h, {años[0]}–{años[-1]}")
    prop = [r for r in d if r.get("tenant") == "www"]
    w(f"- **cuenta personal**: {len(prop)} certificados, "
      f"{sum(r['horas'] or 0 for r in prop):.0f} h\n")

w("## Verificación\n")
ver = [r for r in d if r.get("verificable_publico")]
w(f"{len(ver)} de {len(d)} credenciales resuelven hoy en una URL pública.\n")
for o, rs in sorted(por_origen.items()):
    v = [r for r in rs if r.get("verificable_publico")]
    if v:
        w(f"- **{o}**: {len(v)}/{len(rs)}")
li_no = [r for r in d if r["origen"] == "LinkedIn Learning"
         and r["credencial_id"] and not r.get("verificable_publico")]
w(f"\n{len(li_no)} credenciales de LinkedIn Learning tienen su token asignado pero el "
  "enlace público está apagado: la URL existe y devuelve 404 hasta que se active "
  "«Create certificate link», que es una decisión aparte de descargar el PDF.\n")

w("## Huecos\n")
for etiqueta, cond in [
        ("sin archivo en disco", lambda r: not r["archivos"]),
        ("sin fecha", lambda r: not r["fecha"]),
        ("sin identificador de credencial", lambda r: not r.get("credencial_id")),
]:
    g = [r for r in d if cond(r)]
    w(f"\n**{len(g)} {etiqueta}**")
    if g:
        c = Counter((r["origen"], r["programa"]) for r in g)
        for (o, p), k in c.most_common(8):
            w(f"- {o} / {p}: {k}")

w("\n## Curaduría pendiente\n")
rec_p = ROOT / "data/reconciliacion.json"
if rec_p.exists():
    rec = json.load(open(rec_p, encoding="utf-8"))
    usados = {r["match_id"] for r in rec if r["score"] >= 0.6}
    huerf = [r for r in d if r["id"] not in usados and r["programa"] != "PMI"]
    EMPLEO = ("empleo", "curriculum", "entrevista", "recruiter", "contrataci",
              "acoso", "conflicto", "gente difícil", "gerentes difíciles",
              "búsqueda de", "premium career", "encontrar trabajo", "interview")
    cluster = [r for r in huerf
               if any(k in (r["titulo"] or "").lower() for k in EMPLEO)]
    resto = [r for r in huerf if r not in cluster]
    w(f"{len(huerf)} credenciales del mapa no tienen ficha en la colección. "
      "Se separan en dos grupos que piden decisiones opuestas.\n")
    w(f"**Grupo de búsqueda de empleo y conflicto laboral ({len(cluster)})** — "
      "coincide con lo que ya se sacó de la hoja de cálculo. Publicarlas dice "
      "«estuve buscando trabajo» y «tuve conflictos en el trabajo», que es "
      "información sobre la persona, no sobre su formación. Recomendación: "
      "mantenerlas fuera.\n")
    def marca(r):
        if r["origen"] != "LinkedIn Learning":
            return ""   # Udemy y Credly son públicos por diseño, no por decisión
        return " — **su enlace público está activo hoy**" if r.get("verificable_publico") else ""
    for r in cluster:
        w(f"- {r['titulo']}{marca(r)}")
    w(f"\n**Sin ficha por omisión de la hoja, no por decisión ({len(resto)})** — "
      "aquí sí conviene crear la ficha:\n")
    for r in resto:
        h = f", {r['horas']:.0f} h" if r.get("horas") else ""
        w(f"- {r['titulo']} — {r['origen']}{h}{marca(r)}")

w("\n## Datos personales\n")
pii = [r for r in d if r.get("pii")]
if pii:
    w("Los siguientes documentos imprimen datos personales y **no deben publicarse tal cual**:\n")
    for r in pii:
        w(f"- {r['titulo']} — {', '.join(r['pii'])}")
        for a in r["archivos"]:
            w(f"  - `{a['ruta']}`")
else:
    w("Sin hallazgos.")

w("\n## Vigencia\n")
venc = [r for r in d if r.get("expira") and not r.get("vigente")]
for r in venc:
    w(f"- **{r['titulo']}** venció el {r['expira'][:10]}. Debe mostrarse como vencida.")
ret = [r for r in d if r.get("retirado")]
w(f"\n{len(ret)} cursos de LinkedIn Learning están **retirados del catálogo**. "
  "El certificado sigue siendo válido, pero el curso ya no existe: si se cierra la "
  "cuenta, el PDF descargado es la única copia que queda.\n")

# flat view for eyeballing and for pasting into a spreadsheet
import csv
with open(ROOT / "data/mapa-certificados.tsv", "w", newline="", encoding="utf-8") as fh:
    cols = ["id", "origen", "programa", "tipo", "titulo", "fecha", "horas", "area",
            "tipo_contenido", "tecnologias", "competencias", "nivel", "estado_curso",
            "credencial_id", "verify_url", "verificable_publico", "instructores",
            "archivos"]
    wr = csv.writer(fh, delimiter="\t", quoting=csv.QUOTE_MINIMAL)
    wr.writerow(cols)
    for r in sorted(d, key=lambda x: (x["origen"], x.get("fecha") or "")):
        wr.writerow([
            r.get("id"), r.get("origen"), r.get("programa"), r.get("tipo"),
            r.get("titulo"), r.get("fecha"), r.get("horas"), r.get("area"),
            r.get("tipo_contenido"),
            "; ".join(r.get("tecnologias") or []),
            "; ".join((r.get("competencias") or [])[:6]),
            r.get("nivel"), r.get("estado_curso"), r.get("credencial_id"),
            r.get("verify_url"), r.get("verificable_publico"),
            "; ".join(i.get("nombre") or "" for i in (r.get("instructores") or [])),
            " | ".join(a["ruta"] for a in (r.get("archivos") or [])),
        ])

(ROOT / "reports").mkdir(exist_ok=True)
(ROOT / "reports/mapa-certificados.md").write_text("\n".join(L), encoding="utf-8")
print(f"reports/mapa-certificados.md  ({len(L)} lineas)")
