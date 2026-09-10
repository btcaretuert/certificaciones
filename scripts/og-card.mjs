/* Genera la tarjeta social (og:image) del sitio.
 *
 * Las cifras NO van escritas aca: se leen de la banda de indicadores de
 * `dist/index.html`, que es la misma que ve el visitante. Una tarjeta con
 * numeros propios se desactualiza en silencio el dia que entra un certificado
 * nuevo, y nadie revisa una imagen. Si una etiqueta esperada no aparece, el
 * script aborta en vez de dibujar un hueco.
 *
 * Requiere Chrome del sistema, como las pruebas de navegador. Corre DESPUES de
 * `npm run build` y escribe en `public/` —para que los builds siguientes la
 * copien solas— y tambien en `dist/`, para no obligar a reconstruir.
 */
import { chromium } from '@playwright/test';
import { writeFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORTADA = join(RAIZ, 'dist', 'index.html');
const SALIDA_PUBLIC = join(RAIZ, 'public', 'og.png');
const SALIDA_DIST = join(RAIZ, 'dist', 'og.png');

// Que indicadores entran en la tarjeta y con que rotulo. La clave es la
// etiqueta literal de la portada: si cambia alli, este script lo dice.
const QUIERO = [
  ['certificados', 'certificados\ncon documento'],
  ['de contenido', 'de contenido\nacreditado'],
  ['verificables en el emisor', 'verificables\nen el emisor'],
  ['con certificado PMI', 'con certificado\ndel PMI'],
];

if (!existsSync(PORTADA)) {
  console.error('og-card: falta dist/index.html. Corre `npm run build` primero.');
  process.exit(1);
}

const nav = await chromium.launch({ channel: 'chrome' });
try {
  const lector = await nav.newPage();
  await lector.goto('file://' + PORTADA);

  const banda = await lector.$$eval('.stats li', (lis) =>
    lis.map((li) => ({
      valor: li.querySelector('b')?.textContent?.trim() ?? '',
      etiqueta: li.querySelector('span')?.textContent?.trim() ?? '',
      pie: li.querySelector('i')?.textContent?.trim() ?? '',
    })),
  );
  const h1 = await lector.$eval('h1', (e) => e.textContent.trim());
  const kicker = await lector.$eval('.hero .kicker', (e) => e.textContent.trim());

  const kpis = QUIERO.map(([busca, rotulo]) => {
    const hit = banda.find((k) => k.etiqueta === busca);
    if (!hit) {
      console.error(`og-card: la portada ya no trae el indicador "${busca}".`);
      console.error('           Indicadores presentes: ' + banda.map((k) => k.etiqueta).join(' | '));
      process.exit(1);
    }
    // '610 h' -> numero '610' y sufijo 'h', para que la unidad vaya mas chica.
    const m = hit.valor.match(/^([\d.,]+)\s*(.*)$/);
    return { n: m ? m[1] : hit.valor, u: m ? m[2] : '', rotulo };
  });

  // El rango de años vive en el pie del primer indicador ('2013–2026').
  const rango = banda[0]?.pie ?? '';
  // El kicker de la portada es 'Registro verificable · <area>'; en la tarjeta
  // el area ya esta en el subtitulo, asi que se corta.
  const sello = kicker.split('·')[0].trim();
  const area = (kicker.split('·')[1] ?? '').trim();

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = plantilla({ sello, h1, area, kpis, rango, esc });
  const tmp = join(RAIZ, 'dist', '.og-card.html');
  writeFileSync(tmp, html, 'utf8');

  const lienzo = await nav.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await lienzo.goto('file://' + tmp);
  await lienzo.evaluate(() => document.fonts.ready);
  await lienzo.screenshot({ path: SALIDA_DIST });
  copyFileSync(SALIDA_DIST, SALIDA_PUBLIC);
  // El intermedio no puede sobrevivir dentro del artefacto: audit-dist audita
  // todo lo que quede en dist/, y esto no es una pagina del sitio.
  unlinkSync(tmp);
  console.log(`og-card: tarjeta 1200x630 con ${kpis.length} indicadores -> public/og.png y dist/og.png`);
} finally {
  await nav.close();
}

function plantilla({ sello, h1, area, kpis, rango, esc }) {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  /* Tokens de src/styles/tokens.css. La tarjeta se rasteriza aqui, asi que la
     pila de fuentes es la de ESTA maquina: system-ui no resuelve en headless. */
  :root {
    --bg: #0d1117; --card: #161b22; --line: #30363d;
    --fg: #e6edf3; --titulo: #ffffff; --muted: #8b949e; --dim: #7d8590;
    --accent: #58a6ff; --ok: #39d353;
    --sans: 'Liberation Sans', 'Noto Sans', 'DejaVu Sans', sans-serif;
    --mono: 'Liberation Mono', 'DejaVu Sans Mono', monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1200px; height: 630px; }
  body {
    background: var(--bg); color: var(--fg); font-family: var(--sans);
    font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
    display: flex; flex-direction: column; padding: 68px 76px 60px;
    background-image: radial-gradient(900px 420px at 12% -18%, var(--card) 0%, transparent 62%);
  }
  .kicker {
    display: flex; align-items: center; gap: 11px; font-family: var(--mono);
    font-size: 17px; font-weight: 700; letter-spacing: .16em;
    color: var(--ok); text-transform: uppercase;
  }
  .kicker::before {
    content: ''; width: 9px; height: 9px; border-radius: 50%;
    background: var(--ok); box-shadow: 0 0 0 4px rgba(57,211,83,.15);
  }
  h1 { margin-top: 26px; font-size: 82px; line-height: 1.05; letter-spacing: -.028em;
       color: var(--titulo); font-weight: 700; }
  .sub { margin-top: 16px; font-size: 29px; line-height: 1.35; color: var(--muted);
         letter-spacing: -.01em; max-width: 47ch; text-wrap: balance; }
  .sub b { color: var(--fg); font-weight: 400; }
  .kpis { margin-top: auto; display: grid; grid-template-columns: repeat(${kpis.length}, 1fr);
          gap: 34px; border-top: 1px solid var(--line); padding-top: 30px; }
  .kpi .n { font-family: var(--mono); font-size: 50px; font-weight: 700; line-height: 1;
            color: var(--titulo); letter-spacing: -.02em; }
  .kpi .n small { font-size: 27px; color: var(--muted); margin-left: 3px; }
  .kpi .l { margin-top: 11px; font-family: var(--mono); font-size: 16px; line-height: 1.35;
            color: var(--muted); }
  .pie { margin-top: 30px; display: flex; justify-content: space-between; align-items: baseline;
         font-family: var(--mono); font-size: 18px; color: var(--dim); }
  .pie .url { color: var(--accent); }
</style>
<div class="kicker">${esc(sello)}</div>
<h1>${esc(h1)}</h1>
<p class="sub"><b>${esc(area)}.</b> Cada credencial con su documento adjunto y comprobable.</p>
<div class="kpis">
${kpis.map((k) => `  <div class="kpi"><div class="n">${esc(k.n)}${k.u ? `<small>${esc(k.u)}</small>` : ''}</div><div class="l">${esc(k.rotulo).replace(/\n/g, '<br>')}</div></div>`).join('\n')}
</div>
<div class="pie">
  <span class="url">btcaretuert.github.io/certificaciones</span>
  <span>${esc(rango)}</span>
</div>
`;
}
