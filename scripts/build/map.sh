#!/usr/bin/env bash
# Rebuilds data/mapa-certificados.json from the raw sources.
# Everything here reads local files; the network passes (harvest, download) live
# in scripts/linkedin/ and are run on demand, not as part of this build.
set -euo pipefail
cd "$(dirname "$0")/../.."

# the download pass writes its log to the scratchpad while it runs; pick up the
# freshest copy so a rebuild mid-download still sees every token harvested so far
SCRATCH="${SCRATCH:-/tmp/claude-1000/-srv-personales-trabajos-github-pages-certificaciones/1b35664a-f1ff-4423-bc43-219cbf1ec275/scratchpad}"
if [ -f "$SCRATCH/download_log.jsonl" ]; then
  cp "$SCRATCH/download_log.jsonl" data/_raw/download_log.jsonl
fi

echo "1/7  PDFs reimpresos de LinkedIn (2026)"
python3 scripts/build/parse_reprints.py certs-src/_reimpresos    data/reimpresos.json

echo "2/7  PDFs subidos a mano"
python3 scripts/build/parse_reprints.py input/otros_certs        data/otros_certs.json

echo "3/7  corpus historico de Drive (2019-2022)"
python3 scripts/build/parse_legacy.py

echo "4/7  MOOC y formacion interna"
python3 scripts/build/parse_otros.py > /dev/null

echo "5/7  consolidacion"
python3 scripts/build/consolidate.py

echo "6/7  reconciliacion contra la coleccion de contenido"
python3 scripts/build/reconcile.py | head -3

echo "7/7  reporte y barrido de datos personales"
python3 scripts/build/report.py
python3 scripts/build/scan_pii.py | head -1
echo
echo "listo: data/mapa-certificados.json  data/mapa-certificados.tsv  reports/mapa-certificados.md"
