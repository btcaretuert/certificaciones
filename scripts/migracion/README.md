# Migración — un solo uso, ya ejecutada

Trajo las fichas desde la hoja de cálculo y los PDF de Drive. **Corrió una vez y
no debe volver a correr**: escribe directamente sobre `src/content/certificates/`
y `private/certificates/`, así que una segunda pasada sobrescribiría las 252
fichas con lo que diga la hoja, perdiendo toda la curaduría hecha a mano desde
entonces.

Se conserva como registro de cómo se construyó el corpus, no como herramienta.

```bash
# Solo si sabes exactamente por qué lo estás haciendo:
python3 scripts/migracion/run.py --pdfs certs-src/_origen --dry-run
```

La fuente de verdad hoy son los YAML, no la hoja.
