/**
 * Cuentas del tablero. Mismas fórmulas que la Bitácora anterior (y que el
 * Excel de escritorio) para que los números no cambien al mudarse.
 */
(function () {
'use strict';

const CERRADO = 'Cerrado';
const EN_JUEGO = [
  'Interés bajo (recontactar)', 'Demo hecha', 'Propuesta enviada', 'En negociación', 'Reagendar visita',
];

const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const razon = (a, b) => (b ? a / b : 0);
const sumar = (xs, f) => xs.reduce((s, x) => s + f(x), 0);

/* ------------------------------------------------------------------
   Leads compartidos. El dueño (vendedor) puede compartir una visita con
   otro vendedor: el cierre y el MRR se reparten mitad y mitad. Las puertas,
   demos y propuestas son de quien hizo la visita.

   Las visitas recién capturadas aún no traen vendedor: son de `cuenta`.
   ------------------------------------------------------------------ */

const duenoDe = (v, cuenta) => v.vendedor || cuenta;

/** Si la visita le toca a la cuenta: es suya o se la compartieron. */
function participa(v, cuenta) {
  return duenoDe(v, cuenta) === cuenta || (Boolean(v.compartido_con) && v.compartido_con === cuenta);
}

/** Qué parte del cierre le toca: 1, 0.5 o 0. Sin cuenta (todo el equipo), 1. */
function parte(v, cuenta) {
  if (!cuenta) return 1;
  if (!participa(v, cuenta)) return 0;
  return v.compartido_con ? 0.5 : 1;
}

function numeros(visitas, campo) {
  return visitas
    .map((v) => v[campo])
    .filter((x) => x !== '' && x !== null && x !== undefined)
    .map((x) => parseFloat(x))
    .filter((x) => !Number.isNaN(x));
}

/**
 * Agrupa por un campo: puertas, demos, cerrados, MRR, tasa de cierre y qué
 * parte del total representa cada grupo. Ordenado de mayor a menor.
 *
 * Con `cuenta`, las puertas y demos son sólo las suyas y el cierre cuenta la
 * parte que le toca (también de las que le compartieron).
 */
function agrupar(visitas, campo, cuenta) {
  const grupos = new Map();
  for (const v of visitas) {
    const clave = String(v[campo] || '').trim();
    if (!clave) continue;
    const propia = !cuenta || duenoDe(v, cuenta) === cuenta;
    const credito = parte(v, cuenta);
    if (!propia && !(credito && v.resultado === CERRADO)) continue;
    const g = grupos.get(clave) || { clave, n: 0, demos: 0, cerrados: 0, mrr: 0 };
    if (propia) {
      g.n += 1;
      if (v.demo === 'Sí') g.demos += 1;
    }
    if (v.resultado === CERRADO) {
      g.cerrados += credito;
      g.mrr += credito * (parseFloat(v.mrr) || 0);
    }
    grupos.set(clave, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.n - a.n || b.cerrados - a.cerrados);
  const total = lista.reduce((s, g) => s + g.n, 0);
  return lista.map((g) => ({ ...g, tasa: razon(g.cerrados, g.n), parte: razon(g.n, total) }));
}

/**
 * Embudo, indicadores y desgloses. No cuenta las eliminadas.
 *
 * Sin `cuenta` es el de todo el equipo: cada visita cuenta una vez. Con
 * `cuenta` es el de un vendedor: sus puertas, y del cierre y el MRR la parte
 * que le toca de las suyas y de las que le compartieron.
 */
function resumen(todas, { cuenta } = {}) {
  const vivas = todas.filter((v) => !v.eliminada && (!cuenta || participa(v, cuenta)));
  const visitas = cuenta ? vivas.filter((v) => duenoDe(v, cuenta) === cuenta) : vivas;
  const cuantas = (f) => visitas.filter(f).length;
  const cerradas = vivas.filter((v) => v.resultado === CERRADO);

  const puertas = visitas.length;
  const decisor = cuantas((v) => v.decisor === 'Sí');
  const demos = cuantas((v) => v.demo === 'Sí');
  const propuestas = cuantas((v) => v.propuesta === 'Sí');
  const cerrados = sumar(cerradas, (v) => parte(v, cuenta));
  const mrr = sumar(cerradas, (v) => parte(v, cuenta) * (parseFloat(v.mrr) || 0));
  const compartidos = cerradas.filter((v) => v.compartido_con).length;
  const dias = new Set(visitas.map((v) => v.fecha).filter(Boolean)).size;

  return {
    puertas, decisor, demos, propuestas, cerrados, mrr, dias, compartidos,
    conv: {
      decisor: razon(decisor, puertas),
      demo: razon(demos, decisor),
      propuesta: razon(propuestas, demos),
      cierre: razon(cerrados, propuestas),
      total: razon(cerrados, puertas),
    },
    puertasPorCliente: cerrados ? puertas / cerrados : 0,
    mrrPorCliente: cerrados ? mrr / cerrados : 0,
    puertasPorDia: dias ? puertas / dias : 0,
    interes: promedio(numeros(visitas, 'interes')),
    minutos: promedio(numeros(visitas, 'minutos')),
    mensajes: promedio(numeros(visitas, 'mensajes')),
    ticket: promedio(numeros(visitas, 'ticket')),
    sucursales: promedio(numeros(visitas, 'sucursales')),
    enJuego: cuantas((v) => EN_JUEGO.includes(v.resultado)),
    porVendedor: agrupar(visitas, 'visitador'),
    porCuenta: cuenta ? [] : porCuenta(vivas),
    porGiro: agrupar(vivas, 'giro', cuenta),
    porMunicipio: agrupar(vivas, 'municipio', cuenta),
    porFranja: agrupar(vivas, 'franja', cuenta),
    porObjecion: agrupar(visitas, 'objecion'),
    porSistema: agrupar(visitas, 'sistema'),
    porResultado: agrupar(visitas, 'resultado'),
    porPerdida: agrupar(visitas, 'motivo_perdida'),
  };
}

/**
 * Todo el equipo, una fila por vendedor (por id): puertas y demos de quien
 * visitó; cierre y MRR repartidos con quien se compartió.
 */
function porCuenta(visitas) {
  const filas = new Map();
  const fila = (id) => {
    if (!filas.has(id)) filas.set(id, { clave: id, n: 0, demos: 0, cerrados: 0, mrr: 0 });
    return filas.get(id);
  };
  for (const v of visitas) {
    if (!v.vendedor) continue;
    const f = fila(v.vendedor);
    f.n += 1;
    if (v.demo === 'Sí') f.demos += 1;
    if (v.resultado !== CERRADO) continue;
    const mrr = parseFloat(v.mrr) || 0;
    const cuentas = v.compartido_con ? [v.vendedor, v.compartido_con] : [v.vendedor];
    for (const id of cuentas) {
      const g = fila(id);
      g.cerrados += 1 / cuentas.length;
      g.mrr += mrr / cuentas.length;
    }
  }
  return [...filas.values()]
    .map((g) => ({ ...g, tasa: razon(g.cerrados, g.n) }))
    .sort((a, b) => b.mrr - a.mrr || b.n - a.n);
}

/** Las que tienen algo pendiente: en juego y no archivadas, por fecha de seguimiento. */
function porSeguir(todas) {
  return todas
    .filter((v) => !v.eliminada && !v.archivada && EN_JUEGO.includes(v.resultado))
    .sort((a, b) => String(a.f_seguimiento || '9999').localeCompare(String(b.f_seguimiento || '9999')));
}

/* Fechas como texto YYYY-MM-DD (así vienen en las visitas), en hora local. */
function aFecha(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function aTexto(fecha) {
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${m}-${d}`;
}

/** El día que fue hace n días (n = 0 es hoy). */
function haceDias(hoy, n) {
  const f = aFecha(hoy);
  f.setDate(f.getDate() - n);
  return aTexto(f);
}

/** Las de los últimos `dias` días contando hoy. Sin `dias`, todas. */
function enPeriodo(todas, dias, hoy) {
  if (!dias) return todas;
  const desde = haceDias(hoy, dias - 1);
  return todas.filter((v) => v.fecha && v.fecha >= desde && v.fecha <= hoy);
}

/** Una fila por día de los últimos `dias` (el más viejo primero), con ceros. */
function porDia(todas, dias, hoy) {
  const filas = new Map();
  for (let n = dias - 1; n >= 0; n--) {
    const fecha = haceDias(hoy, n);
    filas.set(fecha, { fecha, n: 0, cerrados: 0 });
  }
  for (const v of todas) {
    const f = !v.eliminada && filas.get(v.fecha);
    if (!f) continue;
    f.n += 1;
    if (v.resultado === CERRADO) f.cerrados += 1;
  }
  return [...filas.values()];
}

const api = { resumen, agrupar, porCuenta, porSeguir, enPeriodo, porDia, haceDias, participa, parte };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.BitacoraCalculos = api;
}
})();
