#!/usr/bin/env node
/**
 * Garantiza que exista src/lib/classify/curation.js.
 *
 * El archivo lleva el criterio de exclusion y por eso no se versiona, pero
 * index.js lo importa de forma estatica: sin el, un clon limpio no compila ni
 * pasa las pruebas. Aqui se copia la plantilla neutra —lista vacia— y se dice
 * en voz alta que el clasificador quedo sin criterio, que no es lo mismo que
 * "no hay nada que revisar".
 */
import { copyFile, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'src/lib/classify/curation.js');
const PLANTILLA = join(RAIZ, 'src/lib/classify/curation.plantilla.js');

if (await stat(DESTINO).then(() => true, () => false)) process.exit(0);

await copyFile(PLANTILLA, DESTINO);
console.warn(
  'ensure-curation: no habia src/lib/classify/curation.js; se copio la plantilla vacia.\n' +
    '  El panel no va a sugerir revisar ninguna ficha. Eso es ausencia de criterio,\n' +
    '  no ausencia de fichas a revisar.',
);
