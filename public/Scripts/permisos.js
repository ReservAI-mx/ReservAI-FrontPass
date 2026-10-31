import { apiJson, goLogout, requireAdminSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';
import { showToast } from './toast.js';

/**
 * /admin/permisos: el admin decide qué puede cada área (tipo de cuenta) en
 * cada herramienta interna y, por excepción, cada persona.
 * API: /api/permisos (Backend_PassManager). Cada servicio vuelve a revisar
 * el permiso en cada petición, así que un cambio aplica al momento.
 */

const session = requireAdminSession();

const NOMBRE_NIVEL = { ninguno: 'Sin acceso', ver: 'Ver', editar: 'Editar' };
const NOMBRE_AREA = { seller: 'Vendedores', client: 'Clientes', admin: 'Admins' };
const BUSCAR_MS = 250;

const estado = {
  herramientas: [],
  tiposCuenta: [],
  niveles: [],
  areas: new Map(), // `${herramienta}|${tipo}` → nivel
  excepciones: [],
  cuentaElegida: null,
};

const $ = (id) => document.getElementById(id);

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined) n.textContent = texto;
  return n;
}

function nombreArea(tipo) {
  return NOMBRE_AREA[tipo] || tipo;
}

function nombreHerramienta(clave) {
  const h = estado.herramientas.find((x) => x.clave === clave);
  return h ? h.nombre : clave;
}

function selectNivel(valor, etiqueta) {
  const s = el('select', 'pm-select');
  s.setAttribute('aria-label', etiqueta);
  for (const n of estado.niveles) {
    const o = el('option', '', NOMBRE_NIVEL[n] || n);
    o.value = n;
    s.appendChild(o);
  }
  s.value = valor;
  s.dataset.nivel = valor;
  return s;
}

function mensajeError(data, porDefecto) {
  const codigos = {
    tipo_cuenta_invalido: 'Esa área no existe.',
    nivel_invalido: 'Nivel no válido.',
    herramienta_desconocida: 'Esa herramienta no existe.',
    cuenta_no_existe: 'La cuenta ya no existe.',
    cuenta_es_admin: 'Los admins ya pueden todo.',
    sin_excepcion: 'Esa excepción ya no estaba.',
  };
  return codigos[data && data.error] || porDefecto;
}

// ---------- Carga ----------

async function cargar() {
  $('cargando').hidden = false;
  $('errorCarga').hidden = true;
  $('seccionAreas').hidden = true;
  $('seccionExcepciones').hidden = true;

  let r;
  try {
    r = await apiJson('/permisos');
  } catch {
    r = { ok: false, status: 0, data: {} };
  }
  $('cargando').hidden = true;
  if (!r.ok) {
    $('errorCargaTexto').textContent = r.status === 403
      ? 'Sólo un admin puede ver esta pantalla.'
      : 'Revisa tu conexión e intenta de nuevo.';
    $('errorCarga').hidden = false;
    return;
  }

  estado.herramientas = r.data.herramientas || [];
  estado.tiposCuenta = r.data.tipos_cuenta || [];
  estado.niveles = r.data.niveles || ['ninguno', 'ver', 'editar'];
  estado.areas = new Map((r.data.areas || []).map((a) => [`${a.herramienta}|${a.tipo_cuenta}`, a.nivel]));
  estado.excepciones = r.data.excepciones || [];

  pintarAreas();
  pintarFormulario();
  pintarExcepciones();
  $('seccionAreas').hidden = false;
  $('seccionExcepciones').hidden = false;
}

// ---------- Por área ----------

function pintarAreas() {
  const head = $('areasHead');
  while (head.children.length > 1) head.lastChild.remove();
  for (const tipo of estado.tiposCuenta) head.appendChild(el('th', '', nombreArea(tipo)));
  head.appendChild(el('th', 'pm-col-admin', 'Admins'));

  const body = $('areasBody');
  body.replaceChildren();
  for (const h of estado.herramientas) {
    const tr = el('tr');
    const th = el('th', '', h.nombre);
    th.scope = 'row';
    tr.appendChild(th);
    for (const tipo of estado.tiposCuenta) {
      const td = el('td');
      td.dataset.area = nombreArea(tipo); // etiqueta de la fila en el teléfono
      const nivel = estado.areas.get(`${h.clave}|${tipo}`) || 'ninguno';
      const s = selectNivel(nivel, `${h.nombre}: ${nombreArea(tipo)}`);
      s.addEventListener('change', () => cambiarArea(s, h.clave, tipo));
      td.appendChild(s);
      tr.appendChild(td);
    }
    const admin = el('td', 'pm-col-admin', 'Editar, siempre');
    admin.dataset.area = 'Admins';
    tr.appendChild(admin);
    body.appendChild(tr);
  }
}

async function cambiarArea(select, herramienta, tipo) {
  const anterior = select.dataset.nivel;
  const nivel = select.value;
  select.disabled = true;
  const r = await apiJson('/permisos/area', {
    method: 'PUT',
    body: { herramienta, tipo_cuenta: tipo, nivel },
  }).catch(() => ({ ok: false, data: {} }));
  select.disabled = false;
  if (!r.ok) {
    select.value = anterior;
    showToast(mensajeError(r.data, 'No se pudo guardar el permiso.'), 'error');
    return;
  }
  select.dataset.nivel = nivel;
  estado.areas.set(`${herramienta}|${tipo}`, nivel);
  showToast(`${nombreArea(tipo)} en ${nombreHerramienta(herramienta)}: ${NOMBRE_NIVEL[nivel]}. Guardado.`, 'success');
}

// ---------- Excepciones ----------

function pintarFormulario() {
  const sh = $('nuevaHerramienta');
  sh.replaceChildren();
  for (const h of estado.herramientas) {
    const o = el('option', '', h.nombre);
    o.value = h.clave;
    sh.appendChild(o);
  }
  const sn = $('nuevoNivel');
  sn.replaceChildren();
  for (const n of estado.niveles) {
    const o = el('option', '', NOMBRE_NIVEL[n] || n);
    o.value = n;
    sn.appendChild(o);
  }
  sn.value = 'ver';
}

function pintarExcepciones() {
  const lista = $('listaExcepciones');
  lista.replaceChildren();
  $('sinExcepciones').hidden = estado.excepciones.length > 0;

  for (const x of estado.excepciones) {
    const li = el('li', 'pm-item');

    const quien = el('div', 'pm-item__quien');
    quien.appendChild(el('span', 'pm-item__nombre', x.name));
    quien.appendChild(el('span', 'pm-item__correo', x.email));
    li.appendChild(quien);

    li.appendChild(el('span', 'pm-chip', nombreArea(x.type)));
    li.appendChild(el('span', 'pm-item__herr', nombreHerramienta(x.herramienta)));

    const nivelArea = estado.areas.get(`${x.herramienta}|${x.type}`) || 'ninguno';
    const s = selectNivel(x.nivel, `${x.name} en ${nombreHerramienta(x.herramienta)}`);
    s.addEventListener('change', () => cambiarExcepcion(s, x));
    li.appendChild(s);

    li.appendChild(el('span', 'pm-item__area', `Su área: ${NOMBRE_NIVEL[nivelArea]}`));

    const quitar = el('button', 'ui-icon-btn ui-icon-btn--sm pm-item__quitar');
    quitar.type = 'button';
    quitar.title = 'Quitar excepción';
    quitar.setAttribute('aria-label', `Quitar la excepción de ${x.name}`);
    quitar.appendChild(iconoX());
    quitar.addEventListener('click', () => quitarExcepcion(quitar, x));
    li.appendChild(quitar);

    lista.appendChild(li);
  }
}

function iconoX() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M6.5 6.5l11 11M17.5 6.5l-11 11');
  svg.appendChild(p);
  return svg;
}

async function guardarExcepcion(herramienta, account_id, nivel) {
  return apiJson('/permisos/cuenta', {
    method: 'PUT',
    body: { herramienta, account_id, nivel },
  }).catch(() => ({ ok: false, data: {} }));
}

async function cambiarExcepcion(select, x) {
  const anterior = select.dataset.nivel;
  select.disabled = true;
  const r = await guardarExcepcion(x.herramienta, x.account_id, select.value);
  select.disabled = false;
  if (!r.ok) {
    select.value = anterior;
    showToast(mensajeError(r.data, 'No se pudo guardar la excepción.'), 'error');
    return;
  }
  select.dataset.nivel = select.value;
  x.nivel = select.value;
  showToast(`${x.name}: ${NOMBRE_NIVEL[x.nivel]}. Guardado.`, 'success');
}

async function quitarExcepcion(boton, x) {
  boton.disabled = true;
  const r = await apiJson('/permisos/cuenta', {
    method: 'DELETE',
    body: { herramienta: x.herramienta, account_id: x.account_id },
  }).catch(() => ({ ok: false, data: {} }));
  boton.disabled = false;
  if (!r.ok && r.status !== 404) {
    showToast(mensajeError(r.data, 'No se pudo quitar la excepción.'), 'error');
    return;
  }
  estado.excepciones = estado.excepciones.filter((e) => e !== x);
  pintarExcepciones();
  showToast(`${x.name} vuelve a lo de su área.`, 'success');
}

// ---------- Buscar cuenta ----------

let temporizador = null;
let ultimaBusqueda = 0;

function cerrarSugerencias() {
  $('sugerencias').hidden = true;
  $('buscarCuenta').setAttribute('aria-expanded', 'false');
}

function elegirCuenta(c) {
  estado.cuentaElegida = c;
  $('buscarCuenta').value = `${c.name} (${c.email})`;
  cerrarSugerencias();
}

async function buscarCuentas(texto) {
  const id = ++ultimaBusqueda;
  const r = await apiJson(`/permisos/cuentas?buscar=${encodeURIComponent(texto)}`).catch(() => ({ ok: false }));
  if (id !== ultimaBusqueda) return; // llegó una búsqueda más nueva
  const ul = $('sugerencias');
  ul.replaceChildren();
  const cuentas = r.ok ? r.data.cuentas || [] : [];
  if (!cuentas.length) {
    ul.appendChild(el('li', 'pm-sugerencias__vacio', r.ok ? 'Sin resultados' : 'No se pudo buscar'));
  }
  for (const c of cuentas) {
    const li = el('li', 'pm-sugerencias__item');
    li.setAttribute('role', 'option');
    li.tabIndex = -1;
    li.appendChild(el('span', 'pm-item__nombre', c.name));
    li.appendChild(el('span', 'pm-item__correo', `${c.email} · ${nombreArea(c.type)}`));
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      elegirCuenta(c);
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        elegirCuenta(c);
        $('nuevoNivel').focus();
      }
    });
    ul.appendChild(li);
  }
  ul.hidden = false;
  $('buscarCuenta').setAttribute('aria-expanded', 'true');
}

function enlazarBuscador() {
  const input = $('buscarCuenta');
  input.addEventListener('input', () => {
    estado.cuentaElegida = null;
    clearTimeout(temporizador);
    const texto = input.value.trim();
    if (!texto) {
      cerrarSugerencias();
      return;
    }
    temporizador = setTimeout(() => buscarCuentas(texto), BUSCAR_MS);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      const primero = $('sugerencias').querySelector('[role="option"]');
      if (primero) {
        e.preventDefault();
        primero.focus();
      }
    } else if (e.key === 'Escape') {
      cerrarSugerencias();
    }
  });
  $('sugerencias').addEventListener('keydown', (e) => {
    const actual = document.activeElement;
    if (e.key === 'ArrowDown' && actual.nextElementSibling) {
      e.preventDefault();
      actual.nextElementSibling.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (actual.previousElementSibling || input).focus();
    } else if (e.key === 'Escape') {
      cerrarSugerencias();
      input.focus();
    }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (!$('sugerencias').contains(document.activeElement)) cerrarSugerencias();
  }, 120));

  $('formExcepcion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = estado.cuentaElegida;
    if (!c) {
      showToast('Elige una cuenta de la lista.', 'warning');
      input.focus();
      return;
    }
    const herramienta = $('nuevaHerramienta').value;
    const nivel = $('nuevoNivel').value;
    const boton = $('agregarExcepcion');
    boton.disabled = true;
    const r = await guardarExcepcion(herramienta, c.id, nivel);
    boton.disabled = false;
    if (!r.ok) {
      showToast(mensajeError(r.data, 'No se pudo guardar la excepción.'), 'error');
      return;
    }
    estado.excepciones = estado.excepciones.filter(
      (x) => !(x.account_id === c.id && x.herramienta === herramienta)
    );
    estado.excepciones.push({
      herramienta, account_id: c.id, name: c.name, email: c.email, type: c.type, nivel,
    });
    estado.excepciones.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    pintarExcepciones();
    input.value = '';
    estado.cuentaElegida = null;
    showToast(`${c.name}: ${NOMBRE_NIVEL[nivel]} en ${nombreHerramienta(herramienta)}. Guardado.`, 'success');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!session) return;
  setupAccountMenu(session);
  $('logout').addEventListener('click', (e) => {
    e.preventDefault();
    goLogout();
  });
  $('reintentar').addEventListener('click', cargar);
  enlazarBuscador();
  cargar();
});
