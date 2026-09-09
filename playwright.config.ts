import { defineConfig, devices } from '@playwright/test';

/**
 * Las pruebas de navegador corren contra `astro preview`, no contra el
 * servidor de desarrollo: preview sirve el artefacto real, con el mismo
 * `base` que produccion. Un fallo por `base` mal resuelto no aparece en dev,
 * que es justo la clase de error que rompe el sitio recien desplegado.
 *
 * Consecuencia buscada: aqui el panel NO existe. strip-admin lo retira del
 * artefacto, asi que estas pruebas ven exactamente lo que vera un visitante.
 *
 * `channel: 'chrome'` usa el Chrome instalado en el sistema en vez de
 * descargar el navegador de Playwright. Evita 150 MB de descarga y los
 * runners de GitHub ya lo traen.
 */

const BASE = '/certificaciones';
// Puerto propio, distinto del 4321 de `astro dev`. Con el mismo puerto,
// `reuseExistingServer` reutiliza un dev server que ya este corriendo y las
// pruebas miden HMR, dev-toolbar y mas de 1 MB de JavaScript de desarrollo en
// vez del artefacto. Paso de verdad: Lighthouse dio 66 midiendo eso.
const PUERTO = 4322;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    // La barra final importa: sin ella, una ruta relativa como 'x/' se
    // resuelve contra la raiz del servidor y no contra el base del sitio.
    baseURL: `http://localhost:${PUERTO}${BASE}/`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'a11y',
      testDir: 'tests/a11y',
      // axe recorre las 252 filas de la portada y tarda entre 25 y 30 s. Con
      // el limite por defecto de 30 s la prueba falla de a ratos, y una prueba
      // que falla sola termina volviendose a correr hasta que pasa: deja de
      // significar algo. El limite se sube donde el trabajo es real.
      timeout: 90_000,
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'e2e',
      testDir: 'tests/e2e',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],

  webServer: [
    {
      // Construye y sirve. `astro preview` no sirve para esto: se demoniza, el
      // proceso en primer plano termina y Playwright lo da por caido. En local
      // eso no se veia porque reutilizaba un demonio ya levantado, con lo cual
      // las pruebas podian estar midiendo un dist/ de hace rato.
      command: `npm run build && npm run serve`,
      url: `http://localhost:${PUERTO}${BASE}/`,
      env: { PORT: String(PUERTO) },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
    },
    {
      // El panel no esta en el artefacto —strip-admin lo retira— pero su CSP
      // hay que probarla igual: es la unica pagina del proyecto que carga un
      // bundle de terceros. Servidor propio, en su puerto.
      command: 'npm run panel',
      url: 'http://127.0.0.1:4323/admin/',
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'pipe',
    },
  ],
});
