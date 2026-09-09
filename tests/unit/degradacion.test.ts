/**
 * La regla de degradacion, ejercitada.
 *
 * `src/content.config.ts` define dos esquemas: el estricto, que reporta, y el
 * tolerante, que construye. El tolerante NUNCA lanza, porque un error de
 * contenido que tumba el build deja publicado justo lo que se queria ocultar:
 * si la ficha que se acaba de marcar como retenida tiene un typo y el build
 * muere, el sitio anterior —con esa ficha visible— sigue en linea.
 *
 * Los fixtures de tests/fixtures/degradacion/ existian desde el 2026-09-07
 * documentando esta regla, pero NINGUN test los leia: la verificacion habia
 * sido manual y puntual. Esto es lo que faltaba. Cada caso comprueba las dos
 * mitades de la regla: que no lanza, y que el fallback apunta a `private`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { lenient, strictCertificate } from '../../src/content.config';

const DIR = join('tests', 'fixtures', 'degradacion');
const fixture = (n: string) => parse(readFileSync(join(DIR, `${n}.yaml`), 'utf8'));

/** Lo que Astro hace de verdad al construir: parsear con el tolerante. */
const degradar = (n: string) => lenient.parse(fixture(n));

describe('regla de degradacion', () => {
  it('un typo en visibility retiene la ficha, no la publica', () => {
    // `publico` no esta en el enum. Si el fallback fuera 'public' o si el
    // esquema lanzara, un error de tipeo publicaria material retenido.
    expect(fixture('typo-visibilidad').visibility).toBe('publico');
    expect(degradar('typo-visibilidad').visibility).toBe('private');
  });

  it('una ficha sin campo obligatorio se retiene entera', () => {
    // Aqui no falla un campo sino el objeto: lo atrapa el .catch() final.
    expect(fixture('sin-titulo').title).toBeUndefined();
    expect(degradar('sin-titulo').visibility).toBe('private');
  });

  it('los campos sucios se neutralizan sin arrastrar la ficha', () => {
    const c = degradar('datos-sucios');
    // `javascript:` en un href es el caso que mas importa: se descarta.
    expect(c.verify_url).toBeNull();
    expect(c.area).toBe('sin-clasificar');
    expect(c.type).toBe('transversal');
    expect(c.issued).toBeNull();
    expect(c.hours).toBeNull();
    // Esta ficha declara visibility: public y lo conserva: degradar un campo
    // no es motivo para retenerla, solo para no confiar en ese campo.
    expect(c.visibility).toBe('public');
  });

  it('ningun fixture hace lanzar al esquema que construye', () => {
    for (const n of ['typo-visibilidad', 'sin-titulo', 'datos-sucios'])
      expect(() => degradar(n), n).not.toThrow();
  });

  it('el estricto SI falla con los mismos datos, que es su trabajo', () => {
    // Si ambos esquemas se comportaran igual, uno de los dos sobra y la regla
    // de degradacion no estaria haciendo nada.
    for (const n of ['typo-visibilidad', 'sin-titulo', 'datos-sucios'])
      expect(strictCertificate.safeParse(fixture(n)).success, n).toBe(false);
  });
});
