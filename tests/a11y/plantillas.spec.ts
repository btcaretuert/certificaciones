/**
 * Prueba 7 del plan: accesibilidad de las 3 plantillas, en claro y oscuro.
 *
 * Corre sobre `astro preview`, es decir el artefacto real. Falla ante
 * cualquier violacion de impacto serio o critico segun WCAG 2.2 AA.
 *
 * Las paginas de detalle se eligen por CRITERIO y no por slug: una con
 * acreditacion PMI y una vencida ejercitan ramas de plantilla que la ficha
 * promedio no toca (el bloque del segundo certificado y el badge de
 * vigencia). Fijar el slug a mano haria que la prueba dejara de cubrir esa
 * rama en silencio el dia que esa ficha se retire.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const DIR = 'src/content/certificates';

type Ficha = { slug: string; datos: Record<string, unknown> };

const fichas: Ficha[] = readdirSync(DIR)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => ({
    slug: f.replace(/\.yaml$/, ''),
    datos: (parse(readFileSync(join(DIR, f), 'utf8')) ?? {}) as Record<string, unknown>,
  }))
  .filter((f) => f.datos.visibility === 'public')
  .sort((a, b) => (a.slug < b.slug ? -1 : 1));

const primero = (pred: (f: Ficha) => boolean, que: string): string => {
  const f = fichas.find(pred);
  if (!f) throw new Error(`ninguna ficha publica ${que}: la prueba dejaria de cubrir esa rama`);
  return f.slug;
};

const conPmi = primero((f) => !!f.datos.pmi_credential_id, 'con acreditacion PMI');
const vencida = primero(
  (f) => typeof f.datos.expires === 'string' && f.datos.expires < new Date().toISOString().slice(0, 10),
  'vencida',
);

// Rutas RELATIVAS al base del sitio: una barra inicial las resolveria contra
// la raiz del servidor, donde solo vive el 404 de Astro.
const PAGINAS: [string, string][] = [
  ['portada', ''],
  ['competencias', 'competencias/'],
  [`detalle con PMI (${conPmi})`, `c/${conPmi}/`],
  [`detalle vencida (${vencida})`, `c/${vencida}/`],
];

/**
 * Un 404 no tiene violaciones de accesibilidad, asi que auditar la pagina
 * equivocada da verde y no verifica nada. Esta comprobacion existe porque
 * paso: con el base mal resuelto, las cuatro plantillas "pasaron" auditando
 * el 404 de Astro.
 */
async function abrir(page: Page, ruta: string) {
  const respuesta = await page.goto(ruta, { waitUntil: 'domcontentloaded' });
  expect(respuesta?.status(), `${ruta} no respondio 200`).toBe(200);
  await expect(page.locator('h1').first(), `${ruta} sirvio un 404`).not.toContainText('404');
  // El artefacto no tiene ni un solo archivo .js: si aparece uno de Vite, esto
  // es `astro dev` y no lo que se publica.
  expect(
    await page.locator('script[src*="/@vite/"], script[src*="/node_modules/"]').count(),
    `${ruta} se sirvio desde el servidor de desarrollo, no desde el artefacto`,
  ).toBe(0);
}

/** Violaciones que de verdad bloquean a alguien. Las menores se reportan aparte. */
async function graves(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

const detalle = (vs: Awaited<ReturnType<typeof graves>>) =>
  vs
    .map((v) => `${v.id} (${v.impact}) en ${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}\n    ${v.help}`)
    .join('\n  ');

for (const tema of ['light', 'dark'] as const) {
  test.describe(`tema ${tema}`, () => {
    test.use({ colorScheme: tema });

    for (const [nombre, ruta] of PAGINAS) {
      test(`${nombre} sin violaciones serias ni criticas`, async ({ page }) => {
        await abrir(page, ruta);
        const vs = await graves(page);
        expect(vs, `violaciones en ${ruta} (${tema}):\n  ${detalle(vs)}`).toEqual([]);
      });
    }
  });
}

test.describe('portada con filtros aplicados', () => {
  // Filtrar oculta filas y cambia el DOM: el estado "sin resultados" y la
  // tabla reducida son vistas que nadie audita si solo se mira la carga.
  test('sigue accesible tras buscar y al quedarse sin resultados', async ({ page }) => {
    await abrir(page, '');

    const busqueda = page.locator('#q');
    await busqueda.fill('kubernetes');
    await expect.poll(() => page.locator('tbody tr:visible').count()).toBeGreaterThan(0);
    expect(await graves(page)).toEqual([]);

    await busqueda.fill('zzzzz-no-existe-nada');
    await expect.poll(() => page.locator('tbody tr:visible').count()).toBe(0);
    const vs = await graves(page);
    expect(vs, `violaciones sin resultados:\n  ${detalle(vs)}`).toEqual([]);
  });
});
