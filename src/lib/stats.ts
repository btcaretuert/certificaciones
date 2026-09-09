import type { PublishedCert } from './data';

/** Todos los agregados son funciones puras sobre el corpus PUBLICADO. */

export function countBy<K extends string>(certs: PublishedCert[], key: (c: PublishedCert) => K) {
  const m = new Map<K, number>();
  for (const c of certs) m.set(key(c), (m.get(key(c)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/**
 * Horas acumuladas, sin contar dos veces.
 *
 * Los itinerarios de LinkedIn AGRUPAN cursos que ya estan en esta misma
 * coleccion: sumar ambos da 892 h donde el contenido real son 610. Es la cifra
 * mas facil de inflar de todo el portafolio y la mas facil de desmontar, asi
 * que se excluyen y se informa cuantos son.
 *
 * Devuelve tambien la cobertura: una suma parcial presentada como total es una
 * mentira por omision.
 */
export function hoursFloor(certs: PublishedCert[]) {
  const cursos = certs.filter((c) => c.kind !== 'itinerario');
  const withHours = cursos.filter((c) => c.hours !== null);
  return {
    hours: Math.round(withHours.reduce((s, c) => s + (c.hours ?? 0), 0)),
    covered: withHours.length,
    total: cursos.length,
    itineraries: certs.length - cursos.length,
  };
}

export function techCoverage(certs: PublishedCert[]) {
  const m = new Map<string, { n: number; weight: number }>();
  for (const c of certs)
    for (const t of c.tech) {
      const cur = m.get(t) ?? { n: 0, weight: 0 };
      m.set(t, { n: cur.n + 1, weight: cur.weight + c.weight });
    }
  return [...m.entries()]
    .map(([tech, v]) => ({ tech, ...v }))
    .sort((a, b) => b.weight - a.weight || b.n - a.n || (a.tech < b.tech ? -1 : 1));
}

/** Una fila del eje temporal. `hours` excluye itinerarios, igual que el total
 *  del sitio: un itinerario agrupa cursos que ya estan contados en su año. */
export type YearRow = {
  year: number;
  n: number;
  hours: number;
  /** Credenciales de organismo externo emitidas ese año. */
  official: number;
};

/**
 * Actividad por año, con los años vacios incluidos.
 *
 * Devolver solo los años con certificados convierte el grafico en una mentira
 * de eje: entre 2014 y 2018 no hubo formacion registrada, y omitir los tres
 * años intermedios los dibujaba pegados, como si 2014 y 2018 fueran
 * consecutivos. En un grafico de actividad el hueco ES el dato.
 *
 * El relleno se limita al rango observado —del primer año al ultimo— y no toca
 * ningun conteo: la suma de `n` sigue siendo certs.length menos `undated`.
 *
 * Devuelve las HORAS ademas del conteo porque el conteo solo no es comparable
 * entre años: 2019 son 151 cursos de 1,4 h de media y 2026 son 5 de 11,4 h.
 * Contarlos como unidades equivalentes fabrica un pico que no existe en el
 * contenido. Quien dibuja decide la medida; aqui se devuelven las dos.
 */
export function timeline(certs: PublishedCert[]) {
  const years = new Map<number, YearRow>();
  let undated = 0;
  const fila = (y: number) => {
    const r = years.get(y) ?? { year: y, n: 0, hours: 0, official: 0 };
    years.set(y, r);
    return r;
  };
  for (const c of certs) {
    if (!c.issued) { undated++; continue; }
    const r = fila(Number(c.issued.slice(0, 4)));
    r.n++;
    if (c.kind !== 'itinerario') r.hours += c.hours ?? 0;
    if (c.official) r.official++;
  }
  if (years.size === 0) return { years: [] as YearRow[], undated };
  const desde = Math.min(...years.keys());
  const hasta = Math.max(...years.keys());
  const sorted: YearRow[] = [];
  for (let y = desde; y <= hasta; y++) {
    const r = fila(y);
    sorted.push({ ...r, hours: Math.round(r.hours) });
  }
  return { years: sorted, undated };
}

export function evidence(certs: PublishedCert[]) {
  return {
    withVerifyUrl: certs.filter((c) => c.verify_url).length,
    withPdf: certs.filter((c) => c.pdf).length,
    official: certs.filter((c) => c.official).length,
    total: certs.length,
  };
}
