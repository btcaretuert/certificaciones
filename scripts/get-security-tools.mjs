#!/usr/bin/env node
/**
 * Descarga los escaneres a .tools/, verificando su SHA256 contra el valor
 * fijado en scripts/security-tools.json.
 *
 * Mismo criterio que el bundle del panel: una herramienta que revisa si el
 * repositorio filtra secretos no puede llegar por un tag movible. Se descarga
 * una vez y queda fuera de git.
 *
 * Solo linux x64, que es donde corre esto y donde corre el runner de Actions.
 * En otra plataforma falla diciendolo, en vez de bajar un binario que no sirve.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod, stat, readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONF = JSON.parse(await readFile(join(RAIZ, 'scripts/security-tools.json'), 'utf8'));
const DESTINO = join(RAIZ, CONF.destino);

if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error(
    `security-tools.json fija binarios de linux x64; aqui corre ${process.platform}/${process.arch}. ` +
      'Agrega las URLs y hash de tu plataforma antes de seguir.',
  );
}

await mkdir(DESTINO, { recursive: true });

for (const h of CONF.herramientas) {
  const binario = join(DESTINO, h.nombre);
  const marca = join(DESTINO, `${h.nombre}.version`);

  const instalada = await readFile(marca, 'utf8').catch(() => null);
  if (instalada === h.version && (await stat(binario).then(() => true, () => false))) {
    console.log(`${h.nombre} ${h.version}: ya esta`);
    continue;
  }

  console.log(`${h.nombre} ${h.version}: descargando`);
  const res = await fetch(h.url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${h.nombre}: HTTP ${res.status} en ${h.url}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  const suma = createHash('sha256').update(bytes).digest('hex');
  if (suma !== h.sha256) {
    throw new Error(
      `${h.nombre}: SHA256 ${suma}, se esperaba ${h.sha256}.\n` +
        '  El binario no es el fijado. No se instala.',
    );
  }

  if (h.extraer) {
    // El tar se escribe y se extrae en el destino: tar valida el gzip, cosa
    // que este script no sabe hacer, y el hash ya se comprobo sobre el archivo.
    const tmp = join(DESTINO, `${h.nombre}.tar.gz`);
    await writeFile(tmp, bytes);
    await ejecutar('tar', ['xzf', tmp, '-C', DESTINO, h.extraer]);
  } else {
    await writeFile(binario, bytes);
  }
  await chmod(binario, 0o755);
  await writeFile(marca, h.version);
  console.log(`${h.nombre} ${h.version}: verificado e instalado`);
}
