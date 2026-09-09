#!/usr/bin/env node
/**
 * Prueba 8 del plan: Lighthouse sobre las 3 plantillas, umbral 95 en las
 * cuatro categorias.
 *
 * Corre en perfil movil, que es el de por defecto y el mas exigente: aplica
 * limitacion de CPU y de red. Un 95 de escritorio sin limitar no dice nada
 * sobre el telefono desde el que un reclutador abre el enlace.
 *
 * Audita `astro preview`, no el servidor de desarrollo: mide el artefacto que
 * se publica, con su `base` y sus activos reales.
 */
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_PATH } from './lib/rutas.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.env.PORT ?? 4322);
const BASE = process.env.SITE_BASE ?? `http://localhost:${PUERTO}${BASE_PATH}`;

/**
 * El servidor lo levanta esta misma corrida, salvo que se apunte a otro con
 * SITE_BASE. Antes se medía contra lo que hubiera escuchando en el puerto: un
 * `astro dev` dio 66 con su HMR y su dev-toolbar, y un demonio de preview con
 * un dist/ viejo habria dado un numero bueno del artefacto equivocado.
 */
async function levantarServidor() {
  if (process.env.SITE_BASE) return null;
  const proc = spawn(process.execPath, [join(RAIZ, 'scripts/serve-dist.mjs')], {
    env: { ...process.env, PORT: String(PUERTO) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  for (let i = 0; i < 50; i++) {
    const vivo = await fetch(`${BASE}/`).then((r) => r.ok, () => false);
    if (vivo) return proc;
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error(`el servidor no respondio en ${BASE}/ ; corre "npm run build" antes`);
}
const UMBRAL = Number(process.env.LH_UMBRAL ?? 95);

const PAGINAS = [
  ['portada', `${BASE}/`],
  ['competencias', `${BASE}/competencias/`],
  ['detalle', `${BASE}/c/scrum-master/`],
];

const CATEGORIAS = ['performance', 'accessibility', 'best-practices', 'seo'];

const pct = (v) => Math.round((v ?? 0) * 100);
const ms = (a) => a?.displayValue ?? '—';

const servidor = await levantarServidor();
const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});

const fallos = [];

try {
  for (const [nombre, url] of PAGINAS) {
    const { lhr } = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: CATEGORIAS,
    });

    if (lhr.runtimeError?.code) {
      throw new Error(`${nombre}: ${lhr.runtimeError.message}`);
    }

    // Si esto mide el servidor de desarrollo, los numeros no valen nada: HMR y
    // el dev-toolbar meten mas de 1 MB de JavaScript que no existe en el sitio
    // publicado. Fallar es mejor que informar un 66 inventado.
    const red = lhr.audits['network-requests']?.details?.items ?? [];
    const dev = red.find((r) => /\/@vite\/|\/node_modules\/|astro:toolbar/.test(r.url ?? ''));
    if (dev) {
      throw new Error(
        `${nombre}: esto es el servidor de desarrollo, no el artefacto (${dev.url}).\n` +
          '  Corre `npm run build && npm run preview -- --port 4322` antes.',
      );
    }

    const puntajes = CATEGORIAS.map((c) => [c, pct(lhr.categories[c]?.score)]);
    const linea = puntajes.map(([c, p]) => `${c.slice(0, 4)} ${p}`).join('  ');
    const a = lhr.audits;
    console.log(
      `${nombre.padEnd(13)} ${linea}   LCP ${ms(a['largest-contentful-paint'])}` +
        `  CLS ${ms(a['cumulative-layout-shift'])}  TBT ${ms(a['total-blocking-time'])}`,
    );

    for (const [c, p] of puntajes) {
      if (p < UMBRAL) fallos.push(`${nombre}: ${c} = ${p} (umbral ${UMBRAL})`);
    }
  }
} finally {
  await chrome.kill();
  servidor?.kill();
}

if (fallos.length) {
  console.error(`\nlighthouse: ${fallos.length} categoria(s) por debajo del umbral`);
  fallos.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}

console.log(`\nlighthouse: las ${PAGINAS.length} plantillas cumplen ${UMBRAL} en las 4 categorias`);
