# Pruebas de los módulos de migración

**Nadie las ejecuta automáticamente, y conviene saberlo.** Vivían en
`tests/unit/`, donde parecían parte de la suite pero no lo eran: vitest solo
recoge `*.test.{js,ts}` y no corre Python, no hay `pytest.ini` ni
`pyproject.toml`, y CI no instala Python. El sufijo `_test.py` tampoco coincide
con el patrón por omisión de pytest.

Se conservan porque lo que prueban importa, y su propio docstring lo dice mejor
que este README: sin la prueba del detector, «0 hallazgos en 235 PDFs» es
indistinguible de un detector roto que nunca detecta nada.

Para correrlas:

```bash
pip install -r requirements.txt pytest
python3 -m pytest scripts/datos/tests/ -o python_files='*_test.py'
```

`sheet_parse_test.py` además necesita el XLSX original, que vive en `input/` y
no se versiona: en un clon fallará por eso, no por un defecto.
