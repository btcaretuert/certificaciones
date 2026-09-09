/**
 * Las rutas del proyecto, en un solo lugar.
 *
 * Antes cada script repetia los literales: 'src/content/certificates' aparecia
 * en 13 archivos, 'certs-src/' en 10, 'private/' en 7. Ninguno estaba mal, pero
 * renombrar cualquiera de esos directorios obligaba a encontrarlos todos, y el
 * que se olvidara no daria error: los auditores y los emisores de activos
 * simplemente mirarian un directorio vacio y darian verde sobre nada.
 *
 * El mismo problema con el base del sitio. astro.config lo deriva de GH_REPO,
 * pero serve-dist, lighthouse y la configuracion de Playwright lo llevaban
 * escrito entero, asi que un renombre del repositorio dejaba las pruebas
 * midiendo un sitio y el build publicando otro.
 */
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ─── El sitio ───────────────────────────────────────────────────────────────
// Mismos valores por omision que astro.config.mjs, que los importa de aqui.
export const GH_USER = process.env.GH_USER ?? 'btcaretuert';
export const REPO = process.env.GH_REPO ?? 'certificaciones';
/** Prefijo de toda URL del sitio publicado. Bajo project pages es /<repo>. */
export const BASE_PATH = `/${REPO}`;
export const SITE_URL = process.env.SITE_URL ?? `https://${GH_USER}.github.io`;

// ─── El corpus ──────────────────────────────────────────────────────────────
export const FICHAS = join(RAIZ, 'src/content/certificates');
// Sobreescribible solo para poder probar el caso "no hay lista de retenidos",
// que es como corre en cualquier clon. No abre un agujero: sin lista, los
// auditores declaran alcance reducido en vez de informar "sin fugas".
export const RETENIDAS = process.env.PRIVADAS_DIR ?? join(RAIZ, 'private/certificates');
export const RETENIDOS_PDF = join(RAIZ, 'private/certs');

// ─── Los activos ────────────────────────────────────────────────────────────
// Fuera de public/ a proposito: un paso posterior al build emite a dist/certs/
// SOLO los de las fichas publicas, asi que publicar deja de ser el estado por
// omision y los huerfanos son estructuralmente imposibles.
export const CERTS_SRC = join(RAIZ, 'certs-src');
export const THUMBS = join(CERTS_SRC, '_thumbs');

// ─── La salida ──────────────────────────────────────────────────────────────
// resolve y no join: DIST_DIR puede ser absoluto y join lo colgaria de RAIZ.
export const DIST = resolve(RAIZ, process.env.DIST_DIR ?? 'dist');
