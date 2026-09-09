/**
 * Prueba 1 del plan: los datos, contra el esquema ESTRICTO.
 *
 * Aqui si es correcto que un dato malo falle. El esquema laxo existe para que
 * el sitio se despliegue igual reteniendo la ficha rota; esta prueba existe
 * para que nadie se entere de la rotura por un hueco en la pagina.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { strictCertificate, AREAS } from '../../src/content.config';

const DIR = 'src/content/certificates';
const nombres = readdirSync(DIR).filter((f) => f.endsWith('.yaml'));
const fichas = nombres.map((n) => ({
  slug: n.replace(/\.yaml$/, ''),
  datos: parse(readFileSync(join(DIR, n), 'utf8')) as Record<string, unknown>,
}));
const vocab = parse(readFileSync('src/data/skills.yaml', 'utf8')) as {
  competencias: { slug: string; area: string }[];
  tecnologias: Record<string, string[]>;
};

describe('coleccion de certificados', () => {
  it('no esta vacia', () => expect(fichas.length).toBeGreaterThan(200));

  it.each(fichas)('$slug valida contra el esquema estricto', ({ datos }) => {
    const r = strictCertificate.safeParse(datos);
    // el mensaje por defecto de Zod no dice que campo fallo; sin esto hay que
    // adivinar cual de 40 campos rompio
    if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  });

  it('no repite slugs', () => {
    expect(new Set(fichas.map((f) => f.slug)).size).toBe(fichas.length);
  });

  /**
   * certs-src/ esta en .gitignore —126 MB, y con los PDF de las fichas
   * retenidas dentro—, asi que un clon limpio no los tiene. Estas dos pruebas
   * comprueban archivos, no datos: donde no hay archivos no verifican nada, y
   * dejarlas correr igual las volveria un fallo permanente en CI. Se saltan
   * diciendo por que; el build real las exige, porque ahi si estan.
   */
  const hayActivos = existsSync('certs-src');

  it.skipIf(!hayActivos)('cada archivo declarado en source_files existe en disco', () => {
    const faltan = fichas.flatMap(({ slug, datos }) =>
      ((datos.source_files as string[]) ?? [])
        .filter((r) => !existsSync(r))
        .map((r) => `${slug} -> ${r}`),
    );
    expect(faltan).toEqual([]);
  });

  it('toda ficha publica con pdf declarado tiene al menos una fuente', () => {
    const rotas = fichas
      .filter((f) => f.datos.visibility === 'public' && f.datos.pdf)
      .filter((f) => ((f.datos.source_files as string[]) ?? []).length === 0)
      .map((f) => f.slug);
    expect(rotas).toEqual([]);
  });

  it.skipIf(!hayActivos)('toda miniatura declarada existe', () => {
    const faltan = fichas
      .filter((f) => f.datos.thumb)
      .filter((f) => !existsSync(`certs-src/_thumbs/${f.datos.thumb}.webp`))
      .map((f) => f.slug);
    expect(faltan).toEqual([]);
  });

  it('ninguna verify_url usa http plano', () => {
    const malas = fichas
      .map((f) => [f.slug, f.datos.verify_url as string | null] as const)
      .filter(([, u]) => u && !u.startsWith('https://'));
    expect(malas).toEqual([]);
  });

  it('una credencial vencida no puede declararse vigente', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const mal = fichas
      .filter((f) => typeof f.datos.expires === 'string' && f.datos.expires < hoy)
      .filter((f) => f.datos.active === true)
      .map((f) => f.slug);
    expect(mal).toEqual([]);
  });
});

describe('vocabulario de competencias', () => {
  it('cada tecnologia usada tiene competencia asignada', () => {
    const usadas = new Set(fichas.flatMap((f) => (f.datos.tech as string[]) ?? []));
    const huerfanas = [...usadas].filter((t) => !vocab.tecnologias[t]);
    expect(huerfanas).toEqual([]);
  });

  it('toda competencia apunta a un area del esquema', () => {
    const malas = vocab.competencias.filter((c) => !(AREAS as readonly string[]).includes(c.area));
    expect(malas.map((c) => c.slug)).toEqual([]);
  });

  it('los slugs de competencia no se repiten', () => {
    const s = vocab.competencias.map((c) => c.slug);
    expect(new Set(s).size).toBe(s.length);
  });
});
