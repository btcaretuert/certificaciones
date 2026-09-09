#!/usr/bin/env node
/**
 * Retira el panel del artefacto que se publica.
 *
 * El panel vive en public/ para que `npm run dev` lo sirva en
 * localhost:4321/admin/, que es donde se usa de verdad: en modo local Sveltia
 * abre la carpeta del repositorio con la File System Access API, asi que desde
 * la URL publica no podria escribir nada aunque se cargara.
 *
 * El motivo de sacarlo no es que sobre, es que filtra. El clasificador se
 * empaqueta para el navegador e incluye CURATION_RULES, es decir el CRITERIO
 * por el que se retiene material ('acoso', 'despido', 'busqueda de empleo').
 * Publicarlo dice, en texto legible, por que se oculto lo que se oculto —
 * exactamente la inferencia que la regla de "sin motivos versionados" existe
 * para impedir. Los titulos no salian; el motivo, si.
 *
 * Esto contradice al plan maestro, que daba por publicado un /admin "inerte".
 * Esa linea se escribio cuando el panel iba a autenticar contra GitHub y tenia
 * sentido abrirlo desde el sitio. Con el modo local no lo tiene.
 */
import { rm, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, process.argv[2] ?? 'dist');
const PANEL = join(DIST, 'admin');

if (!(await stat(DIST).then(() => true, () => false))) {
  throw new Error(`no existe ${DIST}; corre el build antes`);
}

if (await stat(PANEL).then(() => true, () => false)) {
  await rm(PANEL, { recursive: true });
  console.log('strip-admin: panel retirado del artefacto');
} else {
  console.log('strip-admin: el artefacto no traia panel');
}
