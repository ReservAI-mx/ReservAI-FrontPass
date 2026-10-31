import { apiJson, goLogout, requireUiSession } from '../api.js';
import { setupAccountMenu } from '../accountMenu.js';
import { showToast } from '../toast.js';
import { Lienzo } from './lienzo.js';
import { crearChat } from './chat.js';

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
  ocultos: new Set(),  // estados atenuados con el filtro (se quedan al cambiar de diagrama)
};

let lienzo = null;
let chat = null;

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
  enlazarExportar();
  enlazarBuscador();
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
  chat = crearChat({
    slug: () => estado.slug,
    antesDeEnviar: () => guardarYa(),
    // Chat e inspector comparten el lado derecho: con el chat abierto, el
    // inspector espera.
    alCambiar: () => pintarInspector(),
  });
  document.addEventListener('keydown', teclado);
}

function cerrarEditor() {
  clearTimeout(estado.temporizador);
  if (chat) chat.reiniciar();
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
    estadosOcultos: estado.ocultos,
  });
  pintarMigas();
  pintarFiltro();
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
  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    abrirBuscador();
    return;
  }
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

/* ==================================================================
   Filtro por estado (atenúa, no oculta: la forma del flujo se sigue viendo)
   ================================================================== */

function pintarFiltro() {
  const cont = $('filtroEstados');
  cont.replaceChildren();
  const nodos = diagramaActual().nodes;
  const conteo = M.conteoPorEstado(nodos);
  // Un estado sin nodos aquí sólo haría ruido; con uno solo no hay qué filtrar.
  const presentes = M.ESTADOS.filter((s) => conteo[s] > 0);
  cont.hidden = presentes.length < 2;
  if (cont.hidden) return;

  for (const s of presentes) {
    const apagado = estado.ocultos.has(s);
    const b = el('button', `dv-chip-estado dv-estado--${M.claseEstado(s)}`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!apagado));
    b.title = apagado ? `Mostrar ${M.ESTADO_CORTO[s]}` : `Atenuar ${M.ESTADO_CORTO[s]}`;
    b.append(el('span', '', M.ESTADO_CORTO[s]), el('span', 'dv-chip-estado__n', String(conteo[s])));
    b.addEventListener('click', () => {
      if (apagado) estado.ocultos.delete(s);
      else estado.ocultos.add(s);
      repintar();
    });
    cont.appendChild(b);
  }
  if (estado.ocultos.size) {
    const todos = el('button', 'dv-filtro__todos', 'Ver todos');
    todos.type = 'button';
    todos.addEventListener('click', () => {
      estado.ocultos.clear();
      repintar();
    });
    cont.appendChild(todos);
  }
}

/* ==================================================================
   Buscar nodo (Ctrl+K): en todo el proyecto, también en los detalles
   ================================================================== */

const busqueda = { resultados: [], activo: 0 };

function abrirBuscador() {
  if (!estado.doc) return;
  $('buscarNodo').value = '';
  pintarResultados([]);
  $('dlgBuscar').showModal();
  $('buscarNodo').focus();
}

function pintarResultados(resultados) {
  busqueda.resultados = resultados;
  busqueda.activo = 0;
  const ul = $('resultadosBusqueda');
  ul.replaceChildren();
  const q = $('buscarNodo').value.trim();
  $('notaBusqueda').textContent = !q
    ? 'Busca en todo el proyecto, también dentro de los diagramas de detalle. ↑↓ para moverte, Enter para ir.'
    : resultados.length ? `${resultados.length} resultado${resultados.length === 1 ? '' : 's'}` : 'Nada coincide.';

  resultados.forEach((r, i) => {
    const cfg = M.TIPOS[r.tipo];
    const li = el('li', 'dv-buscar__item');
    li.id = `resultado-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === 0));
    const tipo = el('span', 'dv-buscar__tipo', cfg.label);
    tipo.style.color = cfg.accent;
    li.append(el('span', 'dv-buscar__nombre', r.nombre), tipo, el('span', 'dv-buscar__donde', r.migas.join(' › ')));
    const http = [r.metodo, r.ruta].filter(Boolean).join(' ');
    li.appendChild(el('span', 'dv-buscar__http', http || M.ESTADO_CORTO[r.estado]));
    li.addEventListener('mousemove', () => marcarResultado(i));
    li.addEventListener('click', () => irAResultado(r));
    ul.appendChild(li);
  });
  $('buscarNodo').setAttribute('aria-activedescendant', resultados.length ? 'resultado-0' : '');
}

function marcarResultado(i) {
  const items = $('resultadosBusqueda').children;
  if (!items.length) return;
  busqueda.activo = (i + items.length) % items.length;
  [...items].forEach((li, j) => li.setAttribute('aria-selected', String(j === busqueda.activo)));
  items[busqueda.activo].scrollIntoView({ block: 'nearest' });
  $('buscarNodo').setAttribute('aria-activedescendant', items[busqueda.activo].id);
}

function irAResultado(r) {
  $('dlgBuscar').close();
  // Si su estado está atenuado, se quita del filtro: se buscó para verlo.
  if (estado.ocultos.delete(r.estado)) showToast(`Se volvieron a mostrar los nodos "${M.ESTADO_CORTO[r.estado]}".`, 'info');
  estado.pila = r.ids.slice();
  lienzo.seleccionar([], [], false);
  pintarDiagrama(true);
  lienzo.seleccionar([r.nodoId], []);
  lienzo.centrarEn(r.nodoId);
}

function enlazarBuscador() {
  const input = $('buscarNodo');
  $('abrirBuscar').addEventListener('click', abrirBuscador);
  input.addEventListener('input', () => pintarResultados(M.buscarNodos(estado.doc, input.value, 40)));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      marcarResultado(busqueda.activo + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      marcarResultado(busqueda.activo - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = busqueda.resultados[busqueda.activo];
      if (r) irAResultado(r);
    }
  });
  // Clic fuera de la caja (en el fondo del diálogo) lo cierra.
  $('dlgBuscar').addEventListener('click', (e) => {
    if (e.target === $('dlgBuscar')) $('dlgBuscar').close();
  });
}

/* ==================================================================
   Exportar
   ================================================================== */

const X = globalThis.DocExportar;

function descargar(contenido, nombre, tipo) {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** "proyecto" o "proyecto-login" para un diagrama de detalle. */
function nombreArchivo() {
  if (estado.pila.length === 1) return estado.slug;
  const nodo = M.nodoQueAbre(estado.doc, estado.pila[estado.pila.length - 2], idActual());
  const sufijo = M.slugDesdeNombre(nodo ? nodo.data.name : 'detalle') || 'detalle';
  return `${estado.slug}-${sufijo}`;
}

function tituloImagen() {
  const ruta = M.rutasDiagramas(estado.doc).get(idActual());
  return ruta ? ruta.join(' · ') : estado.doc.meta.name;
}

// Lado máximo del PNG: más grande, algunos navegadores no pueden con el canvas.
const LADO_MAX = 8192;

async function exportarPng() {
  const r = X.svgDiagrama(diagramaActual(), { titulo: tituloImagen() });
  if (!r) {
    showToast('El diagrama no tiene nodos que exportar.', 'warning');
    return;
  }
  const escala = Math.min(2, LADO_MAX / Math.max(r.ancho, r.alto));
  const img = new Image();
  // data: y no blob:, que la CSP del pass (img-src) no permite.
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(r.ancho * escala);
  canvas.height = Math.round(r.alto * escala);
  const ctx = canvas.getContext('2d');
  ctx.scale(escala, escala);
  ctx.drawImage(img, 0, 0, r.ancho, r.alto);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('canvas vacío');
  descargar(blob, `${nombreArchivo()}.png`);
}

async function exportar(formato) {
  try {
    if (formato === 'png') {
      await exportarPng();
    } else if (formato === 'svg') {
      const r = X.svgDiagrama(diagramaActual(), { titulo: tituloImagen() });
      if (!r) {
        showToast('El diagrama no tiene nodos que exportar.', 'warning');
        return;
      }
      descargar(r.svg, `${nombreArchivo()}.svg`, 'image/svg+xml');
    } else if (formato === 'md') {
      const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'long', timeStyle: 'short' });
      descargar(X.markdownProyecto(estado.doc, fecha), `${estado.slug}.md`, 'text/markdown;charset=utf-8');
    } else if (formato === 'json') {
      descargar(JSON.stringify(estado.doc, null, 2), `${estado.slug}.json`, 'application/json');
    }
  } catch {
    showToast('No se pudo exportar.', 'error');
  }
}

function enlazarExportar() {
  const boton = $('exportar');
  const menu = $('menuExportar');
  const cerrar = () => {
    menu.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
  };
  boton.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    boton.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) menu.querySelector('button').focus();
  });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-formato]');
    if (!item) return;
    cerrar();
    exportar(item.dataset.formato);
  });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('[data-formato]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    } else if (e.key === 'Escape') {
      cerrar();
      boton.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) cerrar();
  });
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
  if (!n || (chat && chat.abierto())) {
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
