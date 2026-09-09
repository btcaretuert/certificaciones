/**
 * El servidor que sirve dist/ a las pruebas de navegador.
 *
 * Existe porque `astro preview` se demoniza y Playwright daba por caido su
 * webServer; en local pasaba desapercibido porque reutilizaba un demonio ya
 * levantado. Ese es justamente el riesgo que estas pruebas cubren: si el
 * servidor sirve otra cosa que dist/, o si sirve fuera del base, toda la suite
 * de navegador mide algo que no es el artefacto y aun asi da verde.
 *
 * Corre sobre un dist/ de mentira para no depender de que haya build.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let server: Server;
let base: string;
let raiz: string;
let rutaSegura: (u: string) => string | null;

beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), 'dist-falso-'));
  await mkdir(join(raiz, 'competencias'), { recursive: true });
  await mkdir(join(raiz, '_astro'), { recursive: true });
  await writeFile(join(raiz, 'index.html'), '<h1>portada</h1>');
  await writeFile(join(raiz, '404.html'), '<h1>404</h1>');
  await writeFile(join(raiz, 'robots.txt'), 'User-agent: *\n');
  await writeFile(join(raiz, 'competencias', 'index.html'), '<h1>competencias</h1>');
  await writeFile(join(raiz, '_astro', 'x.css'), 'body{}');
  await writeFile(join(raiz, 'secreto-fuera-de-base.txt'), 'no');

  process.env.DIST_DIR = raiz;
  process.env.SITE_BASE_PATH = '/certificaciones';
  const mod = await import('../../scripts/serve-dist.mjs');
  rutaSegura = mod.rutaSegura;
  server = mod.crearServidor();
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const dir = server.address();
  base = `http://127.0.0.1:${typeof dir === 'object' && dir ? dir.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => server.close(() => ok()));
  await rm(raiz, { recursive: true, force: true });
});

describe('el base manda', () => {
  it('fuera del base no hay nada, como en el host real', async () => {
    // En GitHub Pages la raiz del host es de otro sitio. Servir dist/ ahi
    // haria pasar pruebas que en produccion darian 404.
    for (const ruta of ['/', '/index.html', '/competencias/']) {
      expect((await fetch(base + ruta)).status, ruta).toBe(404);
    }
    expect(rutaSegura('/index.html')).toBeNull();
  });

  it('dentro del base sirve el artefacto', async () => {
    const res = await fetch(`${base}/certificaciones/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('portada');
  });

  it('un directorio resuelve su index.html', async () => {
    // build.format: 'directory' — las URLs no llevan index.html.
    const res = await fetch(`${base}/certificaciones/competencias/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('competencias');
  });
});

describe('lo que no existe', () => {
  it('devuelve 404 y la pagina 404 del sitio, no una de servidor', async () => {
    const res = await fetch(`${base}/certificaciones/no-existe/`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('404');
  });
});

describe('no se sale de dist/', () => {
  it.each([
    '/certificaciones/../secreto-fuera-de-base.txt',
    '/certificaciones/%2e%2e/%2e%2e/etc/passwd',
    '/certificaciones/../../../../etc/passwd',
  ])('rechaza %s', async (ruta) => {
    const r = rutaSegura(ruta);
    expect(r === null || r.startsWith(raiz)).toBe(true);
    const cuerpo = await (await fetch(base + ruta)).text();
    expect(cuerpo).not.toContain('root:');
  });
});

describe('tipos y metodos', () => {
  it('el CSS no sale como descarga', async () => {
    const res = await fetch(`${base}/certificaciones/_astro/x.css`);
    expect(res.headers.get('content-type')).toContain('text/css');
  });

  it('robots.txt sale como texto', async () => {
    const res = await fetch(`${base}/certificaciones/robots.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
  });

  it('comprime el texto cuando el cliente lo acepta', async () => {
    // Sin compresion, Lighthouse midio la portada en 92 con LCP 2,7 s. Ese
    // numero describia a este servidor, no a GitHub Pages, que si comprime.
    const res = await fetch(`${base}/certificaciones/`, {
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('vary')).toContain('Accept-Encoding');
  });

  it('no comprime lo que ya viene comprimido', async () => {
    await writeFile(join(raiz, 'x.webp'), Buffer.from([0x52, 0x49, 0x46, 0x46]));
    const res = await fetch(`${base}/certificaciones/x.webp`, {
      headers: { 'accept-encoding': 'br, gzip' },
    });
    expect(res.headers.get('content-encoding')).toBeNull();
  });

  it('no permite escribir', async () => {
    expect((await fetch(`${base}/certificaciones/`, { method: 'POST' })).status).toBe(405);
  });
});
