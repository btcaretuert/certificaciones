/**
 * Prueba 10 del plan: la CSP, sobre el sitio publicado y sobre el panel.
 *
 * Una CSP en <meta> se rompe sin ruido: el navegador bloquea el recurso, la
 * pagina sigue pintando y solo queda una linea en una consola que nadie mira.
 * El caso tipico no es un ataque sino una regresion propia —una fuente de
 * Google, un script de analitica, un `style=` en linea— que deja el sitio a
 * medias en el navegador del visitante y entero en el del que lo programo.
 *
 * Falla ante CUALQUIER violacion, sin lista de toleradas: la primera que se
 * tolere convierte esta prueba en decoracion.
 */
import { test, expect, type Page } from '@playwright/test';

const PANEL = process.env.PANEL_URL ?? 'http://127.0.0.1:4323/admin/';

type Violacion = { directiva: string; bloqueado: string; origen: string };

/**
 * Se escucha el evento del documento y ademas la consola: hay violaciones
 * —dentro de un worker, por ejemplo— que no llegan a disparar el evento.
 */
async function vigilar(page: Page): Promise<() => Promise<Violacion[]>> {
  const deConsola: Violacion[] = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(t)) {
      deConsola.push({ directiva: '(consola)', bloqueado: t.slice(0, 200), origen: '' });
    }
  });

  await page.addInitScript(() => {
    (window as unknown as { __csp: unknown[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: unknown[] }).__csp.push({
        directiva: e.effectiveDirective,
        bloqueado: e.blockedURI,
        origen: `${e.sourceFile ?? ''}:${e.lineNumber ?? 0}`,
      });
    });
  });

  return async () => [
    ...deConsola,
    ...((await page.evaluate(() => (window as unknown as { __csp: Violacion[] }).__csp ?? [])) as Violacion[]),
  ];
}

/** Directivas de una politica, como mapa. */
const politica = (texto: string) =>
  Object.fromEntries(
    texto
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [nombre, ...valores] = d.split(/\s+/);
        return [nombre, valores];
      }),
  ) as Record<string, string[]>;

async function politicaDe(page: Page) {
  const meta = await page
    .locator('meta[http-equiv="Content-Security-Policy" i]')
    .getAttribute('content');
  expect(meta, 'la pagina no declara CSP').toBeTruthy();
  return politica(meta!);
}

test.describe('sitio publico', () => {
  const PAGINAS: [string, string][] = [
    ['portada', ''],
    ['competencias', 'competencias/'],
    ['detalle', 'c/scrum-master/'],
  ];

  for (const [nombre, ruta] of PAGINAS) {
    test(`${nombre} carga sin ninguna violacion de CSP`, async ({ page }) => {
      const leer = await vigilar(page);
      const res = await page.goto(ruta, { waitUntil: 'networkidle' });
      // Sin esto, un 404 —que no declara CSP— pasaria la prueba por no
      // violar nada. Ya ocurrio con las pruebas de accesibilidad.
      expect(res?.status(), `${ruta} no devolvio 200`).toBe(200);
      await expect(page.locator('h1')).not.toHaveText('404');

      expect(await leer(), `violaciones de CSP en /${ruta}`).toEqual([]);
    });
  }

  test('la politica no deja resquicios en script-src', async ({ page }) => {
    await page.goto('', { waitUntil: 'domcontentloaded' });
    const p = await politicaDe(page);

    expect(p['default-src']).toEqual(["'none'"]);
    expect(p['script-src']).toEqual(["'self'"]);
    expect(p['script-src']).not.toContain("'unsafe-inline'");
    expect(p['script-src']).not.toContain("'unsafe-eval'");
    // Ningun origen ajeno: el sitio filtra sobre el DOM ya renderizado.
    expect(p['connect-src']).toEqual(["'self'"]);
    // Sin esto, una inyeccion de <base> reescribe cada enlace relativo.
    expect(p['base-uri']).toEqual(["'none'"]);
    expect(p['form-action']).toEqual(["'none'"]);
    // El sitio publico no habla con GitHub; el panel si, y no comparten CSP.
    expect(JSON.stringify(p)).not.toContain('githubusercontent');
    expect(JSON.stringify(p)).not.toContain('api.github.com');
  });

  test('un script en linea inyectado no se ejecuta', async ({ page }) => {
    // Comprueba que la politica esta VIGENTE y no solo declarada: un meta mal
    // colocado —despues del primer script, por ejemplo— se ignora entero.
    const leer = await vigilar(page);
    await page.goto('', { waitUntil: 'domcontentloaded' });

    await page.evaluate(() => {
      const s = document.createElement('script');
      s.textContent = 'window.__inyectado = true;';
      document.body.appendChild(s);
    });

    expect(await page.evaluate(() => '__inyectado' in window)).toBe(false);
    const violaciones = await leer();
    expect(violaciones.length, 'la CSP no bloqueo el script inyectado').toBeGreaterThan(0);
    expect(violaciones.some((v) => /script-src|consola/.test(v.directiva))).toBe(true);
  });
});

test.describe('panel', () => {
  test('carga sin violaciones y no habla con quien no debe', async ({ page }) => {
    const leer = await vigilar(page);
    const res = await page.goto(PANEL, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), 'el servidor del panel no responde; corre npm run panel').toBe(200);

    const p = await politicaDe(page);
    expect(p['default-src']).toEqual(["'none'"]);
    expect(p['script-src']).toEqual(["'self'"]);
    expect(p['script-src']).not.toContain("'unsafe-eval'");

    // El panel escribe en disco por la File System Access API, sin token y sin
    // backend. Si algun dia apareciera un origen de escritura en connect-src,
    // dejaria de ser cierto que no puede publicar nada por si mismo.
    for (const origen of p['connect-src'] ?? []) {
      expect(
        ["'self'", 'blob:', 'data:', 'https://api.github.com', 'https://www.githubstatus.com', 'https://unpkg.com'],
        `origen inesperado en connect-src del panel: ${origen}`,
      ).toContain(origen);
    }

    // Sveltia tarda en montar; lo que se mide es que nada quede bloqueado.
    await page.waitForTimeout(3000);
    expect(await leer(), 'violaciones de CSP en el panel').toEqual([]);
  });

  test('el panel se declara no indexable', async ({ page }) => {
    await page.goto(PANEL, { waitUntil: 'domcontentloaded' });
    // Sveltia inyecta su propio meta robots al montar: el que importa es el
    // que va en el HTML servido, porque es el que ve un rastreador.
    const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
    expect(robots).toContain('noindex');
  });
});
