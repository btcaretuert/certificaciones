"""Extraccion de metadatos y deteccion de datos personales en los PDFs.

Dos plataformas traen capa de texto y se leen con `pdftotext`; los 17 de Udemy
son imagenes sin texto y requieren revision visual aparte (ver `necesita_ocr`).
"""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    # abreviaturas en espanol que difieren del ingles
    "ene": 1, "abr": 4, "ago": 8, "dic": 12, "set": 9,
}


@dataclass
class PdfInfo:
    path: Path
    text: str = ""
    issued: str | None = None
    hours: float | None = None
    credential_id: str | None = None
    verify_url: str | None = None
    pii: list[tuple[str, str]] = field(default_factory=list)  # (tipo, evidencia recortada)
    necesita_ocr: bool = False


def extract_text(path: Path) -> str:
    try:
        r = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"],
            capture_output=True, timeout=60, check=False,
        )
        return r.stdout.decode("utf-8", "replace")
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return ""


# ── fechas ────────────────────────────────────────────────────────────────
_DATE_PATTERNS = [
    # "el 27 de Enero de 2020"  (Udemy / MOOC en espanol)
    (re.compile(r"\b(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+de\s+(\d{4})", re.I), "dmy_es"),
    # "Issued Date: Sep 01, 2025"  (Google Cloud)
    (re.compile(r"(?:issued\s*date|issued)\s*:?\s*([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})", re.I), "mdy_en"),
    # "Mar 11, 2020"
    (re.compile(r"\b([A-Za-z]{3,})\s+(\d{1,2}),\s*(\d{4})\b"), "mdy_en"),
    # "20-ago-2019"  (formato antiguo de LinkedIn Learning)
    (re.compile(r"\b(\d{1,2})-([a-zA-Zñ]{3,})-(\d{4})\b"), "dmy_abbr"),
    # ISO suelto
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"), "iso"),
]


def parse_issued(text: str) -> str | None:
    for rx, kind in _DATE_PATTERNS:
        m = rx.search(text)
        if not m:
            continue
        try:
            if kind == "dmy_es":
                d, mes, y = m.group(1), m.group(2).lower(), m.group(3)
                mm = MESES.get(mes)
                if mm:
                    return f"{int(y):04d}-{mm:02d}-{int(d):02d}"
            elif kind == "mdy_en":
                mes, d, y = m.group(1)[:3].lower(), m.group(2), m.group(3)
                mm = MESES.get(mes)
                if mm:
                    return f"{int(y):04d}-{mm:02d}-{int(d):02d}"
            elif kind == "dmy_abbr":
                d, mes, y = m.group(1), m.group(2)[:3].lower(), m.group(3)
                mm = MESES.get(mes)
                if mm:
                    return f"{int(y):04d}-{mm:02d}-{int(d):02d}"
            elif kind == "iso":
                return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        except (ValueError, TypeError):
            continue
    return None


def parse_hours(text: str) -> float | None:
    # "2,5 total horas", "28 total hours", "39 minutos en total"
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*total\s*(?:horas|hours)", text, re.I)
    if m:
        return float(m.group(1).replace(",", "."))
    m = re.search(r"(\d+)\s*minutos?\s+en\s+total", text, re.I)
    if m:
        return round(int(m.group(1)) / 60, 2)
    # LinkedIn Learning: "Curso completado el ... • 1 h 5 min" / "• 45 min"
    m = re.search(r"[•·]\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?", text)
    if m and (m.group(1) or m.group(2)):
        h = int(m.group(1) or 0) + int(m.group(2) or 0) / 60
        return round(h, 2) if h > 0 else None
    return None


def parse_credential(text: str, filename: str) -> tuple[str | None, str | None]:
    """Devuelve (credential_id, verify_url)."""
    # Udemy: el NOMBRE DE ARCHIVO es el id de credencial, y la URL de
    # verificacion oficial se construye a partir de el.
    m = re.match(r"^(UC-[0-9a-zA-Z-]+)", filename)
    if m:
        cid = m.group(1)
        return cid, f"https://www.udemy.com/certificate/{cid}/"
    # Google Cloud: "ID: 0f880b92..."
    m = re.search(r"\bID:\s*([0-9a-f]{16,})\b", text)
    if m:
        return m.group(1), None
    m = re.search(r"n[uú]mero de certificado:\s*([A-Za-z0-9-]{6,})", text, re.I)
    if m:
        return m.group(1), None
    return None, None


# ── datos personales ──────────────────────────────────────────────────────
# Se publican 235 PDFs en un sitio abierto. Los certificados de organismos
# externos suelen imprimir documento de identidad; los de plataforma, el correo.
_PII_PATTERNS = [
    # RUT chileno. Se exige que NO venga precedido de un rotulo de identificador
    # de certificacion: "Certificant ID: 000851698" es un dato publicable, no un
    # documento de identidad, y tratarlo como PII esconderia justo el numero que
    # sirve para verificar la credencial.
    ("rut_chileno", re.compile(
        r"(?<!certificant id: )(?<!certificate id: )(?<!credential id: )"
        r"\b\d{1,2}\.?\d{3}\.?\d{3}[-‐]?[0-9kK]\b", re.I)),
    ("correo", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b")),
    ("telefono", re.compile(r"(?:\+?56|\(\+?56\))[\s-]?9[\s-]?\d{4}[\s-]?\d{4}\b")),
    ("documento", re.compile(r"\b(?:cedula|c[eé]dula|dni|pasaporte|identity\s+card|id\s+number)\b[\s:]*[\w.-]{5,}", re.I)),
    ("direccion", re.compile(r"\b(?:calle|avenida|avda\.?|pasaje|depto\.?|departamento)\s+[A-Za-zÁÉÍÓÚñÑ]+\s*\d+", re.I)),
    ("fecha_nacimiento", re.compile(r"\b(?:fecha de nacimiento|date of birth|born)\b", re.I)),
]

# El nombre del titular NO es un hallazgo: es el proposito del certificado.
_ESPERADO = re.compile(r"alejandro\s+retuert", re.I)


def detect_pii(text: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for tipo, rx in _PII_PATTERNS:
        for m in rx.finditer(text):
            frag = m.group(0)
            if _ESPERADO.search(frag):
                continue
            # correos de la propia plataforma no son dato personal del titular
            if tipo == "correo" and re.search(r"@(udemy|linkedin|google|coursera|edx)\.", frag, re.I):
                continue
            found.append((tipo, frag[:60]))
    return found


def analyze(path: Path) -> PdfInfo:
    info = PdfInfo(path=path)
    info.text = extract_text(path)
    if len(info.text.strip()) < 40:
        # Sin capa de texto: es una imagen. No se puede afirmar nada sobre su
        # contenido sin verla, asi que se marca en vez de darla por limpia.
        info.necesita_ocr = True
        cid, url = parse_credential("", path.name)
        info.credential_id, info.verify_url = cid, url
        return info
    info.issued = parse_issued(info.text)
    info.hours = parse_hours(info.text)
    info.credential_id, info.verify_url = parse_credential(info.text, path.name)
    info.pii = detect_pii(info.text)
    return info
