#!/usr/bin/env node
/**
 * Auditor del artefacto. Revienta el build si algo retenido aparece en dist/.
 *
 * Es la red de segundo nivel, no la primera: con el repo publico las fichas
 * retenidas viven en private/ y ni siquiera se versionan. Esto cubre el otro
 * caso, el que si puede pasar sin querer — una ficha que estaba publica, se
 * paso a `review`, y quedo su rastro en un indice, un sitemap, un prop de
 * isla hidratada o un activo emitido.
 *
 * Reglas que lo hacen util en vez de decorativo:
 *  - Si escaneo 0 archivos, falla. Un auditor que no encuentra nada porque no
 *    miro nada es peor que no tenerlo.
 *  - El emparejamiento es con delimitadores, no por subcadena: `gestion-del-tiempo`
 *    no puede dar positivo dentro de `gestion-del-tiempo-para-lideres`.
 *  - Tambien busca los TITULOS retenidos. En este corpus el titulo ES el dato
 *    sensible: el titulo de un curso se lee entero, el slug hay que
 *    reconstruirlo. Nombrar aqui uno retenido de ejemplo seria filtrarlo.
 *  - Si hay un .zip, falla en vez de ignorarlo. Un limite silencioso se lee
 *    como cobertura completa.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { RAIZ, CI, clasificar, normalizar } from './lib/curaduria.mjs';

const DIST = join(RAIZ, process.argv[2] ?? 'dist');

const TEXTO = new Set(['.html', '.htm', '.json', '.xml', '.txt', '.js', '.css', '.svg', '.webmanifest']);

async function* recorrer(dir) {
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) yield* recorrer(ruta);
    else yield ruta;
  }
}

async function main() {
  if (!(await stat(DIST).then(() => true, () => false))) {
    throw new Error(`no existe ${DIST}; corre el build antes del auditor`);
  }

  const { vivos, auditables, colisiones, sondas, hayRetenidos } = await clasificar();

  const fallos = [];
  let escaneados = 0, zips = 0;

  for await (const ruta of recorrer(DIST)) {
    const ext = extname(ruta).toLowerCase();
    if (ext === '.zip') { zips++; continue; }

    const rel = relative(DIST, ruta);

    // Los activos no se leen: se comprueba su nombre contra la lista viva.
    if (rel.startsWith('certs/')) {
      const base = rel.split('/').pop().replace(/\.(pdf|webp)$/i, '');
      // <slug>-pmi es el certificado del PMI del mismo curso, no otra ficha
      const dueno = vivos.has(base) ? base : base.replace(/-pmi$/, '');
      if (!vivos.has(dueno)) fallos.push(`activo emitido sin ficha publica: ${rel}`);
      escaneados++;
      continue;
    }
    if (!TEXTO.has(ext)) continue;

    // Normalizado en las dos puntas: el heno de busqueda que index.astro
    // incrusta en cada fila ya viene sin tildes, asi que una sonda literal no
    // encontraria ahi un titulo retenido.
    const contenido = normalizar(await readFile(ruta, 'utf8'));
    escaneados++;
    for (const s of sondas) {
      if (s.re.test(contenido)) fallos.push(`${s.tipo} retenido "${s.slug}" aparece en ${rel}`);
    }
  }

  if (escaneados === 0) throw new Error('el auditor no escaneo ningun archivo: revisa la ruta de dist/');

  // El panel empaqueta el clasificador, y el clasificador lleva dentro el
  // CRITERIO de retencion. Publicarlo dice por que se oculto lo que se oculto.
  if (await stat(join(DIST, 'admin')).then(() => true, () => false)) {
    fallos.push('el panel quedo en dist/: publica el criterio de curaduria (corre strip-admin.mjs)');
  }
  if (zips > 0) {
    fallos.push(`${zips} archivo(s) .zip en dist/ que este auditor no sabe abrir; el contenido del dossier queda sin auditar`);
  }

  if (!hayRetenidos) {
    // Sin private/ —un clon, CI— no hay contra que comparar: las sondas de
    // texto no corren. Lo que queda comprobado es que no hay activo emitido
    // sin ficha publica y que el panel no llego al artefacto. Decirlo, porque
    // "sin fugas" con cero sondas se lee igual que "sin fugas" con treinta.
    console.warn(
      'audit-dist: no hay private/ en este arbol: NO se buscaron titulos ni slugs\n' +
        '  retenidos en dist/. Quedan cubiertos los activos emitidos y el panel.',
    );
  }
  console.log(
    `audit-dist: ${escaneados} archivos, ${vivos.size} fichas publicas, ` +
    `${auditables.length} retenidas auditadas (${sondas.length} sondas)`,
  );
  if (colisiones.length) {
    console.warn(`audit-dist: ${colisiones.length} slug(s) retenidos coinciden con uno publico y no se pueden auditar por texto`);
    if (!CI) colisiones.forEach((s) => console.warn(`  ${s}`));
  }

  if (fallos.length) {
    if (CI) console.error(`audit-dist: ${fallos.length} fuga(s); corre "node scripts/audit-dist.mjs" en local para el detalle`);
    else fallos.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log(`audit-dist: sin fugas${hayRetenidos ? '' : ' (solo reglas estructurales)'}`);
}

await main();
