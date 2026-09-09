#!/usr/bin/env node
/**
 * Sirve dist/ como lo servira GitHub Pages, en primer plano.
 *
 * Existe porque `astro preview` se demoniza: el proceso en primer plano
 * imprime "Preview server running (pid N)" y termina. Playwright vigila el
 * proceso del webServer, lo ve terminar y aborta; en local no se notaba
 * porque `reuseExistingServer` reutilizaba un demonio que ya estaba
 * escuchando. Es decir: las pruebas de navegador nunca levantaron su propio
 * servidor, y un demonio con un dist/ viejo las habria hecho medir el
 * artefacto equivocado sin decir nada. Ya paso algo asi con Lighthouse.
 *
 * Ademas replica lo que hace Pages y `astro preview` no:
 *  - Todo cuelga de /certificaciones. Fuera del base no hay nada, igual que
 *    en el host real, donde esa zona es de otro sitio.
 *  - Un directorio resuelve su index.html (build.format: 'directory').
 *  - Lo que no existe devuelve 404 con el 404.html del sitio, no una pagina
 *    de servidor de desarrollo.
 *  - Comprime lo que se comprime. No es un detalle: sin compresion la portada
 *    medida con Lighthouse baja a 92 con LCP 2,7 s, y ese numero no describe
 *    a GitHub Pages sino a este servidor.
 */
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { brotliCompress, gzip } from 'node:zlib';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// resolve y no join: DIST_DIR puede ser absoluto y join lo colgaria de RAIZ.
const DIST = resolve(RAIZ, process.env.DIST_DIR ?? 'dist');
const BASE = process.env.SITE_BASE_PATH ?? '/certificaciones';
const PUERTO = Number(process.env.PORT ?? 4322);

const comprimir = { br: promisify(brotliCompress), gzip: promisify(gzip) };

/** Se comprime el texto; las imagenes y los PDF ya vienen comprimidos. */
const COMPRIMIBLE = /^(text\/|application\/(json|xml|javascript))/;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

/** Ruta dentro de dist/, o null si se sale o no cuelga del base. */
export function rutaSegura(urlPath) {
  let ruta;
  try {
    ruta = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (ruta.includes('\0')) return null;
  if (ruta !== BASE && !ruta.startsWith(`${BASE}/`)) return null;

  const relativa = ruta.slice(BASE.length) || '/';
  const destino = resolve(join(DIST, relativa));
  if (destino !== DIST && !destino.startsWith(DIST + sep)) return null;
  return destino;
}

export function crearServidor() {
  return createServer(async (req, res) => {
    const enviar = async (codigo, cuerpo, tipo) => {
      const cabeceras = {
        'content-type': tipo,
        // Lo mismo que manda Pages para un activo: ni no-store, que forzaria
        // a Lighthouse a medir siempre en frio y no como lo ve un visitante.
        'cache-control': 'public, max-age=600',
      };
      const acepta = String(req.headers['accept-encoding'] ?? '');
      const algoritmo = COMPRIMIBLE.test(tipo)
        ? acepta.includes('br') ? 'br' : acepta.includes('gzip') ? 'gzip' : null
        : null;
      let cuerpoFinal = Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(cuerpo);
      if (algoritmo) {
        cuerpoFinal = await comprimir[algoritmo](cuerpoFinal);
        cabeceras['content-encoding'] = algoritmo;
        cabeceras.vary = 'Accept-Encoding';
      }
      res.writeHead(codigo, cabeceras);
      res.end(req.method === 'HEAD' ? undefined : cuerpoFinal);
    };
    const noEncontrado = async () => {
      const pagina = await readFile(join(DIST, '404.html')).catch(() => null);
      await enviar(404, pagina ?? 'no encontrado', pagina ? TIPOS['.html'] : TIPOS['.txt']);
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return enviar(405, 'metodo no permitido', TIPOS['.txt']);
    }

    let destino = rutaSegura(req.url);
    if (!destino) return noEncontrado();

    try {
      let info = await stat(destino);
      if (info.isDirectory()) {
        destino = join(destino, 'index.html');
        info = await stat(destino);
      }
      await enviar(
        200,
        await readFile(destino),
        TIPOS[extname(destino).toLowerCase()] ?? 'application/octet-stream',
      );
    } catch {
      await noEncontrado();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  crearServidor().listen(PUERTO, () => {
    console.log(`dist servido en http://localhost:${PUERTO}${BASE}/`);
  });
}
