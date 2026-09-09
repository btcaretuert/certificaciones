#!/usr/bin/env node
/**
 * Prueba 9 del plan: seguridad estatica. Cuatro escaneres, un solo veredicto.
 *
 * Corre lo mismo en local y en CI. Si a un escaner le falta su binario, esto
 * FALLA en vez de saltarselo: una suite de seguridad que se salta lo que no
 * puede correr informa verde por no haber mirado, que es peor que no tenerla.
 *
 * Los secretos van siempre con --redact. Los logs de Actions de un repositorio
 * publico los lee cualquiera, y en el informe de una fuga el detalle ES la fuga.
 */
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(RAIZ, '.tools');

/** Corre y devuelve {code, stdout, stderr} sin lanzar por codigo != 0. */
async function correr(cmd, args, opciones = {}) {
  try {
    const r = await ejecutar(cmd, args, { cwd: RAIZ, maxBuffer: 64 * 1024 * 1024, ...opciones });
    return { code: 0, ...r };
  } catch (e) {
    if (e.code === 'ENOENT') throw e;
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

async function binario(nombre) {
  const ruta = join(TOOLS, nombre);
  if (await stat(ruta).then(() => true, () => false)) return ruta;
  throw new Error(
    `falta ${nombre} en .tools/. Corre "npm run tools:security" (descarga fijada por SHA256).`,
  );
}

const resultados = [];
const anotar = (nombre, ok, detalle) => {
  resultados.push({ nombre, ok, detalle });
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
};

/** 1. Curaduria: arbol versionado e historial completo. */
async function auditoriaDelRepo() {
  const r = await correr(process.execPath, [join(RAIZ, 'scripts/audit-repo.mjs'), '--historial']);
  process.stdout.write(r.stdout);
  if (r.code !== 0) process.stderr.write(r.stderr);
  anotar('audit-repo (arbol + historial)', r.code === 0, r.code === 0 ? '' : 'hay fugas de curaduria');
}

/** 2. Secretos en el historial: es lo que un push transfiere entero. */
async function secretosEnHistorial(gitleaks) {
  const r = await correr(gitleaks, ['git', '--redact', '--no-banner', '-c', '.gitleaks.toml', '.']);
  const leaks = /leaks found: (\d+)/.exec(r.stderr)?.[1] ?? (r.code === 0 ? '0' : '?');
  anotar('gitleaks (historial)', r.code === 0, r.code === 0 ? '' : `${leaks} hallazgo(s)`);
  if (r.code !== 0) process.stderr.write(r.stderr);
}

/**
 * 3. Secretos en lo que aun no se commitea.
 *
 * gitleaks no respeta .gitignore al escanear un directorio, y aqui eso son
 * cientos de coincidencias en la cosecha cruda, que nunca sale de la maquina.
 * Se filtra contra lo que git ve —versionado o versionable— para que el
 * escaner hable solo de lo que puede terminar en el remoto, y se informa
 * cuantas quedaron fuera para que el filtro no pase por ausencia de hallazgos.
 */
async function secretosPorVersionar(gitleaks) {
  const visibles = new Set();
  for (const args of [['ls-files'], ['ls-files', '--others', '--exclude-standard']]) {
    const r = await correr('git', args);
    r.stdout.split('\n').filter(Boolean).forEach((f) => visibles.add(f));
  }

  const informe = join(RAIZ, '.tools/gitleaks-dir.json');
  await correr(gitleaks, [
    'dir', '--redact', '--no-banner', '-c', '.gitleaks.toml',
    '--exit-code', '0', '-f', 'json', '-r', informe, '.',
  ]);

  const todos = JSON.parse(await readFile(informe, 'utf8').catch(() => '[]'));
  const dentro = todos.filter((h) => visibles.has(h.File.replace(/^\.\//, '')));
  const fuera = todos.length - dentro.length;

  anotar(
    'gitleaks (por versionar)',
    dentro.length === 0,
    `${dentro.length} en archivos que git ve, ${fuera} en rutas ignoradas (fuera de alcance)`,
  );
  for (const h of dentro) console.error(`  ${h.RuleID} en ${h.File}:${h.StartLine}`);
}

/** 4. Dependencias con CVE alta, por dos fuentes distintas. */
async function dependencias(osv) {
  const npmAudit = await correr('npm', ['audit', '--audit-level=high']);
  anotar('npm audit (>= high)', npmAudit.code === 0);
  if (npmAudit.code !== 0) process.stdout.write(npmAudit.stdout);

  const r = await correr(osv, ['scan', 'source', '--lockfile=package-lock.json']);
  // 0 = sin hallazgos. 1 = vulnerabilidades. Otro codigo es un fallo del
  // escaner y no puede leerse como "limpio".
  if (r.code !== 0 && r.code !== 1) {
    throw new Error(`osv-scanner termino con codigo ${r.code}:\n${r.stderr}`);
  }
  anotar('osv-scanner (lockfile)', r.code === 0);
  if (r.code === 1) process.stdout.write(r.stdout);
}

const gitleaks = await binario('gitleaks');
const osv = await binario('osv-scanner');

await auditoriaDelRepo();
await secretosEnHistorial(gitleaks);
await secretosPorVersionar(gitleaks);
await dependencias(osv);

const fallidos = resultados.filter((r) => !r.ok);
console.log(`\nseguridad: ${resultados.length - fallidos.length}/${resultados.length} comprobaciones en verde`);
if (fallidos.length) {
  console.error(`seguridad: ${fallidos.map((f) => f.nombre).join(', ')}`);
  process.exit(1);
}
