# Fixtures de la regla de degradacion

Cada archivo prueba que un dato malo NO tumba el build, y que el fallback
apunta a la direccion segura.

| Archivo | Defecto | Esperado |
|---|---|---|
| `typo-visibilidad.yaml` | `visibility: publico` | `visibility === 'private'` |
| `datos-sucios.yaml` | `javascript:` en `verify_url`, `area` y `type` inexistentes, `""` en fecha y horas | campos neutralizados a `null`/fallback, ficha sigue publicada |
| `sin-titulo.yaml` | falta `title`, que es obligatorio | `visibility === 'private'` por el catch de objeto |

Verificado empiricamente el 2026-09-07 contra astro 7.3.1 / zod 4.5.4: los
cuatro casos terminan en `exit 0`.
