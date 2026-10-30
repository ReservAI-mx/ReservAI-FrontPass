/**
 * Catálogos y columnas de la Bitácora. Son los mismos de la app anterior
 * (bitacora.reservai.com.mx) para que el histórico siga cuadrando: si cambias
 * una opción, las visitas viejas conservan el texto anterior.
 *
 * Las claves son las columnas de bitacora.visitas (snake_case), igual que
 * las manda y recibe /api/bitacora.
 */

(function () {
'use strict';

const OPCIONES = {
  giro: [
    'Barbería', 'Salón / Estética', 'Spa', 'Clínica dental', 'Consultorio médico',
    'Consultorio (otro)', 'Restaurante', 'Veterinaria', 'Gimnasio / Estudio', 'Otro',
  ],
  municipio: ['Guadalajara', 'Zapopan', 'Tlaquepaque', 'Tonalá', 'Tlajomulco', 'El Salto', 'Otro'],
  franja: ['10:00-13:00', '13:00-16:00', '16:00-19:00'],
  quien_contesta: [
    'Dueño', 'Recepcionista', 'Se turnan empleados', 'Nadie / a destiempo', 'Servicio externo', 'No sabe',
  ],
  sistema: [
    'Ninguno / papel', 'Agenda en el celular', 'Excel / Google Sheets', 'WhatsApp Business (manual)',
    'AgendaPro', 'Booksy', 'Fresha', 'Otro software', 'No sabe',
  ],
  si_no_nose: ['Sí', 'No', 'No sabe'],
  si_no: ['Sí', 'No'],
  plan_sugerido: ['Básico', 'Pro', 'No califica', 'Por definir'],
  decisor: ['Sí', 'No (sólo empleado)', 'Negocio cerrado', 'No quiso atender'],
  objecion: [
    'Precio', 'Desconfía de la IA', 'Yo mismo contesto', 'Ya tiene sistema', 'No tiene tiempo ahora',
    'Debe consultarlo con socio', 'No usa WhatsApp para citas', 'Poco volumen de mensajes',
    'Sin objeción', 'Otra',
  ],
  resultado: [
    'No interesado', 'Interés bajo (recontactar)', 'Demo hecha', 'Propuesta enviada',
    'En negociación', 'Cerrado', 'Perdido', 'Reagendar visita',
  ],
  canal: ['WhatsApp', 'Llamada', 'Visita presencial', 'Correo'],
  motivo_perdida: [
    'Precio', 'Eligió competidor', 'Nunca respondió', 'Cerró el negocio', 'No era el decisor',
    'Sin necesidad real', 'Otro',
  ],
  plan_contratado: ['Básico', 'Pro', 'Básico + Llamadas', 'Pro + Llamadas'],
  interes: ['1', '2', '3', '4', '5'],
  minutos: ['1', '3', '5', '10', '15', '20'],
};

/* Las 38 columnas del Excel, en el orden de siempre. */
const COLUMNAS = [
  ['fecha', 'Fecha de visita'],
  ['franja', 'Franja horaria'],
  ['visitador', 'Visitador'],
  ['negocio', 'Nombre del negocio'],
  ['giro', 'Giro'],
  ['municipio', 'Municipio'],
  ['colonia', 'Colonia / Corredor'],
  ['direccion', 'Dirección'],
  ['telefono', 'Teléfono / WhatsApp'],
  ['instagram', 'Instagram / Sitio web'],
  ['sucursales', 'Sucursales'],
  ['estaciones', 'Estaciones / Especialistas'],
  ['mensajes', 'Mensajes WhatsApp al día (est.)'],
  ['quien_contesta', '¿Quién contesta hoy?'],
  ['sistema', 'Sistema que usa hoy'],
  ['google_calendar', '¿Usa Google Calendar?'],
  ['ticket', 'Ticket promedio (MXN)'],
  ['reconoce', '¿Reconoce citas perdidas?'],
  ['plan_sugerido', 'Plan sugerido'],
  ['decisor', '¿Decisor presente?'],
  ['contacto', 'Nombre del contacto'],
  ['puesto', 'Puesto del contacto'],
  ['demo', '¿Aceptó ver la demo?'],
  ['minutos', 'Minutos de conversación'],
  ['interes', 'Interés (1-5)'],
  ['objecion', 'Objeción principal'],
  ['propuesta', '¿Pidió propuesta?'],
  ['resultado', 'Resultado de la visita'],
  ['f_seguimiento', 'Fecha próximo seguimiento'],
  ['canal', 'Canal de seguimiento'],
  ['n_seguimientos', 'Núm. de seguimientos'],
  ['f_propuesta', 'Fecha propuesta enviada'],
  ['f_cierre', 'Fecha de cierre'],
  ['plan_contratado', 'Plan contratado'],
  ['mrr', 'MRR (MXN)'],
  ['f_implementacion', 'Fecha de implementación'],
  ['motivo_perdida', 'Motivo de pérdida'],
  ['notas', 'Notas'],
];

const NUMERICOS = new Set([
  'sucursales', 'estaciones', 'mensajes', 'ticket', 'minutos', 'interes', 'n_seguimientos', 'mrr',
]);

/* Lo que manda el teléfono. vendedor, visitador y fechas de servidor los
   pone /api/bitacora. */
const EDITABLES = COLUMNAS.map(([c]) => c).filter((c) => c !== 'visitador')
  .concat(['archivada', 'f_exportado', 'eliminada']);

const CERRADO = 'Cerrado';
/* Se archivan al exportar: ya no hay nada que seguir. */
const TERMINALES = new Set(['Cerrado', 'Perdido', 'No interesado']);
/* Aparecen en "Por seguir". */
const EN_JUEGO = [
  'Interés bajo (recontactar)', 'Demo hecha', 'Propuesta enviada', 'En negociación', 'Reagendar visita',
];

/* Metas del embudo: supuestos de venta B2B en frío, no datos de ReservAI. */
const METAS = { decisor: 0.35, demo: 0.45, propuesta: 0.3, cierre: 0.25 };

function hoy(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fechaCorta(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function franjaActual(fecha = new Date()) {
  const h = fecha.getHours();
  if (h < 13) return '10:00-13:00';
  if (h < 16) return '13:00-16:00';
  return '16:00-19:00';
}

function nuevoId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
}

/**
 * Visita en blanco. Municipio y colonia se quedan de la anterior: se suele
 * recorrer la misma zona toda la tarde.
 */
function nuevaVisita({ visitador = '', ultimoMunicipio = '', ultimaColonia = '' } = {}, ahora = new Date()) {
  const v = { id: nuevoId() };
  for (const [c] of COLUMNAS) v[c] = '';
  v.fecha = hoy(ahora);
  v.franja = franjaActual(ahora);
  v.visitador = visitador;
  v.municipio = ultimoMunicipio;
  v.colonia = ultimaColonia;
  v.archivada = false;
  v.eliminada = false;
  v.f_exportado = '';
  // Sólo para ordenar en el teléfono; el servidor pone el suyo.
  v.creado_en = ahora.toISOString();
  return v;
}

/**
 * Lo que se sube: sólo columnas editables, '' → null y números como número.
 */
function paraSubir(v) {
  const out = { id: v.id };
  for (const c of EDITABLES) {
    let valor = v[c];
    if (c === 'archivada' || c === 'eliminada') {
      out[c] = Boolean(valor);
      continue;
    }
    if (valor === '' || valor === undefined || valor === null) {
      out[c] = null;
      continue;
    }
    if (NUMERICOS.has(c)) {
      const n = Number(valor);
      out[c] = Number.isFinite(n) ? n : null;
      continue;
    }
    out[c] = typeof valor === 'string' ? valor.trim() : valor;
  }
  return out;
}

/**
 * Lo que llega del servidor, en la forma que usa la pantalla: textos en vez
 * de null para que los campos no muestren "null".
 */
function desdeServidor(row) {
  const v = { id: row.id, vendedor: row.vendedor, creado_en: row.creado_en, actualizado_en: row.actualizado_en };
  for (const [c] of COLUMNAS) {
    v[c] = row[c] === null || row[c] === undefined ? '' : String(row[c]);
  }
  v.archivada = Boolean(row.archivada);
  v.eliminada = Boolean(row.eliminada);
  v.f_exportado = row.f_exportado || '';
  return v;
}

/* Ficha mínima para guardar: lo que permite contarla en el tablero. */
function lista(v) {
  return Boolean(v.negocio && String(v.negocio).trim() && v.giro && v.municipio);
}

const api = {
  OPCIONES, COLUMNAS, NUMERICOS, EDITABLES, CERRADO, TERMINALES, EN_JUEGO, METAS,
  hoy, fechaCorta, franjaActual, nuevoId, nuevaVisita, paraSubir, desdeServidor, lista,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.BitacoraCampos = api;
}
})();
