#!/usr/bin/env node
/**
 * Auditor del repositorio: que hay dentro de lo que git versiona.
 *
 * audit-dist mira el artefacto y no ve esto. La constante del proyecto es que
 * "no publicado" significa "no accesible en el repo publico", no solo "no
 * listado en el sitio"; el artefacto puede estar impecable y el arbol seguir
 * llevando el PDF, el titulo o la cosecha cruda de la que salio la ficha.
 *
 * Tres reglas, cada una por un fallo que ya ocurrio aqui:
 *  - .gitignore no desversiona. Un archivo que ya estaba en el indice sigue
 *    versionado aunque despues se agregue su patron: el ignore solo aplica a
 *    lo no rastreado. `git ls-files -c -i` es la unica forma de verlo.
 *  - Ningun PDF versionado. Los certificados entran por directorios ignorados
 *    y salen a dist/ por emit-assets, ficha por ficha. Un PDF en el arbol se
 *    salto esa decision: o es de una ficha retenida o duplica una publica.
 *  - Ni el contenido ni el NOMBRE de un archivo versionado nombran una ficha
 *    retenida. Un nombre de archivo se lee en la web de GitHub sin abrir nada.
 *
 * Con --historial repite las sondas sobre todos los commits: el push manda el
 * historial entero, y un archivo borrado en el ultimo commit viaja igual.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { promisify } from 'node:util';
import { RAIZ, CI, clasificar, normalizar } from './lib/curaduria.mjs';

const ejecutar = promisify(execFile);
const git = async (...args) => {
  const { stdout } = await ejecutar('git', args, { cwd: RAIZ, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
};
const lineas = (s) => s.split('\n').filter(Boolean);

/**
 * Documentos que no deben versionarse nunca.
 * El XLSX es la hoja de origen: lleva las 249 filas sin curar, es decir la
 * lista completa incluidos los titulos que se decidio no publicar.
 */
const EXT_PROHIBIDAS = new Set(['.pdf', '.xlsx', '.xls']);

/**
 * Falsos positivos revisados de a uno.
 *
 * La ficha va identificada por huella y no por su slug: una lista de
 * excepciones que nombrara lo retenido seria ella misma la fuga. Con private/
 * a mano —es decir, en la maquina del dueno— el auditor traduce la huella al
 * correr con --explicar; para cualquier otro es opaca.
 *
 * Una entrada que deje de calzar se denuncia como obsoleta: una lista que solo
 * crece termina tapando justo la fuga que motivo el auditor.
 */
const PERMITIDOS = [
  {
    archivo: 'src/content/certificates/desarrolla-tu-capacidad-para-gestionar-equipos.yaml',
    huella: 'ba3e0cfb35158a4b',
    motivo: 'la coincidencia es un objetivo del curso publicado, no una referencia a la ficha retenida',
  },
  {
    archivo: 'src/content/certificates/desarrolla-tus-habilidades-como-lider-emergente.yaml',
    huella: 'ba3e0cfb35158a4b',
    motivo: 'el mismo objetivo, en otro itinerario publicado',
  },
];

/** Huella corta y estable de un slug retenido. No es un secreto: es un nombre
 *  que no se puede leer sin tener ya la lista. */
const huella = (slug) => createHash('sha256').update(slug).digest('hex').slice(0, 16);

/** Un blob es texto si no trae un NUL en su primer tramo. */
const esTexto = (buf) => !buf.subarray(0, 8000).includes(0);

async function main() {
  const historial = process.argv.includes('--historial');

  const versionados = lineas(await git('ls-files'));
  if (versionados.length === 0) {
    throw new Error('git no versiona ningun archivo: el auditor no tiene nada que mirar');
  }

  const { vivos, auditables, sondas, colisiones, hayRetenidos } = await clasificar();
  const fallos = [];

  // 1. Lo que .gitignore cree ignorar pero el indice sigue rastreando.
  for (const f of lineas(await git('ls-files', '-c', '-i', '--exclude-standard'))) {
    fallos.push(`versionado pese a estar en .gitignore: ${f}`);
  }

  // 2. private/ no se versiona. Es la regla que sostiene toda la curaduria.
  for (const f of versionados.filter((f) => f.startsWith('private/'))) {
    fallos.push(`private/ versionado: ${f}`);
  }

  // 3. Documentos de certificado en el arbol.
  for (const f of versionados.filter((f) => EXT_PROHIBIDAS.has(extname(f).toLowerCase()))) {
    fallos.push(`documento versionado: ${f}`);
  }

  const usados = new Set();
  const permitido = (archivo, slug) => {
    const h = huella(slug);
    const i = PERMITIDOS.findIndex((p) => p.archivo === archivo && p.huella === h);
    if (i < 0) return false;
    usados.add(i);
    return true;
  };

  if (process.argv.includes('--explicar')) {
    for (const p of PERMITIDOS) {
      const cual = auditables.find((f) => huella(f.slug) === p.huella);
      console.log(`permitido: ${p.archivo} <- ${cual?.slug ?? '(huella sin ficha)'} — ${p.motivo}`);
    }
  }

  // 4. Sondas contra los nombres de archivo. Un nombre se lee en la web de
  //    GitHub sin abrir el archivo.
  for (const f of hayRetenidos ? versionados : []) {
    const ruta = normalizar(f);
    for (const s of sondas) {
      if (s.re.test(ruta) && !permitido(f, s.slug)) {
        fallos.push(`${s.tipo} retenido "${s.slug}" en el nombre ${f}`);
      }
    }
  }

  // 5. Sondas contra el contenido de los archivos de texto.
  let escaneados = 0;
  for (const f of hayRetenidos ? versionados : []) {
    let buf;
    try {
      buf = await readFile(join(RAIZ, f));
    } catch {
      continue; // versionado pero ausente del disco: no es asunto de este auditor
    }
    if (!esTexto(buf)) continue;
    escaneados++;
    const texto = normalizar(buf.toString('utf8'));
    for (const s of sondas) {
      if (s.re.test(texto) && !permitido(f, s.slug)) {
        fallos.push(`${s.tipo} retenido "${s.slug}" aparece en ${f}`);
      }
    }
  }

  if (hayRetenidos && escaneados === 0) {
    throw new Error('ningun archivo de texto versionado: el auditor no leyo nada');
  }

  // Una excepcion que ya no calza con nada suele significar que el archivo
  // cambio de nombre y que la sonda quedo sin cubrir, no que se resolvio.
  // Sin lista de retenidos no calza ninguna, y eso no dice nada.
  for (const [i, p] of hayRetenidos ? PERMITIDOS.entries() : []) {
    if (!usados.has(i)) fallos.push(`permiso obsoleto: ${p.archivo} / ${p.huella} — ${p.motivo}`);
  }

  if (!hayRetenidos) {
    // Sin esto, un clon informaria "sin fugas" habiendo comprobado la mitad.
    console.warn(
      'audit-repo: no hay private/ en este arbol, asi que NO se auditaron titulos\n' +
        '  ni slugs retenidos. Esta corrida cubre solo las reglas estructurales\n' +
        '  (ignorados versionados, private/, documentos). La auditoria completa\n' +
        '  solo puede correr donde estan las fichas retenidas.',
    );
  }
  console.log(
    `audit-repo: ${versionados.length} archivos versionados` +
      (hayRetenidos
        ? ` (${escaneados} de texto), ${vivos.size} fichas publicas, ` +
          `${auditables.length} retenidas auditadas (${sondas.length} sondas, ` +
          `${PERMITIDOS.length} falsos positivos permitidos)`
        : `, ${vivos.size} fichas publicas, sin lista de retenidos`),
  );
  if (colisiones.length) {
    console.warn(`audit-repo: ${colisiones.length} slug(s) retenidos coinciden con uno publico y no se auditan por texto`);
  }

  if (historial && hayRetenidos) fallos.push(...(await auditarHistorial(sondas)));

  if (fallos.length) {
    // Los logs de Actions de un repo publico los lee cualquiera: el detalle
    // de una fuga no puede ir al log, porque el detalle ES la fuga.
    if (CI) console.error(`audit-repo: ${fallos.length} problema(s); corre "npm run audit:repo" en local para el detalle`);
    else fallos.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
  const alcance = hayRetenidos
    ? `${historial ? 'arbol e historial' : 'arbol'}`
    : 'solo reglas estructurales';
  console.log(`audit-repo: sin fugas (${alcance})`);
}

/**
 * Las mismas sondas sobre cada commit alcanzable.
 *
 * Se delega en `git grep` en vez de recorrer blobs: recorre solo lo que el
 * push transferiria y salta binarios con -I. Los titulos van como cadena fija
 * porque llevan comas, parentesis y hasta "&amp;".
 */
async function auditarHistorial(sondas) {
  const revisiones = lineas(await git('rev-list', '--all'));
  if (revisiones.length === 0) return [];

  const fallos = [];
  for (const s of sondas) {
    const patron =
      s.tipo === 'slug'
        ? ['-E', '-e', `(^|[^a-z0-9-])${s.slug}([^a-z0-9-]|$)`]
        : ['-F', '-e', s.re.source.replace(/^\\b|\\b$/g, '').replace(/\\(.)/g, '$1')];
    try {
      const salida = await git('grep', '-I', '-i', '-l', ...patron, ...revisiones, '--');
      for (const linea of lineas(salida)) {
        const [rev, ruta] = [linea.slice(0, linea.indexOf(':')), linea.slice(linea.indexOf(':') + 1)];
        fallos.push(`${s.tipo} retenido "${s.slug}" en el historial: ${rev.slice(0, 7)} ${ruta}`);
      }
    } catch (e) {
      // git grep sale con 1 cuando no encuentra nada. Cualquier otro codigo es
      // un fallo real y no puede confundirse con "limpio".
      if (e.code !== 1) throw e;
    }
  }
  console.log(`audit-repo: historial de ${revisiones.length} commits auditado con ${sondas.length} sondas`);
  return fallos;
}

await main();
