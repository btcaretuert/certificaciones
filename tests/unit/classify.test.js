import { describe, it, expect } from 'vitest';
import { classify, curationFlag, normalize, RULES_VERSION } from '../../src/lib/classify/index.js';
import { DOMAIN_RULES, TECH_RULES } from '../../src/lib/classify/rules.js';
import { AREAS, TYPES, AREA_OF_DOMAIN, TYPE_OF_DOMAIN, DOMAINS } from '../../src/lib/classify/vocabulary.js';

/** Permutacion determinista con semilla.
 *  `sort(() => Math.random() - 0.5)` devuelve la identidad con frecuencia en
 *  arrays chicos: el test pasaria sin haber barajado nada. */
function shuffled(arr, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SAMPLE = [
  'Big Data y Spark: ingeniería de datos con Python y PySpark',
  'Google Kubernetes Engine - de cero a experto',
  'Fundamentos de Six Sigma',
  'Cómo dar y recibir feedback o retroalimentación',
  'Python esencial',
  'DevOps esencial',
  'Aprende MongoDB: Bases de datos NoSQL',
  'Transición de jefe a líder',
  'Inglés de negocios: Dominar las reuniones en línea',
  'Taller Starting Data Governance (DAMA - CMDP)',
  'Outlook en la web esencial (Office 365/Microsoft 365)',
  // Titulo inventado: cubre 'gestion-personas' con la misma clasificacion
  // exacta que el real, sin nombrar una ficha retenida en un repo publico.
  'Cómo construir un buen clima laboral',
];

describe('vocabulario', () => {
  it('cada dominio tiene area y tipo declarados', () => {
    for (const d of DOMAINS) {
      expect(AREA_OF_DOMAIN[d], `${d} sin area`).toBeDefined();
      expect(TYPE_OF_DOMAIN[d], `${d} sin tipo`).toBeDefined();
      expect(AREAS).toContain(AREA_OF_DOMAIN[d]);
      expect(TYPES).toContain(TYPE_OF_DOMAIN[d]);
    }
  });

  it('TYPE_OF_DOMAIN es explicito, no derivado del area', () => {
    // Si el tipo se derivara del area, todos los dominios de un area
    // compartirian tipo. 'ofimatica-colaboracion' y 'programacion' viven en la
    // misma area y deben diferir: es la prueba de que el mapa es explicito.
    expect(AREA_OF_DOMAIN['programacion']).toBe(AREA_OF_DOMAIN['ofimatica-colaboracion']);
    expect(TYPE_OF_DOMAIN['programacion']).not.toBe(TYPE_OF_DOMAIN['ofimatica-colaboracion']);
  });
});

describe('clasificador', () => {
  it('los tres tipos son alcanzables', () => {
    const got = new Set(SAMPLE.map((t) => classify({ title: t }).type));
    for (const t of TYPES) expect(got, `tipo inalcanzable: ${t}`).toContain(t);
  });

  it('nunca devuelve valores fuera del vocabulario', () => {
    for (const title of SAMPLE) {
      const r = classify({ title });
      expect(AREAS).toContain(r.area);
      expect(TYPES).toContain(r.type);
      expect(DOMAINS).toContain(r.domain);
    }
  });

  it('el orden del array de reglas es semanticamente inerte', () => {
    const base = SAMPLE.map((t) => classify({ title: t }).domain);
    const original = [...DOMAIN_RULES];
    try {
      for (let seed = 1; seed <= 5; seed++) {
        DOMAIN_RULES.length = 0;
        DOMAIN_RULES.push(...shuffled(original, seed));
        // classify reordena por priority en cada llamada, no en el import
        const got = SAMPLE.map((t) => classify({ title: t }).domain);
        expect(got, `permutacion con semilla ${seed} cambio la salida`).toEqual(base);
      }
    } finally {
      DOMAIN_RULES.length = 0;
      DOMAIN_RULES.push(...original);
    }
  });

  it('el titulo manda sobre las aptitudes', () => {
    // Caso real del corpus: #195 recibia las aptitudes de "DevOps esencial"
    // por el join roto de la hoja Aptitudes, y terminaba en ingenieria de datos.
    const r = classify({
      title: 'Mejora tus habilidades para resolver problemas',
      skills: ['CI/CD', 'pipelines', 'DevOps'],
    });
    expect(r.type).not.toBe('tecnico');
  });

  it('las aptitudes se usan solo si el titulo no resuelve', () => {
    const r = classify({ title: 'Curso avanzado', skills: ['Kubernetes', 'Docker'] });
    expect(r.domain).toBe('cloud-plataforma');
    expect(r.confidence).toBe('low'); // resolver por aptitudes nunca da alta confianza
  });

  it('docker y kubernetes son tecnologias distintas', () => {
    expect(classify({ title: 'Docker esencial' }).tech).toEqual(['docker']);
    expect(classify({ title: 'Kubernetes para desarrolladores esencial' }).tech).toEqual(['kubernetes']);
  });

  it('sin dominio devuelve sin-clasificar, nunca un relleno modal', () => {
    const r = classify({ title: 'zzz qqq xyz' });
    expect(r.domain).toBe('sin-clasificar');
    expect(r.area).toBe('sin-clasificar');
    expect(r.needs_review).toBe(true);
    expect(r.confidence).toBe('low');
  });

  it('normalize quita tildes y puntuacion', () => {
    expect(normalize('Transformación Digital: Ágil')).toBe('transformacion digital agil');
  });
});

describe('RULES_VERSION', () => {
  it('es estable entre llamadas', () => {
    expect(RULES_VERSION).toBe(RULES_VERSION);
    expect(RULES_VERSION).toMatch(/^r-[0-9a-f]{8}$/);
  });

  it('cambia si y solo si cambia la tabla de reglas', async () => {
    const before = RULES_VERSION;
    TECH_RULES.push({ tech: 'zzz-prueba', re: /zzz-prueba/ });
    try {
      const mod = await import('../../src/lib/classify/index.js?bump=1');
      expect(mod.RULES_VERSION).not.toBe(before);
    } finally {
      TECH_RULES.pop();
    }
  });
});

describe('sugerencia de curaduria', () => {
  // Las reglas reales viven en curation.js, que git ignora: son el criterio de
  // exclusion y decirlo en un repo publico revela mas que la lista de excluidos.
  // Estas pruebas no las necesitan —lo que se prueba es el mecanismo—, y usar
  // los titulos reales aqui equivaldria a versionar la lista de retenidos.
  const REGLAS = [
    { reason: 'motivo-uno', re: /tema reservado/ },
    { reason: 'motivo-dos', re: /otro tema/ },
  ];

  it('marca el titulo que cae en una regla y no el que no', () => {
    expect(curationFlag('Curso sobre tema reservado', REGLAS).flag).toBe(true);
    expect(curationFlag('Otro tema, en profundidad', REGLAS).flag).toBe(true);
    expect(curationFlag('Fundamentos de Six Sigma', REGLAS).flag).toBe(false);
  });

  it('normaliza antes de comparar: tildes y mayusculas no salvan a un titulo', () => {
    // El titulo llega del PDF o del panel; si la comparacion fuera literal, un
    // acento de mas dejaria pasar sin marcar justo lo que la regla describe.
    expect(curationFlag('TEMA RESERVADO', REGLAS).flag).toBe(true);
    expect(curationFlag('Tema Reservádo', REGLAS).flag).toBe(true);
  });

  it('sin reglas no marca nada, que no es lo mismo que no haber que revisar', () => {
    // Es el estado de un clon limpio: prebuild copia la plantilla vacia.
    expect(curationFlag('Curso sobre tema reservado', []).flag).toBe(false);
  });

  it('devuelve el motivo aparte del booleano: el motivo NO se persiste', () => {
    const r = curationFlag('Curso sobre tema reservado', REGLAS);
    expect(r).toEqual({ flag: true, reason: 'motivo-uno' });
    // En un repo publico, un campo con el motivo de cada exclusion es un
    // perfil mas especifico que la propia lista de cursos.
    expect(classify({ title: 'Curso sobre tema reservado' })).not.toHaveProperty('curation_reason');
  });
});
