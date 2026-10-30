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
 */
function agrupar(visitas, campo) {
  const grupos = new Map();
  for (const v of visitas) {
    const clave = String(v[campo] || '').trim();
    if (!clave) continue;
    const g = grupos.get(clave) || { clave, n: 0, demos: 0, cerrados: 0, mrr: 0 };
    g.n += 1;
    if (v.demo === 'Sí') g.demos += 1;
    if (v.resultado === CERRADO) {
      g.cerrados += 1;
      g.mrr += parseFloat(v.mrr) || 0;
    }
    grupos.set(clave, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.n - a.n);
  const total = lista.reduce((s, g) => s + g.n, 0);
  return lista.map((g) => ({ ...g, tasa: razon(g.cerrados, g.n), parte: razon(g.n, total) }));
}

/** Embudo, indicadores y desgloses. No cuenta las eliminadas. */
function resumen(todas) {
  const visitas = todas.filter((v) => !v.eliminada);
  const cuantas = (f) => visitas.filter(f).length;

  const puertas = visitas.length;
  const decisor = cuantas((v) => v.decisor === 'Sí');
  const demos = cuantas((v) => v.demo === 'Sí');
  const propuestas = cuantas((v) => v.propuesta === 'Sí');
  const cerrados = cuantas((v) => v.resultado === CERRADO);
  const mrr = visitas
    .filter((v) => v.resultado === CERRADO)
    .reduce((s, v) => s + (parseFloat(v.mrr) || 0), 0);
  const dias = new Set(visitas.map((v) => v.fecha).filter(Boolean)).size;

  return {
    puertas, decisor, demos, propuestas, cerrados, mrr, dias,
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
    porGiro: agrupar(visitas, 'giro'),
    porMunicipio: agrupar(visitas, 'municipio'),
    porFranja: agrupar(visitas, 'franja'),
    porObjecion: agrupar(visitas, 'objecion'),
    porSistema: agrupar(visitas, 'sistema'),
    porResultado: agrupar(visitas, 'resultado'),
    porPerdida: agrupar(visitas, 'motivo_perdida'),
  };
}

/** Las que tienen algo pendiente: en juego y no archivadas, por fecha de seguimiento. */
function porSeguir(todas) {
  return todas
    .filter((v) => !v.eliminada && !v.archivada && EN_JUEGO.includes(v.resultado))
    .sort((a, b) => String(a.f_seguimiento || '9999').localeCompare(String(b.f_seguimiento || '9999')));
}

const api = { resumen, agrupar, porSeguir };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.BitacoraCalculos = api;
}
})();
