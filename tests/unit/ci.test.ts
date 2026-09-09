/**
 * El flujo de CI, comprobado como codigo.
 *
 * Un workflow no tiene pruebas propias: se descubre que estaba mal cuando ya
 * dejo pasar algo. Lo que se fija aqui es lo que lo vuelve util o inutil:
 *
 *  - Que las acciones esten clavadas por SHA. Un tag de GitHub lo mueve su
 *    dueno cuando quiere, y estas corren con acceso al arbol del repositorio.
 *  - Que gitleaks reciba el historial completo. Con el checkout superficial
 *    solo veria el ultimo commit y daria verde sobre un secreto de hace tres.
 *  - Que cada `npm run` del workflow exista de verdad. Renombrar un script y
 *    olvidar el workflow apaga un paso entero sin que nada se ponga en rojo.
 *  - Que los permisos del GITHUB_TOKEN sean de solo lectura.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

type Paso = { uses?: string; run?: string; with?: Record<string, unknown>; name?: string };
type Trabajo = { steps: Paso[]; 'runs-on': string };

const texto = readFileSync('.github/workflows/ci.yml', 'utf8');
const ci = parse(texto) as {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  env: Record<string, string>;
  jobs: Record<string, Trabajo>;
};
const pasos = Object.values(ci.jobs).flatMap((j) => j.steps);
const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> })
  .scripts;

describe('superficie del workflow', () => {
  it('no se dispara con pull_request_target', () => {
    // pull_request_target corre el workflow del repo base con los secretos del
    // repo base sobre codigo de un fork. Es el disparador con el que se roban
    // los tokens de Actions.
    expect(Object.keys(ci.on)).not.toContain('pull_request_target');
  });

  it('el token es de solo lectura', () => {
    expect(ci.permissions).toEqual({ contents: 'read' });
    for (const trabajo of Object.values(ci.jobs)) {
      expect((trabajo as unknown as { permissions?: unknown }).permissions).toBeUndefined();
    }
  });

  it('CI=true, para que los scripts propios no impriman lo retenido', () => {
    // Los logs de Actions de un repositorio publico los lee cualquiera, y en
    // el informe de una fuga el detalle ES la fuga.
    expect(ci.env.CI).toBe('true');
  });

  it('no hay ni un secreto referenciado', () => {
    // El proyecto no tiene ninguno: el panel trabaja en modo local, sin token.
    expect(texto).not.toMatch(/\$\{\{\s*secrets\./);
  });
});

describe('cadena de suministro', () => {
  it('cada accion va clavada por SHA y con el tag en un comentario', () => {
    const usos = texto.match(/uses:\s*\S+/g) ?? [];
    expect(usos.length).toBeGreaterThan(0);
    for (const paso of pasos.filter((p) => p.uses)) {
      expect(paso.uses, `${paso.uses} no esta clavada por SHA`).toMatch(/@[0-9a-f]{40}$/);
    }
    // El comentario con la version es lo unico que hace legible un SHA.
    for (const linea of texto.split('\n').filter((l) => l.includes('uses:'))) {
      expect(linea, `sin version anotada: ${linea.trim()}`).toMatch(/#\s*v\d/);
    }
  });

  it('instala con npm ci y no con npm install', () => {
    const instala = pasos.filter((p) => p.run?.includes('npm ') && /\bnpm (ci|install)\b/.test(p.run));
    expect(instala.length).toBeGreaterThan(0);
    for (const p of instala) expect(p.run).not.toMatch(/npm install/);
  });

  it('los escaneres van fijados por version y por SHA256', () => {
    const conf = JSON.parse(readFileSync('scripts/security-tools.json', 'utf8')) as {
      herramientas: { nombre: string; version: string; url: string; sha256: string }[];
    };
    expect(conf.herramientas.map((h) => h.nombre).sort()).toEqual(['gitleaks', 'osv-scanner']);
    for (const h of conf.herramientas) {
      expect(h.sha256, `${h.nombre}: sha256 mal formado`).toMatch(/^[0-9a-f]{64}$/);
      // Si la URL no lleva la version, las dos pueden divergir en silencio.
      expect(h.url, `${h.nombre}: la URL no nombra la version fijada`).toContain(h.version);
    }
  });
});

describe('lo que cada trabajo tiene que hacer', () => {
  it('todo npm run del workflow existe en package.json', () => {
    const invocados = [...texto.matchAll(/npm run ([a-z:]+)/g)].map((m) => m[1]);
    expect(invocados.length).toBeGreaterThan(3);
    for (const s of invocados) expect(scripts, `falta el script ${s}`).toHaveProperty(s);
  });

  it('el trabajo de seguridad clona el historial completo', () => {
    const checkout = ci.jobs.seguridad.steps.find((p) => p.uses?.includes('actions/checkout'));
    expect(checkout?.with?.['fetch-depth']).toBe(0);
  });

  it('el trabajo de seguridad corre los cuatro escaneres', () => {
    const corridos = ci.jobs.seguridad.steps.map((p) => p.run ?? '').join('\n');
    expect(corridos).toContain('npm run tools:security');
    expect(corridos).toContain('npm run check:security');
  });

  it('el build de CI declara que no tiene los activos', () => {
    // certs-src/ esta en .gitignore. Sin esto, emit-assets falla con 252
    // problemas y el fallo real —que CI no puede publicar— queda tapado.
    expect(ci.env.SIN_ACTIVOS).toBe('1');
  });

  it('las pruebas de navegador corren en CI', () => {
    const corridos = ci.jobs.navegador.steps.map((p) => p.run ?? '').join('\n');
    expect(corridos).toContain('playwright test');
  });
});

describe('dependabot', () => {
  const bot = parse(readFileSync('.github/dependabot.yml', 'utf8')) as {
    updates: { 'package-ecosystem': string }[];
  };

  it('vigila las dependencias y tambien las acciones', () => {
    // Clavar las acciones por SHA sin nadie que las actualice deja el
    // repositorio con una version vieja para siempre.
    const eco = bot.updates.map((u) => u['package-ecosystem']).sort();
    expect(eco).toEqual(['github-actions', 'npm']);
  });
});

describe('README', () => {
  it('todo comando que documenta existe', () => {
    // Un README que manda correr un script inexistente es peor que no tenerlo:
    // en un repo publico es lo primero que alguien copia y pega.
    const readme = readFileSync('README.md', 'utf8');
    const invocados = [...readme.matchAll(/`npm run ([a-z:]+)`/g)].map((m) => m[1]);
    expect(invocados.length).toBeGreaterThan(5);
    for (const s of invocados) expect(scripts, `README nombra ${s}, que no existe`).toHaveProperty(s);
  });
});

describe('version de Node', () => {
  it('.nvmrc cumple el rango declarado en engines', () => {
    const nvmrc = readFileSync('.nvmrc', 'utf8').trim();
    const engines = (JSON.parse(readFileSync('package.json', 'utf8')) as { engines: { node: string } })
      .engines.node;
    const [may, men, par] = nvmrc.split('.').map(Number);
    const [rmay, rmen, rpar] = engines.replace(/[^\d.]/g, '').split('.').map(Number);
    expect(may).toBeGreaterThanOrEqual(rmay);
    if (may === rmay) expect(men * 1000 + par).toBeGreaterThanOrEqual(rmen * 1000 + rpar);
  });
});
