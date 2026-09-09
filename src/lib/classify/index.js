/**
 * Clasificador de certificados.
 *
 * ESM puro, CERO dependencias, sin `node:` y sin DOM: corre identico en el
 * navegador (hook preSave de Sveltia), en el build y en los scripts de Node.
 * Hay un test que compara la salida de la ruta caliente y la fria sobre un
 * set fijo de titulos, porque una divergencia entre ambas seria invisible.
 */

import { AREA_OF_DOMAIN, TYPE_OF_DOMAIN } from './vocabulary.js';
import { DOMAIN_RULES, TECH_RULES } from './rules.js';
// curation.js no se versiona: lleva el criterio de exclusion. prebuild lo crea
// desde curation.plantilla.js si falta, con la lista vacia.
import { CURATION_RULES } from './curation.js';

/** Normaliza: sin tildes, minusculas, sin puntuacion, espacios colapsados. */
export function normalize(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** FNV-1a de 32 bits en hex. Estable entre ejecuciones y entornos. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Version de las reglas, DERIVADA de la tabla, no escrita a mano.
 *
 * Un entero manual se olvida de incrementar justo cuando importa, y entonces
 * `reclassify --min-version` salta exactamente las entradas que habia que
 * corregir. Aqui cambia si y solo si cambia la tabla.
 */
export const RULES_VERSION =
  'r-' +
  fnv1a(
    JSON.stringify([
      DOMAIN_RULES.map((r) => [r.domain, r.priority, r.re.source]),
      TECH_RULES.map((r) => [r.tech, r.re.source]),
    ]),
  );

/**
 * Ordena por prioridad explicita EN CADA LLAMADA, no una vez al importar.
 *
 * Congelarlo en el import hacia que el test de inercia pasara aunque el
 * ordenamiento se eliminara: mutar la tabla despues del import no afectaba al
 * array ya congelado, asi que el test no podia fallar. Son 19 reglas; el coste
 * es despreciable y la propiedad pasa a ser cierta en ejecucion.
 */
function orderedRules() {
  return [...DOMAIN_RULES].sort((a, b) => a.priority - b.priority);
}

/**
 * Clasifica a partir del titulo y, como respaldo, de las aptitudes curadas.
 *
 * El TITULO MANDA. Las aptitudes solo se consultan si el titulo no resuelve.
 * Al pesar igual, un curso de liderazgo cuyas aptitudes mencionaban "CI/CD"
 * terminaba clasificado como ingenieria de datos.
 *
 * @param {{title: string, skills?: string[], issuer?: string}} input
 */
export function classify(input) {
  const title = normalize(input.title);
  const skills = normalize((input.skills ?? []).join(' '));
  const both = title + ' ' + skills;

  let domain = null;
  let matchedOn = null;

  const ORDERED = orderedRules();
  const titleHits = ORDERED.filter((r) => r.re.test(title));
  if (titleHits.length > 0) {
    domain = titleHits[0].domain;
    matchedOn = 'title';
  } else {
    const skillHits = ORDERED.filter((r) => r.re.test(both));
    if (skillHits.length > 0) {
      domain = skillHits[0].domain;
      matchedOn = 'skills';
    }
  }

  const competing = (matchedOn === 'title' ? titleHits : ORDERED.filter((r) => r.re.test(both))).length;
  const tech = TECH_RULES.filter((r) => r.re.test(both)).map((r) => r.tech).sort();

  // Confianza: etiqueta discreta con senales legibles, nunca un float que
  // aparente una precision que las reglas no tienen.
  const signals = {
    tm: matchedOn === 'title' ? 1 : 0, // matched on title
    sm: matchedOn === 'skills' ? 1 : 0, // matched on skills
    cd: Math.max(0, competing - 1), // competing domains
    tv: tech.length, // tech values
  };

  let confidence;
  if (!domain) confidence = 'low';
  else if (matchedOn === 'title' && signals.cd === 0) confidence = 'high';
  else if (matchedOn === 'title') confidence = 'medium';
  else confidence = 'low';

  // Sin dominio => sin-clasificar explicito. NUNCA relleno con el area modal
  // del emisor: eso cierra un bucle de realimentacion en el que el
  // clasificador aprende de sus propias salidas.
  if (!domain) domain = 'sin-clasificar';

  return {
    domain,
    area: AREA_OF_DOMAIN[domain] ?? 'sin-clasificar',
    type: TYPE_OF_DOMAIN[domain] ?? 'transversal',
    tech,
    confidence,
    needs_review: confidence !== 'high',
    signals: `tm=${signals.tm};sm=${signals.sm};cd=${signals.cd};tv=${signals.tv}`,
    rules_version: RULES_VERSION,
  };
}

/**
 * Sugerencia de curaduria. Devuelve el booleano que SI se persiste y el motivo,
 * que NO se persiste: en un repositorio publico, un campo con el motivo de cada
 * exclusion es un perfil mas especifico que la propia lista de cursos.
 *
 * @returns {{flag: boolean, reason: string|null}}
 */
export function curationFlag(title, reglas = CURATION_RULES) {
  const t = normalize(title);
  const hit = reglas.find((r) => r.re.test(t));
  return { flag: Boolean(hit), reason: hit ? hit.reason : null };
}
