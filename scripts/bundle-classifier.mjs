#!/usr/bin/env node
/**
 * Empaqueta el clasificador para que el panel lo ejecute en el navegador.
 *
 * El clasificador corre en el hook `preSave` de la CMS, en el cliente: asi la
 * clasificacion viaja dentro del mismo commit que el panel ya hace y no existe
 * un segundo commit que pueda re-disparar el despliegue. Ese es el motivo de
 * que haya que empaquetarlo y no simplemente importarlo.
 *
 * No falla cuando el panel todavia no existe. Es un paso de `prebuild`, y hacer
 * que `npm run dev` muera porque falta una carpeta de un paso posterior es
 * romper el bucle de trabajo por una dependencia que no es tal.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = join(RAIZ, 'src/lib/classify/index.js');
const PANEL = join(RAIZ, 'public/admin');
const SALIDA = join(PANEL, 'classifier.js');

if (!existsSync(PANEL)) {
  console.log('bundle-classifier: public/admin/ todavia no existe; nada que empaquetar');
  process.exit(0);
}
if (!existsSync(ENTRADA)) {
  console.error(`bundle-classifier: falta ${ENTRADA}`);
  process.exit(1);
}

const { build } = await import('esbuild');
mkdirSync(PANEL, { recursive: true });

const r = await build({
  entryPoints: [ENTRADA],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  outfile: SALIDA,
  metafile: true,
  // el panel se sirve desde el mismo origen y su CSP es script-src 'self':
  // nada de dependencias externas coladas por el empaquetador
  external: [],
});

const bytes = Object.values(r.metafile.outputs)[0]?.bytes ?? 0;
console.log(`bundle-classifier: public/admin/classifier.js  ${(bytes / 1024).toFixed(1)} kB`);
