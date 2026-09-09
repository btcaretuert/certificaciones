// Vocabulario canonico en JS puro, sin dependencias y sin tipos.
// Se importa desde el navegador (hook preSave), desde el build y desde los
// scripts de Node. content.config.ts declara los mismos valores en TypeScript
// y un test compara ambos conjuntos: la deriva entre ellos es silenciosa.

export const AREAS = [
  'datos-y-analitica',
  'cloud-e-infraestructura',
  'desarrollo-y-herramientas',
  'liderazgo-y-gestion',
  'comunicacion-y-efectividad',
  'negocio-e-innovacion',
  'sin-clasificar',
];

export const TYPES = ['tecnico', 'gestion', 'transversal'];

/**
 * dominio -> area. Un dominio pertenece a exactamente un area.
 */
export const AREA_OF_DOMAIN = {
  'ingenieria-datos': 'datos-y-analitica',
  'gobierno-datos': 'datos-y-analitica',
  'analitica-bi': 'datos-y-analitica',
  'ml-ia': 'datos-y-analitica',
  'bases-datos': 'datos-y-analitica',

  'cloud-plataforma': 'cloud-e-infraestructura',
  devops: 'cloud-e-infraestructura',
  seguridad: 'cloud-e-infraestructura',
  'sistemas-linux': 'cloud-e-infraestructura',

  programacion: 'desarrollo-y-herramientas',
  'ofimatica-colaboracion': 'desarrollo-y-herramientas',

  'liderazgo-equipos': 'liderazgo-y-gestion',
  'gestion-personas': 'liderazgo-y-gestion',
  'agile-proyectos': 'liderazgo-y-gestion',

  comunicacion: 'comunicacion-y-efectividad',
  'efectividad-personal': 'comunicacion-y-efectividad',

  'estrategia-negocio': 'negocio-e-innovacion',
  'creatividad-innovacion': 'negocio-e-innovacion',
  'transformacion-digital': 'negocio-e-innovacion',

  'sin-clasificar': 'sin-clasificar',
};

/**
 * dominio -> type. Mapa EXPLICITO, nunca derivado del area.
 *
 * Derivar el tipo del area hacia que el clasificador no pudiera emitir
 * 'gestion' nunca, y 'gestion' es el 62% de este corpus. Dos revisores lo
 * marcaron como bloqueante por separado.
 */
export const TYPE_OF_DOMAIN = {
  'ingenieria-datos': 'tecnico',
  'gobierno-datos': 'tecnico',
  'analitica-bi': 'tecnico',
  'ml-ia': 'tecnico',
  'bases-datos': 'tecnico',
  'cloud-plataforma': 'tecnico',
  devops: 'tecnico',
  seguridad: 'tecnico',
  'sistemas-linux': 'tecnico',
  programacion: 'tecnico',

  'ofimatica-colaboracion': 'transversal',
  comunicacion: 'transversal',
  'efectividad-personal': 'transversal',

  'liderazgo-equipos': 'gestion',
  'gestion-personas': 'gestion',
  'agile-proyectos': 'gestion',
  'estrategia-negocio': 'gestion',
  'creatividad-innovacion': 'gestion',
  'transformacion-digital': 'gestion',

  'sin-clasificar': 'transversal',
};

export const DOMAINS = Object.keys(AREA_OF_DOMAIN);
