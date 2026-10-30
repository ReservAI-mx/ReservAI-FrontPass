import { showToast } from '../toast.js';
import { visitasDe, guardarLocal, leerMeta, guardarMeta, disponible } from './store.js';
import { sincronizar, yo, pedirSesionDispositivo, SinSesion, SinRed } from './sync.js';

const C = globalThis.BitacoraCampos;
const K = globalThis.BitacoraCalculos;
const X = globalThis.BitacoraExcel;

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------
   Estado
   ------------------------------------------------------------------ */

const estado = {
  cuenta: null,          // { id, nombre, correo, tipo, sesion }
  visitas: [],           // copia local de esta cuenta
  config: { meta: 20, ultimoMunicipio: '', ultimaColonia: '' },
  tab: 'hoy',
  filtroTodas: 'activas',
  busqueda: '',
  sync: 'revisando',
  sincronizando: false,
  hoja: null,            // { v, modo: 'rapido'|'completo', paso, esNueva }
};

const esAdmin = () => estado.cuenta && estado.cuenta.tipo === 'admin';

/* Las que capturó esta cuenta. Las recién creadas aún no traen vendedor. */
const mias = () => estado.visitas.filter((v) => !v.vendedor || v.vendedor === estado.cuenta.id);
const vivas = (lista) => lista.filter((v) => !v.eliminada);

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
  $('syncPill').dataset.estado = e;
  $('syncTexto').textContent = texto;
}

let relojSync = null;
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

function item(v, { fecha = false, seguimiento = false, vendedor = false } = {}) {
  const etiqueta = v.resultado || (v.decisor && v.decisor !== 'Sí' ? 'Sin decisor' : 'Sin cerrar');
  const meta = [
    fecha && C.fechaCorta(v.fecha),
    vendedor && v.visitador,
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
    v._rechazo && h('span', { class: 'bt-item__aviso bt-item__aviso--error', text: `No se subió: ${v._rechazo}` }),
    !v._rechazo && v._pendiente && h('span', { class: 'bt-item__aviso', text: 'Por subir' }));
}

function vacio(titulo, texto) {
  return h('div', { class: 'bt-vacio' }, h('strong', { text: titulo }), texto);
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

  const r = K.resumen(propias);
  const kpi = (label, num) => h('div', { class: 'ui-kpi' },
    h('span', { class: 'ui-kpi__label', text: label }), h('span', { class: 'ui-kpi__num', text: num }));
  $('kpisHoy').replaceChildren(
    kpi('Puertas', r.puertas), kpi('Demos', r.demos), kpi('Propuestas', r.propuestas), kpi('Cerrados', r.cerrados));

  $('tituloHoy').textContent = `Hoy · ${deHoy.length}`;
  // La más reciente arriba.
  const lista = deHoy.slice().sort((a, b) => String(b.creado_en || '').localeCompare(String(a.creado_en || '')));
  $('listaHoy').replaceChildren(...(lista.length
    ? lista.map((v) => item(v))
    : [vacio('Todavía no tocas ninguna.',
      'Registra cada puerta, también las que no te abrieron. Los “no” son los que hacen que los números sirvan.')]));
}

function pintarSeguir() {
  const lista = K.porSeguir(mias());
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
  const todas = estado.visitas;
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
  const textos = {
    activas: ['Sin visitas activas.', 'Empieza en la pestaña Hoy.'],
    pendientes: ['Todo subido.', 'Lo que captures sin señal aparece aquí hasta que suba.'],
    archivadas: ['Nada archivado.', 'Las visitas cerradas o descartadas se archivan al exportar el Excel.'],
  };
  $('listaTodas').replaceChildren(...(lista.length
    ? lista.map((v) => item(v, { fecha: true, vendedor: esAdmin() }))
    : [vacio(...textos[estado.filtroTodas])]));
}

function tabla(titulos, filas, numericas = []) {
  return h('div', { class: 'bt-scroll' }, h('table', { class: 'bt-tabla' },
    h('thead', {}, h('tr', {}, titulos.map((t, i) => h('th', { class: numericas.includes(i) ? 'n' : null, text: t })))),
    h('tbody', {}, filas.map((f) => h('tr', {}, f.map((c, i) => {
      const celda = c && typeof c === 'object' && !(c instanceof Node) ? c : { v: c };
      return h('td', { class: [numericas.includes(i) ? 'n' : '', celda.clase || ''].join(' ').trim() || null }, celda.v);
    }))))));
}

function pintarTablero() {
  const visitas = vivas(estado.visitas);
  const r = K.resumen(visitas);
  $('tableroAlcance').textContent = `${esAdmin() ? 'Todo el equipo' : estado.cuenta.nombre} · ${r.puertas} visitas`;

  const etapa = (nombre, n, conv, meta) => {
    const dif = conv - meta;
    return [nombre, n, pct(conv), pct(meta), { v: `${dif >= 0 ? '+' : '−'}${pct(Math.abs(dif))}`, clase: dif >= 0 ? 'arriba' : 'abajo' }];
  };
  const desglose = (titulo, clave, grupos, conMrr) => [
    h('h3', { class: 'bt-subtitulo', text: titulo }),
    grupos.length
      ? tabla(conMrr ? [clave, 'Puertas', 'Demos', 'Cerr.', 'Cierre', 'MRR'] : [clave, 'Puertas', 'Demos', 'Cerr.', 'Cierre'],
        grupos.map((g) => [g.clave, g.n, g.demos, g.cerrados, pct(g.tasa)].concat(conMrr ? [dinero(g.mrr)] : [])),
        conMrr ? [1, 2, 3, 4, 5] : [1, 2, 3, 4])
      : h('p', { class: 'bt-nota', text: 'Sin datos todavía.' }),
  ];
  const reparto = (titulo, clave, columna, grupos) => [
    h('h3', { class: 'bt-subtitulo', text: titulo }),
    grupos.length
      ? tabla([clave, columna, '% del total'], grupos.map((g) => [g.clave, g.n, pct(g.parte)]), [1, 2])
      : h('p', { class: 'bt-nota', text: 'Sin datos todavía.' }),
  ];

  $('tablero').replaceChildren(
    h('h3', { class: 'bt-subtitulo', text: 'El embudo' }),
    tabla(['Etapa', 'N', 'Conv', 'Meta', 'Dif.'], [
      ['Puertas tocadas', r.puertas, '', '', ''],
      etapa('Decisor presente', r.decisor, r.conv.decisor, C.METAS.decisor),
      etapa('Demos', r.demos, r.conv.demo, C.METAS.demo),
      etapa('Propuestas', r.propuestas, r.conv.propuesta, C.METAS.propuesta),
      etapa('Cerrados', r.cerrados, r.conv.cierre, C.METAS.cierre),
    ], [1, 2, 3, 4]),
    h('p', { class: 'bt-nota', text: 'Las metas son supuestos de venta en frío, no datos de ReservAI. Cámbialas cuando tengas unas 200 visitas propias.' }),
    h('h3', { class: 'bt-subtitulo', text: 'Indicadores' }),
    tabla(['Indicador', 'Valor'], [
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
    ], [1]),
    ...(r.porVendedor.length > 1 ? desglose('Por vendedor', 'Vendedor', r.porVendedor, true) : []),
    ...desglose('Por giro de negocio', 'Giro', r.porGiro),
    ...desglose('Por municipio', 'Municipio', r.porMunicipio),
    ...desglose('Por franja horaria', 'Franja', r.porFranja),
    ...reparto('Objeciones que más aparecen', 'Objeción', 'Casos', r.porObjecion),
    ...reparto('Qué sistema usan hoy', 'Sistema', 'Negocios', r.porSistema),
    ...reparto('Estado de cada visita', 'Resultado', 'Visitas', r.porResultado),
    ...reparto('Motivos de pérdida', 'Motivo', 'Visitas', r.porPerdida),
  );
}

function pintarAjustes() {
  $('inputMeta').value = estado.config.meta;
  $('cuentaNombre').textContent = estado.cuenta.nombre || estado.cuenta.correo || '';
  $('cuentaPapel').textContent = esAdmin() ? 'Administrador' : 'Vendedor';
  $('cuentaSesion').textContent = estado.cuenta.sesion === 'dispositivo' || estado.cuenta.dispositivo
    ? 'Guardada (30 días)'
    : estado.sync === 'sin-sesion' ? 'Terminada' : 'Activa';
}

function pintar() {
  if (!estado.cuenta) return;
  pintarSync();
  ({ hoy: pintarHoy, seguir: pintarSeguir, todas: pintarTodas, tablero: pintarTablero, ajustes: pintarAjustes })[estado.tab]();
}

function irA(tab) {
  estado.tab = tab;
  for (const sec of document.querySelectorAll('.bt-panel')) sec.hidden = sec.id !== `tab-${tab}`;
  for (const b of $('tabs').querySelectorAll('.bt-tab')) b.classList.toggle('is-active', b.dataset.tab === tab);
  if (tab === 'ajustes') revisarOffline();
  pintar();
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------
   Hoja de captura
   ------------------------------------------------------------------ */

function abrirHoja(visita) {
  if (visita) {
    const copia = { ...visita };
    estado.hoja = { v: copia, modo: 'completo', paso: 0, esNueva: false };
  } else {
    const v = C.nuevaVisita({
      visitador: estado.cuenta.nombre,
      ultimoMunicipio: estado.config.ultimoMunicipio,
      ultimaColonia: estado.config.ultimaColonia,
    });
    estado.hoja = { v, modo: 'rapido', paso: 0, esNueva: true };
  }
  $('hoja').hidden = false;
  document.body.style.overflow = 'hidden';
  pintarHoja();
}

function cerrarHoja() {
  estado.hoja = null;
  $('hoja').hidden = true;
  document.body.style.overflow = '';
}

function set(clave, valor) {
  estado.hoja.v[clave] = valor;
  if (estado.hoja.modo === 'rapido' && estado.hoja.paso === 0) pintarPie();
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
  } else {
    botones = [
      !esNueva && boton('Eliminar', 'ui-btn--peligro', eliminarHoja),
      boton('Guardar', 'ui-btn--primary', () => guardarHoja()),
    ].filter(Boolean);
  }
  $('hojaPie').replaceChildren(...botones);
}

function pintarHoja() {
  const { modo, paso, esNueva } = estado.hoja;
  const titulos = ['El negocio', '¿Estaba el dueño?', 'Cómo salió'];
  $('hojaTitulo').textContent = modo === 'rapido' ? titulos[paso] : (esNueva ? 'Ficha completa' : 'Editar visita');
  $('hojaPasos').textContent = modo === 'rapido' ? `PASO ${paso + 1} DE 3` : '';
  $('hojaCuerpo').replaceChildren(...(modo === 'rapido' ? cuerpoRapido(paso) : cuerpoCompleto()).filter(Boolean));
  $('hojaCuerpo').scrollTop = 0;
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
  const visitas = vivas(estado.visitas).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const bytes = X.libroBitacora({
    visitas,
    resumen: K.resumen(visitas),
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
  $('volverPass').href = esAdmin() ? '/inicioAdmin' : '/invitations';

  $('pantallaInicio').hidden = true;
  $('tabs').hidden = false;
  irA(window.location.pathname.startsWith('/bitacora/tablero') ? 'tablero' : 'hoy');
  await recargar();
  if (!r.sinSesion) sincronizarAhora();
}

/* Eventos */

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) irA(b.dataset.tab);
});
$('btnRegistrar').addEventListener('click', () => abrirHoja(null));
$('hojaCerrar').addEventListener('click', cerrarHoja);
$('syncPill').addEventListener('click', () => {
  if (estado.sync === 'sin-sesion') {
    window.location.href = '/login?return_to=%2Fbitacora%2F';
    return;
  }
  sincronizarAhora();
});
$('segTodas').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtro]');
  if (!b) return;
  estado.filtroTodas = b.dataset.filtro;
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
$('btnSalir').addEventListener('click', () => {
  const pendientes = estado.visitas.filter((v) => v._pendiente).length;
  // eslint-disable-next-line no-alert
  if (pendientes && !window.confirm(`Tienes ${pendientes} visita(s) sin subir. Si cierras sesión se quedan en este teléfono hasta que vuelvas a entrar. ¿Cerrar de todos modos?`)) return;
  window.location.href = '/api/logout';
});
$('btnActualizar').addEventListener('click', () => window.location.reload());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && estado.hoja) cerrarHoja();
});
window.addEventListener('online', () => sincronizarAhora());
window.addEventListener('offline', () => { estado.sync = 'sin-red'; pintarSync(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sincronizarAhora();
});
setInterval(() => sincronizarAhora(), 5 * 60 * 1000);

arrancar();
