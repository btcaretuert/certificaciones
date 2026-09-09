#!/usr/bin/env node
/**
 * Reporte local del estado de curaduria. NUNCA se commitea su salida.
 *
 * El motivo de que exista como reporte y no como campo en el YAML: en un repo
 * publico, una taxonomia de motivos de exclusion es un perfil mas especifico
 * que los propios titulos que se quisieron ocultar. El motivo vive aqui y en
 * `curation_note` de las fichas retenidas, que git ignora.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CI = process.env.CI === 'true';

async function cargar(dir) {
  let nombres;
  try {
    nombres = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f));
  } catch {
    return [];
  }
  return Promise.all(nombres.map(async (n) => ({
    slug: n.replace(/\.ya?ml$/, ''),
    d: parse(await readFile(join(dir, n), 'utf8')) ?? {},
  })));
}

const publicas = await cargar(join(RAIZ, 'src/content/certificates'));
const privadas = await cargar(join(RAIZ, 'private/certificates'));

const enRevision = publicas.filter((f) => f.d.visibility === 'review');
const marcadas = publicas.filter((f) => f.d.curation_flag);
const noPublicas = publicas.filter((f) => f.d.visibility !== 'public');
const sinNota = privadas.filter((f) => !String(f.d.curation_note || '').trim());
const revisar = publicas.filter((f) => f.d.needs_review);
const sinEvidencia = publicas.filter((f) => f.d.visibility === 'public'
  && !f.d.verified_public && !(f.d.source_files || []).length);

// En un repo publico los logs de Actions los lee cualquiera: bajo CI solo cuentas.
if (CI) {
  console.log(`curacion: ${publicas.length} publicables, ${privadas.length} retenidas, ` +
    `${enRevision.length} en revision, ${marcadas.length} marcadas, ${sinNota.length} sin nota`);
  process.exit(0);
}

const bloque = (titulo, filas, campo) => {
  console.log(`\n${titulo}: ${filas.length}`);
  for (const f of filas) {
    const extra = campo ? `  ${String(f.d[campo] ?? '').slice(0, 70)}` : '';
    console.log(`  ${f.slug.slice(0, 56).padEnd(58)}${extra}`);
  }
};

console.log(`Curaduria — ${publicas.length} en la coleccion publicable, ${privadas.length} retenidas en private/`);
bloque('Retenidas', privadas, 'curation_note');
if (noPublicas.length) bloque('EN LA COLECCION PERO NO PUBLICAS (deberian estar en private/)', noPublicas, 'visibility');
if (enRevision.length) bloque('En revision, se comportan como privadas', enRevision);
if (marcadas.length) bloque('Marcadas por el clasificador para revisar', marcadas);
if (sinNota.length) bloque('Retenidas sin motivo anotado', sinNota);
if (sinEvidencia.length) bloque('Publicas sin verificacion ni archivo', sinEvidencia);
if (revisar.length) console.log(`\nCon needs_review: ${revisar.length} (clasificacion sin confirmar)`);

const rotas = privadas.filter((f) => f.d.visibility === 'public');
if (rotas.length) {
  console.log(`\nINCOHERENCIA: ${rotas.length} ficha(s) en private/ se declaran public:`);
  rotas.forEach((f) => console.log(`  ${f.slug}`));
  process.exitCode = 1;
}
