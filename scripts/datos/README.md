# Reconstrucción del mapa de certificados

**Esto no lo corre el build.** El directorio se llamaba `scripts/build/` y el
nombre mentía: `npm run build` y CI son solo Node, sin una línea de Python. Lo
de aquí reconstruye `data/mapa-certificados.json` a partir de las fuentes
crudas, y se ejecuta a mano cuando esas fuentes cambian.

```bash
npm run map          # bash scripts/datos/mapa.sh — los 7 pasos en orden
npm run map:report   # solo el informe legible
npm run check:skills # cobertura del vocabulario sobre las fichas
npm run thumbs       # miniaturas de las fichas públicas
```

## Lo que sí toca al build, indirectamente

`thumbs.py` escribe `certs-src/_thumbs`, y **eso sí lo lee `emit-assets.mjs`
dentro del build**. El acoplamiento es por artefacto, no por invocación: si
nadie corre `npm run thumbs`, el build no falla, simplemente emite sin
miniaturas. No lo des por muerto.

## Dependencias

Ver `requirements.txt` en la raíz. Además hace falta `pdftotext`, que es un
binario del sistema (`poppler-utils` en Debian y Ubuntu).

## Pruebas

`tests/` contiene las de los módulos de migración. No las corre nadie
automáticamente: ver el README de ahí.
