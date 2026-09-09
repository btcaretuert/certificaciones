/**
 * Corre ANTES del CMS. Dos cosas, en este orden.
 *
 * 1. Guardia anti-clickjacking. GitHub Pages no permite cabeceras HTTP, y
 *    `frame-ancestors` NO funciona en <meta>: no hay proteccion declarativa
 *    posible en este hosting. Esto sube el liston, no equivale a la cabecera.
 *    La unica solucion real seria mover el hosting a algo que permita
 *    cabeceras propias, que esta fuera del alcance elegido.
 *
 * 2. Desactiva la auto-inicializacion del CMS. El hook `preSave` tiene que
 *    quedar registrado ANTES de que el panel arranque; si el CMS se inicializa
 *    solo, la primera ficha que se guarde puede salir sin clasificar.
 *
 * Va en un archivo aparte y no inline porque la CSP del panel es
 * `script-src 'self'`: un <script> inline obligaria a 'unsafe-inline' o a
 * mantener un hash a mano en cada edicion.
 */
if (window.top !== window.self) {
  document.documentElement.remove();
} else {
  window.CMS_MANUAL_INIT = true;
}
