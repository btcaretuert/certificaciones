/**
 * Agrupacion de competencias. Puente entre las etiquetas crudas de las fichas y
 * el vocabulario canonico de src/data/skills.yaml.
 *
 * Las fichas guardan `skills` TAL COMO las emitio la plataforma: son evidencia y
 * no se tocan. Son 392 etiquetas distintas para 252 fichas, 271 usadas una sola
 * vez, con duplicados bilingues (Liderazgo/Leadership, Python/Python
 * (Programming Language)). Un filtro con 392 opciones es el mismo ruido que el
 * sitio existe para eliminar, asi que la agrupacion se aplica AQUI, en build, y
 * no en los YAML: no se pierde el dato original y reagrupar no obliga a
 * reescribir 252 fichas.
 */
import { parse } from 'yaml';
import type { PublishedCert } from './data';
import skillsYaml from '../data/skills.yaml?raw';

export type Competencia = {
  slug: string;
  es: string;
  en: string;
  area: string;
  match: string[];
  patterns?: string[];
};

type Vocab = { competencias: Competencia[]; tecnologias: Record<string, string[]> };

/**
 * El vocabulario se importa como texto, no se lee del disco.
 *
 * `readFileSync('src/data/skills.yaml')` resolvia contra el directorio DESDE EL
 * QUE se lanza el proceso, no contra el proyecto: funcionaba solo porque todo
 * se corre desde la raiz. Con `?raw` lo resuelve el bundler contra este
 * archivo, queda incrustado en build y deja de haber I/O en tiempo de ejecucion.
 */
const vocab = parse(skillsYaml) as Vocab;

/** Minusculas y sin acentos: 'Comunicación' y 'comunicacion' son la misma etiqueta. */
export const norm = (s: string) =>
  (s ?? '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

const indice = vocab.competencias.map((c) => ({
  c,
  exactas: new Set((c.match ?? []).map(norm)),
  regex: (c.patterns ?? []).map((p) => new RegExp(p)),
}));

export const COMPETENCIAS = vocab.competencias;
export const AREA_DE_COMPETENCIA = Object.fromEntries(
  vocab.competencias.map((c) => [c.slug, c.area]),
);

/** Competencias que reconoce una etiqueta suelta. Una etiqueta puede caer en varias. */
export function mapLabel(label: string): string[] {
  const n = norm(label);
  return indice.filter((i) => i.exactas.has(n) || i.regex.some((r) => r.test(n)))
    .map((i) => i.c.slug);
}

/**
 * Competencias de un certificado, de tres fuentes:
 *  - `skills`: las etiquetas del emisor;
 *  - `tech`: los 29 cursos de Udemy no traen etiquetas y esto es lo unico
 *    estructurado que tienen;
 *  - `objectives`: el "lo que aprenderas" reconoce familias que ninguna
 *    etiqueta nombra, como el trabajo asistido por IA.
 */
export function competenciasDe(c: PublishedCert): string[] {
  const out = new Set<string>();
  for (const t of c.tech) for (const s of vocab.tecnologias[t] ?? []) out.add(s);
  for (const s of c.skills) for (const x of mapLabel(s)) out.add(x);
  for (const o of c.objectives ?? []) for (const x of mapLabel(o)) out.add(x);
  return [...out];
}

export type GrupoCompetencia = Competencia & {
  certs: PublishedCert[];
  horas: number;
};

/** Competencias con al menos un certificado, ordenadas por horas y luego por volumen. */
export function agruparPorCompetencia(certs: PublishedCert[]): GrupoCompetencia[] {
  const m = new Map<string, PublishedCert[]>();
  for (const c of certs) {
    for (const s of competenciasDe(c)) {
      if (!m.has(s)) m.set(s, []);
      m.get(s)!.push(c);
    }
  }
  return vocab.competencias
    .filter((c) => m.has(c.slug))
    .map((c) => {
      const lista = m.get(c.slug)!;
      return {
        ...c,
        certs: lista,
        // los itinerarios agrupan cursos ya contados: mismo criterio que el total
        horas: Math.round(lista.filter((x) => x.kind !== 'itinerario')
          .reduce((s, x) => s + (x.hours ?? 0), 0)),
      };
    })
    .sort((a, b) => b.horas - a.horas || b.certs.length - a.certs.length);
}
