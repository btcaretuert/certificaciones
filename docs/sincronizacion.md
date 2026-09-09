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
```

Si el material ya llegó por un medio que perdió los permisos, no hay que volver
a copiarlo; alcanza con reponerlos:

```bash
chmod +x .tools/* scripts/build/*.sh
rm -rf node_modules && npm ci
```

## 3. Puesta a punto de una máquina nueva

Prerequisitos del sistema, en Ubuntu:

```bash
sudo apt install git python3-yaml python3-pil poppler-utils
```

Google Chrome aparte: las pruebas de navegador usan `channel: 'chrome'`, el del
sistema. Playwright no descarga ningún navegador propio, así que sin Chrome
—o sin Edge o Brave— los 27 casos no corren.

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

npm run test:unit       # 365 en verde
npm run build           # 254 páginas, ambos auditores "sin fugas"
npx playwright test     # 27 en verde
npm run check:security  # 5/5 comprobaciones en verde
npm run test:perf       # 100/100/100/100 en las 3 plantillas
```

Dos lecturas que engañan si no se conocen:

- Si `test:unit` da **352 de 365**, faltan los activos privados o falta git:
  13 pruebas leen el repositorio real con `git ls-files`.
- Si un auditor dice **«sin fugas (solo reglas estructurales)»**, no leas eso
  como una auditoría completa. Sin `private/` no ejecuta ninguna sonda, y lo
  declara. La auditoría completa solo corre donde están los activos.

Antes de dar por buena una sesión, revisar que no quedaron servidores vivos de
la anterior. Uno olvidado hace medir un `dist/` viejo:

```bash
ss -ltn | grep -E ':432[123]'   # 4321 dev, 4322 dist servido, 4323 panel
```
