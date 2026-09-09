# Cosecha de las plataformas

Extraen de LinkedIn Learning y Udemy lo que sus exportaciones no dan. **No
participan del build ni de CI**, y no hay motivo para volver a correrlos salvo
que haya certificados nuevos que incorporar.

Necesitan un Chrome escuchando en `127.0.0.1:9333` con la sesión ya iniciada, y
usan `playwright-core` (que ya es dependencia del proyecto).

El orden de las pasadas de LinkedIn está en `linkedin/README.md`.

## Cuidado con las salidas

Escriben en el directorio de trabajo, no en `data/_raw/`, que es donde
`scripts/datos/consolidate.py` las espera. La copia intermedia es manual.
