"""Generacion de los archivos YAML de contenido.

Dos destinos segun curaduria:
  - `src/content/certificates/`  las publicables. Van al repositorio.
  - `private/certificates/`      las retenidas. gitignoreadas: en un repo
                                 publico, versionar una ficha retenida la hace
                                 legible, y el titulo ES el dato sensible.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

# Orden de claves en el YAML emitido. Estable para que los diffs del CMS sean
# legibles y no reordenen el archivo entero en cada guardado.
ORDEN = [
    "title", "issuer", "platform",
    "area", "domain", "tech", "type",
    "official", "skills", "issued", "hours", "credential_id", "verify_url",
    "pdf", "thumb", "weight", "featured",
    "visibility", "curation_note", "curation_flag",
    "manual_fields", "auto_snapshot", "classification_confidence",
    "classification_signals", "classification_rules_version",
    "needs_review", "extracted_fields",
]


def slugify(s: str, maxlen: int = 70) -> str:
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) > maxlen:
        s = s[:maxlen].rsplit("-", 1)[0]
    return s or "sin-titulo"


def unique_slug(base: str, taken: set[str]) -> str:
    slug, i = base, 2
    while slug in taken:
        slug = f"{base}-{i}"
        i += 1
    taken.add(slug)
    return slug


def _yaml_scalar(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v)
    # Comillas siempre en texto: evita que YAML interprete fechas, 'yes'/'no',
    # numeros con ceros a la izquierda o dos puntos como estructura.
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def to_yaml(data: dict) -> str:
    lines: list[str] = []
    for k in ORDEN:
        if k not in data:
            continue
        v = data[k]
        if isinstance(v, list):
            if not v:
                lines.append(f"{k}: []")
            else:
                lines.append(f"{k}:")
                lines.extend(f"  - {_yaml_scalar(x)}" for x in v)
        elif isinstance(v, dict):
            lines.append(f"{k}:")
            for kk, vv in v.items():
                if isinstance(vv, list):
                    lines.append(f"  {kk}: [{', '.join(_yaml_scalar(x) for x in vv)}]")
                else:
                    lines.append(f"  {kk}: {_yaml_scalar(vv)}")
        else:
            lines.append(f"{k}: {_yaml_scalar(v)}")
    return "\n".join(lines) + "\n"


def write(data: dict, slug: str, public_dir: Path, private_dir: Path) -> Path:
    """Escribe la ficha en el destino que corresponde a su visibilidad."""
    dest = public_dir if data.get("visibility") == "public" else private_dir
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / f"{slug}.yaml"
    path.write_text(to_yaml(data), encoding="utf-8")
    return path
