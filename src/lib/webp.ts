/**
 * Alto y ancho REALES de una miniatura, leidos de la cabecera WebP en build.
 *
 * 217 de 253 son 640x495, pero hay 7 verticales (A4 y Letter) y varias de
 * 640x476. Un alto fijo reserva mal el espacio y la pagina salta al cargar.
 *
 * Vivia dentro de getStaticPaths en la ficha, donde no habia forma de
 * probarlo. Y hace falta probarlo: el catch de abajo se traga cualquier error
 * de lectura y devuelve null, asi que las paginas se emiten igual, con las
 * dimensiones por omision, sin que nada falle. Un fallo de ruta degrada las
 * 252 fichas en silencio.
 */
import { readFileSync } from 'node:fs';

export type Dim = { w: number; h: number };

/** Directorio de las miniaturas fuente. No esta en public/: los activos se
 *  emiten ficha por ficha en un paso posterior al build. */
export const THUMBS_DIR = 'certs-src/_thumbs';

export function dimWebp(slug: string): Dim | null {
  try {
    const b = readFileSync(`${THUMBS_DIR}/${slug}.webp`);
    const fmt = b.toString('latin1', 12, 16);
    if (fmt === 'VP8 ') {
      const i = b.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
      if (i < 0) return null;
      // 14 bits utiles: los 2 altos son la escala, no la dimension
      return { w: b.readUInt16LE(i + 3) & 0x3fff, h: b.readUInt16LE(i + 5) & 0x3fff };
    }
    if (fmt === 'VP8L') {
      const v = b.readUInt32LE(21);
      return { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 };
    }
    if (fmt === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  } catch {
    // miniatura ausente en disco: la pagina se emite sin vista previa
  }
  return null;
}
