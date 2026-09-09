/**
 * Registra el hook de clasificacion y recien entonces arranca el panel.
 *
 * Por que el clasificador corre AQUI, en el navegador, y no en un job:
 * la clasificacion viaja dentro del mismo guardado que el panel ya hace, asi
 * que no existe un segundo commit que pueda re-disparar el despliegue. Ese
 * bucle se elimina de raiz en vez de mitigarse.
 *
 * Reglas que este hook NO puede violar:
 *  - La maquina nunca escribe `private` ni promueve nada a `public`. Como
 *    maximo degrada `public -> review` y levanta `curation_flag`.
 *  - Los campos listados en `manual_fields` no se tocan: si el dueño corrigio
 *    el area a mano, reclasificar encima seria deshacer su decision.
 *  - El motivo del flag NO se persiste. En un repositorio publico, un campo
 *    con el motivo de cada exclusion es un perfil mas especifico que la
 *    propia lista de cursos.
 */
import { classify, curationFlag } from './classifier.js';

/** Campos que produce el clasificador y que `manual_fields` puede proteger. */
const AUTO_FIELDS = ['area', 'domain', 'tech', 'type'];

/** El media_folder del panel, donde Sveltia deja los PDFs que se suben. */
const MEDIA_FOLDER = 'certs-src/_admin';

const esInmutable = (o) => Boolean(o) && typeof o.get === 'function' && typeof o.set === 'function';

const leer = (data, clave) => {
  const v = esInmutable(data) ? data.get(clave) : data[clave];
  return v && typeof v.toJS === 'function' ? v.toJS() : v;
};

const escribir = (data, clave, valor) =>
  esInmutable(data) ? data.set(clave, valor) : { ...data, [clave]: valor };

window.CMS.registerEventListener({
  name: 'preSave',
  handler: ({ entry }) => {
    const data = entry.get('data');

    const title = leer(data, 'title') ?? '';
    if (!title) return data;

    const resultado = classify({
      title,
      skills: leer(data, 'skills') ?? [],
      issuer: leer(data, 'issuer') ?? '',
    });

    const manuales = new Set(leer(data, 'manual_fields') ?? []);
    const previo = leer(data, 'auto_snapshot');
    let siguiente = data;

    /**
     * Un campo se reclasifica solo si sigue valiendo lo que el clasificador
     * dejo la ultima vez. Si diverge, alguien lo mejoro —a mano o en la
     * migracion, que enriquece con datos que las reglas no ven— y pisarlo
     * seria degradar la ficha en silencio al abrirla y guardarla sin tocar
     * nada. Para esto existe `auto_snapshot`; `manual_fields` solo cubre lo
     * que se marco explicitamente.
     */
    const intacto = (campo) =>
      !previo || JSON.stringify(leer(data, campo) ?? null) === JSON.stringify(previo[campo] ?? null);

    for (const campo of AUTO_FIELDS) {
      if (!manuales.has(campo) && intacto(campo)) {
        siguiente = escribir(siguiente, campo, resultado[campo]);
      }
    }

    // Lo que produjo el clasificador, intacto: permite detectar mas tarde que
    // una ficha diverge de las reglas sin tener que reejecutarlas.
    siguiente = escribir(siguiente, 'auto_snapshot', {
      area: resultado.area,
      domain: resultado.domain,
      type: resultado.type,
      tech: resultado.tech,
    });
    siguiente = escribir(siguiente, 'classification_confidence', resultado.confidence);
    siguiente = escribir(siguiente, 'classification_signals', resultado.signals);
    siguiente = escribir(siguiente, 'classification_rules_version', resultado.rules_version);
    siguiente = escribir(siguiente, 'needs_review', resultado.needs_review);

    // Sugerencia de curaduria: levanta la mano, no decide.
    if (curationFlag(title).flag) {
      siguiente = escribir(siguiente, 'curation_flag', true);
      if (leer(siguiente, 'visibility') === 'public') {
        siguiente = escribir(siguiente, 'visibility', 'review');
      }
    }

    // El build localiza el PDF real por `source_files`, no por `pdf`, que es
    // solo el basename de salida. Un PDF subido desde el panel sin esto deja
    // la ficha prometiendo un archivo que emit-assets.mjs no encuentra.
    const pdf = leer(siguiente, 'pdf');
    const fuentes = leer(siguiente, 'source_files') ?? [];
    if (pdf && fuentes.length === 0) {
      const base = String(pdf).replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '');
      siguiente = escribir(siguiente, 'source_files', [`${MEDIA_FOLDER}/${base}.pdf`]);
    }

    return siguiente;
  },
});

window.CMS.init();
