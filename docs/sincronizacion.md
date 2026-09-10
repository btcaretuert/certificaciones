# Sincronizar el proyecto entre máquinas

Este repositorio no se basta a sí mismo. Cinco categorías de archivos viven
fuera de git a propósito, y sin ellas el sitio se construye vacío o el panel
clasifica mal. Este documento dice qué hay que mover a mano, cómo moverlo sin
romperlo y cómo comprobar que la máquina nueva quedó equivalente.

La razón de fondo está en `.gitignore`, comentario por comentario, y en
[`README.md`](../README.md). Acá solo está el procedimiento.

---

## 1. Qué se mueve y qué no

| Ruta | Origen | Por qué no está en git |
|---|---|---|
| `private/` | sincronizar | Fichas retenidas. El título es el dato sensible. |
| `certs-src/` | sincronizar | 126 MB de PDF, incluidos los de las fichas retenidas. |
| `input/` | sincronizar | Cosecha cruda: tokens de la plataforma y títulos retenidos. |
| `data/_raw/`, `data/origen_linkedin.json` | sincronizar | Inventario sin curar. |
| `src/lib/classify/curation.js` | sincronizar | El criterio de exclusión. Dice por qué se ocultó lo que se ocultó. |
| `docs/checkpoints/` | opcional | Bitácoras de sesión. Nombran fichas retenidas y su motivo. |
| `docs/plan/` | opcional | Plan maestro. Describe la curaduría en prosa. |
| `node_modules/` | **NO** | Se reconstruye con `npm ci`. Copiarlo rompe los permisos. |
| `.tools/` | **NO** | Se descarga con `npm run tools:security`, verificado por SHA256. |
| `dist/`, `.astro/`, `test-results/` | **NO** | Artefactos. Se regeneran. |

Todo lo demás está versionado: `git clone` lo trae.

## 2. La trampa que costó una sesión entera

**Sincroniza preservando permisos.** Un `zip`, un recurso compartido SMB o un
`rsync` sin `-a` pierden el bit de ejecución. El síntoma no apunta a la causa:

```
sh: 1: vitest: Permission denied
```

Y las herramientas de seguridad fallan igual, porque `.tools/gitleaks` deja de
ser ejecutable.

Forma correcta, del origen al destino:

```bash
# El repositorio, por git. Nunca por copia de directorio.
git clone <remoto> github_pages_certificaciones

# Lo que git no lleva, por rsync con -a (preserva permisos y enlaces).
DEST=jano@maquina-nueva:/srv/personales/trabajos/github_pages_certificaciones
rsync -a --info=progress2 private/    "$DEST/private/"
rsync -a --info=progress2 certs-src/  "$DEST/certs-src/"
rsync -a --info=progress2 input/      "$DEST/input/"
rsync -a data/_raw/                   "$DEST/data/_raw/"
rsync -a data/origen_linkedin.json    "$DEST/data/"
rsync -a src/lib/classify/curation.js "$DEST/src/lib/classify/"
rsync -a docs/plan/ docs/checkpoints/   "$DEST/docs/"   # si los quieres allá
```

Si el material ya llegó por un medio que perdió los permisos, no hay que volver
a copiarlo; alcanza con reponerlos:

```bash
chmod +x .tools/* scripts/datos/*.sh
rm -rf node_modules && npm ci
```

Los tres archivos ignorados de `docs/` y `curation.js` comparten una propiedad
incómoda: **los auditores no los alcanzan.** `audit-repo` busca los slugs y los
títulos de las fichas retenidas; ninguno de esos archivos los nombra. Lo que
llevan es la regla —cuántos registros se retuvieron y bajo qué criterio—, que
es más específica que la lista. La única defensa es su línea en `.gitignore`,
y lo que la sostiene es la prueba de ignorados versionados: un `git add -f`
sobre cualquiera de ellos hace fallar `audit-repo`.

## 3. Puesta a punto de una máquina nueva

Prerequisitos del sistema, en Ubuntu:

```bash
sudo apt install git poppler-utils     # pdftotext, que no es un paquete de Python
pip install -r requirements.txt        # PyYAML y Pillow
```

Eso último solo hace falta para `scripts/datos/` y `scripts/migracion/`; el
sitio se construye sin una línea de Python.

Google Chrome aparte: las pruebas de navegador usan `channel: 'chrome'`, el del
sistema. Playwright no descarga ningún navegador propio, así que sin Chrome
—o sin Edge o Brave— los 29 casos no corren.

Node vive en NVM y **no está en el PATH por defecto**. Toda sesión de Bash que
use `node`, `npm` o `npx` empieza por:

```bash
export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh" && nvm use
```

`nvm use` lee `.nvmrc`. Si esa versión no está instalada:

```bash
nvm install "$(cat .nvmrc)"
```

Después, desde la raíz del repositorio:

```bash
npm ci                    # nunca copiar node_modules entre máquinas
npm run tools:security    # descarga gitleaks y osv-scanner con SHA fijado
```

Identidad de git, si el clon no la hereda de la configuración global:

```bash
git config user.name  "Alejandro Retuert Gubernatis"
git config user.email "215289135+btcaretuert@users.noreply.github.com"
```

## 4. Comprobar que quedó equivalente

Correr en este orden. Cada línea tiene un resultado esperado exacto; si alguno
no calza, la máquina no está lista y el número dice dónde mirar.

```bash
export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh" && nvm use

npm run test:unit       # 377 en verde
npm run build           # 254 páginas, ambos auditores "sin fugas"
npx playwright test     # 29 en verde
npm run check:security  # 5/5 comprobaciones en verde
npm run test:perf       # 100/100/100/100 en las 3 plantillas
```

Dos lecturas que engañan si no se conocen:

- Si `test:unit` no llega a **377** y lo que falla vive en
  `tests/unit/audit-repo.test.ts`, no busques una regresión: esas pruebas leen
  el repositorio real con `git ls-files`, y fallan en bloque cuando faltan los
  activos privados o cuando el árbol no es un clon de git.
- Si un auditor dice **«sin fugas (solo reglas estructurales)»**, no leas eso
  como una auditoría completa. Sin `private/` no ejecuta ninguna sonda, y lo
  declara. La auditoría completa solo corre donde están los activos.

Antes de dar por buena una sesión, revisar que no quedaron servidores vivos de
la anterior. Uno olvidado hace medir un `dist/` viejo:

```bash
ss -ltn | grep -E ':432[123]'   # 4321 dev, 4322 dist servido, 4323 panel
```

## 5. Publicar el sitio

El despliegue es **manual y desde esta máquina**. No hay `deploy.yml` ni un
`npm run deploy`: `.github/workflows/` solo tiene `ci.yml`, que ejecuta pruebas
y auditorías pero **nunca construye el artefacto real**. No podría: el build
necesita `certs-src/` —126 MB de PDFs y miniaturas, incluidos los de las fichas
retenidas— y ese directorio no se versiona. Un artefacto construido en CI
saldría sin evidencias.

Pages sirve la rama `gh-pages` desde la raíz, con `https_enforced`. El flujo es
construir en local y empujar el `dist/` resultante a esa rama por un worktree
desechable, fuera del árbol del repositorio:

```bash
export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh" && nvm use
npm run build

WT=/tmp/gh-pages-worktree
git worktree add "$WT" gh-pages
rsync -a --delete --exclude=.git dist/ "$WT/"
git -C "$WT" add -A
git -C "$WT" commit -m "deploy: publica el artefacto del $(date +%Y-%m-%d)"
git -C "$WT" push origin gh-pages
git worktree remove --force "$WT"
```

`rsync` con `--delete` deja `gh-pages` idéntico a `dist/`, incluido lo que
empieza con punto: `.nojekyll` viaja porque el build lo emite, no porque nadie
se acuerde de reponerlo. Ver abajo por qué importa.

Dos reglas que no son opcionales: el worktree **se borra siempre** al terminar,
y `dist/` **nunca** se commitea en `main`.

Si el push agrega historial nuevo, antes:

```bash
npm run tools:security && npm run check:security
```

El repositorio es público. Una vez publicado un commit, su contenido es
recuperable aunque un commit posterior lo "corrija".

### `.nojekyll`: la línea que parece de adorno y no lo es

Astro emite sus bundles en `dist/_astro/`, y GitHub Pages pasa todo por Jekyll,
que **descarta cualquier carpeta cuyo nombre empiece con `_`**. Sin un
`.nojekyll` en la raíz de `gh-pages`, el sitio responde **HTTP 200 con el HTML
completo y sin una línea de CSS ni de JS**: sin estilos y sin filtrado.

El síntoma engaña: parece un problema de `base` o de rutas relativas, y no lo
es. Durante un tiempo el archivo vivió solo en la rama `gh-pages`, puesto a
mano, y el sitio dependía de que quien desplegara se acordara. Hoy está
versionado en `public/.nojekyll`, así que el build lo emite y `rsync` lo lleva:
**no lo borres del repositorio pensando que es basura**, es de los archivos
vacíos que hacen trabajo.

### La tarjeta social

`public/og.png` es la imagen que muestran LinkedIn, Slack o WhatsApp al pegar
el enlace. Está versionada, así que un despliegue normal no la toca. Se
regenera con `npm run og`, **después** de `npm run build`: el script no lleva
cifras propias, las lee de la banda de indicadores de `dist/index.html` y
aborta si alguna etiqueta esperada ya no está. Necesita Chrome del sistema,
igual que las pruebas de navegador.

Conviene rehacerla cuando cambien los números de la portada —certificados,
horas, verificables, PMI—, porque si no la tarjeta sigue anunciando un total
viejo y nadie mira una imagen para darse cuenta.

### Comprobar que el despliegue quedó bien

No alcanza con que la portada responda `200`: eso es exactamente lo que hace un
sitio al que Jekyll le comió los bundles. Hay que pedir también una hoja de
estilo:

```bash
SITIO=https://btcaretuert.github.io/certificaciones/

curl -o /dev/null -w '%{http_code}\n' "$SITIO"

# La hoja que la portada declara, resuelta y pedida:
CSS=$(curl -s "$SITIO" | grep -o '/certificaciones/_astro/[^"]*\.css' | head -1)
curl -o /dev/null -w '%{http_code}\n' "https://btcaretuert.github.io$CSS"
```

Los dos tienen que dar `200`. Si el primero da `200` y el segundo `404`, falta
el `.nojekyll`.

Estado de Pages y última corrida, sin abrir el navegador:

```bash
gh api repos/btcaretuert/certificaciones/pages --jq '.status, .source'
```
