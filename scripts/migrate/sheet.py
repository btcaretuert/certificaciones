"""Extraccion del Google Sheet de origen.

El export CSV PIERDE los hipervinculos: viven en las relaciones del XLSX
(`xl/worksheets/_rels/sheet1.xml.rels`), no en el texto de la celda. Por eso
todo el parseo se hace sobre el XLSX.
"""
from __future__ import annotations

import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

SHEET_ID = "1MGMMkg1xLcsw_1FjOM_AA5YZ4JWtUx-D4tmePPD5Tao"
XLSX_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

# Columnas de la hoja principal (0-indexed) -> plataforma.
# Se evaluan en este orden: la primera marcada gana.
PLATFORM_COLUMNS = [(7, "International"), (5, "Udemy"), (6, "MOOC"), (4, "PMI"), (3, "LinkedIn")]


def norm(s: str) -> str:
    """Minusculas, sin tildes, sin puntuacion, espacios colapsados."""
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


@dataclass
class Row:
    n: int
    title: str
    old_category: str
    platform: str
    weight: int | None
    drive_urls: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)


def _cells(sheet_xml: str, shared: list[str]) -> dict[int, dict[str, str]]:
    """Celdas por fila, indexadas por letra de columna.

    Se usa un parser XML real y NO una expresion regular: las celdas vacias son
    self-closing (`<c r="D2" s="20"/>`), asi que un patron `<c ...>(.*?)</c>`
    no encuentra su cierre y se traga el contenido de la siguiente celda con
    valor. Eso asignaba la marca de plataforma a la columna equivocada.
    """
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ET.fromstring(sheet_xml)
    grid: dict[int, dict[str, str]] = {}
    for row_el in root.iterfind(".//m:row", ns):
        rn = int(row_el.get("r", "0"))
        row: dict[str, str] = {}
        for c in row_el.iterfind("m:c", ns):
            ref = c.get("r") or ""
            col = re.match(r"[A-Z]+", ref)
            v = c.find("m:v", ns)
            if not col or v is None or v.text is None:
                continue
            val = v.text
            if c.get("t") == "s" and val.isdigit() and int(val) < len(shared):
                val = shared[int(val)]
            row[col.group()] = val
        if row:
            grid[rn] = row
    return grid


def parse(xlsx_path: Path) -> tuple[list[Row], list[str]]:
    """Devuelve (filas de la hoja principal, titulos de la hoja `Ocultos`)."""
    z = zipfile.ZipFile(xlsx_path)
    shared = [
        re.sub(r"<[^>]+>", "", s)
        for s in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode(), re.S)
    ]

    # --- hoja 1: certificados + hipervinculos ---
    sheet1 = z.read("xl/worksheets/sheet1.xml").decode()
    rels = dict(
        re.findall(
            r'Id="([^"]+)"[^>]*?Target="([^"]+)"',
            z.read("xl/worksheets/_rels/sheet1.xml.rels").decode(),
        )
    )
    links: dict[int, list[str]] = {}
    for rid, _col, rn in re.findall(r'<hyperlink r:id="([^"]+)" ref="([A-Z]+)(\d+)"', sheet1):
        links.setdefault(int(rn), []).append(rels[rid].replace("&amp;", "&"))

    # --- hoja 2 `Aptitudes`: join POR NOMBRE, nunca por numero ---
    # La numeracion de esa hoja quedo congelada cuando se insertaron filas en la
    # principal: unir por numero cruza 20 de 200 filas (verificado). Por nombre
    # acierta 199 de 200.
    skills_by_title: dict[str, list[str]] = {}
    for row in _cells(z.read("xl/worksheets/sheet2.xml").decode(), shared).values():
        if row.get("B"):
            skills_by_title[norm(row["B"])] = [row[c] for c in "DEFGH" if row.get(c)]

    # --- hoja 6 `Ocultos`: curaduria que el dueno ya hizo a mano ---
    hidden = [
        row["A"]
        for rn, row in sorted(_cells(z.read("xl/worksheets/sheet6.xml").decode(), shared).items())
        if row.get("A")
    ]

    rows: list[Row] = []
    for rn, cell in sorted(_cells(sheet1, shared).items()):
        if rn == 1 or not re.fullmatch(r"\d+(?:\.0+)?", cell.get("A", "").strip()):
            continue
        title = (cell.get("C") or "").strip()
        if not title:
            continue
        cols = [cell.get(chr(ord("A") + i), "").strip() for i in range(9)]
        platform = next((p for i, p in PLATFORM_COLUMNS if cols[i]), "LinkedIn")
        try:
            weight = int(float(cols[8])) if cols[8] else None
        except ValueError:
            weight = None
        rows.append(
            Row(
                n=int(float(cols[0])),
                title=title,
                old_category=cols[1],
                platform=platform,
                weight=weight,
                drive_urls=links.get(rn, []),
                skills=skills_by_title.get(norm(title), []),
            )
        )
    return rows, hidden
