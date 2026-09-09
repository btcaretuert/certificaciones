import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * UNICO modulo del proyecto autorizado a llamar getCollection('certificates').
 * Hay un test de repositorio que falla si el literal aparece en otro archivo:
 * cualquier otro punto de acceso puede saltarse el filtro de curaduria.
 */

export type Cert = CollectionEntry<'certificates'>['data'] & { id: string };

/**
 * Marca de tipo. Una funcion que solo acepta PublishedCert[] no puede recibir
 * el corpus completo por descuido. No sustituye al filtro: lo documenta.
 */
export type PublishedCert = Cert & { readonly __published: unique symbol };

const withId = (e: CollectionEntry<'certificates'>): Cert => ({ ...e.data, id: e.id });

/** Corpus completo, incluidas las retenidas. Solo para auditoria y scripts. */
export async function allCertificates(): Promise<Cert[]> {
  return (await getCollection('certificates')).map(withId);
}

/**
 * INVARIANTE UNICO DE CURADURIA
 *
 *   PUBLISHED = all.filter(c => c.visibility === 'public')
 *
 * Toda cifra, porcentaje, denominador, faceta, grafico, JSON-LD, sitemap,
 * indice de busqueda, ZIP y activo emitido se deriva EXCLUSIVAMENTE de aqui.
 * No existe en el sitio ningun numero cuyo denominador incluya un certificado
 * que el visitante no pueda enumerar.
 *
 * `review` se comporta como `private`: fail-closed. Publicar es una decision
 * explicita, nunca lo que ocurre por omision.
 */
export function selectPublished(certs: Cert[]): PublishedCert[] {
  return certs.filter((c) => c.visibility === 'public') as PublishedCert[];
}

/** El acceso normal del sitio. Ordenado de forma estable y determinista. */
export async function publishedCertificates(): Promise<PublishedCert[]> {
  return sortStable(selectPublished(await allCertificates()));
}

/**
 * Orden estable: por fecha descendente, las sin fecha al final, y desempate
 * por id con comparacion de code units.
 *
 * Nunca `localeCompare`: es dependiente del locale por definicion y difiere
 * entre la maquina del dueño (es_CL) y el runner de CI (C.UTF-8), lo que
 * produce artefactos de build distintos para la misma entrada.
 */
export function sortStable<T extends Cert>(certs: T[]): T[] {
  return [...certs].sort((a, b) => {
    if (a.issued !== b.issued) {
      if (a.issued === null) return 1;
      if (b.issued === null) return -1;
      return a.issued < b.issued ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * `featured` solo tiene efecto sobre fichas publicadas. Se resuelve por
 * precedencia, no por error: una ficha destacada que luego se retira no debe
 * romper nada, simplemente deja de destacarse.
 */
export function selectFeatured(certs: PublishedCert[]): PublishedCert[] {
  return sortStable(certs.filter((c) => c.featured)).sort((a, b) => b.weight - a.weight);
}
