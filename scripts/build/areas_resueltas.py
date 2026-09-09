#!/usr/bin/env python3
"""Resolucion manual del area en las 45 fichas donde la ficha y el clasificador
discrepaban.

Criterio unico: el area es DE QUE TRATA el curso, no a quien va dirigido.
"Lenguaje no verbal para lideres" es comunicacion; "Trucos creativos para
lideres" es innovacion. El sufijo "para lideres" es publico objetivo, no tema.

Cada entrada queda con `manual_fields: [area]`, incluidas las que no cambian:
la revision ya ocurrio y ninguna corrida futura debe volver a moverlas.
"""
import glob, os, re
from pathlib import Path
import yaml

C, D, L, N, K, R = ("comunicacion-y-efectividad", "datos-y-analitica",
                    "liderazgo-y-gestion", "negocio-e-innovacion",
                    "cloud-e-infraestructura", "desarrollo-y-herramientas")

DECIDIDO = {
    # el clasificador tenia razon
    "Aprende LinkedIn Recruiter (2018)": L,
    "Cómo desarrollar la presencia ejecutiva": C,          # como te perciben, no como diriges
    "Cómo enfrentarse a los cambios": L,
    "Curso Completo de Claude Code: Crea Aplicaciones con IA": R,
    "Excel 2016: Gráficos y presentación de datos": D,     # el tema es visualizar, no Excel
    "Fundamentos de la tecnología blockchain": R,
    "GDPR: Reglamento europeo de protección de datos": D,  # gobierno de datos
    "Liderazgo en tiempos de transformación digital": L,
    "Master en Antigravity: Crea apps con IA y Vibe Coding": R,
    "OneNote Online esencial": R,
    "Recursos humanos: Contratación IT": L,
    "Resolución de problemas empresariales": N,
    "Transformación digital: Equipos online y trabajo colaborativo": L,
    "Transformación digital: Liderazgo": L,

    # ninguno de los dos: el clasificador manda GitLab a liderazgo y los
    # ecosistemas a cloud; la ficha manda las decisiones a negocio
    "Cómo mejorar tu capacidad de toma de decisiones": L,
    "Crea una atmósfera de trabajo productiva": L,
    "Estrategias para tomar decisiones": L,
    "GitLab esencial": R,
    "Introducción al diseño de ecosistemas": N,

    # la ficha tenia razon
    "Bill George sobre autoconocimiento, autenticidad, y liderazgo": L,
    "Cómo comunicar de forma efectiva en la empresa": C,
    "Cómo contactar con la gente (y que te responda)": C,
    "Cómo establecer y cumplir tus objetivos profesionales": C,
    "Cómo gestionar mejor tu tiempo": C,
    "Cómo superar el bloqueo creativo": N,
    "Comunicación en momentos de cambio": C,               # el tema es comunicar
    "Creatividad en la empresa": N,
    "DevOps esencial": K,
    "Digital Transformation: Interfaces conversacionales": D,
    "Diversidad e inclusión en empresas globales": L,
    "Domina las habilidades de vida sociales": C,
    "Economía naranja: Primeros pasos en cloud computing": K,
    "Evaluación de decisiones estratégicas": N,
    "Fred Kofman y la gestión de conflictos": C,
    "Fundamentos de big data: Modelos de negocio": D,
    "Fundamentos de la gestión del tiempo": C,
    "Habilidades de trabajo fundamentales": C,
    "Inglés de negocios: Dominar las reuniones en línea": C,
    "Lenguaje no verbal para líderes": C,                  # publico objetivo, no tema
    "Mejora tu competencia en conflictos": C,
    "Reuniones eficaces": C,
    "Toma de notas para profesionales": C,
    "Transformación digital: El rol de recursos humanos": L,
    "Trucos creativos para líderes": N,                    # publico objetivo, no tema
    "Yammer esencial": R,
}

cambios = marcadas = 0
vistos = set()
for f in sorted(glob.glob("src/content/certificates/*.yaml")):
    p = Path(f)
    txt = p.read_text(encoding="utf-8")
    d = yaml.safe_load(txt) or {}
    area = DECIDIDO.get((d.get("title") or "").strip())
    if not area:
        continue
    vistos.add((d.get("title") or "").strip())
    if d.get("area") != area:
        txt = re.sub(r'^area:.*$', f'area: "{area}"', txt, count=1, flags=re.M)
        print(f"  {d['title'][:52]:54} {d.get('area'):26} -> {area}")
        cambios += 1
    if "area" not in (d.get("manual_fields") or []):
        txt = re.sub(r'^manual_fields:.*$', 'manual_fields: ["area"]', txt, count=1, flags=re.M)
        marcadas += 1
    p.write_text(txt, encoding="utf-8")

faltan = set(DECIDIDO) - vistos
if faltan:
    print("\nNO ENCONTRADAS EN LA COLECCION:")
    for t in sorted(faltan):
        print(f"  {t}")
print(f"\nareas corregidas: {cambios}   fichas marcadas como revisadas: {marcadas}")
