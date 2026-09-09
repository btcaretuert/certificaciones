/**
 * Como se muestra cada valor de la taxonomia.
 *
 * Las claves no se escriben aqui: se derivan de AREAS, TYPES y KINDS de
 * content.config.ts, que es la fuente canonica. Con `Record<string, string>`
 * el compilador daba por buena cualquier clave y devolvia `string` aunque el
 * valor no existiera, asi que TYPE_LABEL[c.type] —que se usa sin respaldo—
 * podia devolver undefined y reventar el build con undefined.toLowerCase().
 * Con este tipo, olvidar una etiqueta es un error de compilacion.
 *
 * Se veia venir: AREA_LABEL estaba ademas copiado palabra por palabra dentro
 * de la vista de competencias, que no importaba este modulo.
 */
import { AREAS, TYPES, KINDS } from '../content.config';

type Etiquetas<T extends readonly string[]> = Record<T[number], string>;

export const AREA_LABEL: Etiquetas<typeof AREAS> = {
  'datos-y-analitica': 'Datos y Analítica',
  'cloud-e-infraestructura': 'Cloud e Infraestructura',
  'desarrollo-y-herramientas': 'Desarrollo y Herramientas',
  'liderazgo-y-gestion': 'Liderazgo y Gestión',
  'comunicacion-y-efectividad': 'Comunicación y Efectividad',
  'negocio-e-innovacion': 'Negocio e Innovación',
  'sin-clasificar': 'Sin clasificar',
};

export const TYPE_LABEL: Etiquetas<typeof TYPES> = {
  tecnico: 'Técnico',
  gestion: 'Gestión',
  transversal: 'Transversal',
};

export const KIND_LABEL: Etiquetas<typeof KINDS> = {
  curso: 'Curso',
  itinerario: 'Itinerario',
  certificacion: 'Certificación',
};

/**
 * Nivel e idioma vienen del emisor, no de la taxonomia propia: el esquema los
 * declara texto libre, asi que estos mapas traducen lo conocido y quien llama
 * cae al valor original con `?? c.level`. Vivian dentro de la ficha, que era el
 * unico sitio que los usaba; estan aqui para que un componente pueda usarlos
 * sin arrastrarse la pagina entera.
 */
export const LEVEL_LABEL: Record<string, string> = {
  Beginner: 'Principiante',
  Intermediate: 'Intermedio',
  Advanced: 'Avanzado',
  General: 'General',
  'Beginner + Intermediate': 'Principiante e intermedio',
};

export const LANG_LABEL: Record<string, string> = { es: 'Español', en: 'Inglés' };

/**
 * Acceso con respaldo.
 *
 * Los mapas de arriba obligan a declarar TODAS las claves de la taxonomia —esa
 * es la parte que el compilador vigila—, pero el valor que llega en tiempo de
 * ejecucion viene de un YAML y su tipo es `string`. Estas funciones son el
 * unico punto donde ese salto se hace, y devuelven el valor original si no hay
 * etiqueta, en vez de `undefined`.
 *
 * Antes cada pagina escribia `AREA_LABEL[x] ?? x` a mano, y en TYPE_LABEL y
 * KIND_LABEL se olvidaba el `?? x`: una clave ausente devolvia undefined y
 * `undefined.toLowerCase()` tumbaba el build.
 */
export const areaLabel = (v: string): string => AREA_LABEL[v as (typeof AREAS)[number]] ?? v;
export const typeLabel = (v: string): string => TYPE_LABEL[v as (typeof TYPES)[number]] ?? v;
export const kindLabel = (v: string): string => KIND_LABEL[v as (typeof KINDS)[number]] ?? v;
