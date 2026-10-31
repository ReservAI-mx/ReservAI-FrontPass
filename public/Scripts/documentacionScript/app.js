import { apiJson, goLogout, requireUiSession } from '../api.js';
import { setupAccountMenu } from '../accountMenu.js';
import { showToast } from '../toast.js';
import { Lienzo } from './lienzo.js';

/**
 * /documentacion/: lista de proyectos y editor de diagramas de Doc visual.
 * API: /api/documentacion (reservai-documentacion-service). Lo que cada quien
 * puede hacer lo decide el admin en /admin/permisos; aquí sólo se esconde lo
 * que el servicio igual rechazaría.
 */

const M = globalThis.DocModelo;
const session = requireUiSession();
const $ = (id) => document.getElementById(id);

const AUTOGUARDADO_MS = 2500;
const HISTORIAL_MAX = 60;
const NOMBRE_ESTADO = {
  'TO DO': 'Por hacer', 'IN PROGRESS': 'En curso', 'ON HOLD': 'En pausa', TESTING: 'Pruebas', COMPLETE: 'Listo',
};
const NOMBRE_ATRIBUTO = { text: 'Texto', textarea: 'Texto largo', tags: 'Etiquetas', kv: 'Clave-valor', json: 'JSON', table: 'Tabla' };

const estado = {
  yo: null,
  puedeEditar: false,
  proyectos: [],
  filtro: '',
  // Editor
  slug: null,
  version: 0,
  doc: null,
  pila: [],            // diagramas abiertos, de la raíz al actual
  sucio: false,
  guardando: false,
  conflicto: false,
  temporizador: null,
  deshacer: [],
  rehacer: [],
  nodoInspector: null,
};

let lienzo = null;

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined && texto !== null) n.textContent = texto;
  return n;
}

function fecha(valor) {
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return '';
  return f.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function diagramaActual() {
  return estado.doc.diagrams[estado.pila[estado.pila.length - 1]];
}

function idActual() {
  return estado.pila[estado.pila.length - 1];
}

/* ==================================================================
   Arranque
   ================================================================== */

async function arrancar() {
  setupAccountMenu(session);
  const admin = session.account_type === 'admin';
  for (const n of document.querySelectorAll('.js-admin-only')) n.hidden = !admin;
  for (const n of document.querySelectorAll('.js-no-admin')) n.hidden = admin;
  $('logout').addEventListener('click', (e) => {
    e.preventDefault();
    goLogout();
  });

  const r = await apiJson('/documentacion/yo').catch(() => ({ ok: false, status: 0, data: {} }));
  $('cargando').hidden = true;
  if (!r.ok) {
    mostrarVacio('No se pudo abrir Documentación', 'Revisa tu conexión e intenta de nuevo.', true);
    return;
  }
  estado.yo = r.data;
  estado.puedeEditar = r.data.nivel === 'editar';
  if (r.data.nivel === 'ninguno') {
    mostrarVacio('No tienes acceso a Documentación', 'Pídele a un admin que te dé permiso en Permisos.', false);
    return;
  }
  for (const n of document.querySelectorAll('.js-editar')) n.hidden = !estado.puedeEditar;

  enlazarLista();
  enlazarEditor();
  window.addEventListener('popstate', rutear);
  window.addEventListener('beforeunload', (e) => {
    if (estado.sucio || estado.guardando) e.preventDefault();
  });
  rutear();
}

function mostrarVacio(titulo, sub, reintentar) {
  $('vacioTitulo').textContent = titulo;
  $('vacioSub').textContent = sub;
  $('vacioReintentar').hidden = !reintentar;
  $('vacio').hidden = false;
}

function rutear() {
  const slug = new URLSearchParams(window.location.search).get('p');
  if (slug && M.slugValido(slug)) abrirProyecto(slug);
  else mostrarLista();
}

function irA(slug) {
  const url = slug ? `/documentacion/?p=${encodeURIComponent(slug)}` : '/documentacion/';
  history.pushState(null, '', url);
  rutear();
}

/* ==================================================================
   Lista de proyectos
   ================================================================== */

function enlazarLista() {
  $('buscarProyecto').addEventListener('input', (e) => {
    estado.filtro = e.target.value.trim().toLowerCase();
    pintarLista();
  });
  $('nuevoProyecto').addEventListener('click', () => abrirDialogoNuevo());
  $('importarProyecto').addEventListener('click', () => $('archivoImportar').click());
  $('archivoImportar').addEventListener('change', importar);
  $('vacioReintentar').addEventListener('click', () => window.location.reload());

  const nombre = $('nuevoNombre');
  const slug = $('nuevoSlug');
  nombre.addEventListener('input', () => {
    if (!slug.dataset.tocado) slug.value = M.slugDesdeNombre(nombre.value);
  });
  slug.addEventListener('input', () => {
    slug.dataset.tocado = '1';
  });
  $('formNuevo').addEventListener('submit', crearProyecto);
  $('cancelarNuevo').addEventListener('click', () => $('dlgNuevo').close());
  $('cancelarBorrar').addEventListener('click', () => $('dlgBorrar').close());
}

async function mostrarLista() {
  if (estado.slug && (estado.sucio || estado.guardando)) await guardarYa();
  cerrarEditor();
  document.body.classList.remove('dv--editor');
  $('vistaEditor').hidden = true;
  $('vistaLista').hidden = false;
  document.title = 'ReservAI - Documentación';
  await cargarLista();
}

async function cargarLista() {
  $('listaCargando').hidden = false;
  const r = await apiJson('/documentacion/proyectos').catch(() => ({ ok: false, data: {} }));
  $('listaCargando').hidden = true;
  if (!r.ok) {
    $('listaError').textContent = 'No se pudo cargar la lista de proyectos.';
    return;
  }
  $('listaError').textContent = '';
  estado.proyectos = r.data.proyectos || [];
  pintarLista();
}

function pintarLista() {
  const ul = $('listaProyectos');
  ul.replaceChildren();
  const f = estado.filtro;
  const visibles = estado.proyectos.filter((p) => !f
    || p.nombre.toLowerCase().includes(f) || p.slug.includes(f) || (p.descripcion || '').toLowerCase().includes(f));
  $('totalProyectos').textContent = String(estado.proyectos.length);
  $('totalProyectos').hidden = estado.proyectos.length === 0;

  $('listaVacia').hidden = visibles.length > 0;
  $('listaVaciaTitulo').textContent = estado.proyectos.length ? 'Ningún proyecto coincide' : 'Todavía no hay proyectos';
  $('listaVaciaSub').textContent = estado.proyectos.length
    ? 'Prueba con otra búsqueda.'
    : estado.puedeEditar ? 'Crea uno o importa el JSON de la versión local.' : 'Cuando alguien cree uno, aparecerá aquí.';

  for (const p of visibles) {
    const li = el('li', 'dv-tarjeta');
    const a = el('a', 'dv-tarjeta__abrir');
    a.href = `/documentacion/?p=${encodeURIComponent(p.slug)}`;
    a.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      irA(p.slug);
    });
    a.appendChild(el('span', 'dv-tarjeta__nombre', p.nombre || p.slug));
    a.appendChild(el('span', 'dv-tarjeta__desc', p.descripcion || 'Sin descripción'));
    const pie = el('span', 'dv-tarjeta__pie');
    pie.appendChild(el('span', 'dv-tarjeta__slug', p.slug));
    pie.appendChild(el('span', '', `${p.actualizado_por ? `${p.actualizado_por} · ` : ''}${fecha(p.actualizado_en)}`));
    a.appendChild(pie);
    li.appendChild(a);

    if (estado.puedeEditar) {
      const borrar = el('button', 'ui-icon-btn ui-icon-btn--sm dv-tarjeta__borrar');
      borrar.type = 'button';
      borrar.title = 'Eliminar proyecto';
      borrar.setAttribute('aria-label', `Eliminar ${p.nombre || p.slug}`);
      borrar.appendChild(icono('M5.5 7h13M10 7V5h4v2M7.5 7l.75 12h7.5L16.5 7'));
      borrar.addEventListener('click', () => confirmarBorrar(p));
      li.appendChild(borrar);
    }
    ul.appendChild(li);
  }
}

function icono(d) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d);
  s.appendChild(p);
  return s;
}

function abrirDialogoNuevo() {
  $('nuevoNombre').value = '';
  $('nuevoSlug').value = '';
  delete $('nuevoSlug').dataset.tocado;
  $('nuevoError').textContent = '';
  $('dlgNuevo').showModal();
  $('nuevoNombre').focus();
}

async function crearProyecto(e) {
  e.preventDefault();
  const nombre = $('nuevoNombre').value.trim();
  const slug = $('nuevoSlug').value.trim();
  if (!M.slugValido(slug)) {
    $('nuevoError').textContent = 'El identificador sólo admite minúsculas, números, guion y guion bajo.';
    return;
  }
  $('crearNuevo').disabled = true;
  const r = await apiJson('/documentacion/proyectos', { method: 'POST', body: { slug, nombre } })
    .catch(() => ({ ok: false, data: {} }));
  $('crearNuevo').disabled = false;
  if (!r.ok) {
    $('nuevoError').textContent = r.data.error === 'slug_existe'
      ? 'Ya hay un proyecto con ese identificador.'
      : 'No se pudo crear el proyecto.';
    return;
  }
  $('dlgNuevo').close();
  showToast('Proyecto creado.', 'success');
  irA(slug);
}

async function importar(e) {
  const archivo = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  let documento;
  try {
    documento = JSON.parse(await archivo.text());
  } catch {
    showToast('Ese archivo no es un JSON válido.', 'error');
    return;
  }
  // El nombre del archivo de la versión local era el slug: data/<slug>.json
  const slug = M.slugDesdeNombre(archivo.name.replace(/\.json$/i, ''));
  if (!M.slugValido(slug)) {
    showToast('No se pudo sacar un identificador del nombre del archivo.', 'error');
    return;
  }
  const r = await apiJson('/documentacion/proyectos', { method: 'POST', body: { slug, documento } })
    .catch(() => ({ ok: false, data: {} }));
  if (r.ok) {
    showToast(`Importado como "${slug}".`, 'success');
    irA(slug);
    return;
  }
  if (r.status === 409) showToast(`Ya hay un proyecto "${slug}". Renombra el archivo e intenta de nuevo.`, 'error');
  else if (r.status === 413) showToast('El archivo es demasiado grande (máximo 5 MB).', 'error');
  else if (r.status === 422) showToast(`El JSON no es un proyecto válido: ${(r.data.errores || [])[0] || ''}`, 'error', 7000);
  else showToast('No se pudo importar.', 'error');
}

function confirmarBorrar(p) {
  $('borrarNombre').textContent = p.nombre || p.slug;
  const btn = $('confirmarBorrar');
  btn.onclick = async () => {
    btn.disabled = true;
    const r = await apiJson(`/documentacion/proyectos/${encodeURIComponent(p.slug)}`, { method: 'DELETE', body: {} })
      .catch(() => ({ ok: false }));
    btn.disabled = false;
    $('dlgBorrar').close();
    if (!r.ok && r.status !== 404) {
      showToast('No se pudo eliminar.', 'error');
      return;
    }
    showToast('Proyecto eliminado.', 'success');
    cargarLista();
  };
  $('dlgBorrar').showModal();
}

/* ==================================================================
   Editor
   ================================================================== */

function enlazarEditor() {
  lienzo = new Lienzo($('lienzo'), {
    onSeleccion: alSeleccionar,
    onMover: (ids, dx, dy) => cambiar(M.moverNodos(estado.doc, idActual(), ids, dx, dy)),
    onConectar: (o, po, d, pd) => {
      const nuevo = M.conectar(estado.doc, idActual(), o, po, d, pd);
      if (nuevo) cambiar(nuevo);
      else repintar();
    },
    onAbrir: entrarAHijo,
    onViewport: (vp) => {
      // La vista viaja con el siguiente guardado, pero sola no guarda: si
      // no, dos personas que sólo miran el mismo proyecto chocarían por
      // versión cada vez que una mueve el lienzo.
      diagramaActual().viewport = vp;
    },
    onSoltarTipo: (tipo, punto) => agregar(tipo, punto),
  });

  pintarPaleta();
  $('volverLista').addEventListener('click', () => irA(null));
  $('deshacer').addEventListener('click', deshacer);
  $('rehacer').addEventListener('click', rehacer);
  $('encuadrar').addEventListener('click', () => lienzo.encuadrar());
  $('alejar').addEventListener('click', () => lienzo.acercar(1 / 1.2));
  $('acercar').addEventListener('click', () => lienzo.acercar(1.2));
  $('exportarJson').addEventListener('click', exportarJson);
  $('recargarConflicto').addEventListener('click', () => abrirProyecto(estado.slug, true));
  $('sobrescribirConflicto').addEventListener('click', sobrescribir);

  const titulo = $('tituloProyecto');
  titulo.addEventListener('change', () => {
    const nombre = titulo.value.trim();
    if (!nombre) {
      titulo.value = estado.doc.meta.name;
      return;
    }
    const nuevo = M.clonar(estado.doc);
    nuevo.meta.name = nombre;
    cambiar(nuevo);
  });

  enlazarInspector();
  document.addEventListener('keydown', teclado);
}

function cerrarEditor() {
  clearTimeout(estado.temporizador);
  Object.assign(estado, {
    slug: null, doc: null, version: 0, pila: [], sucio: false, conflicto: false,
    deshacer: [], rehacer: [], nodoInspector: null,
  });
  $('inspector').hidden = true;
  $('bannerConflicto').hidden = true;
}

async function abrirProyecto(slug, forzar) {
  if (!forzar && estado.slug === slug && estado.doc) return;
  if (estado.slug && estado.slug !== slug && (estado.sucio || estado.guardando)) await guardarYa();
  $('vistaLista').hidden = true;
  $('vistaEditor').hidden = false;
  document.body.classList.add('dv--editor');
  $('editorCargando').hidden = false;
  const r = await apiJson(`/documentacion/proyectos/${encodeURIComponent(slug)}`).catch(() => ({ ok: false, data: {} }));
  $('editorCargando').hidden = true;
  if (!r.ok) {
    showToast(r.status === 404 ? 'Ese proyecto no existe o fue eliminado.' : 'No se pudo abrir el proyecto.', 'error');
    irA(null);
    return;
  }
  cerrarEditor();
  estado.slug = slug;
  estado.version = r.data.version;
  estado.doc = r.data.documento;
  estado.pila = [estado.doc.rootDiagramId];
  document.title = `ReservAI - ${estado.doc.meta.name}`;
  $('tituloProyecto').value = estado.doc.meta.name;
  $('tituloProyecto').readOnly = !estado.puedeEditar;
  $('modoLectura').hidden = estado.puedeEditar;
  pintarGuardado();
  pintarDiagrama(false);
}

function pintarDiagrama(conservarVista) {
  estado.pila = M.podarPila(estado.doc, estado.pila);
  lienzo.dibujar(diagramaActual(), {
    soloLectura: !estado.puedeEditar,
    conservarVista,
    ignorarVista: window.matchMedia('(max-width: 900px)').matches,
  });
  pintarMigas();
  pintarBotones();
  pintarInspector();
}

function repintar() {
  pintarDiagrama(true);
}

function pintarMigas() {
  const nav = $('migas');
  nav.replaceChildren();
  estado.pila.forEach((id, i) => {
    const ultimo = i === estado.pila.length - 1;
    const nombre = i === 0
      ? 'Principal'
      : ((M.nodoQueAbre(estado.doc, estado.pila[i - 1], id) || {}).data || {}).name || 'Detalle';
    if (i > 0) nav.appendChild(el('span', 'dv-migas__sep', '›'));
    if (ultimo) {
      const s = el('span', 'dv-migas__actual', nombre);
      s.setAttribute('aria-current', 'page');
      nav.appendChild(s);
    } else {
      const b = el('button', 'dv-migas__btn', nombre);
      b.type = 'button';
      b.addEventListener('click', () => {
        estado.pila = estado.pila.slice(0, i + 1);
        lienzo.seleccionar([], [], false);
        estado.nodoInspector = null;
        pintarDiagrama(false);
      });
      nav.appendChild(b);
    }
  });
}

function pintarBotones() {
  $('deshacer').disabled = !estado.deshacer.length || !estado.puedeEditar;
  $('rehacer').disabled = !estado.rehacer.length || !estado.puedeEditar;
}

function pintarPaleta() {
  const cont = $('paleta');
  cont.replaceChildren();
  for (const g of M.GRUPOS) {
    cont.appendChild(el('p', 'dv-paleta__grupo', g.label));
    for (const [tipo, cfg] of Object.entries(M.TIPOS)) {
      if (cfg.group !== g.group) continue;
      const b = el('button', 'dv-paleta__item');
      b.type = 'button';
      b.draggable = true;
      b.title = cfg.hint;
      const punto = el('span', 'dv-paleta__color');
      punto.style.background = cfg.accent;
      b.append(punto, el('span', '', cfg.label));
      b.addEventListener('click', () => {
        // Un poco movido del centro, para que dos clics seguidos no se encimen.
        const c = lienzo.centro();
        agregar(tipo, { x: c.x + (Math.random() * 60 - 30), y: c.y + (Math.random() * 60 - 30) });
      });
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/x-dv-tipo', tipo);
        e.dataTransfer.effectAllowed = 'copy';
      });
      cont.appendChild(b);
    }
  }
}

/** Agrega un nodo centrado en `punto` (coordenadas del diagrama). */
function agregar(tipo, punto) {
  const cfg = M.TIPOS[tipo];
  if (!estado.puedeEditar || !cfg) return;
  const pos = { x: punto.x - cfg.width / 2, y: punto.y - cfg.height / 2 };
  const { doc, id } = M.agregarNodo(estado.doc, idActual(), tipo, pos);
  cambiar(doc);
  lienzo.seleccionar([id], []);
}

/** Todo cambio del documento pasa por aquí: historial, repintar y autoguardado. */
function cambiar(nuevo) {
  if (!estado.puedeEditar) return;
  estado.deshacer.push(JSON.stringify(estado.doc));
  if (estado.deshacer.length > HISTORIAL_MAX) estado.deshacer.shift();
  estado.rehacer = [];
  estado.doc = nuevo;
  marcarSucio();
  repintar();
}

function deshacer() {
  if (!estado.deshacer.length || !estado.puedeEditar) return;
  estado.rehacer.push(JSON.stringify(estado.doc));
  estado.doc = JSON.parse(estado.deshacer.pop());
  $('tituloProyecto').value = estado.doc.meta.name;
  marcarSucio();
  repintar();
}

function rehacer() {
  if (!estado.rehacer.length || !estado.puedeEditar) return;
  estado.deshacer.push(JSON.stringify(estado.doc));
  estado.doc = JSON.parse(estado.rehacer.pop());
  $('tituloProyecto').value = estado.doc.meta.name;
  marcarSucio();
  repintar();
}

function entrarAHijo(nodoId) {
  const r = M.abrirHijo(estado.doc, idActual(), nodoId);
  if (!r.hijoId) return;
  if (r.creado) {
    if (!estado.puedeEditar) return;
    cambiar(r.doc);
  }
  estado.pila.push(r.hijoId);
  lienzo.seleccionar([], [], false);
  estado.nodoInspector = null;
  pintarDiagrama(false);
}

function quitarSeleccion() {
  if (!estado.puedeEditar) return;
  const { nodos, aristas } = lienzo.seleccion();
  if (!nodos.length && !aristas.length) return;
  const conHijo = diagramaActual().nodes.filter((n) => nodos.includes(n.id) && n.data.childDiagramId);
  if (conHijo.length && !window.confirm(
    conHijo.length === 1
      ? `"${conHijo[0].data.name}" tiene un diagrama de detalle. ¿Borrarlo junto con el nodo?`
      : `${conHijo.length} nodos tienen diagrama de detalle. ¿Borrarlos junto con los nodos?`,
  )) return;
  cambiar(M.quitar(estado.doc, idActual(), nodos, aristas));
  lienzo.seleccionar([], []);
}

function teclado(e) {
  if ($('vistaEditor').hidden || !estado.doc) return;
  if (document.querySelector('dialog[open]')) return;
  const t = e.target;
  const escribiendo = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    guardarYa();
    return;
  }
  if (escribiendo) return;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) rehacer();
    else deshacer();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    rehacer();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    quitarSeleccion();
  } else if (e.key === 'Escape') {
    lienzo.seleccionar([], []);
  } else if (e.key === 'Enter' && estado.nodoInspector) {
    e.preventDefault();
    entrarAHijo(estado.nodoInspector);
  }
}

function exportarJson() {
  const blob = new Blob([JSON.stringify(estado.doc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${estado.slug}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ==================================================================
   Guardado (con versión: nadie pisa a nadie sin enterarse)
   ================================================================== */

function marcarSucio() {
  if (!estado.puedeEditar || estado.conflicto) return;
  estado.sucio = true;
  pintarGuardado();
  pintarBotones();
  clearTimeout(estado.temporizador);
  estado.temporizador = setTimeout(guardar, AUTOGUARDADO_MS);
}

function pintarGuardado() {
  const s = $('estadoGuardado');
  let texto = 'Guardado';
  let clase = 'ok';
  if (!estado.puedeEditar) {
    texto = 'Sólo lectura';
    clase = 'lectura';
  } else if (estado.conflicto) {
    texto = 'Sin guardar: conflicto';
    clase = 'error';
  } else if (estado.guardando) {
    texto = 'Guardando…';
    clase = 'pendiente';
  } else if (estado.sucio) {
    texto = 'Cambios sin guardar';
    clase = 'pendiente';
  }
  s.textContent = texto;
  s.dataset.estado = clase;
}

async function guardar() {
  if (!estado.sucio || estado.guardando || estado.conflicto || !estado.slug) return;
  clearTimeout(estado.temporizador);
  estado.guardando = true;
  estado.sucio = false;
  pintarGuardado();
  const slug = estado.slug;
  const enviado = estado.doc;
  const r = await apiJson(`/documentacion/proyectos/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: { documento: enviado, version: estado.version },
  }).catch(() => ({ ok: false, status: 0, data: {} }));
  estado.guardando = false;
  if (estado.slug !== slug) return;

  if (r.ok) {
    estado.version = r.data.version;
  } else if (r.status === 409) {
    estado.conflicto = true;
    estado.sucio = true;
    $('bannerConflicto').hidden = false;
  } else {
    estado.sucio = true;
    const motivo = {
      0: 'Sin conexión: se reintentará en unos segundos.',
      403: 'Ya no tienes permiso para editar este proyecto.',
      404: 'Este proyecto fue eliminado.',
      413: 'El proyecto pasó de 5 MB y no se puede guardar.',
      422: `El documento no es válido: ${(r.data.errores || [])[0] || ''}`,
    }[r.status] || 'No se pudo guardar; se reintentará.';
    showToast(motivo, 'error');
    if (r.status === 0 || r.status >= 500) estado.temporizador = setTimeout(guardar, 8000);
  }
  pintarGuardado();
  // Si hubo cambios mientras se guardaba, va otra vuelta.
  if (estado.sucio && !estado.conflicto && estado.doc !== enviado && r.ok) {
    clearTimeout(estado.temporizador);
    estado.temporizador = setTimeout(guardar, AUTOGUARDADO_MS);
  }
}

async function guardarYa() {
  clearTimeout(estado.temporizador);
  while (estado.guardando) await new Promise((res) => setTimeout(res, 100));
  await guardar();
}

/** Conflicto: guardar mi versión encima de la que otro guardó. */
async function sobrescribir() {
  const r = await apiJson(`/documentacion/proyectos/${encodeURIComponent(estado.slug)}`).catch(() => ({ ok: false }));
  if (!r.ok) {
    showToast('No se pudo leer la versión actual.', 'error');
    return;
  }
  estado.version = r.data.version;
  estado.conflicto = false;
  estado.sucio = true;
  $('bannerConflicto').hidden = true;
  await guardar();
  if (!estado.sucio) showToast('Se guardó tu versión.', 'success');
}

/* ==================================================================
   Inspector
   ================================================================== */

function alSeleccionar(sel) {
  estado.nodoInspector = sel.nodos.length === 1 ? sel.nodos[0] : null;
  pintarInspector();
}

const CAMPOS = ['name', 'description', 'endpoints', 'input', 'output', 'returnCodes', 'feature'];

function enlazarInspector() {
  $('cerrarInspector').addEventListener('click', () => lienzo.seleccionar([], []));
  for (const campo of CAMPOS) {
    $(`in_${campo}`).addEventListener('change', (e) => cambiarCampo(campo, e.target.value));
  }
  $('in_status').addEventListener('change', (e) => cambiarCampo('status', e.target.value));
  $('in_inputs').addEventListener('change', (e) => cambiarCampo('connectionInputs', M.puertosDesdeTexto(e.target.value)));
  $('in_outputs').addEventListener('change', (e) => cambiarCampo('connectionOutputs', M.puertosDesdeTexto(e.target.value)));
  $('agregarAtributo').addEventListener('click', () => {
    const n = nodoInspector();
    const attrs = [...(n.data.attributes || []), { key: '', kind: 'text', value: '' }];
    cambiarCampo('attributes', attrs);
    const ultimo = $('atributos').querySelector('.dv-attr:last-child input');
    if (ultimo) ultimo.focus();
  });
  $('abrirHijo').addEventListener('click', () => entrarAHijo(estado.nodoInspector));
  $('quitarHijo').addEventListener('click', () => {
    if (!window.confirm('¿Borrar el diagrama de detalle de este nodo? Se puede deshacer con Ctrl+Z.')) return;
    cambiar(M.quitarHijo(estado.doc, idActual(), estado.nodoInspector));
  });
  $('borrarNodo').addEventListener('click', quitarSeleccion);

  const sel = $('in_status');
  for (const s of M.ESTADOS) {
    const o = el('option', '', NOMBRE_ESTADO[s]);
    o.value = s;
    sel.appendChild(o);
  }
}

function nodoInspector() {
  return diagramaActual().nodes.find((n) => n.id === estado.nodoInspector) || null;
}

function cambiarCampo(campo, valor) {
  const n = nodoInspector();
  if (!n || !estado.puedeEditar) return;
  const datos = M.clonar(n.data);
  datos[campo] = valor;
  cambiar(M.cambiarDatos(estado.doc, idActual(), n.id, datos));
}

function pintarInspector() {
  const panel = $('inspector');
  const n = estado.doc && estado.nodoInspector ? nodoInspector() : null;
  if (!n) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const cfg = M.TIPOS[n.type];
  $('inspTipo').textContent = cfg.label;
  $('inspTipo').style.color = cfg.accent;
  const lectura = !estado.puedeEditar;

  const activo = document.activeElement;
  for (const campo of CAMPOS) {
    const input = $(`in_${campo}`);
    if (input !== activo) input.value = n.data[campo] || '';
    input.readOnly = lectura;
  }
  $('in_status').value = M.normalizarEstado(n.data.status);
  $('in_status').disabled = lectura;
  $('in_inputs').value = M.normalizarPuertos(n.data.connectionInputs).join(', ');
  $('in_outputs').value = M.normalizarPuertos(n.data.connectionOutputs).join(', ');
  $('in_inputs').readOnly = lectura;
  $('in_outputs').readOnly = lectura;

  const tieneHijo = Boolean(n.data.childDiagramId);
  $('abrirHijo').textContent = tieneHijo ? 'Abrir diagrama de detalle' : 'Crear diagrama de detalle';
  $('abrirHijo').hidden = !tieneHijo && lectura;
  $('quitarHijo').hidden = !tieneHijo || lectura;
  $('borrarNodo').hidden = lectura;
  $('agregarAtributo').hidden = lectura;

  pintarAtributos(n, lectura);
}

function pintarAtributos(n, lectura) {
  const cont = $('atributos');
  // No repintar mientras se escribe en un atributo: se perdería el foco.
  if (cont.contains(document.activeElement) && cont.children.length === (n.data.attributes || []).length) return;
  cont.replaceChildren();
  const attrs = n.data.attributes || [];
  attrs.forEach((a, i) => {
    const fila = el('div', 'dv-attr');
    const clave = el('input', 'dv-input dv-attr__clave');
    clave.value = a.key;
    clave.placeholder = 'Nombre';
    clave.readOnly = lectura;
    clave.setAttribute('aria-label', 'Nombre del atributo');
    clave.addEventListener('change', () => editarAtributo(i, { key: clave.value.trim() }));

    const tipo = el('select', 'dv-input dv-attr__tipo');
    tipo.setAttribute('aria-label', 'Tipo del atributo');
    for (const k of M.TIPOS_ATRIBUTO) {
      const o = el('option', '', NOMBRE_ATRIBUTO[k]);
      o.value = k;
      tipo.appendChild(o);
    }
    if (!M.TIPOS_ATRIBUTO.includes(a.kind)) {
      const o = el('option', '', a.kind);
      o.value = a.kind;
      tipo.appendChild(o);
    }
    tipo.value = a.kind;
    tipo.disabled = lectura;
    tipo.addEventListener('change', () => editarAtributo(i, { kind: tipo.value }));

    const largo = ['textarea', 'json', 'table', 'kv'].includes(a.kind);
    const valor = el(largo ? 'textarea' : 'input', `dv-input dv-attr__valor${a.kind === 'json' || a.kind === 'table' ? ' dv-mono' : ''}`);
    valor.value = a.value;
    valor.readOnly = lectura;
    valor.setAttribute('aria-label', `Valor de ${a.key || 'atributo'}`);
    if (largo) valor.rows = Math.min(8, Math.max(2, String(a.value).split('\n').length));
    valor.addEventListener('change', () => editarAtributo(i, { value: valor.value }));

    fila.append(clave, tipo);
    if (!lectura) {
      const quitar = el('button', 'ui-icon-btn ui-icon-btn--xs dv-attr__quitar');
      quitar.type = 'button';
      quitar.title = 'Quitar atributo';
      quitar.setAttribute('aria-label', `Quitar ${a.key || 'atributo'}`);
      quitar.appendChild(icono('M6.5 6.5l11 11M17.5 6.5l-11 11'));
      quitar.addEventListener('click', () => {
        const lista = [...attrs];
        lista.splice(i, 1);
        cambiarCampo('attributes', lista);
      });
      fila.appendChild(quitar);
    }
    fila.appendChild(valor);
    cont.appendChild(fila);
  });
  if (!attrs.length) cont.appendChild(el('p', 'dv-inspector__nota', 'Sin atributos.'));
}

function editarAtributo(i, cambio) {
  const n = nodoInspector();
  const lista = (n.data.attributes || []).map((a, j) => (j === i ? { ...a, ...cambio } : a));
  cambiarCampo('attributes', lista);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!session) return;
  arrancar();
});
