#!/usr/bin/env node
/**
 * Verifica que el bundle del panel sigue siendo el que se audito.
 *
 * @sveltia/cms es un 0.x auto-hospedado: se fija la version, se guarda el
 * archivo en el repo y se comprueba su hash en cada build. Sin esto, un
 * reemplazo del bundle —por error o por compromiso de la cadena de
 * suministro— entraria sin dejar rastro en el diff, porque nadie lee 2 MB de
 * JavaScript minificado.
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(RAIZ, 'public/admin/sveltia-cms.js');
const FIJADO = join(RAIZ, 'public/admin/sveltia-cms.js.sha256');

const esperado = (await readFile(FIJADO, 'utf8')).trim().split(/\s+/)[0];
const real = createHash('sha256').update(await readFile(BUNDLE)).digest('hex');

if (real !== esperado) {
  console.error('check-admin-bundle: el bundle del panel NO coincide con el hash fijado');
  console.error(`  esperado: ${esperado}`);
  console.error(`  real:     ${real}`);
  console.error('  Si el cambio es intencional, actualiza public/admin/sveltia-cms.js.sha256');
  process.exit(1);
}

console.log(`check-admin-bundle: bundle verificado (${esperado.slice(0, 12)}…)`);
