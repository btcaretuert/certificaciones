#!/usr/bin/env python3
"""Orquestador de la migracion. Un solo uso, reproducible y auditable.

    python3 scripts/migracion/run.py --pdfs certs-src/_origen [--dry-run]

Produce:
  src/content/certificates/*.yaml   fichas publicables
  private/certificates/*.yaml       fichas retenidas (gitignoreadas)
  reports/migration-report.md       que quedo vacio, que falta, que sobra
  reports/pii-report.md             hallazgos de datos personales
"""
from __future__ import annotations

import argparse
import shutil
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import emit  # noqa: E402
import match as matcher  # noqa: E402
import pdfmeta  # noqa: E402
import sheet  # noqa: E402
from classify_bridge import classify_all  # noqa: E402
from manual_udemy import UDEMY  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", type=Path, required=True)
    ap.add_argument("--pdfs", type=Path, required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    node = shutil.which("node")
    if not node:
        print("ERROR: node no esta en el PATH", file=sys.stderr)
        return 1

    print("1/6  parseando el Sheet…")
    rows, hidden_titles = sheet.parse(args.xlsx)
    print(f"     {len(rows)} certificados, {len(hidden_titles)} en la hoja 'Ocultos'")

    print("2/6  leyendo los PDFs…")
    pdfs = sorted(args.pdfs.rglob("*.pdf"))
    infos = {p: pdfmeta.analyze(p) for p in pdfs}
    sin_texto = sum(1 for i in infos.values() if i.necesita_ocr)
    print(f"     {len(pdfs)} PDFs; {sin_texto} sin capa de texto (requieren revision visual)")

    print("3/6  cruce en cascada…")
    texts = {p: i.text for p, i in infos.items()}
    matches = matcher.cross(rows, pdfs, texts)
    por_metodo = Counter(m.method for m in matches)
    localizados = sum(1 for m in matches if m.pdf)
    print(f"     {localizados}/{len(rows)} localizados  {dict(por_metodo)}")

    print("4/6  clasificando…")
    payload = [{"title": r.title, "skills": r.skills, "issuer": r.platform} for r in rows]
    cls = classify_all(payload, ROOT, node)
    print(f"     reglas {cls['rules_version']}")

    print("5/6  generando fichas…")
    hidden_norm = {sheet.norm(t) for t in hidden_titles}
    public_dir = ROOT / "src" / "content" / "certificates"
    private_dir = ROOT / "private" / "certificates"
    taken: set[str] = set()
    pii_rows: list[tuple[str, str, str]] = []
    ocr_rows: list[tuple[str, str]] = []
    vac: Counter[str] = Counter()
    escritas = Counter()

    for m, c in zip(matches, cls["results"]):
        row = m.row
        info = infos.get(m.pdf) if m.pdf else None
        udemy = next((v for k, v in UDEMY.items() if m.pdf and m.pdf.stem.startswith(k)), None)

        issued = (info.issued if info else None) or (udemy[1] if udemy else None)
        hours = (info.hours if info else None) or (udemy[2] if udemy else None)
        cred = info.credential_id if info else None
        verify = info.verify_url if info else None

        extracted = [k for k, v in
                     (("issued", issued), ("hours", hours),
                      ("credential_id", cred), ("verify_url", verify)) if v]

        # Curaduria. La maquina NUNCA escribe 'private' por su cuenta:
        #   - 'private' solo si el dueno YA lo decidio (hoja 'Ocultos').
        #   - 'review'  si el clasificador lo sugiere: queda sin publicar hasta
        #     que el dueno resuelva. Fail-closed, como el default del esquema.
        #   - 'public'  el resto.
        retenida = sheet.norm(row.title) in hidden_norm
        if retenida:
            visibility = "private"
        elif c["curation"]["flag"]:
            visibility = "review"
        else:
            visibility = "public"

        data_pdf_bloqueado = bool(info and info.pii)
        slug = emit.unique_slug(emit.slugify(row.title), taken)
        data = {
            "title": row.title,
            "issuer": row.platform,
            "platform": row.platform,
            "area": c["area"], "domain": c["domain"], "tech": c["tech"], "type": c["type"],
            "official": row.platform == "International",
            "skills": row.skills,
            "issued": issued, "hours": hours,
            "credential_id": cred, "verify_url": verify,
            "pdf": (slug if m.pdf and not data_pdf_bloqueado else None),
            "thumb": None,
            "weight": row.weight or 1,
            "featured": (row.weight or 1) >= 20,
            "visibility": visibility,
            "curation_note": ("migrado desde la hoja 'Ocultos'" if retenida
                              else "PDF no publicado: contiene datos personales impresos"
                              if data_pdf_bloqueado else ""),
            "curation_flag": bool(c["curation"]["flag"]),
            "manual_fields": [],
            "auto_snapshot": {"area": c["area"], "domain": c["domain"],
                              "type": c["type"], "tech": c["tech"]},
            "classification_confidence": c["confidence"],
            "classification_signals": c["signals"],
            "classification_rules_version": cls["rules_version"],
            "needs_review": bool(c["needs_review"]),
            "extracted_fields": extracted,
        }
        for k in ("issued", "hours", "credential_id", "verify_url", "pdf"):
            if data[k] is None:
                vac[k] += 1
        # Un PDF con dato personal impreso NO se publica. La ficha si: el
        # certificado es legitimo y valioso; lo que no puede salir es el
        # documento escaneado. Se conserva el original en certs-src/ para poder
        # redactarlo y republicarlo despues.
        if info and info.pii:
            data_pdf_bloqueado = True
        if info:
            for tipo, frag in info.pii:
                pii_rows.append((slug, tipo, frag))
            if info.necesita_ocr:
                # No es un hallazgo: es la imposibilidad de afirmar nada. Se
                # cuenta aparte para que el numero de hallazgos siga siendo
                # legible como "cuantos PDFs traen datos personales".
                ocr_rows.append((slug, str(m.pdf.relative_to(args.pdfs)) if m.pdf else ""))
        if not args.dry_run:
            emit.write(data, slug, public_dir, private_dir)
        escritas[visibility] += 1

    # DEFECTO 2: los 13 de la hoja 'Ocultos' YA NO figuran entre los 249: esa
    # hoja es el registro de lo que se quito, no una marca sobre filas vivas.
    # Sin esto, la curaduria previa se pierde sin dejar rastro y en unos meses
    # nadie recuerda por que faltan.
    for titulo in hidden_titles:
        if sheet.norm(titulo) in {sheet.norm(r.title) for r in rows}:
            continue  # ya existe como fila; no duplicar
        slug = emit.unique_slug(emit.slugify(titulo), taken)
        if not args.dry_run:
            emit.write({
                "title": titulo, "issuer": "LinkedIn", "platform": "LinkedIn",
                "area": "sin-clasificar", "domain": "sin-clasificar",
                "tech": [], "type": "transversal", "official": False, "skills": [],
                "issued": None, "hours": None, "credential_id": None, "verify_url": None,
                "pdf": None, "thumb": None, "weight": 1, "featured": False,
                "visibility": "private",
                "curation_note": "retirado por el dueno antes de la migracion (hoja 'Ocultos')",
                "curation_flag": True, "manual_fields": [], "auto_snapshot": None,
                "classification_confidence": "low", "classification_signals": "",
                "classification_rules_version": cls["rules_version"],
                "needs_review": False, "extracted_fields": [],
            }, slug, public_dir, private_dir)
        escritas["private"] += 1

    print(f"     publicables {escritas['public']}  por decidir {escritas['review']}  retenidas {escritas['private']}")

    print("6/6  reportes…")
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    faltan = [m.row for m in matches if not m.pdf]
    extra = matcher.sobrantes(rows, matches, pdfs)
    if not args.dry_run:
        (reports / "migration-report.md").write_text(
            "# Reporte de migracion\n\n"
            f"- Certificados en el Sheet: **{len(rows)}**\n"
            f"- Con PDF localizado: **{localizados}** ({localizados / len(rows) * 100:.0f}%)\n"
            f"- Metodo: {dict(por_metodo)}\n"
            f"- Publicables: **{escritas['public']}** · Retenidas: **{escritas['private']}**\n"
            f"- Reglas del clasificador: `{cls['rules_version']}`\n\n"
            "## Campos vacios\n\n"
            + "".join(f"- `{k}`: {v}\n" for k, v in vac.most_common())
            + f"\n## Sin PDF ({len(faltan)})\n\n"
            + "".join(f"- #{r.n} {r.title}\n" for r in faltan)
            + f"\n## PDFs sin fila en el Sheet ({len(extra)})\n\n"
            + "".join(f"- `{p.parent.name}/{p.name}`\n" for p in extra),
            encoding="utf-8")
        (reports / "pii-report.md").write_text(
            "# Revision de datos personales\n\n"
            "Un hallazgo por linea. **Ningun PDF se publica hasta que su linea este resuelta.**\n"
            "El nombre del titular no es hallazgo: es el proposito del certificado.\n\n"
            f"## Hallazgos automaticos: {len(pii_rows)}\n\n"
            + ("| ficha | tipo | evidencia |\n|---|---|---|\n"
               + "".join(f"| {a} | {t} | `{f}` |\n" for a, t, f in sorted(pii_rows))
               if pii_rows else "Ninguno.\n")
            + f"\n## Sin capa de texto: {len(ocr_rows)}\n\n"
            "No se puede afirmar nada sobre su contenido sin verlos. **Pendientes de\n"
            "revision visual**, no aprobados.\n\n"
            + "".join(f"- `{a}` — {b}\n" for a, b in sorted(ocr_rows)),
            encoding="utf-8")
    print(f"     sin PDF: {len(faltan)} · sobrantes: {len(extra)}")
    print(f"     datos personales: {len(pii_rows)} hallazgos · {len(ocr_rows)} sin capa de texto (revision visual)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
