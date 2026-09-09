/**
 * El servidor del panel es codigo propio que abre un puerto y lee del disco.
 * Poco codigo, pero con una via de fuga clasica: una ruta con `..` que se
 * escape de public/ y sirva cualquier archivo del repositorio —incluido
 * private/, que es justo lo que no debe salir de la maquina.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { crearServidor, rutaSegura } from '../../scripts/panel-server.mjs';

let server: Server;
let base: string;

beforeAll(async () => {
  server = crearServidor();
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const dir = server.address();
  base = `http://127.0.0.1:${typeof dir === 'object' && dir ? dir.port : 0}`;
});

afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

describe('rutas fuera de public/', () => {
  it.each([
    '/../package.json',
    '/admin/../../package.json',
    '/../private/certificates/una-ficha-retenida.yaml',
    '/%2e%2e/package.json',
    '/..%2fpackage.json',
  ])('rechaza %s', (ruta) => {
    const r = rutaSegura(ruta);
    expect(r === null || r.includes(`${'public'}/`) || r.endsWith('public')).toBe(true);
  });

  it('no sirve un archivo de fuera de public por HTTP', async () => {
    // La comprobacion que importa: aunque el cliente normalice la ruta antes
    // de enviarla, el contenido del repositorio no debe salir por este puerto.
    for (const ruta of ['/../package.json', '/%2e%2e/%2e%2e/package.json']) {
      const res = await fetch(base + ruta);
      const cuerpo = await res.text();
      expect(cuerpo).not.toContain('"name": "certificaciones"');
    }
  });

  it('acepta las rutas normales del panel', () => {
    expect(rutaSegura('/admin/')).not.toBeNull();
    expect(rutaSegura('/admin/config.yml')).not.toBeNull();
  });
});

describe('servicio del panel', () => {
  it('/admin/ resuelve el index sin escribir index.html', async () => {
    // El motivo de que este servidor exista: `astro dev` devuelve 404 aqui.
    const res = await fetch(`${base}/admin/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('sveltia-cms.js');
  });

  it('la raiz lleva al panel', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('sveltia-cms.js');
  });

  it('sirve el config con su tipo, no como descarga', async () => {
    const res = await fetch(`${base}/admin/config.yml`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('yaml');
    expect(await res.text()).toContain('collections:');
  });

  it('lo inexistente da 404 y no cuelga', async () => {
    expect((await fetch(`${base}/admin/no-existe.js`)).status).toBe(404);
  });

  it('no permite escribir', async () => {
    expect((await fetch(`${base}/admin/config.yml`, { method: 'POST' })).status).toBe(405);
  });
});
