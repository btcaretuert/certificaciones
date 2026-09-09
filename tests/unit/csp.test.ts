/**
 * La CSP, comprobada sin navegador.
 *
 * La prueba de navegador (tests/e2e/csp.spec.ts) verifica que la politica se
 * CUMPLE. Esta verifica que dice lo que tiene que decir, y corre en cada build:
 * una politica se debilita en una linea —agregar 'unsafe-inline' para que algo
 * vuelva a funcionar— y esa linea no rompe nada visible.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Directivas de una politica CSP, como mapa. */
function politica(texto: string): Record<string, string[]> {
  return Object.fromEntries(
    texto
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [nombre, ...valores] = d.split(/\s+/);
        return [nombre, valores];
      }),
  );
}

function metaCsp(archivo: string): Record<string, string[]> {
  const html = readFileSync(archivo, 'utf8');
  const m = /http-equiv="Content-Security-Policy"\s*[\r\n]*\s*content="([^"]+)"/.exec(html);
  expect(m, `${archivo} no declara CSP en un meta`).toBeTruthy();
  return politica(m![1]);
}

const publico = metaCsp('src/layouts/Base.astro');
const panel = metaCsp('public/admin/index.html');

describe('sitio publico', () => {
  it('parte de default-src none y abre lo justo', () => {
    expect(publico['default-src']).toEqual(["'none'"]);
    for (const d of ['script-src', 'style-src', 'img-src', 'connect-src', 'base-uri', 'form-action']) {
      expect(publico[d], `falta ${d}`).toBeDefined();
    }
  });

  it('script-src no admite nada en linea ni eval', () => {
    expect(publico['script-src']).toEqual(["'self'"]);
  });

  it('no habla con ningun origen ajeno en tiempo de ejecucion', () => {
    // El filtrado corre sobre el DOM ya renderizado. 'self' y no 'none'
    // porque Lighthouse pide /robots.txt desde el contexto de la pagina. El
    // dia que alguien meta una fuente de datos remota, esto falla antes que
    // el visitante lo note.
    expect(publico['connect-src']).toEqual(["'self'"]);
  });

  it('el sitio publico no lleva los origenes del panel', () => {
    // Son politicas distintas a proposito: el panel habla con GitHub y con el
    // CDN de sus traducciones; el sitio, con nadie.
    const todo = JSON.stringify(publico);
    for (const origen of ['api.github.com', 'githubusercontent', 'unpkg.com', 'jsdelivr']) {
      expect(todo, `${origen} no pinta nada en el sitio publico`).not.toContain(origen);
    }
  });

  it('el unico resquicio es style-src, y esta acotado', () => {
    // Los graficos llevan el ancho de cada barra en un atributo style. Es el
    // unico 'unsafe-*' del proyecto y no debe aparecer en ninguna otra parte.
    expect(publico['style-src']).toContain("'unsafe-inline'");
    for (const [nombre, valores] of Object.entries(publico)) {
      if (nombre === 'style-src') continue;
      expect(valores.join(' '), `${nombre} lleva un unsafe-*`).not.toMatch(/unsafe-/);
    }
    expect(JSON.stringify(publico)).not.toContain('unsafe-eval');
  });

  it('no declara lo que un meta no puede aplicar', () => {
    // frame-ancestors, sandbox y report-to SOLO funcionan en cabecera HTTP, y
    // GitHub Pages no deja poner cabeceras. Declararlas aqui daria una
    // sensacion de proteccion contra clickjacking que no existe.
    for (const d of ['frame-ancestors', 'sandbox', 'report-to', 'report-uri']) {
      expect(publico[d], `${d} en un meta no hace nada`).toBeUndefined();
    }
  });
});

describe('panel', () => {
  it('tampoco admite scripts en linea', () => {
    expect(panel['default-src']).toEqual(["'none'"]);
    expect(panel['script-src']).toEqual(["'self'"]);
    expect(JSON.stringify(panel)).not.toContain('unsafe-eval');
  });

  it('connect-src no crece por descuido', () => {
    // unpkg contradice el plan, que lo daba por eliminado al auto-hospedar el
    // bundle: Sveltia lo lleva escrito dentro para sus traducciones y, si se
    // bloquea, el panel se queda cargando para siempre en un navegador que no
    // este en ingles. Queda como excepcion documentada, no como olvido.
    expect(new Set(panel['connect-src'])).toEqual(
      new Set([
        "'self'",
        'blob:',
        'data:',
        'https://api.github.com',
        'https://www.githubstatus.com',
        'https://unpkg.com',
      ]),
    );
  });

  it('compensa con el guardia lo que la cabecera no puede dar', () => {
    // Sin frame-ancestors no hay proteccion declarativa contra clickjacking.
    // El guardia es externo para que script-src siga en 'self' sin hashes.
    const guardia = readFileSync('public/admin/guard.js', 'utf8');
    expect(guardia).toMatch(/window\.top\s*!==\s*window\.self/);
    expect(readFileSync('public/admin/index.html', 'utf8')).toContain('guard.js');
  });

  it('se declara no indexable', () => {
    const html = readFileSync('public/admin/index.html', 'utf8');
    expect(html).toMatch(/<meta[^>]+name="robots"[^>]+noindex/);
  });
});
