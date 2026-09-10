# Certificaciones

Sitio estático con las certificaciones y la formación continua de Alejandro
Retuert. Astro, sin framework de cliente, publicado en GitHub Pages bajo
`/certificaciones`.

## Cómo está armado

Cada certificado es un YAML en `src/content/certificates/`, validado contra un
esquema Zod. El sitio se genera desde ahí: listado con filtros, una ficha por
certificado, vista por competencias y línea de tiempo.

**Invariante de curaduría:** todo lo que el sitio muestra sale de
`selectPublished()`, en [`src/lib/data.ts`](src/lib/data.ts), que se queda
únicamente con `visibility === 'public'`. Ninguna cifra, faceta, gráfico,
sitemap ni activo emitido tiene un denominador que incluya algo que el visitante
no pueda enumerar. Hay pruebas de repositorio que fallan si aparece un segundo
punto de acceso a la colección.

Lo retenido no se versiona: vive en `private/`, ignorado por git. "No publicado"
significa inaccesible en el repositorio, no solamente ausente del listado.

## Lo que este repositorio no trae

| Ruta | Por qué |
|---|---|
| `certs-src/` | Los PDF y las miniaturas: 126 MB, y entre ellos los de las fichas retenidas. |
| `private/` | Las fichas retenidas. |
| `src/lib/classify/curation.js` | El criterio de exclusión. Dice por qué se ocultó lo que se ocultó, que revela más que la lista misma. `prebuild` copia una plantilla vacía si falta. |
| `public/admin/` en `dist/` | El panel se retira del artefacto: empaqueta ese mismo criterio. |

Cómo se mueve a otra máquina lo que git no lleva, y cómo comprobar que
llegó completo: [`docs/sincronizacion.md`](docs/sincronizacion.md).

Consecuencia: un clon puede compilar el HTML y correr las pruebas
(`SIN_ACTIVOS=1`), pero **el artefacto publicable solo se construye donde están
los activos**. CI valida estructura; no publica.

Publicar, entonces, es manual y desde la máquina que tiene los activos: se
construye en local y se empuja `dist/` a la rama `gh-pages`. El procedimiento
completo, con la trampa del `.nojekyll` que deja el sitio sin CSS respondiendo
`200`, está en
[`docs/sincronizacion.md` §5](docs/sincronizacion.md#5-publicar-el-sitio).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo en `localhost:4321`. |
| `npm run build` | Construye, retira el panel, emite activos y corre los dos auditores. |
| `npm run serve` | Sirve `dist/` como lo servirá Pages, en `localhost:4322`. |
| `npm run panel` | Panel de edición en `localhost:4323/admin/`. Solo Chrome, Edge o Brave. |
| `npm run test` | Pruebas unitarias y de repositorio. |
| `npm run test:e2e` | Playwright: funcional, accesibilidad y CSP, sobre el artefacto. |
| `npm run og` | Regenera `public/og.png`, la tarjeta social, con las cifras de `dist/`. Después de `build`. |
| `npm run test:perf` | Lighthouse sobre las 3 plantillas, umbral 95. |
| `npm run tools:security` | Descarga gitleaks y osv-scanner, fijados por SHA256. |
| `npm run check:security` | gitleaks, osv-scanner, `npm audit` y el auditor del repositorio. |
| `npm run audit:repo` | Qué hay dentro de lo que git versiona. |

`npm run build` corre las pruebas unitarias antes de compilar; los auditores,
después. Si algo retenido aparece en `dist/` o en el árbol, el build se detiene.

## Panel de edición

Sveltia CMS en modo local: escribe en el disco por la File System Access API,
sin token y sin servidor. Al elegir la carpeta, Chrome pregunta dos veces y el
botón por defecto es el que **niega**.
