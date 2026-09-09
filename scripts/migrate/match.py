"""Cruce en cascada entre las filas del Sheet y los PDFs del Drive.

Cada nivel opera SOLO sobre lo que quedo sin resolver en el anterior, y cada
emparejamiento consume su PDF: un archivo no puede asignarse a dos filas.

Cobertura medida sobre el corpus real: 235 de 249.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass
from pathlib import Path

from manual_udemy import DUPLICADOS, INTERNACIONALES, UDEMY
from sheet import Row, norm

# LinkedIn Learning nombra asi: CertificadoDeFinalizacion_<titulo>.pdf
_PREFIJO_LINKEDIN = re.compile(r"^CertificadoDeFinalizacion[_ ]", re.I)

# Umbral del emparejamiento difuso. Por debajo, se prefiere no emparejar:
# un PDF mal asignado es peor que uno faltante, porque publica evidencia
# que no corresponde al curso.
FUZZY_CUTOFF = 0.90


@dataclass
class Match:
    row: Row
    pdf: Path | None
    method: str  # filename | text | rule | manual | none


def _titulo_desde_archivo(p: Path) -> str:
    return norm(_PREFIJO_LINKEDIN.sub("", p.stem))


def cross(rows: list[Row], pdfs: list[Path], texts: dict[Path, str] | None = None) -> list[Match]:
    texts = texts or {}
    disponibles = {p for p in pdfs if p.stem not in DUPLICADOS}
    pendientes = list(rows)
    resultados: dict[int, Match] = {}

    def asignar(row: Row, pdf: Path, method: str) -> None:
        resultados[row.n] = Match(row=row, pdf=pdf, method=method)
        disponibles.discard(pdf)

    # ── nivel 1: nombre de archivo exacto ────────────────────────────────
    por_nombre: dict[str, list[Path]] = {}
    for p in disponibles:
        por_nombre.setdefault(_titulo_desde_archivo(p), []).append(p)
    for row in list(pendientes):
        cand = [p for p in por_nombre.get(norm(row.title), []) if p in disponibles]
        if cand:
            asignar(row, sorted(cand)[0], "filename")
            pendientes.remove(row)

    # ── nivel 2: nombre de archivo difuso ────────────────────────────────
    for row in list(pendientes):
        pool = {_titulo_desde_archivo(p): p for p in disponibles}
        hit = difflib.get_close_matches(norm(row.title), list(pool), n=1, cutoff=FUZZY_CUTOFF)
        if hit:
            asignar(row, pool[hit[0]], "filename")
            pendientes.remove(row)

    # ── nivel 3: texto del PDF ───────────────────────────────────────────
    for row in list(pendientes):
        nt = norm(row.title)
        mejor, score = None, 0.0
        for p in disponibles:
            t = norm(texts.get(p, ""))
            if not t:
                continue
            s = 1.0 if nt and nt in t else difflib.SequenceMatcher(None, nt, t[:400]).ratio()
            if s > score:
                mejor, score = p, s
        if mejor and score >= FUZZY_CUTOFF:
            asignar(row, mejor, "text")
            pendientes.remove(row)

    # ── nivel 4: reglas sobre el nombre (internacionales) ────────────────
    por_stem = {p.stem: p for p in disponibles}
    for stem, titulo in INTERNACIONALES.items():
        p = por_stem.get(stem)
        if not p or p not in disponibles:
            continue
        row = next((r for r in pendientes if norm(r.title) == norm(titulo)), None)
        if row:
            asignar(row, p, "rule")
            pendientes.remove(row)

    # ── nivel 5: tabla manual de Udemy (lectura visual) ──────────────────
    for prefijo, (titulo, _fecha, _horas) in UDEMY.items():
        p = next((q for q in disponibles if q.stem.startswith(prefijo)), None)
        if not p:
            continue
        row = next((r for r in pendientes if norm(r.title) == norm(titulo)), None)
        if row:
            asignar(row, p, "manual")
            pendientes.remove(row)

    for row in pendientes:
        resultados[row.n] = Match(row=row, pdf=None, method="none")

    return [resultados[r.n] for r in rows]


def sobrantes(rows: list[Row], matches: list[Match], pdfs: list[Path]) -> list[Path]:
    """PDFs del Drive sin fila en el Sheet: certificados nunca listados."""
    usados = {m.pdf for m in matches if m.pdf}
    return sorted(p for p in pdfs if p not in usados and p.stem not in DUPLICADOS)
