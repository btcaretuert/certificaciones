"""Puente al clasificador JavaScript.

El clasificador NO se reimplementa en Python. Vive en `src/lib/classify/` y se
invoca con node pasando JSON por stdin: una sola implementacion para el
navegador (hook preSave), el build y la migracion. Dos implementaciones
divergirian en silencio, y la divergencia solo se notaria como fichas mal
clasificadas meses despues.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

_RUNNER = """
import { classify, curationFlag, RULES_VERSION } from './src/lib/classify/index.js';
let raw = ''; for await (const c of process.stdin) raw += c;
const items = JSON.parse(raw);
process.stdout.write(JSON.stringify({
  rules_version: RULES_VERSION,
  results: items.map((it) => ({ ...classify(it), curation: curationFlag(it.title) })),
}));
"""


def classify_all(items: list[dict], repo_root: Path, node: str) -> dict:
    """items: [{title, skills?, issuer?}]  ->  {rules_version, results:[...]}"""
    runner = repo_root / ".classify-runner.mjs"
    runner.write_text(_RUNNER, encoding="utf-8")
    try:
        r = subprocess.run(
            [node, str(runner)],
            input=json.dumps(items).encode("utf-8"),
            capture_output=True, cwd=repo_root, timeout=180, check=False,
        )
        if r.returncode != 0:
            raise RuntimeError("clasificador fallo: " + r.stderr.decode("utf-8", "replace")[:500])
        return json.loads(r.stdout.decode("utf-8"))
    finally:
        runner.unlink(missing_ok=True)
