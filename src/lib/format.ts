/**
 * Formato y predicados de dominio, en un solo lugar.
 *
 * Cada una de estas funciones estaba escrita entre tres y nueve veces, una por
 * pagina, y habian empezado a divergir: el mismo certificado se leia "0,5 h" en
 * la vista de competencias y "30 min" en su propia ficha. Nada fallaba, porque
 * dos formatos distintos del mismo numero no rompen nada; solo se contradicen.
 */

/**
 * Minusculas y sin acentos. 'Comunicación' y 'comunicacion' son la misma
 * etiqueta.
 *
 * La usan el build y el filtrado del navegador. Vivia duplicada en los dos
 * lados con un comentario que reconocia que mantenerlas iguales era manual: si
 * divergen, buscar "analitica" deja de encontrar "Analítica" y la pagina no da
 * ningun error, simplemente no encuentra.
 */
export const normalizar = (s: string) =>
  (s ?? '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/**
 * Horas de contenido, con su unidad.
 *
 * Por debajo de una hora se dice en minutos: "0,3 h" obliga a hacer una cuenta
 * para entender que son 18 minutos. La unidad va DENTRO del texto devuelto, no
 * la pone quien llama, que es como se habian producido las dos versiones.
 */
export const fmtHoras = (h: number) =>
  h < 1 ? `${Math.round(h * 60)} min` : `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;

/** Año de una fecha ISO. Aparecia como `.slice(0, 4)` en nueve puntos. */
export const anio = (iso: string | null | undefined) => iso?.slice(0, 4) ?? null;

/**
 * El dia en que se construyo el sitio.
 *
 * Es estatico: esta fecha queda congelada en el artefacto hasta el proximo
 * build. Sirve para decidir vigencias, no para mostrarla como "hoy".
 */
export const hoy = () => new Date().toISOString().slice(0, 10);

/** Una credencial vencida sigue siendo evidencia; deja de ser una vigencia. */
export const estaVencida = (expires: string | null | undefined, referencia = hoy()) =>
  !!expires && expires < referencia;
