/**
 * Dimensiones reales de las miniaturas.
 *
 * `dimWebp` devuelve null ante cualquier problema de lectura, y quien lo llama
 * cae a unas dimensiones por omision. Eso es correcto —una miniatura ausente no
 * debe tumbar el build— pero significa que un fallo de ruta degradaria las 252
 * fichas sin que nada fallara: las paginas se emiten, con la relacion de aspecto
 * equivocada, y el sitio salta al cargar.
 *
 * Estas pruebas son la unica senal de que la lectura sigue funcionando.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { dimWebp, THUMBS_DIR } from '../../src/lib/webp';

// certs-src/ no se versiona: en un clon limpio y en CI no hay nada que leer.
const hayActivos = existsSync(THUMBS_DIR);

describe('lectura de dimensiones WebP', () => {
  it('una miniatura inexistente da null, no lanza', () => {
    expect(dimWebp('esto-no-existe-en-ninguna-parte')).toBeNull();
  });

  it.skipIf(!hayActivos)('sobre las miniaturas reales, lee dimensiones plausibles', () => {
    const slugs = readdirSync(THUMBS_DIR)
      .filter((f) => f.endsWith('.webp'))
      .map((f) => f.replace(/\.webp$/, ''));
    expect(slugs.length, 'sin miniaturas la prueba no comprobaria nada').toBeGreaterThan(200);

    const dims = slugs.map((s) => dimWebp(s));
    const leidas = dims.filter((d) => d !== null);
    // Si la ruta se rompiera, TODAS darian null y el sitio seguiria construyendo.
    expect(leidas.length).toBe(slugs.length);
    for (const d of leidas) {
      expect(d!.w).toBeGreaterThan(0);
      expect(d!.h).toBeGreaterThan(0);
      expect(d!.w).toBeLessThan(5000);
      expect(d!.h).toBeLessThan(5000);
    }
  });

  it.skipIf(!hayActivos)('las miniaturas NO son todas del mismo alto', () => {
    // Es la razon de ser del modulo. Si fueran todas iguales, un literal en el
    // marcado bastaria y este codigo sobraria; como no lo son, un alto fijo
    // reserva mal el espacio en las que se salen de la norma.
    const slugs = readdirSync(THUMBS_DIR)
      .filter((f) => f.endsWith('.webp'))
      .map((f) => f.replace(/\.webp$/, ''));
    const altos = new Set(slugs.map((s) => dimWebp(s)?.h).filter(Boolean));
    expect(altos.size).toBeGreaterThan(1);
  });

  it.skipIf(!hayActivos)('el alto dominante es 495, no 480', () => {
    // La portada declaraba height="480" y la ficha usa 495 como respaldo: dos
    // relaciones de aspecto para el mismo activo. Esta prueba fija cual es la
    // real, para que el arreglo no sea una opinion.
    const slugs = readdirSync(THUMBS_DIR)
      .filter((f) => f.endsWith('.webp'))
      .map((f) => f.replace(/\.webp$/, ''));
    const cuenta = new Map<number, number>();
    for (const s of slugs) {
      const h = dimWebp(s)?.h;
      if (h) cuenta.set(h, (cuenta.get(h) ?? 0) + 1);
    }
    const [altoDominante] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(altoDominante).toBe(495);
    expect(cuenta.get(480) ?? 0).toBe(0);
  });
});
