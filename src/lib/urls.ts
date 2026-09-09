/**
 * Rutas del sitio en un solo lugar. `base` cambia si el repo se renombra o si
 * se pasa a dominio propio, y una ruta escrita a mano en una plantilla es la
 * que se olvida ese dia.
 */
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const urlHome = () => `${base}/`;
/** Activo suelto de public/. BASE_URL no trae barra final: concatenar
 *  directamente producia /certificacionesfavicon.svg y el sitio se quedaba
 *  sin icono. */
export const urlAsset = (nombre: string) => `${base}/${nombre}`;
export const urlCert = (slug: string) => `${base}/c/${slug}/`;
export const urlCompetencias = () => `${base}/competencias/`;
export const urlPdf = (nombre: string) => `${base}/certs/${nombre}.pdf`;
export const urlThumb = (nombre: string) => `${base}/certs/thumbs/${nombre}.webp`;
