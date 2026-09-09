/**
 * Plantilla de las reglas de curaduria. Esto SI se versiona; curation.js no.
 *
 * El criterio con el que se decide que no se publica es, en un repositorio
 * publico, mas revelador que la lista de lo no publicado: la lista se puede
 * mirar y sacar conclusiones, el criterio las entrega escritas. Por eso vive
 * en curation.js, ignorado por git, y aqui solo queda la forma.
 *
 * Para trabajar con criterio propio:
 *   cp src/lib/classify/curation.plantilla.js src/lib/classify/curation.js
 *
 * Sin curation.js, prebuild copia esta plantilla: `curationFlag` no marca
 * nada y el panel no sugiere revisar ninguna ficha. Que no sugiera no
 * significa que no haya nada que revisar.
 *
 * Cada regla es `{ reason, re }`. `re` corre contra el titulo normalizado
 * —sin tildes, en minusculas, sin puntuacion—, asi que se escribe sin tildes.
 */
export const CURATION_RULES = [
  // { reason: 'motivo-en-kebab-case', re: /termino|otro termino/ },
];
