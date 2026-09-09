/**
 * Lo retenido, en un solo lugar.
 *
 * Dos auditores hacen la misma pregunta desde lados distintos: audit-dist mira
 * el artefacto que se publica, audit-repo mira lo que git versiona. Si cada uno
 * arma su propia lista de retenidos, basta que una derive para que uno de verde
 * sobre lo que el otro considera oculto — y el que da verde es el que se cree.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// Las rutas viven en rutas.mjs; aqui solo se les da el nombre con el que las
// conocen los dos auditores, para no tocar sus llamadas.
// Import + export y no `export ... from`: la forma corta re-exporta sin crear
// un binding local, y este modulo usa PUBLICAS y PRIVADAS mas abajo.
import { RAIZ, FICHAS as PUBLICAS, RETENIDAS as PRIVADAS } from './rutas.mjs';
export { RAIZ, PUBLICAS, PRIVADAS };
export const CI = process.env.CI === 'true';

export const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Sin tildes y en minusculas, en las dos puntas de la comparacion.
 *
 * Sin esto, un titulo escrito sin tildes no coincide con el de la ficha y el
 * auditor da verde sobre una fuga real. Paso: un inventario versionado llevaba
 * dos titulos retenidos que la sonda literal no vio, porque el inventario
 * guardaba el texto ya normalizado.
 */
export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export async function leerFichas(dir) {
  let nombres;
  try {
    nombres = (await readdir(dir)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  } catch {
    return []; // private/ puede no existir en un clon limpio; no es un error
  }
  return Promise.all(
    nombres.map(async (n) => ({
      slug: n.replace(/\.ya?ml$/, ''),
      datos: parse(await readFile(join(dir, n), 'utf8')) ?? {},
    })),
  );
}

/**
 * Reparte el corpus en publico y retenido, y arma las sondas de texto.
 *
 * `vivos` sale de `visibility === 'public'` y nada mas: es el mismo predicado
 * que src/lib/data.ts aplica al construir el sitio. Fail-closed en las dos
 * puntas — lo que no dice exactamente 'public' se audita como retenido.
 */
export async function clasificar() {
  const publicas = await leerFichas(PUBLICAS);
  const privadas = await leerFichas(PRIVADAS);
  // private/ no se versiona: en un clon —CI incluido— no existe. Sin el, las
  // sondas por titulo no tienen contra que comparar, y eso hay que decirlo en
  // vez de informar "sin fugas" por no haber mirado.
  const hayRetenidos = privadas.length > 0;

  const retenidos = [...privadas, ...publicas.filter((f) => f.datos.visibility !== 'public')];
  const vivos = new Set(
    publicas.filter((f) => f.datos.visibility === 'public').map((f) => f.slug),
  );

  // Un slug retenido que ADEMAS existe como publico no se puede auditar por
  // texto: el positivo seria del publico. Se excluye y se informa.
  const colisiones = retenidos.filter((f) => vivos.has(f.slug)).map((f) => f.slug);
  const auditables = retenidos.filter((f) => !vivos.has(f.slug));

  return {
    publicas, privadas, retenidos, vivos, colisiones, auditables, hayRetenidos,
    sondas: sondasDe(auditables),
  };
}

/**
 * Una sonda por slug y otra por titulo, con delimitadores.
 *
 * Sin ellos `gestion-del-tiempo` daria positivo dentro de
 * `gestion-del-tiempo-para-lideres` y el auditor gritaria en cada build hasta
 * que alguien lo apague. Un auditor apagado no protege nada.
 */
export function sondasDe(auditables) {
  const sondas = [];
  for (const { slug, datos } of auditables) {
    sondas.push({
      slug,
      tipo: 'slug',
      re: new RegExp(`(?<![a-z0-9-])${escapar(normalizar(slug))}(?![a-z0-9-])`, 'i'),
    });
    // Un titulo de 4 o 5 letras daria positivo dentro de prosa corriente y el
    // auditor gritaria en cada build hasta que alguien lo apagara.
    if (typeof datos.title === 'string' && datos.title.trim().length >= 8) {
      sondas.push({
        slug,
        tipo: 'titulo',
        texto: datos.title.trim(),
        re: new RegExp(`\\b${escapar(normalizar(datos.title.trim()))}\\b`, 'i'),
      });
    }
  }
  return sondas;
}
