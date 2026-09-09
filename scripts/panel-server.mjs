#!/usr/bin/env node
/**
 * Sirve el panel en http://localhost:4323/admin/ y nada mas.
 *
 * Existe por tres motivos, todos comprobados usandolo:
 *  - `astro dev` no resuelve index.html para carpetas de public/, asi que
 *    /admin/ devolvia 404 y habia que escribir /admin/index.html.
 *  - `astro preview` NO tiene panel: strip-admin lo retira del artefacto a
 *    proposito. Buscarlo ahi es el error natural, porque es "el sitio".
 *  - Con dev, cada guardado del CMS toca src/content y Vite recarga la pagina
 *    mientras se edita. Aqui no hay HMR: el panel escribe en disco por la File
 *    System Access API y no necesita nada del servidor.
 *
 * Solo escucha en 127.0.0.1: es secure context —requisito de Sveltia— sin
 * quedar expuesto en la red local.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICO = join(RAIZ, 'public');
const PUERTO = Number(process.env.PANEL_PORT ?? 4323);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Resuelve la ruta pedida dentro de public/, o null si se sale.
 * Comprobar con `startsWith(PUBLICO + sep)` y no con la ruta cruda: `..`
 * decodificado de un %2e%2e es exactamente como se lee un archivo del disco
 * desde un servidor estatico escrito a la ligera.
 */
export function rutaSegura(urlPath) {
  let decodificada;
  try {
    decodificada = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (decodificada.includes('\0')) return null;

  const destino = resolve(join(PUBLICO, decodificada));
  if (destino !== PUBLICO && !destino.startsWith(PUBLICO + sep)) return null;
  return destino;
}

export function crearServidor() {
  return createServer(async (req, res) => {
    const enviar = (codigo, cuerpo, tipo = 'text/plain; charset=utf-8') => {
      res.writeHead(codigo, {
        'content-type': tipo,
        // El panel es local y de un solo usuario; nada de esto debe cachearse
        // entre ediciones ni quedar en un historial compartido.
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(cuerpo);
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') return enviar(405, 'metodo no permitido');

    const pedido = req.url === '/' ? '/admin/' : req.url;
    let destino = rutaSegura(pedido);
    if (!destino) return enviar(403, 'ruta fuera de public/');

    try {
      let info = await stat(destino);
      if (info.isDirectory()) {
        destino = join(destino, 'index.html');
        info = await stat(destino);
      }
      const cuerpo = await readFile(destino);
      enviar(200, cuerpo, TIPOS[extname(destino).toLowerCase()] ?? 'application/octet-stream');
    } catch {
      enviar(404, 'no encontrado');
    }
  });
}

// Solo levanta el servidor cuando se ejecuta directamente, no al importarlo
// desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  crearServidor().listen(PUERTO, '127.0.0.1', () => {
    console.log(`panel: http://localhost:${PUERTO}/admin/`);
    console.log('  Chrome, Edge o Brave. Firefox no implementa la File System Access API.');
    console.log('  Al elegir la carpeta, Chrome pregunta dos veces: hay que pulsar');
    console.log('  "Permitir" y luego "Guardar cambios". El boton por defecto es el que NIEGA.');
  });
}
