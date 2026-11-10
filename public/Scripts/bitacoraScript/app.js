import { showToast } from '../toast.js';
import { goLogout } from '../api.js';
import { setupAccountMenu } from '../accountMenu.js';
import { visitasDe, guardarLocal, leerMeta, guardarMeta, disponible } from './store.js';
import {
  sincronizar, yo, pedirSesionDispositivo, equipo, prospectosCerca, buscarProspectos, prospecto, SinSesion, SinRed,
} from './sync.js';

const C = globalThis.BitacoraCampos;
const K = globalThis.BitacoraCalculos;
const X = globalThis.BitacoraExcel;

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------
   Estado
   ------------------------------------------------------------------ */

const estado = {
  cuenta: null,          // { id, nombre, correo, tipo, sesion, equipo }
  visitas: [],           // copia local: las de todo el equipo
  config: { meta: 20, ultimoMunicipio: '', ultimaColonia: '' },
  tab: 'hoy',
  filtroTodas: 'activas',
  deQuien: 'todos',      // Todas: 'todos' o 'mias'
  busqueda: '',
  sync: 'revisando',
  sincronizando: false,
  hoja: null,            // { v, modo: 'rapido'|'completo'|'ver', paso, esNueva }
  sugerencias: null,     // prospectos para la hoja abierta: { titulo, lista, cargando, error }
  periodo: 0,            // días del tablero; 0 = todo
  vendedorFiltro: '',    // admin: id de la cuenta, '' = todo el equipo
  equipo: null,          // admin: filas de /api/bitacora/resumen
};

const esAdmin = () => estado.cuenta && estado.cuenta.tipo === 'admin';

/* En pantalla grande la bitácora se ve como el resto del pass: barra con
   menú, encabezado, pestañas arriba y tablas en lugar de tarjetas. */
const escritorio = window.matchMedia('(min-width: 900px)');

/* Las que capturó esta cuenta. Las recién creadas aún no traen vendedor. */
const mias = () => estado.visitas.filter((v) => !v.vendedor || v.vendedor === estado.cuenta.id);
/* Las suyas y las que le compartieron: su seguimiento y su tablero. */
const suyas = () => estado.visitas.filter((v) => K.participa(v, estado.cuenta.id));
const vivas = (lista) => lista.filter((v) => !v.eliminada);

const esDueno = (v) => !v.vendedor || v.vendedor === estado.cuenta.id;
/* Edita el dueño, con quien se compartió y un admin; los demás sólo la ven. */
const puedoEditar = (v) => esAdmin() || esDueno(v) || v.compartido_con === estado.cuenta.id;

/* id → nombre de quien vende (de /yo); para visitas viejas, su visitador. */
function nombreDe(id, respaldo = '') {
  if (!id) return respaldo;
  if (id === estado.cuenta.id) return estado.cuenta.nombre || 'Tú';
  const p = (estado.cuenta.equipo || []).find((x) => x.id === id);
  return (p && p.nombre) || respaldo || 'Otro vendedor';
}

/* ------------------------------------------------------------------
   DOM: se construye con textContent, nunca con innerHTML de datos.
   ------------------------------------------------------------------ */

function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

const dinero = (n) => `$${Math.round(n || 0).toLocaleString('es-MX')}`;
const pct = (n) => `${(100 * (n || 0)).toFixed(1)}%`;
const dec = (n) => (n || 0).toLocaleString('es-MX', { maximumFractionDigits: 1 });

/* ------------------------------------------------------------------
   Sincronización
   ------------------------------------------------------------------ */

const TEXTO_SYNC = {
  revisando: 'Revisando…',
  'al-dia': 'Al día',
  subiendo: 'Subiendo',
  'sin-red': 'Sin red',
  'sin-sesion': 'Sin sesión',
  error: 'Error al subir',
};

function pintarSync() {
  const pendientes = estado.visitas.filter((v) => v._pendiente).length;
  let e = estado.sync;
  let texto = TEXTO_SYNC[e] || '';
  if (e === 'al-dia' && pendientes) {
    e = 'pendientes';
    texto = `${pendientes} por subir`;
  } else if ((e === 'sin-red' || e === 'sin-sesion') && pendientes) {
    texto = `${TEXTO_SYNC[e]} · ${pendientes} por subir`;
  }
  // Hay uno en la barra del teléfono y otro en la del escritorio.
  for (const pill of document.querySelectorAll('.bt-sync')) {
    pill.dataset.estado = e;
    pill.querySelector('.bt-sync__texto').textContent = texto;
  }
}

let relojSync = null;
let ultimaSync = 0;
function programarSync(ms = 3000) {
  clearTimeout(relojSync);
  relojSync = setTimeout(sincronizarAhora, ms);
}

async function sincronizarAhora() {
  if (!estado.cuenta || estado.sincronizando) return;
  if (navigator.onLine === false) {
    estado.sync = 'sin-red';
    pintarSync();
    return;
  }
  estado.sincronizando = true;
  estado.sync = 'subiendo';
  pintarSync();
  try {
    const r = await sincronizar(estado.cuenta.id);
    estado.sync = 'al-dia';
    $('avisoSesion').hidden = true;
    if (r.rechazadas) {
      showToast(`${r.rechazadas} visita(s) no se pudieron subir. Revísalas en Todas › Por subir.`, 'error', 6000);
    }
  } catch (err) {
    if (err instanceof SinSesion) {
      estado.sync = 'sin-sesion';
      $('avisoSesion').hidden = false;
    } else if (err instanceof SinRed) {
      estado.sync = 'sin-red';
    } else {
      estado.sync = 'error';
      showToast(`No se pudo sincronizar: ${err.message}`, 'error');
    }
  } finally {
    estado.sincronizando = false;
    ultimaSync = Date.now();
  }
  await recargar();
}

/* Sólo cuenta la última lectura: una que empezó antes de guardar (la de la
   sincronización, por ejemplo) puede terminar después y pintaría la lista
   sin la visita recién capturada. */
let ultimaCarga = 0;
async function recargar() {
  const n = ++ultimaCarga;
  const visitas = await visitasDe(estado.cuenta.id);
  if (n !== ultimaCarga) return;
  estado.visitas = visitas;
  pintar();
  // Con la hoja abierta, lo que acaba de bajar puede ser otra visita al
  // mismo negocio (p. ej. al llegar desde Prospección antes de sincronizar).
  if (estado.hoja) {
    pintarRepetida();
    pintarSugerencias();
  }
}

/* ------------------------------------------------------------------
   Pestañas y listas
   ------------------------------------------------------------------ */

const CLASE_RESULTADO = {
  Cerrado: 'bt-badge--ok',
  'Propuesta enviada': 'bt-badge--info',
  'En negociación': 'bt-badge--info',
  'Demo hecha': 'bt-badge--info',
  'Interés bajo (recontactar)': 'bt-badge--warn',
  'Reagendar visita': 'bt-badge--warn',
  Perdido: 'bt-badge--error',
};

/* "Compartida con Carlos" / "Te la compartió Vero" / "" */
function textoCompartida(v) {
  if (!v.compartido_con) return '';
  if (v.compartido_con === estado.cuenta.id) return `Te la compartió ${nombreDe(v.vendedor, v.visitador)}`;
  return `Compartida con ${nombreDe(v.compartido_con)}`;
}

function item(v, { fecha = false, seguimiento = false, vendedor = false } = {}) {
  const etiqueta = v.resultado || (v.decisor && v.decisor !== 'Sí' ? 'Sin decisor' : 'Sin cerrar');
  const ajena = !esDueno(v);
  const meta = [
    fecha && C.fechaCorta(v.fecha),
    (vendedor || ajena) && nombreDe(v.vendedor, v.visitador),
    v.giro,
    v.colonia || v.municipio,
    v.interes && `interés ${v.interes}`,
    seguimiento && v.f_seguimiento && `seguir el ${C.fechaCorta(v.f_seguimiento)}`,
  ].filter(Boolean).join(' · ');
  return h('button', { type: 'button', class: 'bt-item', onclick: () => abrirHoja(v) },
    h('span', { class: 'bt-item__top' },
      h('span', { class: 'bt-item__nombre', text: v.negocio || 'Sin nombre' }),
      h('span', { class: `bt-badge ${CLASE_RESULTADO[v.resultado] || ''}`, text: etiqueta })),
    meta && h('span', { class: 'bt-item__meta', text: meta }),
    v.compartido_con && h('span', { class: 'bt-item__compartida', text: textoCompartida(v) }),
    v._rechazo && h('span', { class: 'bt-item__aviso bt-item__aviso--error', text: `No se subió: ${v._rechazo}` }),
    !v._rechazo && v._pendiente && h('span', { class: 'bt-item__aviso', text: 'Por subir' }));
}

/* Ícono fijo (no lleva datos), por eso se arma desde texto una sola vez. */
const ICONO_VACIO = (() => {
  const t = document.createElement('template');
  t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
    + 'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.3 2.3 4.7-5"/></svg>';
  return t.content.firstElementChild;
})();

function vacio(titulo, texto) {
  return h('div', { class: 'bt-vacio' },
    h('span', { class: 'bt-vacio__icono', 'aria-hidden': 'true' }, ICONO_VACIO.cloneNode(true)),
    h('strong', { text: titulo }),
    h('span', { text: texto }));
}

function pintarHoy() {
  const hoy = C.hoy();
  const propias = vivas(mias());
  const deHoy = propias.filter((v) => v.fecha === hoy);
  const meta = Number(estado.config.meta) || 20;

  $('metaTitulo').textContent = `META DEL DÍA · ${C.fechaCorta(hoy)}`;
  $('metaCuenta').textContent = `${deHoy.length} / ${meta}`;
  $('metaBarra').style.width = `${Math.min(100, (100 * deHoy.length) / meta)}%`;
  $('metaDia').classList.toggle('is-cumplida', deHoy.length >= meta);
  $('metaNota').textContent = deHoy.length >= meta
    ? 'Meta cumplida.'
    : `Te faltan ${meta - deHoy.length}.`;

  const r = K.resumen(estado.visitas, { cuenta: estado.cuenta.id });
  const kpi = (label, num) => h('div', { class: 'ui-kpi' },
    h('span', { class: 'ui-kpi__label', text: label }), h('span', { class: 'ui-kpi__num', text: num }));
  $('kpisHoy').replaceChildren(
    kpi('Puertas', r.puertas), kpi('Demos', r.demos), kpi('Propuestas', r.propuestas), kpi('Cerrados', dec(r.cerrados)));

  $('tituloHoy').textContent = `Hoy · ${deHoy.length}`;
  // La más reciente arriba.
  const lista = deHoy.slice().sort((a, b) => String(b.creado_en || '').localeCompare(String(a.creado_en || '')));
  $('listaHoy').replaceChildren(...(lista.length
    ? lista.map((v) => item(v))
    : [vacio('Todavía no tocas ninguna.',
      'Registra cada puerta, también las que no te abrieron. Los “no” son los que hacen que los números sirvan.')]));

  // Columna derecha (sólo escritorio): actividad y lo que hay que seguir.
  const dias = K.porDia(propias, 14, hoy);
  $('actividadTotal').textContent = resumenDias(dias);
  $('actividadHoy').replaceChildren(barras(dias, meta));
  const seguir = K.porSeguir(suyas());
  $('tituloSeguirLado').textContent = `Por seguir · ${seguir.length}`;
  $('listaSeguirLado').replaceChildren(...(seguir.length
    ? seguir.slice(0, 5).map((v) => item(v, { seguimiento: true }))
    : [vacio('Nada pendiente.', 'Las visitas en propuesta, demo o reagendar aparecen aquí.')]));
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const diaMes = (iso) => `${Number(iso.slice(8))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const esFinde = (iso) => [0, 6].includes(new Date(`${iso}T12:00:00`).getDay());

/* "45 puertas · 1.5 al día" para el encabezado de una gráfica. */
function resumenDias(dias) {
  const total = dias.reduce((s, d) => s + d.n, 0);
  return `${total} ${total === 1 ? 'puerta' : 'puertas'} · ${dec(total / dias.length)} al día`;
}

/* Barras verticales de puertas por día, con guías de escala a la izquierda.
   La línea punteada es la meta; sábado y domingo van más tenues. */
function barras(dias, meta) {
  const total = dias.reduce((s, d) => s + d.n, 0);
  if (!total) {
    return h('div', { class: 'bt-barras bt-barras--vacia' },
      h('strong', { text: 'Sin puertas en estos días' }),
      h('span', { text: `Del ${diaMes(dias[0].fecha)} al ${diaMes(dias[dias.length - 1].fecha)}.` }));
  }
  const tope = Math.max(meta || 0, ...dias.map((d) => d.n), 1);
  const guia = (valor, clase, texto) => {
    const linea = h('span', { class: `bt-barras__guia ${clase}` }, h('span', { class: 'bt-barras__valor', text: texto }));
    linea.style.bottom = `${(100 * valor) / tope}%`;
    return linea;
  };
  const guias = [];
  if (meta) guias.push(guia(meta, 'bt-barras__guia--meta', `meta ${meta}`));
  if (tope !== meta) guias.push(guia(tope, '', String(tope)));
  const mitad = Math.round(tope / 2);
  if (mitad > 0 && mitad !== meta && mitad !== tope) guias.push(guia(mitad, '', String(mitad)));

  // Fecha cada tantos días, contando desde hoy hacia atrás para que hoy siempre salga.
  const paso = dias.length > 14 ? 5 : dias.length > 7 ? 2 : 1;
  const hoy = C.hoy();
  return h('div', { class: 'bt-barras' },
    h('div', { class: 'bt-barras__area' },
      guias,
      dias.map((d) => {
        const clases = ['bt-barras__col', d.fecha === hoy && 'is-hoy', esFinde(d.fecha) && 'is-finde', !d.n && 'is-cero']
          .filter(Boolean).join(' ');
        const col = h('span', {
          class: clases,
          title: `${diaMes(d.fecha)}: ${d.n} ${d.n === 1 ? 'puerta' : 'puertas'}${d.cerrados ? `, ${d.cerrados} cerrados` : ''}`,
        }, d.n ? h('span', { class: 'bt-barras__num', text: d.n }) : null);
        col.style.height = `${(100 * d.n) / tope}%`;
        return col;
      })),
    h('div', { class: 'bt-barras__ejes' },
      dias.map((d, i) => h('span', { text: (dias.length - 1 - i) % paso === 0 ? diaMes(d.fecha) : '' }))));
}

function pintarSeguir() {
  const lista = K.porSeguir(suyas());
  $('tituloSeguir').textContent = `Por seguir · ${lista.length}`;
  $('listaSeguir').replaceChildren(...(lista.length
    ? lista.map((v) => item(v, { fecha: true, seguimiento: true }))
    : [vacio('Nada pendiente.',
      'Aquí caen las visitas que quedaron en “propuesta enviada”, “demo hecha” o “reagendar”.')]));
}

function coincide(v, q) {
  if (!q) return true;
  const texto = [v.negocio, v.colonia, v.municipio, v.giro, v.contacto, v.telefono, v.visitador, v.notas]
    .join(' ').toLowerCase();
  return texto.includes(q);
}

function pintarTodas() {
  const todas = estado.deQuien === 'mias' ? suyas() : estado.visitas;
  for (const btn of $('segQuien').querySelectorAll('[data-quien]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.quien === estado.deQuien));
  }
  const grupos = {
    activas: todas.filter((v) => !v.eliminada && !v.archivada),
    pendientes: todas.filter((v) => v._pendiente || v._rechazo),
    archivadas: todas.filter((v) => !v.eliminada && v.archivada),
  };
  const nombres = { activas: 'Activas', pendientes: 'Por subir', archivadas: 'Archivadas' };
  for (const btn of $('segTodas').querySelectorAll('[data-filtro]')) {
    const f = btn.dataset.filtro;
    btn.textContent = `${nombres[f]} (${grupos[f].length})`;
    btn.setAttribute('aria-pressed', String(f === estado.filtroTodas));
  }
  const q = estado.busqueda.trim().toLowerCase();
  const lista = grupos[estado.filtroTodas]
    .filter((v) => coincide(v, q))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const conVendedor = estado.deQuien === 'todos';
  const textos = {
    activas: ['Sin visitas activas.', 'Empieza en la pestaña Hoy.'],
    pendientes: ['Todo subido.', 'Lo que captures sin señal aparece aquí hasta que suba.'],
    archivadas: ['Nada archivado.', 'Las visitas cerradas o descartadas se archivan al exportar el Excel.'],
  };
  if (!lista.length) {
    $('listaTodas').replaceChildren(vacio(...textos[estado.filtroTodas]));
  } else if (escritorio.matches) {
    $('listaTodas').replaceChildren(tablaVisitas(lista, conVendedor));
  } else {
    $('listaTodas').replaceChildren(...lista.map((v) => item(v, { fecha: true, vendedor: conVendedor })));
  }
}

/* Escritorio: una fila por visita; clic o Enter abre la ficha. */
function tablaVisitas(lista, conVendedor) {
  const titulos = ['Fecha', 'Negocio', 'Giro', 'Zona', conVendedor && 'Vendedor', 'Interés', 'Resultado', 'Seguimiento']
    .filter(Boolean);
  const filas = lista.map((v) => {
    const etiqueta = v.resultado || (v.decisor && v.decisor !== 'Sí' ? 'Sin decisor' : 'Sin cerrar');
    const estadoSubida = v._rechazo
      ? h('span', { class: 'bt-item__aviso bt-item__aviso--error', text: ' · no se subió' })
      : v._pendiente && h('span', { class: 'bt-item__aviso', text: ' · por subir' });
    const celdas = [
      C.fechaCorta(v.fecha),
      h('td', { class: 'bt-tabla__fuerte' }, v.negocio || 'Sin nombre', estadoSubida,
        v.compartido_con && h('span', { class: 'bt-item__compartida', text: ` · ${textoCompartida(v)}` })),
      v.giro,
      [v.colonia, v.municipio].filter(Boolean).join(', '),
      conVendedor && nombreDe(v.vendedor, v.visitador),
      v.interes,
      h('td', {}, h('span', { class: `bt-badge ${CLASE_RESULTADO[v.resultado] || ''}`, text: etiqueta })),
      v.f_seguimiento ? C.fechaCorta(v.f_seguimiento) : '',
    ].filter((c) => c !== false);
    return h('tr', {
      tabindex: '0',
      onclick: () => abrirHoja(v),
      onkeydown: (e) => { if (e.key === 'Enter') abrirHoja(v); },
    }, celdas.map((c) => (c instanceof Node ? c : h('td', { text: c || '' }))));
  });
  return h('div', { class: 'bt-card bt-card--tabla' }, h('div', { class: 'bt-scroll' },
    h('table', { class: 'bt-tabla bt-tabla--filas' },
      h('thead', {}, h('tr', {}, titulos.map((t) => h('th', { text: t })))),
      h('tbody', {}, filas))));
}

function tabla(titulos, filas, numericas = []) {
  return h('div', { class: 'bt-scroll' }, h('table', { class: 'bt-tabla' },
    h('thead', {}, h('tr', {}, titulos.map((t, i) => h('th', { class: numericas.includes(i) ? 'n' : null, text: t })))),
    h('tbody', {}, filas.map((f) => h('tr', {}, f.map((c, i) => {
      const celda = c && typeof c === 'object' && !(c instanceof Node) ? c : { v: c };
      return h('td', { class: [numericas.includes(i) ? 'n' : '', celda.clase || ''].join(' ').trim() || null }, celda.v);
    }))))));
}

/* Las visitas recién capturadas aún no traen vendedor: son de esta cuenta. */
const vendedorDe = (v) => v.vendedor || estado.cuenta.id;

/* Admin: id → nombre de cada vendedor, de la lista del equipo y de las visitas. */
function nombresVendedores() {
  const nombres = new Map();
  for (const f of estado.equipo || []) nombres.set(f.id, f.nombre);
  for (const v of estado.visitas) {
    const id = vendedorDe(v);
    if (!nombres.has(id)) nombres.set(id, v.visitador || 'Sin nombre');
  }
  return nombres;
}

function pintarFiltroVendedor(nombres) {
  const opciones = [...nombres].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  $('filtroVendedor').replaceChildren(
    h('option', { value: '', text: 'Todo el equipo' }),
    ...opciones.map(([id, nombre]) => h('option', { value: id, text: nombre })));
  $('filtroVendedor').value = estado.vendedorFiltro;
}

const PERIODOS = { 0: 'desde el inicio', 1: 'hoy', 7: 'últimos 7 días', 30: 'últimos 30 días' };

function tarjeta(titulo, ...contenido) {
  return h('section', { class: 'bt-card' }, h('h3', { class: 'bt-card__titulo', text: titulo }), ...contenido);
}

/* Tarjeta cuyo contenido crece hasta la altura de su vecina en la rejilla. */
function tarjetaGrafica(titulo, dato, contenido) {
  return h('section', { class: 'bt-card bt-card--grafica' },
    h('div', { class: 'bt-card__cabeza' },
      h('h3', { class: 'bt-card__titulo', text: titulo }),
      h('span', { class: 'bt-card__dato', text: dato })),
    contenido);
}

function embudo(r) {
  const etapas = [
    ['Puertas tocadas', r.puertas],
    ['Decisor presente', r.decisor, r.conv.decisor, C.METAS.decisor],
    ['Demos', r.demos, r.conv.demo, C.METAS.demo],
    ['Propuestas', r.propuestas, r.conv.propuesta, C.METAS.propuesta],
    ['Cerrados', r.cerrados, r.conv.cierre, C.METAS.cierre],
  ];
  return h('div', { class: 'bt-embudo' }, etapas.map(([nombre, n, conv, meta]) => {
    const barra = h('span', { class: 'bt-embudo__barra' });
    barra.style.width = `${r.puertas ? (100 * n) / r.puertas : 0}%`;
    const dif = conv === undefined ? null : conv - meta;
    return h('div', { class: 'bt-embudo__fila' },
      h('span', { class: 'bt-embudo__nombre', text: nombre }),
      h('span', { class: 'bt-embudo__n', text: n }),
      h('span', { class: 'bt-embudo__conv', text: dif === null ? '' : pct(conv) }),
      h('span', { class: 'bt-embudo__pista' }, barra),
      h('span', {
        class: `bt-embudo__dif ${dif === null ? '' : dif >= 0 ? 'arriba' : 'abajo'}`,
        text: dif === null ? '' : `${dif >= 0 ? '+' : '−'}${pct(Math.abs(dif))} vs. meta ${pct(meta)}`,
      }));
  }));
}

function pintarTablero() {
  const hoy = C.hoy();
  const nombres = esAdmin() ? nombresVendedores() : null;
  if (esAdmin()) pintarFiltroVendedor(nombres);
  for (const b of $('segPeriodo').querySelectorAll('[data-dias]')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.dias) === estado.periodo));
  }

  // De quién es el tablero: el vendedor (sus visitas y las que le
  // compartieron, con la mitad del cierre) o, para el admin, todo el equipo.
  const cuenta = esAdmin() ? estado.vendedorFiltro || null : estado.cuenta.id;
  let base = vivas(estado.visitas);
  if (cuenta) base = base.filter((v) => K.participa(v, cuenta));
  const visitas = K.enPeriodo(base, estado.periodo, hoy);
  const r = K.resumen(visitas, { cuenta });

  const quien = !esAdmin()
    ? estado.cuenta.nombre
    : estado.vendedorFiltro ? nombres.get(estado.vendedorFiltro) || 'Vendedor' : 'Todo el equipo';
  $('tableroAlcance').textContent = `${quien} · ${PERIODOS[estado.periodo]} · ${r.puertas} visitas`;

  const kpi = (label, num, clase, pista) => h('div', { class: `ui-kpi ${clase}` },
    h('span', { class: 'ui-kpi__label', text: label }),
    h('span', { class: 'ui-kpi__num', text: num }),
    pista && h('span', { class: 'ui-kpi__hint', text: pista }));
  $('tableroKpis').replaceChildren(
    kpi('Puertas', r.puertas, '', `${dec(r.puertasPorDia)} por día con visitas`),
    kpi('Demos', r.demos, 'ui-kpi--info', `${pct(r.conv.demo)} de los decisores`),
    kpi('Propuestas', r.propuestas, 'ui-kpi--purple', `${pct(r.conv.propuesta)} de las demos`),
    kpi('Cerrados', dec(r.cerrados), 'ui-kpi--ok', cuenta && r.compartidos
      ? `${r.compartidos} compartido${r.compartidos === 1 ? '' : 's'}: cuenta la mitad`
      : `${pct(r.conv.total)} de las puertas`),
    kpi('MRR cerrado', dinero(r.mrr), 'ui-kpi--ok', r.cerrados ? `${dinero(r.mrrPorCliente)} por cliente` : ''),
    kpi('En seguimiento', r.enJuego, 'ui-kpi--warning', 'demo, propuesta o reagendar'));

  // La gráfica siempre muestra días: con "Todo" u "Hoy", los últimos 30.
  const diasGrafica = estado.periodo === 7 ? 7 : 30;
  const metaGrafica = esAdmin() && !estado.vendedorFiltro ? 0 : Number(estado.config.meta) || 20;
  // Puertas: sólo las que tocó él.
  const actividad = K.porDia(cuenta ? base.filter((v) => vendedorDe(v) === cuenta) : base, diasGrafica, hoy);

  const desglose = (titulo, clave, grupos, conMrr) => tarjeta(titulo,
    grupos.length
      ? tabla(conMrr ? [clave, 'Puertas', 'Demos', 'Cerr.', 'Cierre', 'MRR'] : [clave, 'Puertas', 'Demos', 'Cerr.', 'Cierre'],
        grupos.map((g) => [g.clave, g.n, g.demos, dec(g.cerrados), pct(g.tasa)].concat(conMrr ? [dinero(g.mrr)] : [])),
        conMrr ? [1, 2, 3, 4, 5] : [1, 2, 3, 4])
      : h('p', { class: 'bt-nota', text: 'Sin datos todavía.' }));
  const reparto = (titulo, clave, columna, grupos) => tarjeta(titulo,
    grupos.length
      ? tabla([clave, columna, '% del total'], grupos.map((g) => [g.clave, g.n, pct(g.parte)]), [1, 2])
      : h('p', { class: 'bt-nota', text: 'Sin datos todavía.' }));

  // Todo el equipo: cierre y MRR repartidos entre quienes compartieron.
  const filasVendedor = r.porCuenta.map((g) => ({ ...g, clave: nombres.get(g.clave) || nombreDe(g.clave) }));
  const porVendedor = filasVendedor.length > 1 ? desglose('Por vendedor', 'Vendedor', filasVendedor, true) : null;
  if (porVendedor) porVendedor.classList.add('bt-card--ancha');

  $('tablero').replaceChildren(...[
    tarjeta('El embudo', embudo(r),
      h('p', { class: 'bt-nota', text: 'Las metas son supuestos de venta en frío, no datos de ReservAI. Cámbialas cuando tengas unas 200 visitas propias.' })),
    tarjetaGrafica(`Puertas por día · últimos ${diasGrafica} días`, resumenDias(actividad), barras(actividad, metaGrafica)),
    porVendedor,
    tarjeta('Indicadores', tabla(['Indicador', 'Valor'], [
      ['Conversión total', pct(r.conv.total)],
      ['Puertas por cliente', dec(r.puertasPorCliente)],
      ['MRR cerrado', dinero(r.mrr)],
      ['MRR promedio por cliente', dinero(r.mrrPorCliente)],
      ['Días con visitas', r.dias],
      ['Puertas por día', dec(r.puertasPorDia)],
      ['Interés promedio (1-5)', dec(r.interes)],
      ['Minutos por conversación', dec(r.minutos)],
      ['Mensajes al día del mercado', dec(r.mensajes)],
      ['Ticket promedio del mercado', dinero(r.ticket)],
      ['En seguimiento activo', r.enJuego],
    ], [1])),
    reparto('Estado de cada visita', 'Resultado', 'Visitas', r.porResultado),
    desglose('Por giro de negocio', 'Giro', r.porGiro),
    desglose('Por municipio', 'Municipio', r.porMunicipio),
    desglose('Por franja horaria', 'Franja', r.porFranja),
    reparto('Objeciones que más aparecen', 'Objeción', 'Casos', r.porObjecion),
    reparto('Qué sistema usan hoy', 'Sistema', 'Negocios', r.porSistema),
    reparto('Motivos de pérdida', 'Motivo', 'Visitas', r.porPerdida),
  ].filter(Boolean));
}

/* ------------------------------------------------------------------
   Equipo (admin): una fila por vendedor, de /api/bitacora/resumen
   ------------------------------------------------------------------ */

let pidiendoEquipo = false;
async function cargarEquipo() {
  if (pidiendoEquipo) return;
  pidiendoEquipo = true;
  try {
    const data = await equipo();
    estado.equipo = (data.vendedores || []).map((f) => ({
      ...f,
      total: Number(f.total) || 0,
      hoy: Number(f.hoy) || 0,
      ultimos_7: Number(f.ultimos_7) || 0,
      cerradas: Number(f.cerradas) || 0,
      mrr: Number(f.mrr) || 0,
    }));
    estado.equipoError = '';
  } catch (err) {
    estado.equipoError = err instanceof SinRed
      ? 'Sin conexión: la lista del equipo necesita internet.'
      : err instanceof SinSesion ? 'Tu sesión terminó. Entra de nuevo para ver al equipo.'
        : `No se pudo cargar el equipo: ${err.message}`;
  } finally {
    pidiendoEquipo = false;
  }
  if (estado.tab === 'equipo' || estado.tab === 'tablero') pintar();
}

function pintarEquipo() {
  const filas = estado.equipo;
  if (!filas) {
    $('equipoAlcance').textContent = '';
    $('equipo').replaceChildren(estado.equipoError
      ? vacio('No se pudo cargar.', estado.equipoError)
      : h('div', { class: 'ui-loading' }, h('span', { class: 'ui-loading__spinner', 'aria-hidden': 'true' }), ' Cargando al equipo…'));
    return;
  }
  const vendedores = filas.filter((f) => f.tipo === 'seller');
  const salieronHoy = filas.filter((f) => f.hoy > 0).length;
  $('equipoAlcance').textContent = `${vendedores.length} vendedores · ${salieronHoy} con visitas hoy`
    + (estado.equipoError ? ` · ${estado.equipoError}` : '');

  const kpi = (label, num, clase) => h('div', { class: `ui-kpi ${clase}` },
    h('span', { class: 'ui-kpi__label', text: label }), h('span', { class: 'ui-kpi__num', text: num }));
  const suma = (k) => filas.reduce((s, f) => s + f[k], 0);
  // Sin visitas en la última semana: la fecha sale en rojo.
  const haceSemana = K.haceDias(C.hoy(), 6);

  const tablaEquipo = h('div', { class: 'bt-scroll' }, h('table', { class: 'bt-tabla bt-tabla--filas' },
    h('thead', {}, h('tr', {}, ['Vendedor', 'Hoy', '7 días', 'Total', 'Cerradas', 'MRR', 'Última visita']
      .map((t, i) => h('th', { class: i ? 'n' : null, text: t })))),
    h('tbody', {}, filas.map((f) => {
      const quieto = !f.ultima_visita || f.ultima_visita < haceSemana;
      const ver = () => { estado.vendedorFiltro = f.id; irA('tablero'); };
      return h('tr', { tabindex: '0', onclick: ver, onkeydown: (e) => { if (e.key === 'Enter') ver(); } },
        h('td', { class: 'bt-tabla__fuerte' }, f.nombre || 'Sin nombre',
          f.tipo === 'admin' && h('span', { class: 'bt-item__meta', text: ' · admin' })),
        h('td', { class: 'n', text: f.hoy }),
        h('td', { class: 'n', text: f.ultimos_7 }),
        h('td', { class: 'n', text: f.total }),
        h('td', { class: 'n', text: dec(f.cerradas) }),
        h('td', { class: 'n', text: dinero(f.mrr) }),
        h('td', { class: `n${quieto ? ' abajo' : ''}`, text: f.ultima_visita ? C.fechaCorta(f.ultima_visita) : 'Nunca' }));
    }))));

  $('equipo').replaceChildren(
    h('div', { class: 'ui-kpis bt-kpis bt-kpis--tablero bt-kpis--equipo' },
      kpi('Puertas hoy', suma('hoy'), ''),
      kpi('Puertas 7 días', suma('ultimos_7'), 'ui-kpi--info'),
      kpi('Cerradas', dec(suma('cerradas')), 'ui-kpi--ok'),
      kpi('MRR cerrado', dinero(suma('mrr')), 'ui-kpi--ok')),
    h('section', { class: 'bt-card bt-card--tabla' }, tablaEquipo));
}

function pintarAjustes() {
  $('inputMeta').value = estado.config.meta;
  $('ajustesPendientes').textContent = estado.visitas.filter((v) => v._pendiente || v._rechazo).length;
  $('cuentaNombre').textContent = estado.cuenta.nombre || estado.cuenta.correo || '';
  $('cuentaPapel').textContent = esAdmin() ? 'Administrador' : 'Vendedor';
  $('cuentaSesion').textContent = estado.cuenta.sesion === 'dispositivo' || estado.cuenta.dispositivo
    ? 'Guardada (30 días)'
    : estado.sync === 'sin-sesion' ? 'Terminada' : 'Activa';
}

function pintar() {
  if (!estado.cuenta) return;
  pintarSync();
  ({
    hoy: pintarHoy, seguir: pintarSeguir, todas: pintarTodas, tablero: pintarTablero, equipo: pintarEquipo, ajustes: pintarAjustes,
  })[estado.tab]();
}

function irA(tab) {
  if (tab === 'equipo' && !esAdmin()) tab = 'hoy';
  estado.tab = tab;
  for (const sec of document.querySelectorAll('.bt-panel')) sec.hidden = sec.id !== `tab-${tab}`;
  for (const b of $('tabs').querySelectorAll('.bt-tab')) b.classList.toggle('is-active', b.dataset.tab === tab);
  if (tab === 'ajustes') revisarOffline();
  // La lista del equipo se pide al entrar: trae a los vendedores sin visitas
  // y los nombres del filtro del tablero.
  if (esAdmin() && (tab === 'equipo' || (tab === 'tablero' && !estado.equipo))) cargarEquipo();
  pintar();
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------
   Hoja de captura
   ------------------------------------------------------------------ */

function abrirHoja(visita, datos = null) {
  estado.sugerencias = null;
  if (visita) {
    const copia = { ...visita };
    estado.hoja = { v: copia, modo: puedoEditar(visita) ? 'completo' : 'ver', paso: 0, esNueva: false };
  } else {
    const v = C.nuevaVisita({
      visitador: estado.cuenta.nombre,
      ultimoMunicipio: estado.config.ultimoMunicipio,
      ultimaColonia: estado.config.ultimaColonia,
    });
    if (datos) Object.assign(v, datos);
    estado.hoja = { v, modo: 'rapido', paso: 0, esNueva: true };
  }
  $('hoja').hidden = false;
  $('velo').hidden = false;
  document.body.style.overflow = 'hidden';
  pintarHoja();
  // Puerta nueva sin negocio elegido: el GPS dice dónde está y qué
  // prospectos de Prospección hay alrededor.
  if (!visita && !estado.hoja.v.place_id) ubicar(estado.hoja);
}

/* ------------------------------------------------------------------
   Ligar con Prospección: el punto de la visita y los negocios cercanos
   ------------------------------------------------------------------ */

function ubicar(hoja) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((pos) => {
    if (estado.hoja !== hoja) return;
    const { latitude: lat, longitude: lng } = pos.coords;
    // Si ya eligió un prospecto, se queda el punto de Google.
    if (!hoja.v.place_id) {
      hoja.v.lat = String(Math.round(lat * 1e7) / 1e7);
      hoja.v.lng = String(Math.round(lng * 1e7) / 1e7);
    }
    hoja.gps = { lat, lng };
    if (!hoja.v.place_id && !hoja.v.negocio) cargarSugerencias(hoja, () => prospectosCerca(lat, lng), 'Cerca de ti');
    pintarLugar();
  }, () => {
    if (estado.hoja === hoja) { hoja.gps = false; pintarLugar(); }
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

async function cargarSugerencias(hoja, pedirlas, titulo) {
  if (navigator.onLine === false) return;
  const turno = (hoja.turnoSugerencias || 0) + 1;
  hoja.turnoSugerencias = turno;
  estado.sugerencias = { titulo, lista: (estado.sugerencias && estado.sugerencias.lista) || [], cargando: true };
  pintarSugerencias();
  try {
    const data = await pedirlas();
    if (estado.hoja !== hoja || hoja.turnoSugerencias !== turno) return;
    estado.sugerencias = { titulo, lista: data.prospectos || [], cargando: false };
  } catch {
    if (estado.hoja !== hoja || hoja.turnoSugerencias !== turno) return;
    // Sin señal o sin Prospección: la captura sigue igual.
    estado.sugerencias = null;
  }
  pintarSugerencias();
}

let relojBusqueda = null;
function buscarMientrasEscribe() {
  const hoja = estado.hoja;
  clearTimeout(relojBusqueda);
  if (!hoja || !hoja.esNueva || hoja.v.place_id) return;
  const q = String(hoja.v.negocio || '').trim();
  relojBusqueda = setTimeout(() => {
    if (q.length >= 3) cargarSugerencias(hoja, () => buscarProspectos(q), `En Prospección: “${q}”`);
    else if (hoja.gps) cargarSugerencias(hoja, () => prospectosCerca(hoja.gps.lat, hoja.gps.lng), 'Cerca de ti');
    else { estado.sugerencias = null; pintarSugerencias(); }
  }, 450);
}

function elegirProspecto(p) {
  Object.assign(estado.hoja.v, C.desdeProspecto(p));
  estado.sugerencias = null;
  pintarHoja();
}

/* Quién ya visitó ese lugar, de lo que hay en el teléfono. */
function visitaDelLugar(placeId) {
  return vivas(estado.visitas).filter((v) => v.place_id === placeId && v.id !== (estado.hoja && estado.hoja.v.id))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
}

function pintarSugerencias() {
  const caja = $('sugerencias');
  if (!caja) return;
  const s = estado.sugerencias;
  if (!s || (!s.cargando && !s.lista.length)) {
    caja.hidden = true;
    caja.replaceChildren();
    return;
  }
  caja.hidden = false;
  caja.replaceChildren(
    h('div', { class: 'bt-sugerencias__titulo' },
      h('span', { text: s.titulo }),
      s.cargando && h('span', { class: 'ui-loading__spinner', 'aria-hidden': 'true' })),
    ...s.lista.slice(0, 6).map((p) => {
      const ya = visitaDelLugar(p.place_id);
      const meta = [
        p.categoria,
        Number.isFinite(p.distancia_m) ? `${p.distancia_m} m` : (p.direccion || '').split(',')[0],
        p.lead_score !== null && p.lead_score !== undefined && `score ${p.lead_score}`,
      ].filter(Boolean).join(' · ');
      return h('button', { type: 'button', class: 'bt-sugerencia', onclick: () => elegirProspecto(p) },
        h('span', { class: 'bt-sugerencia__nombre', text: p.nombre }),
        h('span', { class: 'bt-sugerencia__meta', text: meta }),
        ya && h('span', { class: 'bt-sugerencia__ya',
          text: `Ya la visitó ${nombreDe(ya.vendedor, ya.visitador)} el ${C.fechaCorta(ya.fecha)}` }));
    }));
}

/* Debajo del nombre: si quedó ligada a Prospección o sólo con el GPS. */
function pintarLugar() {
  const caja = $('lugarHoja');
  if (!caja || !estado.hoja) return;
  const { v, gps } = estado.hoja;
  const editable = estado.hoja.modo !== 'ver';
  let texto;
  if (v.place_id) texto = 'Ligada a Prospección: aparece en su punto del mapa.';
  else if (v.lat && v.lng) texto = 'Con la ubicación del teléfono: aparece en la zona de Prospección.';
  else if (gps === false) texto = 'Sin ubicación: activa el GPS para ligarla a su zona.';
  else if (estado.hoja.esNueva) texto = 'Buscando tu ubicación…';
  else texto = '';
  caja.hidden = !texto;
  caja.replaceChildren(
    h('span', { text: texto }),
    editable && v.place_id && h('button', {
      type: 'button', class: 'bt-link',
      onclick: () => { v.place_id = ''; if (gps) { v.lat = String(gps.lat); v.lng = String(gps.lng); } pintarLugar(); },
      text: 'Quitar liga',
    }));
}

/* Otra visita al mismo negocio (de quien sea): se avisa antes de duplicar. */
function pintarRepetida() {
  const caja = $('avisoRepetida');
  if (!caja || !estado.hoja) return;
  const otras = C.parecidas(estado.hoja.v, estado.visitas);
  caja.hidden = !otras.length;
  if (!otras.length) { caja.replaceChildren(); return; }
  const o = otras[0];
  const quien = esDueno(o) ? 'Tú ya la visitaste' : `Ya la visitó ${nombreDe(o.vendedor, o.visitador)}`;
  caja.replaceChildren(
    h('strong', { text: `${quien} el ${C.fechaCorta(o.fecha)}` }),
    h('span', { text: ` · ${o.negocio || 'Sin nombre'}${o.resultado ? ` · ${o.resultado}` : ''}`
      + (otras.length > 1 ? ` · y ${otras.length - 1} más` : '') }),
    h('button', { type: 'button', class: 'bt-link', onclick: () => abrirHoja(o), text: 'Ver esa visita' }));
}

function cerrarHoja() {
  estado.sugerencias = null;
  clearTimeout(relojBusqueda);
  estado.hoja = null;
  $('hoja').hidden = true;
  $('velo').hidden = true;
  document.body.style.overflow = '';
}

function set(clave, valor) {
  estado.hoja.v[clave] = valor;
  if (estado.hoja.modo === 'rapido' && estado.hoja.paso === 0) pintarPie();
  if (clave === 'negocio' || clave === 'telefono' || clave === 'municipio') pintarRepetida();
  if (clave === 'negocio') buscarMientrasEscribe();
}

/* Debajo del nombre del negocio: aviso de repetida, prospectos y lugar. */
function bloqueLugar() {
  return [
    h('div', { id: 'avisoRepetida', class: 'bt-aviso-repetida', role: 'status', hidden: true }),
    h('div', { id: 'sugerencias', class: 'bt-sugerencias', hidden: true }),
    h('div', { id: 'lugarHoja', class: 'bt-lugar', hidden: true }),
  ];
}

/* Con quién reparte la comisión. Lo cambia el dueño o un admin. */
function campoCompartir() {
  const v = estado.hoja.v;
  const dueno = v.vendedor || estado.cuenta.id;
  if (!esDueno(v) && !esAdmin()) {
    return h('div', { class: 'bt-caja-nota',
      text: v.compartido_con
        ? `${textoCompartida(v)}: la comisión se reparte mitad y mitad. Sólo quien la registró cambia esto.`
        : '' });
  }
  const otros = (estado.cuenta.equipo || []).filter((p) => p.id !== dueno);
  if (!otros.length) return null;
  const select = h('select', {
    onchange: (e) => set('compartido_con', e.target.value),
  },
  h('option', { value: '', text: 'Nadie: la comisión es completa' }),
  ...otros.map((p) => h('option', { value: p.id, text: `${p.nombre} · mitad y mitad` })));
  select.value = v.compartido_con || '';
  return campo('Lead compartido con', 'reparten la comisión', select);
}

/* Ficha de sólo lectura para la visita de otro vendedor. */
function cuerpoLectura() {
  const v = estado.hoja.v;
  const filas = C.COLUMNAS
    .filter(([c]) => v[c] !== '' && v[c] !== null && v[c] !== undefined)
    .map(([c, titulo]) => h('div', { class: 'bt-lectura__fila' },
      h('dt', { text: titulo }),
      h('dd', { text: c.startsWith('f_') || c === 'fecha' ? C.fechaCorta(v[c]) : String(v[c]) })));
  return [
    h('div', { class: 'bt-caja-nota',
      text: `Es de ${nombreDe(v.vendedor, v.visitador)}. La ves para no repetir el negocio; sólo quien la registró (o con quien la compartió) la edita.` }),
    v.compartido_con && h('div', { class: 'bt-caja-nota', text: textoCompartida(v) }),
    h('dl', { class: 'bt-lectura' }, filas),
  ];
}

function campo(etiqueta, ayuda, control) {
  return h('label', { class: 'bt-campo' },
    h('span', { class: 'bt-campo__etiqueta' }, etiqueta, ayuda && h('em', { text: ` · ${ayuda}` })),
    control);
}

function texto(etiqueta, clave, { placeholder, tipo = 'text', inputmode, ayuda, largo } = {}) {
  const props = {
    value: estado.hoja.v[clave] || '',
    placeholder,
    inputmode,
    oninput: (e) => set(clave, e.target.value),
  };
  const control = largo
    ? h('textarea', { placeholder, oninput: props.oninput })
    : h('input', { type: tipo, ...props });
  if (largo) control.value = estado.hoja.v[clave] || '';
  return campo(etiqueta, ayuda, control);
}

function fecha(etiqueta, clave, ayuda) {
  return texto(etiqueta, clave, { tipo: 'date', ayuda });
}

function chips(etiqueta, clave, opciones, { num = false, ayuda } = {}) {
  const grupo = h('div', { class: 'bt-chips', role: 'group', 'aria-label': etiqueta });
  for (const op of opciones) {
    const b = h('button', {
      type: 'button',
      class: `bt-chip${num ? ' bt-chip--num' : ''}`,
      'aria-pressed': String(String(estado.hoja.v[clave]) === op),
      text: op,
      onclick: () => {
        const nuevo = String(estado.hoja.v[clave]) === op ? '' : op;
        set(clave, nuevo);
        for (const otro of grupo.children) otro.setAttribute('aria-pressed', String(otro.textContent === nuevo));
      },
    });
    grupo.append(b);
  }
  return h('div', { class: 'bt-campo' },
    h('span', { class: 'bt-campo__etiqueta' }, etiqueta, ayuda && h('em', { text: ` · ${ayuda}` })),
    grupo);
}

const O = C.OPCIONES;

function cuerpoRapido(paso) {
  const v = estado.hoja.v;
  if (paso === 0) {
    return [
      texto('Nombre del negocio', 'negocio', { placeholder: 'Barbería El Corte Fino' }),
      ...bloqueLugar(),
      chips('Giro', 'giro', O.giro),
      chips('Municipio', 'municipio', O.municipio),
      texto('Colonia o corredor', 'colonia', { placeholder: 'Chapalita', ayuda: 'se queda para la siguiente' }),
      h('div', { class: 'bt-caja-nota', text: `Fecha (${C.fechaCorta(v.fecha)}) y franja (${v.franja}) se llenaron solas.` }),
    ];
  }
  if (paso === 1) {
    return [
      h('button', {
        type: 'button', class: 'bt-opcion bt-opcion--principal',
        onclick: () => { v.decisor = 'Sí'; estado.hoja.paso = 2; pintarHoja(); },
      }, h('span', { text: 'Sí, hablé con el dueño' }), h('span', { class: 'bt-opcion__pista', text: 'seguir →' })),
      ...O.decisor.slice(1).map((op) => h('button', {
        type: 'button', class: 'bt-opcion',
        onclick: () => guardarRapida(op),
      }, h('span', { text: op }), h('span', { class: 'bt-opcion__pista', text: 'guardar y salir' }))),
      h('div', { class: 'bt-caja-nota', text: 'Estas tres guardan la visita de una vez. Igual caminaste hasta allá: cuenta como puerta.' }),
    ];
  }
  return [
    chips('¿Aceptó ver la demo?', 'demo', O.si_no),
    chips('Interés', 'interes', O.interes, { num: true, ayuda: '1 nada · 5 quiere contratar' }),
    chips('Minutos de conversación', 'minutos', O.minutos, { num: true }),
    chips('Objeción principal', 'objecion', O.objecion),
    chips('¿Pidió propuesta?', 'propuesta', O.si_no),
    chips('Resultado', 'resultado', O.resultado),
    campoCompartir(),
    texto('Mensajes de WhatsApp al día', 'mensajes', { tipo: 'number', inputmode: 'numeric', placeholder: '35', ayuda: 'pregúntalo siempre' }),
    texto('Notas', 'notas', { largo: true, placeholder: 'Qué le prendió el foco, qué lo frenó, con quién hay que hablar.' }),
    h('button', {
      type: 'button', class: 'bt-link',
      onclick: () => { estado.hoja.modo = 'completo'; pintarHoja(); },
    }, 'Abrir la ficha completa →'),
  ];
}

function cuerpoCompleto() {
  const v = estado.hoja.v;
  const seccion = (t) => h('div', { class: 'bt-seccion', text: t });
  const dos = (...hijos) => h('div', { class: 'bt-dos' }, ...hijos);
  return [
    fecha('Fecha de la visita', 'fecha', v.visitador ? `registrada por ${v.visitador}` : ''),
    chips('Franja horaria', 'franja', O.franja),
    texto('Nombre del negocio', 'negocio'),
    ...bloqueLugar(),
    chips('Giro', 'giro', O.giro),
    chips('Municipio', 'municipio', O.municipio),
    texto('Colonia / corredor', 'colonia'),
    texto('Dirección', 'direccion'),
    dos(texto('Teléfono', 'telefono', { tipo: 'tel', inputmode: 'tel' }), texto('Instagram', 'instagram')),
    dos(texto('Sucursales', 'sucursales', { tipo: 'number', inputmode: 'numeric' }),
      texto('Estaciones', 'estaciones', { tipo: 'number', inputmode: 'numeric' })),
    texto('Mensajes de WhatsApp al día', 'mensajes', { tipo: 'number', inputmode: 'numeric' }),
    chips('¿Quién contesta hoy?', 'quien_contesta', O.quien_contesta),
    chips('Sistema que usa hoy', 'sistema', O.sistema),
    chips('¿Usa Google Calendar?', 'google_calendar', O.si_no_nose),
    texto('Ticket promedio (MXN)', 'ticket', { tipo: 'number', inputmode: 'decimal' }),
    chips('¿Reconoce citas perdidas?', 'reconoce', O.si_no_nose),
    chips('Plan sugerido', 'plan_sugerido', O.plan_sugerido),

    seccion('La conversación'),
    chips('¿Decisor presente?', 'decisor', O.decisor),
    dos(texto('Contacto', 'contacto'), texto('Puesto', 'puesto')),
    chips('¿Aceptó ver la demo?', 'demo', O.si_no),
    chips('Minutos', 'minutos', O.minutos, { num: true }),
    chips('Interés 1-5', 'interes', O.interes, { num: true }),
    chips('Objeción principal', 'objecion', O.objecion),
    chips('¿Pidió propuesta?', 'propuesta', O.si_no),
    chips('Resultado', 'resultado', O.resultado),

    seccion('Seguimiento y cierre'),
    fecha('Próximo seguimiento', 'f_seguimiento'),
    chips('Canal', 'canal', O.canal),
    texto('Núm. de seguimientos', 'n_seguimientos', { tipo: 'number', inputmode: 'numeric' }),
    fecha('Propuesta enviada', 'f_propuesta'),
    fecha('Fecha de cierre', 'f_cierre'),
    chips('Plan contratado', 'plan_contratado', O.plan_contratado),
    texto('MRR (MXN)', 'mrr', { tipo: 'number', inputmode: 'decimal' }),
    fecha('Fecha de implementación', 'f_implementacion'),
    chips('Motivo de pérdida', 'motivo_perdida', O.motivo_perdida),
    campoCompartir(),
    texto('Notas', 'notas', { largo: true }),
    v._rechazo && h('div', { class: 'bt-caja-nota', text: `El servidor no la aceptó: ${v._rechazo}. Corrige y guarda de nuevo.` }),
  ];
}

function pintarPie() {
  const { modo, paso, esNueva, v } = estado.hoja;
  const boton = (texto, clase, onclick, disabled) =>
    h('button', { type: 'button', class: `ui-btn ${clase}`, onclick, disabled: disabled || null, text: texto });
  let botones;
  if (modo === 'rapido' && paso === 0) {
    const ok = C.lista(v);
    botones = [boton(ok ? 'Siguiente' : 'Falta negocio, giro y municipio', 'ui-btn--primary',
      () => { estado.hoja.paso = 1; pintarHoja(); }, !ok)];
  } else if (modo === 'rapido' && paso === 1) {
    botones = [boton('Atrás', 'ui-btn--ghost', () => { estado.hoja.paso = 0; pintarHoja(); })];
  } else if (modo === 'rapido') {
    botones = [
      boton('Atrás', 'ui-btn--ghost', () => { estado.hoja.paso = 1; pintarHoja(); }),
      boton('Guardar visita', 'ui-btn--primary', () => guardarHoja()),
    ];
  } else if (modo === 'ver') {
    botones = [boton('Cerrar', 'ui-btn--ghost', cerrarHoja)];
  } else {
    botones = [
      !esNueva && (esDueno(v) || esAdmin()) && boton('Eliminar', 'ui-btn--peligro', eliminarHoja),
      boton('Guardar', 'ui-btn--primary', () => guardarHoja()),
    ].filter(Boolean);
  }
  $('hojaPie').replaceChildren(...botones);
}

function pintarHoja() {
  const { modo, paso, esNueva } = estado.hoja;
  const titulos = ['El negocio', '¿Estaba el dueño?', 'Cómo salió'];
  const v = estado.hoja.v;
  $('hojaTitulo').textContent = modo === 'rapido' ? titulos[paso]
    : modo === 'ver' ? `Visita de ${nombreDe(v.vendedor, v.visitador)}`
      : (esNueva ? 'Ficha completa' : 'Editar visita');
  $('hojaPasos').textContent = modo === 'rapido' ? `PASO ${paso + 1} DE 3` : '';
  const cuerpo = modo === 'rapido' ? cuerpoRapido(paso) : modo === 'ver' ? cuerpoLectura() : cuerpoCompleto();
  $('hojaCuerpo').replaceChildren(...cuerpo.filter(Boolean));
  $('hojaCuerpo').scrollTop = 0;
  pintarRepetida();
  pintarSugerencias();
  pintarLugar();
  pintarPie();
  // Puerta nueva: directo a escribir el nombre del negocio.
  if (modo === 'rapido' && paso === 0 && !estado.hoja.v.negocio) {
    const primero = $('hojaCuerpo').querySelector('input');
    if (primero) primero.focus();
  }
}

async function guardar(v, mensaje) {
  const limpia = { ...v };
  delete limpia._rechazo;
  try {
    await guardarLocal(estado.cuenta.id, limpia);
  } catch {
    showToast('No se pudo guardar en el teléfono. Exporta lo que llevas antes de cerrar.', 'error', 8000);
    return;
  }
  if (v.municipio || v.colonia) {
    estado.config.ultimoMunicipio = v.municipio || estado.config.ultimoMunicipio;
    estado.config.ultimaColonia = v.colonia || '';
    guardarMeta('config', estado.config).catch(() => {});
  }
  cerrarHoja();
  showToast(mensaje, 'success', 2200);
  await recargar();
  programarSync();
}

function guardarRapida(decisor) {
  const v = estado.hoja.v;
  v.decisor = decisor;
  v.resultado = decisor === 'No quiso atender' ? 'No interesado' : 'Reagendar visita';
  guardar(v, 'Puerta registrada');
}

function guardarHoja() {
  const v = estado.hoja.v;
  if (!C.lista(v)) {
    showToast('Faltan negocio, giro y municipio.', 'error');
    return;
  }
  guardar(v, estado.hoja.esNueva ? 'Puerta registrada' : 'Guardado');
}

function eliminarHoja() {
  // eslint-disable-next-line no-alert
  if (!window.confirm('¿Eliminar esta visita? Deja de contar en el tablero.')) return;
  guardar({ ...estado.hoja.v, eliminada: true }, 'Eliminada');
}

/* ------------------------------------------------------------------
   Excel
   ------------------------------------------------------------------ */

function nombreArchivo() {
  const quien = esAdmin() ? 'equipo' : (estado.cuenta.nombre || 'vendedor');
  const slug = quien.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `bitacora-${slug}-${C.hoy()}.xlsx`;
}

function armarExcel() {
  // El vendedor exporta lo suyo y lo que le compartieron; el admin, todo.
  const cuenta = esAdmin() ? null : estado.cuenta.id;
  const visitas = vivas(cuenta ? suyas() : estado.visitas).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const bytes = X.libroBitacora({
    visitas,
    resumen: K.resumen(visitas, { cuenta }),
    alcance: esAdmin() ? 'Todo el equipo' : estado.cuenta.nombre,
    generado: C.fechaCorta(C.hoy()),
    columnas: C.COLUMNAS,
    numericos: C.NUMERICOS,
    metas: C.METAS,
  });
  return new File([bytes], nombreArchivo(), { type: X.MIME });
}

function descargarArchivo(archivo) {
  const url = URL.createObjectURL(archivo);
  const a = h('a', { href: url, download: archivo.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Al exportar, lo propio que ya terminó (cerrado, perdido, no interesado)
   se archiva: sale de "Activas" y sigue contando en el tablero. */
async function archivarTerminadas() {
  const hoy = C.hoy();
  const terminadas = vivas(mias()).filter((v) => !v.archivada && C.TERMINALES.has(v.resultado));
  for (const v of terminadas) {
    await guardarLocal(estado.cuenta.id, { ...v, archivada: true, f_exportado: hoy });
  }
  if (terminadas.length) {
    await recargar();
    programarSync(500);
  }
  return terminadas.length;
}

async function exportar(compartir) {
  let archivo;
  try {
    archivo = armarExcel();
  } catch {
    showToast('No se pudo generar el archivo.', 'error');
    return;
  }
  try {
    if (compartir && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: 'Bitácora de calle' });
      showToast('Compartido', 'success');
    } else {
      descargarArchivo(archivo);
      showToast('Excel descargado', 'success');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    descargarArchivo(archivo);
  }
  const n = await archivarTerminadas();
  if (n) showToast(`${n} visita(s) terminadas pasaron a Archivadas.`, 'info');
}

/* ------------------------------------------------------------------
   Sin conexión (service worker)
   ------------------------------------------------------------------ */

async function registrarSW(intento = 1) {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/bitacora/sw.js', { scope: '/bitacora/' });
  } catch {
    if (intento < 5) setTimeout(() => registrarSW(intento + 1), 3000 * intento);
  }
}

function revisarOffline() {
  const el = $('estadoOffline');
  const nota = $('notaOffline');
  const ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!ctrl) {
    el.textContent = 'No';
    nota.textContent = 'Ábrela una vez con señal y vuelve a revisar. Si sigue en No, ciérrala por completo y entra de nuevo.';
    return;
  }
  el.textContent = 'Revisando…';
  ctrl.postMessage('estado');
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.nueva && estado.cuenta) $('avisoVersion').hidden = false;
    if ('listo' in d) {
      $('estadoOffline').textContent = d.listo ? 'Sí' : 'No';
      $('notaOffline').textContent = d.listo
        ? 'Con esto en Sí, la app abre y captura aunque no haya señal.'
        : 'Ábrela una vez con señal y vuelve a revisar.';
    }
  });
}

/* ------------------------------------------------------------------
   Arranque
   ------------------------------------------------------------------ */

function pantallaInicio(titulo, textoAyuda, accion) {
  $('pantallaInicio').hidden = false;
  $('pantallaInicio').replaceChildren(h('div', { class: 'ui-empty' },
    h('p', { class: 'ui-empty__titulo', text: titulo }),
    h('p', { class: 'ui-empty__sub', text: textoAyuda }),
    accion));
}

async function obtenerCuenta() {
  const guardada = await leerMeta('cuenta');
  try {
    const actual = await yo();
    await guardarMeta('cuenta', actual);
    // Recién entró al pass y el teléfono no tiene sesión larga vigente
    // (nunca se pidió, caducó o la revocó un logout): se pide con la access.
    if (actual.sesion === 'pass' && !actual.dispositivo) {
      try {
        await pedirSesionDispositivo();
        actual.dispositivo = true;
      } catch { /* sigue con la del pass */ }
    }
    return { cuenta: actual, sinSesion: false };
  } catch (err) {
    if (err instanceof SinSesion) return { cuenta: guardada, sinSesion: true };
    if (err instanceof SinRed) return { cuenta: guardada, sinSesion: false, sinRed: true };
    return { cuenta: guardada, sinSesion: false, error: err };
  }
}

/* Lo que cambia entre admin y vendedor: a dónde lleva el logo, qué trae el
   menú del pass, la pestaña Equipo y el filtro por vendedor. */
function prepararPass() {
  const admin = esAdmin();
  const inicio = admin ? '/inicioAdmin' : '/invitations';
  $('volverPass').href = inicio;
  $('logoPass').href = inicio;
  $('logoTexto').textContent = admin ? 'ReservAI Admin' : 'ReservAI Ventas';
  for (const el of document.querySelectorAll('.js-admin-only')) el.hidden = !admin;
  setupAccountMenu({ account_name: estado.cuenta.nombre || estado.cuenta.correo, account_type: estado.cuenta.tipo });
  $('cabezaSub').textContent = admin
    ? 'Visitas en frío de todo el equipo de ventas'
    : 'Tus visitas en frío: captura, seguimiento y números';
  $('cabeza').hidden = false;
  $('tabs').querySelector('[data-tab="equipo"]').hidden = !admin;
  $('filtroVendedorCaja').hidden = !admin;
}

async function arrancar() {
  registrarSW();

  if (!(await disponible())) {
    pantallaInicio('Este navegador no deja guardar datos.',
      'Sin eso no se puede capturar sin señal. Sal del modo privado o usa Chrome / Safari normal.');
    return;
  }

  const r = await obtenerCuenta();
  if (!r.cuenta) {
    if (r.sinSesion) {
      window.location.href = '/login?return_to=%2Fbitacora%2F';
      return;
    }
    pantallaInicio('La primera vez necesitas señal.',
      'Ábrela con internet para entrar con tu cuenta del pass. Después funciona sin conexión.',
      h('button', { type: 'button', class: 'ui-btn ui-btn--primary', onclick: () => window.location.reload(), text: 'Reintentar' }));
    return;
  }
  if (r.cuenta.tipo !== 'seller' && r.cuenta.tipo !== 'admin') {
    pantallaInicio('Tu cuenta no usa la bitácora.', 'La bitácora es para el equipo de ventas.');
    return;
  }

  estado.cuenta = r.cuenta;
  estado.config = { ...estado.config, ...(await leerMeta('config', {})) };
  estado.sync = r.sinSesion ? 'sin-sesion' : r.sinRed ? 'sin-red' : 'al-dia';
  $('avisoSesion').hidden = !r.sinSesion;
  prepararPass();

  $('pantallaInicio').hidden = true;
  $('tabs').hidden = false;
  irA(window.location.pathname.startsWith('/bitacora/tablero') ? 'tablero' : 'hoy');
  await recargar();
  if (!r.sinSesion) sincronizarAhora();
  abrirDesdeProspeccion();
}

/* Prospección abre /bitacora/?prospecto=<id>: la visita nueva ya trae el
   negocio, su lugar y sus datos. Si alguien ya lo visitó, la hoja lo avisa. */
async function abrirDesdeProspeccion() {
  const url = new URL(window.location.href);
  const id = url.searchParams.get('prospecto');
  if (!id) return;
  url.searchParams.delete('prospecto');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  try {
    const data = await prospecto(id);
    irA('hoy');
    abrirHoja(null, C.desdeProspecto(data.prospecto));
  } catch (err) {
    showToast(err instanceof SinRed
      ? 'Sin señal: no se pudo traer el negocio de Prospección.'
      : 'No se encontró ese negocio en Prospección.', 'error', 5000);
  }
}

/* Eventos */

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) irA(b.dataset.tab);
});
$('btnRegistrar').addEventListener('click', () => abrirHoja(null));
$('btnRegistrarCabeza').addEventListener('click', () => abrirHoja(null));
$('btnExcelCabeza').addEventListener('click', () => exportar(false));
$('hojaCerrar').addEventListener('click', cerrarHoja);
$('velo').addEventListener('click', cerrarHoja);
for (const pill of document.querySelectorAll('.bt-sync')) {
  pill.addEventListener('click', () => {
    if (estado.sync === 'sin-sesion') {
      window.location.href = '/login?return_to=%2Fbitacora%2F';
      return;
    }
    sincronizarAhora();
  });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ir]');
  if (b) irA(b.dataset.ir);
});
$('segPeriodo').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dias]');
  if (!b) return;
  estado.periodo = Number(b.dataset.dias);
  pintarTablero();
});
$('filtroVendedor').addEventListener('change', (e) => {
  estado.vendedorFiltro = e.target.value;
  pintarTablero();
});
// Al cruzar el ancho de escritorio cambian las listas por tablas y viceversa.
escritorio.addEventListener('change', () => pintar());
$('segTodas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  estado.filtroTodas = b.dataset.filtro;
  pintarTodas();
});
$('segQuien').addEventListener('click', (e) => {
  const b = e.target.closest('[data-quien]');
  if (!b) return;
  estado.deQuien = b.dataset.quien;
  pintarTodas();
});
$('buscar').addEventListener('input', (e) => {
  estado.busqueda = e.target.value;
  pintarTodas();
});
$('btnCompartir').addEventListener('click', () => exportar(true));
$('btnDescargar').addEventListener('click', () => exportar(false));
$('inputMeta').addEventListener('change', (e) => {
  const n = Math.round(Number(e.target.value));
  if (!Number.isFinite(n) || n < 1 || n > 200) {
    e.target.value = estado.config.meta;
    return;
  }
  estado.config.meta = n;
  guardarMeta('config', estado.config).catch(() => {});
});
function salir(e) {
  if (e) e.preventDefault();
  const pendientes = estado.visitas.filter((v) => v._pendiente).length;
  // eslint-disable-next-line no-alert
  if (pendientes && !window.confirm(`Tienes ${pendientes} visita(s) sin subir. Si cierras sesión se quedan en este dispositivo hasta que vuelvas a entrar. ¿Cerrar de todos modos?`)) return;
  goLogout();
}
$('btnSalir').addEventListener('click', salir);
$('logout').addEventListener('click', salir);
$('btnActualizar').addEventListener('click', () => window.location.reload());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && estado.hoja) cerrarHoja();
});
window.addEventListener('online', () => sincronizarAhora());
window.addEventListener('offline', () => { estado.sync = 'sin-red'; pintarSync(); });
// Al volver a la pestaña o a la app. Algunos navegadores disparan el evento
// muchas veces seguidas: con una vuelta cada 30 s basta.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - ultimaSync > 30000) sincronizarAhora();
});
setInterval(() => sincronizarAhora(), 5 * 60 * 1000);

arrancar();
