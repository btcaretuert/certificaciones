/**
 * Coherencia entre el esquema y el panel de edicion.
 *
 * content.config.ts declara el vocabulario canonico en TypeScript y
 * public/admin/config.yml lo repite en YAML porque la CMS no puede importar
 * el modulo. Esa duplicacion es inevitable; que derive en silencio, no.
 *
 * La prueba mas importante es la ultima: TODO campo del esquema tiene que
 * estar declarado en el panel. No esta documentado si Sveltia conserva las
 * claves que no aparecen en `fields`, y si las descarta, editar una ficha
 * desde el panel borraria su procedencia sin que nada avise.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import {
  strictCertificate,
  AREAS,
  TYPES,
  KINDS,
  PLATFORMS,
  VISIBILITY,
} from '../../src/content.config';
import { AREA_OF_DOMAIN } from '../../src/lib/classify/vocabulary.js';

type Campo = { name: string; widget?: string; options?: unknown[] };

const config = parse(readFileSync('public/admin/config.yml', 'utf8')) as {
  collections: { name: string; folder: string; fields: Campo[] }[];
};

const coleccion = (nombre: string) => {
  const c = config.collections.find((x) => x.name === nombre);
  if (!c) throw new Error(`falta la coleccion ${nombre} en config.yml`);
  return c;
};

const campos = coleccion('certificates').fields;

const campo = (nombre: string): Campo => {
  const f = campos.find((x) => x.name === nombre);
  if (!f) throw new Error(`falta el campo ${nombre} en config.yml`);
  return f;
};

/** Los options admiten `valor` suelto u `{label, value}`. Normaliza a valores. */
const valores = (nombre: string): unknown[] =>
  (campo(nombre).options ?? []).map((o) =>
    o !== null && typeof o === 'object' ? (o as { value: unknown }).value : o,
  );

describe('vocabulario del panel', () => {
  it.each([
    ['area', AREAS],
    ['type', TYPES],
    ['kind', KINDS],
    ['platform', PLATFORMS],
    ['visibility', VISIBILITY],
  ])('%s ofrece exactamente los valores del esquema', (nombre, esperado) => {
    expect([...valores(nombre)].sort()).toEqual([...esperado].sort());
  });

  it('domain ofrece exactamente los dominios del clasificador', () => {
    // Un dominio que el panel ofrece y el clasificador desconoce se queda sin
    // area: AREA_OF_DOMAIN lo resolveria a 'sin-clasificar' en silencio.
    expect([...valores('domain')].sort()).toEqual(Object.keys(AREA_OF_DOMAIN).sort());
  });

  it('todo valor ofrecido por un select lo acepta el esquema estricto', () => {
    const base = {
      title: 'Titulo de prueba',
      issuer: 'Emisor',
      platform: 'LinkedIn',
      area: 'datos-y-analitica',
      domain: 'ingenieria-datos',
      type: 'tecnico',
    };
    const rechazados: string[] = [];
    for (const nombre of ['area', 'type', 'kind', 'platform', 'visibility', 'domain', 'weight']) {
      for (const v of valores(nombre)) {
        if (!strictCertificate.safeParse({ ...base, [nombre]: v }).success) {
          rechazados.push(`${nombre}=${JSON.stringify(v)}`);
        }
      }
    }
    expect(rechazados).toEqual([]);
  });
});

describe('cobertura de campos', () => {
  it('todo campo del esquema esta declarado en el panel', () => {
    // Si Sveltia descarta las claves no declaradas, un campo ausente aqui se
    // pierde al guardar. Declararlos todos hace que la pregunta no importe.
    const enEsquema = Object.keys(strictCertificate.shape);
    const enPanel = new Set(campos.map((f) => f.name));
    expect(enEsquema.filter((k) => !enPanel.has(k))).toEqual([]);
  });

  it('el panel no declara campos que el esquema no conoce', () => {
    const enEsquema = new Set(Object.keys(strictCertificate.shape));
    expect(campos.map((f) => f.name).filter((n) => !enEsquema.has(n))).toEqual([]);
  });

  it('ningun campo que admita null es editable con un interruptor', () => {
    // Un widget boolean no puede expresar "sin valor": al guardar escribe
    // false. Para `active`, false no es "vacio", es "caduco y ya vencido", asi
    // que abrir y guardar una credencial perpetua la marcaba como vencida.
    // Verificado ejecutando el panel, no deducido.
    const culpables = campos
      .filter((f) => f.widget === 'boolean')
      .filter((f) => {
        const forma = (strictCertificate.shape as Record<string, { safeParse(v: unknown): { success: boolean } }>)[f.name];
        return forma?.safeParse(null).success;
      })
      .map((f) => f.name);
    expect(culpables).toEqual([]);
  });

  it('los campos que escribe el clasificador no son editables a mano', () => {
    // Son procedencia, no contenido: si el dueño los edita, dejan de describir
    // lo que la maquina produjo y `auto_snapshot` deja de servir para detectar
    // divergencia.
    const deLaMaquina = [
      'curation_flag',
      'manual_fields',
      'auto_snapshot',
      'classification_confidence',
      'classification_signals',
      'classification_rules_version',
      'needs_review',
      'extracted_fields',
    ];
    expect(deLaMaquina.filter((n) => campo(n).widget !== 'hidden')).toEqual([]);
  });
});

describe('curaduria en el panel', () => {
  it('las dos colecciones comparten el mismo juego de campos', () => {
    // Una ficha se mueve entre publicable y retenida cambiando de carpeta; si
    // los esquemas difirieran, mover una perderia datos.
    expect(coleccion('retained').fields).toEqual(campos);
  });

  it('la coleccion retenida apunta a la carpeta que git ignora', () => {
    expect(coleccion('retained').folder).toBe('private/certificates');
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\/private\/$/m);
  });

  it('ninguna coleccion permite borrar fichas', () => {
    // Retirar una ficha es cambiar `visibility`. El registro de lo retenido,
    // con su motivo, es justamente lo que no se quiere perder.
    for (const c of config.collections) {
      expect((c as { delete?: boolean }).delete).toBe(false);
    }
  });

  it('visibility arranca en review, nunca en public', () => {
    // Fail-closed: publicar es una decision explicita, no lo que ocurre por
    // omision al crear una ficha.
    expect((campo('visibility') as { default?: string }).default).toBe('review');
  });
});
