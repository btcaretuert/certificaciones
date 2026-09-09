/**
 * El auditor del repositorio y las reglas que sostiene.
 *
 * Existe porque el arbol versionado llevaba, sin que nada lo notara: el HTML
 * crudo de una plataforma con 43 trackingToken y dos titulos retenidos, 47 PDF de
 * certificado —41 de ellos sin ficha publica— y un inventario que nombraba los
 * archivos de las fichas ocultas. audit-dist miraba dist/ y daba verde, porque
 * dist/ estaba impecable.
 *
 * Estas pruebas fijan las reglas y, ademas, corren contra el repositorio real:
 * si alguien vuelve a versionar algo asi, fallan aqui y no en el primer push.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { clasificar, normalizar, sondasDe } from '../../scripts/lib/curaduria.mjs';

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);

const versionados = git('ls-files');

describe('sondas de curaduria', () => {
  it('el slug no da positivo dentro de otro mas largo', () => {
    const [sonda] = sondasDe([{ slug: 'gestion-del-tiempo', datos: {} }]);
    expect(sonda.re.test('gestion-del-tiempo-para-lideres')).toBe(false);
    expect(sonda.re.test('c/gestion-del-tiempo/')).toBe(true);
  });

  it('encuentra el titulo aunque le hayan quitado las tildes', () => {
    // data/origen_linkedin.json llevaba dos titulos retenidos que la sonda
    // literal no veia: comparaba con tildes contra un texto que no las tenia.
    const [, titulo] = sondasDe([
      { slug: 'x', datos: { title: 'Cómo cultivar un jardín difícil' } },
    ]);
    expect(titulo.re.test(normalizar('Como cultivar un jardin dificil'))).toBe(true);
    expect(titulo.re.test(normalizar('CÓMO CULTIVAR UN JARDÍN DIFÍCIL'))).toBe(true);
  });

  it('no arma sonda con titulos demasiado cortos', () => {
    // Un titulo de 4 letras daria positivo dentro de prosa normal y el auditor
    // gritaria en cada build hasta que alguien lo apagara.
    expect(sondasDe([{ slug: 'x', datos: { title: 'Java' } }])).toHaveLength(1);
  });
});

describe('el arbol versionado', () => {
  it('git versiona algo: si no, el auditor no mira nada', () => {
    expect(versionados.length).toBeGreaterThan(100);
  });

  it('.gitignore no basta: nada versionado puede estar ignorado', () => {
    // Agregar un patron a .gitignore NO desversiona lo que ya estaba en el
    // indice. Es exactamente como input/ siguio viajando en cada commit.
    expect(git('ls-files', '-c', '-i', '--exclude-standard')).toEqual([]);
  });

  it('ninguna ficha retenida esta versionada', () => {
    expect(versionados.filter((f) => f.startsWith('private/'))).toEqual([]);
  });

  it('ningun documento de certificado esta versionado', () => {
    // Los PDF entran por directorios ignorados y salen a dist/ ficha por ficha.
    // Uno en el arbol se salto esa decision.
    expect(versionados.filter((f) => /\.(pdf|xlsx|xls)$/i.test(f))).toEqual([]);
  });

  it('el criterio de curaduria no se versiona', () => {
    // curation.js dice POR QUE se oculto lo que se oculto, que es mas
    // revelador que la lista de ocultos. Es el mismo motivo por el que el
    // panel no se publica.
    expect(versionados).not.toContain('src/lib/classify/curation.js');
    expect(versionados).toContain('src/lib/classify/curation.plantilla.js');
    expect(readFileSync('src/lib/classify/curation.plantilla.js', 'utf8')).toContain(
      'CURATION_RULES = [',
    );
  });

  it('un clon sin curation.js sigue compilando, y sin criterio dentro', async () => {
    // La plantilla es lo que ensure-curation copia cuando el archivo falta.
    // Tiene que exportar la lista VACIA: si alguien copiara ahi las reglas
    // reales, versionarlas seria el descuido mas facil de cometer.
    expect(existsSync('scripts/ensure-curation.mjs')).toBe(true);
    const { CURATION_RULES } = await import('../../src/lib/classify/curation.plantilla.js');
    expect(CURATION_RULES).toEqual([]);
  });
});

describe('el auditor corriendo de verdad', () => {
  it('no encuentra ninguna fuga en el arbol', () => {
    // Si esto falla, el detalle sale por stderr del comando.
    const salida = execFileSync('node', ['scripts/audit-repo.mjs'], { encoding: 'utf8' });
    expect(salida).toContain('audit-repo: sin fugas');
  });

  it('sin private/ el auditor lo dice en vez de informar "sin fugas"', async () => {
    // En un clon —CI incluido— no hay lista de retenidos, asi que las sondas
    // por titulo no comprueban nada. La corrida sigue siendo util por las
    // reglas estructurales, pero su alcance tiene que quedar escrito.
    const { hayRetenidos } = await clasificar();
    const salida = execFileSync('node', ['scripts/audit-repo.mjs'], { encoding: 'utf8' });
    expect(salida).toContain(hayRetenidos ? 'sin fugas (arbol)' : 'solo reglas estructurales');
  });

  it('sin lista de retenidos declara el alcance reducido, no "sin fugas"', () => {
    // Es como corre en CI y en cualquier clon: private/ no se versiona. Un
    // auditor que en esa situacion dijera "sin fugas" estaria informando
    // sobre treinta sondas que no ejecuto.
    const salida = execFileSync('node', ['scripts/audit-repo.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, PRIVADAS_DIR: '/dev/null/no-existe' },
    });
    expect(salida).toContain('solo reglas estructurales');
    expect(salida).not.toMatch(/sin fugas \(arbol\)/);
  });

  it.skipIf(!existsSync('private/certificates'))(
    'donde hay private/, cubre las retenidas y el corpus publico entero',
    async () => {
      const { auditables, vivos } = await clasificar();
      // Retenido = private/ mas lo que en src/ no diga exactamente 'public'.
      expect(auditables.length).toBeGreaterThan(0);
      expect(vivos.size).toBeGreaterThan(200);
    },
  );
});
