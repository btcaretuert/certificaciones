/**
 * Invariantes del repositorio.
 *
 * No prueban una funcion: prueban que nadie pueda saltarse las reglas que
 * sostienen la curaduria y la honestidad de las cifras. Son las que fallan
 * cuando alguien —yo incluido— agrega una pagina nueva con prisa.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { hoursFloor } from '../../src/lib/stats';
import { agruparPorCompetencia, competenciasDe, mapLabel } from '../../src/lib/skills';
import { selectPublished, type Cert, type PublishedCert } from '../../src/lib/data';

function archivos(dir: string, ext: string[], acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, ext, acc);
    else if (ext.some((e) => n.endsWith(e))) acc.push(p);
  }
  return acc;
}

const fuentes = archivos('src', ['.astro', '.ts', '.js']);

/**
 * El corpus publicado, leido de los YAML y filtrado con el MISMO predicado
 * que usa el sitio (`selectPublished` de data.ts).
 *
 * No se usa `publishedCertificates()` a proposito: esa pasa por
 * `getCollection`, que lee el almacen que Astro deja en .astro/ y que no se
 * versiona. En un clon limpio devuelve una lista VACIA, y una asercion del
 * tipo "ninguna ficha incumple" se cumple sola cuando no hay fichas. Paso: en
 * la simulacion del trabajo de CI, dos pruebas del corpus daban verde sin
 * mirar una sola ficha.
 */
function corpusPublicado(): PublishedCert[] {
  const dir = join('src', 'content', 'certificates');
  const certs = readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({
      ...(parse(readFileSync(join(dir, f), 'utf8')) ?? {}),
      id: f.replace(/\.yaml$/, ''),
    })) as Cert[];
  return selectPublished(certs);
}

describe('invariante de curaduria', () => {
  it('solo src/lib/data.ts accede a la coleccion', () => {
    // Cualquier otro punto de acceso se salta el filtro visibility === 'public'
    // y publica fichas retenidas sin que nada lo advierta.
    const culpables = fuentes
      .filter((f) => f !== join('src', 'lib', 'data.ts'))
      .filter((f) => /getCollection\(\s*['"`]certificates['"`]/.test(readFileSync(f, 'utf8')));
    expect(culpables).toEqual([]);
  });

  it('solo urls.ts lee BASE_URL', () => {
    // BASE_URL no trae barra final. Concatenar `${base}favicon.svg` produjo
    // /certificacionesfavicon.svg y el sitio se quedo sin icono: un 404 que
    // ninguna prueba veia porque no rompe ninguna pagina. Los helpers de
    // urls.ts normalizan la barra una sola vez.
    const culpables = fuentes
      .filter((f) => f !== join('src', 'lib', 'urls.ts'))
      .filter((f) => /import\.meta\.env\.BASE_URL/.test(readFileSync(f, 'utf8')));
    expect(culpables).toEqual([]);
  });

  it('ninguna pagina construye rutas de activos a mano', () => {
    // Si `base` cambia (renombrar el repo, dominio propio), una ruta escrita a
    // mano queda rota en silencio. Para eso estan los helpers de urls.ts.
    const culpables = archivos(join('src', 'pages'), ['.astro'])
      .filter((f) => /['"`]\/certificaciones\//.test(readFileSync(f, 'utf8')));
    expect(culpables).toEqual([]);
  });
});

/** Fabrica de certificados de prueba: solo los campos que la funcion mira. */
const cert = (o: Partial<PublishedCert>) => ({
  id: 'x', tech: [], skills: [], objectives: [], kind: 'curso', hours: null,
  ...o,
}) as unknown as PublishedCert;

describe('horas sin doble conteo', () => {
  it('excluye los itinerarios, que agrupan cursos ya contados', () => {
    const r = hoursFloor([
      cert({ id: 'a', hours: 10 }),
      cert({ id: 'b', hours: 5 }),
      cert({ id: 'c', hours: 100, kind: 'itinerario' }),
    ]);
    expect(r.hours).toBe(15);
    expect(r.itineraries).toBe(1);
    expect(r.total).toBe(2);
  });

  it('informa la cobertura en vez de presentar una suma parcial como total', () => {
    const r = hoursFloor([cert({ id: 'a', hours: 3 }), cert({ id: 'b', hours: null })]);
    expect(r.covered).toBe(1);
    expect(r.total).toBe(2);
  });

  it('sobre el corpus real, la cifra publicada no incluye itinerarios', () => {
    const certs = corpusPublicado();
    expect(certs.length, 'corpus vacio: la prueba no comprobaria nada').toBeGreaterThan(200);
    const todo = certs.reduce((s, c) => s + (c.hours ?? 0), 0);
    const publicada = hoursFloor(certs).hours;
    expect(publicada).toBeLessThan(todo);
    expect(hoursFloor(certs).itineraries).toBeGreaterThan(0);
  });
});

describe('vocabulario de competencias', () => {
  it('colapsa los duplicados bilingues', () => {
    for (const par of [['Liderazgo', 'Leadership'], ['Comunicación', 'Communication'],
                       ['Gestión del tiempo', 'Time Management'],
                       ['Python', 'Python (Programming Language)']]) {
      const [a, b] = par.map(mapLabel);
      expect(a.length).toBeGreaterThan(0);
      expect(a.some((s) => b.includes(s))).toBe(true);
    }
  });

  it('las tecnologias dan competencia a los cursos que no traen etiquetas', () => {
    // los 29 de Udemy llegan con skills vacio; sin esto quedarian fuera de la vista
    expect(competenciasDe(cert({ tech: ['kubernetes'] }))).toContain('contenedores');
    expect(competenciasDe(cert({ tech: ['gcp'] }))).toContain('cloud');
  });

  it('las horas por competencia tampoco cuentan itinerarios', () => {
    const g = agruparPorCompetencia([
      cert({ id: 'a', tech: ['gcp'], hours: 8 }),
      cert({ id: 'b', tech: ['gcp'], hours: 90, kind: 'itinerario' }),
    ]);
    expect(g.find((x) => x.slug === 'cloud')?.horas).toBe(8);
    expect(g.find((x) => x.slug === 'cloud')?.certs).toHaveLength(2);
  });

  it('sobre el corpus real, toda ficha publicada cae en alguna competencia', () => {
    const certs = corpusPublicado();
    expect(certs.length, 'corpus vacio: la prueba no comprobaria nada').toBeGreaterThan(200);
    const huerfanas = certs.filter((c) => competenciasDe(c).length === 0).map((c) => c.id);
    expect(huerfanas).toEqual([]);
  });
});
