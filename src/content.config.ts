import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/* ─────────────────────────────────────────────────────────────────────────
   VOCABULARIO CANONICO
   Unica fuente de verdad. Lo importan tambien el clasificador, los scripts
   de build y el generador de public/admin/config.yml. Los `value` de los
   select del CMS deben ser exactamente estos slugs; hay un test que compara
   ambos conjuntos, porque la deriva entre ellos es silenciosa.
   ───────────────────────────────────────────────────────────────────────── */

export const AREAS = [
  'datos-y-analitica',
  'cloud-e-infraestructura',
  'desarrollo-y-herramientas',
  'liderazgo-y-gestion',
  'comunicacion-y-efectividad',
  'negocio-e-innovacion',
  'sin-clasificar',
] as const;

export const TYPES = ['tecnico', 'gestion', 'transversal'] as const;
export const VISIBILITY = ['public', 'private', 'review'] as const;
export const PLATFORMS = ['LinkedIn', 'PMI', 'Udemy', 'MOOC', 'International'] as const;
export const AUTO_FIELDS = ['area', 'domain', 'tech', 'type'] as const;
export const KINDS = ['curso', 'itinerario', 'certificacion'] as const;
export const EXTRACTABLE = ['issued', 'hours', 'credential_id', 'verify_url'] as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ── normalizadores ──────────────────────────────────────────────────────
   Sveltia escribe '' / null en los opcionales vacios. Normalizamos siempre,
   sin depender de `output.omit_empty_optional_fields`: no apoyar la
   correccion de los datos en un solo flag de la CMS.
   ──────────────────────────────────────────────────────────────────────── */

const blankToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), inner.nullable());

/** 'certs-src/x.pdf' | '/certs/x.pdf' | 'x.pdf'  ->  'x' */
const assetSlug = blankToNull(
  z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '') : v),
    z.string().regex(SLUG),
  ),
);

/** YAML sin comillas entrega Date; con comillas, string. Todo a ISO YYYY-MM-DD. */
const isoDate = blankToNull(
  z.preprocess((v) => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'string') return v.slice(0, 10);
    return v;
  }, z.string().regex(ISO_DATE)),
);

/** https obligatorio: cierra `javascript:` en el mismo origen que sirve el panel. */
const httpsUrl = blankToNull(
  z.string().refine((u) => {
    try { return new URL(u).protocol === 'https:'; } catch { return false; }
  }, 'debe ser una URL https'),
);

/** Texto plano: sin caracteres que abran marcado al interpolarse. */
const plain = (max: number) => z.string().max(max).regex(/^[^<>{}\\]*$/u);

/* ── esquema BASE: las reglas verdaderas ───────────────────────────────── */

const base = z.object({
  title: plain(200).min(3),
  issuer: plain(120),
  platform: z.enum(PLATFORMS),

  // clasificacion
  area: z.enum(AREAS),
  domain: z.string().regex(SLUG),
  tech: z.array(z.string().regex(SLUG)).max(20).default([]),
  type: z.enum(TYPES),

  official: z.boolean().default(false),
  skills: z.array(plain(80)).max(30).default([]),
  issued: isoDate.default(null),
  hours: blankToNull(z.number().positive().max(1000)).default(null),
  credential_id: blankToNull(plain(120)).default(null),
  verify_url: httpsUrl.default(null),

  // basenames, no rutas. Los activos viven en certs-src/, fuera de public/.
  pdf: assetSlug.default(null),
  thumb: assetSlug.default(null),

  weight: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(20), z.literal(30)])
    .default(1),
  featured: z.boolean().default(false),

  // ── curaduria: decision humana. La maquina solo sugiere. ──
  visibility: z.enum(VISIBILITY).default('review'), // fail-closed
  curation_note: plain(200).default(''),
  curation_flag: z.boolean().default(false),

  // ── procedencia de la clasificacion: por campo, no por entrada ──
  manual_fields: z.array(z.enum(AUTO_FIELDS)).default([]),
  auto_snapshot: z
    .object({
      area: z.enum(AREAS),
      domain: z.string(),
      type: z.enum(TYPES),
      tech: z.array(z.string()),
    })
    .nullable()
    .default(null),
  classification_confidence: z.enum(['high', 'medium', 'low']).default('low'),
  classification_signals: plain(120).default(''),
  classification_rules_version: plain(40).default(''),
  needs_review: z.boolean().default(true),
  extracted_fields: z.array(z.enum(EXTRACTABLE)).default([]),

  /* ── evidencia y procedencia ──────────────────────────────────────────
     Lo que produjo la cosecha de las plataformas. Sin declararlo aqui, Zod
     lo descartaba en silencio y el sitio no podia mostrar nada de esto.

     `program` carga dos sentidos segun el emisor: para LinkedIn es el
     programa acreditador ('LinkedIn Learning' | 'PMI'), para el resto es el
     tipo de credencial ('certificacion' | 'curso' | 'MOOC'). Queda como
     texto libre a proposito: un enum aqui obligaria a inventar una fusion
     de dos taxonomias distintas.
     ─────────────────────────────────────────────────────────────────── */

  /** La URL publica resuelve hoy. Comprobado por HTTP, no supuesto. */
  verified_public: z.boolean().default(false),
  program: plain(40).default(''),
  /** Un itinerario AGRUPA cursos que ya estan en la coleccion. Sin este campo
   *  el sitio suma sus horas dos veces: 892 h en vez de 610. */
  kind: z.enum(KINDS).default('curso'),
  course_urn: blankToNull(plain(80)).default(null),
  course_url: httpsUrl.default(null),
  level: blankToNull(plain(40)).default(null),
  language: blankToNull(z.string().regex(/^[a-z]{2}$/)).default(null),
  /** El curso ya no esta en el catalogo del emisor. La credencial sigue valida. */
  retired: z.boolean().default(false),
  instructors: z.array(plain(120)).max(10).default([]),
  summary: blankToNull(plain(400)).default(null),
  /** "Lo que aprenderas" del emisor. Contenido de la ficha, no facetas. */
  objectives: z.array(plain(300)).max(12).default([]),

  /* Rutas relativas a la raiz del repo, dentro de certs-src/. Solo archivos
     publicables: el original con RUT sin redactar nunca entra aqui. */
  source_files: z.array(plain(300)).max(8).default([]),

  /* ── acreditacion PMI del mismo curso ──────────────────────────────────
     70 cursos tienen ademas certificado del Project Management Institute:
     otro documento, con identificador y URL propios, del MISMO curso. Va como
     distintivo de la ficha y no como ficha aparte, para no duplicar cada
     titulo en el listado ni contar dos veces sus horas.
     `pmi_verify_url` solo lleva valor si el enlace resuelve: los PMI quedaron
     fuera del lote de activacion y hoy 67 de 70 devuelven 404.
     ──────────────────────────────────────────────────────────────────────── */
  pmi_credential_id: blankToNull(plain(120)).default(null),
  pmi_verify_url: httpsUrl.default(null),
  pmi_pdus: blankToNull(z.number().positive().max(100)).default(null),
  /** Basename del PDF del PMI, emitido aparte del de LinkedIn: son dos
   *  documentos distintos del mismo curso, con sellos y numeros distintos. */
  pmi_pdf: assetSlug.default(null),
  pmi_source_file: blankToNull(plain(300)).default(null),

  expires: isoDate.default(null),
  /** null = no caduca. Distinto de false, que es "caduco y ya vencio". */
  active: blankToNull(z.boolean()).default(null),
});

/**
 * ESTRICTO — lo usan `npm run check:content` y la suite de pruebas.
 * REPORTA, no despliega. Aqui si es correcto que un dato malo falle.
 */
export const strictCertificate = base;

/**
 * TOTAL — el que usa Astro para construir. NUNCA lanza.
 *
 * REGLA DE DEGRADACION: ningun error de contenido puede impedir un despliegue
 * cuyo efecto seria seguir sirviendo un sitio MAS PERMISIVO. Si el build muere
 * al ocultar un certificado, el resultado es que ese certificado sigue
 * publicado — exactamente lo contrario de lo que se pidio. Por eso todo
 * fallback apunta a la direccion segura: `private`.
 */
// Se exporta para que tests/unit/degradacion.test.ts pueda ejercitarlo con los
// fixtures: una regla que decide que se publica y que se retiene no puede
// depender de una verificacion manual hecha una vez.
export const lenient = base
  .extend({
    visibility: z.enum(VISIBILITY).catch('private'),
    official: z.boolean().catch(false),
    featured: z.boolean().catch(false),
    weight: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(5), z.literal(20), z.literal(30)])
      .catch(1),
    verify_url: httpsUrl.catch(null),
    pdf: assetSlug.catch(null),
    thumb: assetSlug.catch(null),
    issued: isoDate.catch(null),
    hours: blankToNull(z.number().positive().max(1000)).catch(null),
    tech: z.array(z.string().regex(SLUG)).max(20).catch([]),
    area: z.enum(AREAS).catch('sin-clasificar'),
    type: z.enum(TYPES).catch('transversal'),
    verified_public: z.boolean().catch(false),
    retired: z.boolean().catch(false),
    kind: z.enum(KINDS).catch('curso'),
    course_url: httpsUrl.catch(null),
    expires: isoDate.catch(null),
    pmi_verify_url: httpsUrl.catch(null),
    pmi_pdus: blankToNull(z.number().positive().max(100)).catch(null),
    pmi_pdf: assetSlug.catch(null),
    active: blankToNull(z.boolean()).catch(null),
    source_files: z.array(plain(300)).max(8).catch([]),
    instructors: z.array(plain(120)).max(10).catch([]),
  })
  // Ultima red: si el objeto entero no valida, la ficha se retiene.
  .catch((ctx) => ({ ...(ctx.input as Record<string, unknown>), visibility: 'private' }) as never);

const certificates = defineCollection({
  loader: glob({ base: './src/content/certificates', pattern: '**/*.yaml' }),
  schema: lenient,
});

export const collections = { certificates };
