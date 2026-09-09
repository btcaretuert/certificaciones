/**
 * Prueba 4 del plan: el sitio publico, sobre el artefacto real.
 *
 * Lo que cubre y por que:
 *  - Ningun recurso roto. El favicon apuntaba a /certificacionesfavicon.svg
 *    —BASE_URL no trae barra final— y el sitio estuvo sin icono sin que nada
 *    fallara: un 404 de un activo no rompe ninguna pagina, asi que solo lo ve
 *    quien lo busca.
 *  - Los filtros corren en el cliente sobre el DOM ya renderizado. Si el
 *    normalizado de acentos difiere entre build y runtime, "analitica" deja de
 *    encontrar "Analítica" y nadie se entera.
 *  - El enlace profundo a una ficha es lo que un reclutador pega en un correo.
 */
import { test, expect, type Page } from '@playwright/test';

const PLANTILLAS = ['', 'competencias/', 'c/scrum-master/'];

/** Filas visibles del listado. Filtrar oculta con [hidden], no desmonta. */
const visibles = (page: Page) => page.locator('tbody tr:not([hidden])');

/**
 * En CI no existe certs-src/ —esta en .gitignore— y el build corre con
 * SIN_ACTIVOS=1, asi que cada PDF y cada miniatura da 404. La tolerancia se
 * limita a /certs/ y solo con la variable puesta: cualquier otro recurso roto
 * sigue siendo un fallo, y en local no se tolera nada.
 */
const SIN_ACTIVOS = process.env.SIN_ACTIVOS === '1';
const esActivoAusente = (linea: string) =>
  SIN_ACTIVOS && /^404 .*\/certificaciones\/certs\//.test(linea);

test.describe('integridad de recursos', () => {
  for (const ruta of PLANTILLAS) {
    test(`${ruta || 'portada'} carga sin recursos rotos`, async ({ page }) => {
      const rotos: string[] = [];
      page.on('response', (r) => {
        if (r.status() >= 400) rotos.push(`${r.status()} ${r.url()}`);
      });

      const res = await page.goto(ruta, { waitUntil: 'networkidle' });
      expect(res?.status()).toBe(200);
      expect(rotos.filter((r) => !esActivoAusente(r)), `recursos rotos en /${ruta}`).toEqual([]);
    });
  }

  test('el icono declarado existe de verdad', async ({ page }) => {
    await page.goto('', { waitUntil: 'domcontentloaded' });
    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(href, 'el layout no declara icono').toBeTruthy();
    // Concatenar BASE_URL sin barra produce /certificacionesfavicon.svg.
    expect(href, 'la ruta del icono perdio la barra del base').toContain('/certificaciones/');
    expect((await page.request.get(href!)).status()).toBe(200);
  });
});

test.describe('filtros del listado', () => {
  test('la busqueda ignora acentos y mayusculas', async ({ page }) => {
    // El heno se normaliza en build y la consulta en runtime: si las dos
    // normalizaciones divergen, buscar "analitica" deja de encontrar
    // "Analítica" y el listado aparece vacio sin error.
    await page.goto('', { waitUntil: 'domcontentloaded' });
    const total = await visibles(page).count();

    await page.locator('#q').fill('analitica');
    await expect.poll(() => visibles(page).count()).toBeGreaterThan(0);
    const sinTilde = await visibles(page).count();

    await page.locator('#q').fill('ANALÍTICA');
    await expect.poll(() => visibles(page).count()).toBe(sinTilde);
    expect(sinTilde).toBeLessThan(total);
  });

  test('los filtros se combinan y el contador sigue el resultado', async ({ page }) => {
    await page.goto('', { waitUntil: 'domcontentloaded' });
    const cuenta = page.locator('#cuenta');
    const total = await visibles(page).count();
    await expect(cuenta).toHaveText(String(total));

    await page.selectOption('#f-area', 'datos-y-analitica');
    await expect.poll(() => visibles(page).count()).toBeLessThan(total);
    const soloArea = await visibles(page).count();
    await expect(cuenta).toHaveText(String(soloArea));

    // Combinar con "verificable" solo puede reducir, nunca ampliar.
    await page.locator('#f-verif').check();
    await expect.poll(() => visibles(page).count()).toBeLessThanOrEqual(soloArea);
    const combinado = await visibles(page).count();
    await expect(cuenta).toHaveText(String(combinado));

    for (const fila of await visibles(page).all()) {
      expect(await fila.getAttribute('data-area')).toBe('datos-y-analitica');
      expect(await fila.getAttribute('data-verif')).toBe('1');
    }

    await page.locator('#limpiar').click();
    await expect.poll(() => visibles(page).count()).toBe(total);
  });

  test('Enter en la busqueda filtra, no recarga la pagina', async ({ page }) => {
    // Un formulario con un unico campo de texto y sin boton envia igual al
    // pulsar Enter: la pagina recargaria y se perderian los filtros. Ademas la
    // CSP lleva form-action 'none', asi que el envio seria una violacion.
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.locator('#q').fill('analitica');
    await expect.poll(() => visibles(page).count()).toBeGreaterThan(0);
    const filtradas = await visibles(page).count();

    const antes = page.url();
    await page.locator('#q').press('Enter');
    await page.waitForTimeout(200);
    expect(page.url()).toBe(antes);
    expect(await visibles(page).count()).toBe(filtradas);
  });

  test('sin resultados lo dice, no deja la tabla muda', async ({ page }) => {
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.locator('#q').fill('zzzzz-no-existe');
    await expect.poll(() => visibles(page).count()).toBe(0);
    await expect(page.locator('#cuenta')).toHaveText('0');
  });
});

test.describe('navegacion', () => {
  test('el enlace profundo a una ficha resuelve y es citable', async ({ page }) => {
    await page.goto('', { waitUntil: 'domcontentloaded' });
    const primero = page.locator('tbody tr a.tt').first();
    const titulo = (await primero.textContent())?.trim() ?? '';
    await primero.click();

    await expect(page).toHaveURL(/\/certificaciones\/c\/[a-z0-9-]+\/?$/);
    await expect(page.locator('h1')).toHaveText(titulo);

    // Recargar la URL directa tiene que dar lo mismo: es lo que se pega en un
    // correo, no se llega siempre navegando.
    const url = page.url();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText(titulo);
  });

  test('la ficha declara JSON-LD valido', async ({ page }) => {
    await page.goto('c/scrum-master/', { waitUntil: 'domcontentloaded' });
    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    const datos = JSON.parse(ld ?? '{}');
    expect(datos['@type']).toBe('Person');
    expect(datos.hasCredential?.['@type']).toBe('EducationalOccupationalCredential');
    expect(datos.hasCredential?.name).toBeTruthy();
  });

  test('se puede recorrer los filtros con el teclado', async ({ page }) => {
    await page.goto('', { waitUntil: 'domcontentloaded' });
    await page.locator('#q').focus();
    await page.keyboard.press('Tab');
    // El foco debe caer en un control del formulario, no perderse.
    const id = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(['f-area', 'f-tipo', 'f-anio', 'f-verif', 'f-pmi', 'f-ofi', 'limpiar']).toContain(id);
  });
});
