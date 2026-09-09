#!/usr/bin/env node
/**
 * Emite a dist/certs/ los activos de las fichas PUBLICAS, y solo esos.
 *
 * Los PDFs viven en certs-src/, fuera de public/, justamente para que
 * publicar no sea el estado por omision. Aqui se decide, ficha por ficha,
 * que archivo sale. Consecuencia buscada: ocultar un certificado es cambiar
 * una linea de YAML, sin borrar nada del disco, y un activo huerfano en el
 * sitio es estructuralmente imposible.
 *
 * Nunca lee private/. No es una comprobacion, es que ni siquiera mira ahi.
 */
import { readFile, readdir, mkdir, copyFile, stat, open } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FICHAS = join(RAIZ, 'src/content/certificates');
const THUMBS = join(RAIZ, 'certs-src/_thumbs');
const FUENTES = join(RAIZ, 'certs-src');
const CI = process.env.CI === 'true';

/**
 * certs-src/ esta en .gitignore: pesa 126 MB y contiene tambien los PDF de las
 * fichas retenidas, asi que versionarlo publicaria justo lo que la curaduria
 * saco. Consecuencia: un clon limpio no puede emitir activos.
 *
 * SIN_ACTIVOS=1 lo admite explicitamente, para que CI pueda compilar y correr
 * las pruebas de navegador sobre el HTML. Lo que produce NO es publicable, y
 * por eso se rechaza si los activos SI estan: un artefacto sin PDF solo puede
 * salir de una maquina que no los tiene, nunca por descuido de la que si.
 */
const SIN_ACTIVOS = process.env.SIN_ACTIVOS === '1';

const destino = process.argv[2] ?? 'dist';
const OUT = join(RAIZ, destino, 'certs');

/** Un archivo es PDF por sus bytes, no por su extension: hay uno guardado sin ella. */
async function esPdf(ruta) {
  let fh;
  try {
    fh = await open(ruta, 'r');
    const buf = Buffer.alloc(4);
    await fh.read(buf, 0, 4, 0);
    return buf.toString('latin1') === '%PDF';
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}

/**
 * De los archivos publicables de la ficha, el mejor para publicar:
 * el redactado antes que el original — que es lo unico que impide que un
 * PDF con RUT salga al sitio por orden alfabetico.
 */
function ordenar(fuentes) {
  return [...fuentes].sort((a, b) => {
    const red = Number(!a.includes('_redactados')) - Number(!b.includes('_redactados'));
    if (red !== 0) return red;
    return a.localeCompare(b);
  });
}

const problemas = [];

async function main() {
  const archivos = (await readdir(FICHAS)).filter((f) => f.endsWith('.yaml'));
  if (archivos.length === 0) throw new Error('no hay fichas en src/content/certificates');

  const hayFuentes = await stat(FUENTES).then(() => true, () => false);
  if (SIN_ACTIVOS && hayFuentes) {
    throw new Error(
      'SIN_ACTIVOS=1 con certs-src/ presente. Esa combinacion solo puede producir\n' +
        '  un artefacto incompleto desde una maquina que si tiene los activos.',
    );
  }
  if (!hayFuentes && !SIN_ACTIVOS) {
    throw new Error(
      'no existe certs-src/: este clon no tiene los PDF ni las miniaturas.\n' +
        '  Para compilar igual (HTML sin activos, NO publicable): SIN_ACTIVOS=1 npm run build',
    );
  }
  if (SIN_ACTIVOS) {
    const publicables = archivos.length;
    console.warn(
      `emit-assets: SIN_ACTIVOS=1 — ninguno de los activos de las ${publicables} fichas se emite.\n` +
        '  El artefacto sirve para probar el HTML; publicarlo dejaria cada PDF y cada\n' +
        '  miniatura en 404.',
    );
    return;
  }

  await mkdir(join(OUT, 'thumbs'), { recursive: true });

  let publicas = 0, pdfs = 0, miniaturas = 0, pmis = 0;

  for (const nombre of archivos) {
    const slug = nombre.replace(/\.yaml$/, '');
    const ficha = parse(await readFile(join(FICHAS, nombre), 'utf8')) ?? {};

    // fail-closed: cualquier cosa que no sea exactamente 'public' se retiene.
    if (ficha.visibility !== 'public') continue;
    publicas++;

    if (ficha.pdf) {
      let emitido = false;
      for (const rel of ordenar(ficha.source_files ?? [])) {
        const origen = join(RAIZ, rel);
        if (!(await esPdf(origen))) continue;
        await copyFile(origen, join(OUT, `${ficha.pdf}.pdf`));
        emitido = true;
        pdfs++;
        break;
      }
      // La ficha promete un PDF que el visitante va a pedir y no existe.
      if (!emitido) problemas.push(`${slug}: declara pdf pero ninguna fuente resuelve`);
    }

    // El certificado del PMI es otro documento del mismo curso. Se emite con
    // sufijo -pmi para que un solo slug baste para ubicar los dos.
    if (ficha.pmi_pdf && ficha.pmi_source_file) {
      const origen = join(RAIZ, ficha.pmi_source_file);
      if (await esPdf(origen)) {
        await copyFile(origen, join(OUT, `${ficha.pmi_pdf}.pdf`));
        pmis++;
      } else {
        problemas.push(`${slug}: declara pmi_pdf pero la fuente no es un PDF`);
      }
    }

    if (ficha.thumb) {
      const origen = join(THUMBS, `${ficha.thumb}.webp`);
      if (await stat(origen).then(() => true, () => false)) {
        await copyFile(origen, join(OUT, 'thumbs', `${ficha.thumb}.webp`));
        miniaturas++;
      } else {
        problemas.push(`${slug}: declara thumb pero falta ${ficha.thumb}.webp`);
      }
    }
  }

  console.log(`emit-assets: ${publicas} fichas publicas -> ${pdfs} PDF, ${pmis} PDF del PMI, ${miniaturas} miniaturas`);

  if (problemas.length) {
    // En un repo publico los logs de Actions los lee cualquiera: sin slugs ni titulos.
    if (CI) console.error(`emit-assets: ${problemas.length} problema(s); corre "node scripts/emit-assets.mjs" en local para el detalle`);
    else problemas.forEach((p) => console.error(`  ${p}`));
    process.exitCode = 1;
  }
}

await main();
