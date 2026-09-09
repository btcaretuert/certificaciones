// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Verificado por SSH contra github.com el 2026-09-07: la cuenta es btcaretuert.
// URL publica resultante: https://btcaretuert.github.io/certificaciones/
//
// El valor sale de scripts/lib/rutas.mjs y no de aqui, para que el servidor de
// pruebas, Lighthouse y la configuracion de Playwright lean exactamente el
// mismo base que el build. Antes cada uno lo llevaba escrito entero.
import { BASE_PATH, SITE_URL } from './scripts/lib/rutas.mjs';

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: 'ignore',
  output: 'static',
  build: { format: 'directory' },

  // Astro incrusta en el HTML los scripts chicos. Con `script-src 'self'` eso
  // los deja bloqueados: el filtrado del listado dejaba de funcionar sin que
  // la pagina diera error. Con el limite en 0 sale como archivo aparte y la
  // politica se cumple sin 'unsafe-inline' ni hashes por pagina.
  vite: { build: { assetsInlineLimit: 0 } },

  // i18n aplica SOLO a la copy del sitio. El corpus de certificados NO se
  // internacionaliza: un archivo por certificado, con el titulo en el idioma
  // del emisor. Duplicarlo por locale generaria 2 entradas por certificado y
  // doblaria en silencio todos los conteos.
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: { prefixDefaultLocale: false },
  },

  integrations: [
    sitemap({
      i18n: { defaultLocale: 'es', locales: { es: 'es-CL', en: 'en' } },
      // Red de seguridad: el sitemap solo puede contener paginas que el build
      // emitio. Las fichas retenidas nunca generan pagina, asi que no pueden
      // aparecer aqui; este filtro ademas excluye el panel.
      filter: (page) => !page.includes('/admin'),
    }),
  ],
});
