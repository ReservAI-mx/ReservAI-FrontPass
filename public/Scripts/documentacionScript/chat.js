import { apiJson } from '../api.js';
import { showToast } from '../toast.js';

/**
 * Chat con IA del editor. El agente vive en el servicio
 * (POST /api/documentacion/proyectos/:slug/chat) y lee el proyecto guardado,
 * así que antes de preguntar se guarda lo pendiente. Las conversaciones son
 * de cada persona: nadie más las ve.
 *
 * Las respuestas son Markdown; se pintan con markdown.js y textContent, nunca
 * como HTML. Los diagramas Mermaid salen como código para copiar: la CSP del
 * pass no deja que la librería de Mermaid inyecte sus estilos.
 */

const MD = globalThis.DocMarkdown;
const $ = (id) => document.getElementById(id);

function el(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined && texto !== null) n.textContent = texto;
  return n;
}

function pintarInline(padre, tokens) {
  for (const t of tokens) {
    if (t.tipo === 'texto') padre.appendChild(document.createTextNode(t.texto));
    else if (t.tipo === 'fuerte') padre.appendChild(el('strong', '', t.texto));
    else if (t.tipo === 'enfasis') padre.appendChild(el('em', '', t.texto));
    else if (t.tipo === 'codigo') padre.appendChild(el('code', '', t.texto));
    else if (t.tipo === 'enlace') {
      const a = el('a', '', t.texto);
      a.href = t.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      padre.appendChild(a);
    }
  }
}

function bloqueCodigo(b) {
  const caja = el('div', `dv-md-codigo${b.lenguaje === 'mermaid' ? ' dv-md-codigo--mermaid' : ''}`);
  const cabeza = el('div', 'dv-md-codigo__cabeza');
  cabeza.appendChild(el('span', '', b.lenguaje === 'mermaid' ? 'Diagrama Mermaid' : (b.lenguaje || 'código')));
  const copiar = el('button', 'dv-md-codigo__copiar', 'Copiar');
  copiar.type = 'button';
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.texto);
      copiar.textContent = 'Copiado';
      setTimeout(() => { copiar.textContent = 'Copiar'; }, 1500);
    } catch {
      showToast('No se pudo copiar.', 'error');
    }
  });
  cabeza.appendChild(copiar);
  const pre = el('pre');
  pre.appendChild(el('code', '', b.texto));
  caja.append(cabeza, pre);
  return caja;
}

/** Markdown → nodos DOM dentro de `cont`. */
export function pintarMarkdown(cont, texto) {
  for (const b of MD.interpretar(texto)) {
    let n;
    if (b.tipo === 'titulo') {
      n = el(`h${Math.min(6, b.nivel + 2)}`, 'dv-md-titulo');
      pintarInline(n, b.inline);
    } else if (b.tipo === 'parrafo') {
      n = el('p');
      pintarInline(n, b.inline);
    } else if (b.tipo === 'lista') {
      n = el(b.ordenada ? 'ol' : 'ul');
      for (const item of b.items) {
        const li = el('li');
        pintarInline(li, item);
        n.appendChild(li);
      }
    } else if (b.tipo === 'cita') {
      n = el('blockquote');
      pintarInline(n, b.inline);
    } else if (b.tipo === 'codigo') {
      n = bloqueCodigo(b);
    } else if (b.tipo === 'tabla') {
      n = el('div', 'dv-md-tabla');
      const t = el('table');
      const tr = el('tr');
      for (const c of b.encabezado) {
        const th = el('th');
        pintarInline(th, c);
        tr.appendChild(th);
      }
      const thead = el('thead');
      thead.appendChild(tr);
      const tbody = el('tbody');
      for (const fila of b.filas) {
        const r = el('tr');
        for (const c of fila) {
          const td = el('td');
          pintarInline(td, c);
          r.appendChild(td);
        }
        tbody.appendChild(r);
      }
      t.append(thead, tbody);
      n.appendChild(t);
    } else if (b.tipo === 'linea') {
      n = el('hr');
    }
    if (n) cont.appendChild(n);
  }
}

const ERRORES = {
  0: 'Sin conexión. Intenta de nuevo.',
  403: 'No tienes permiso para usar el chat en este proyecto.',
  404: 'La conversación o el proyecto ya no existen.',
  413: 'El mensaje es demasiado largo.',
  429: 'Llegaste al límite de preguntas por hora. Intenta más tarde.',
  502: 'La IA no respondió. Intenta de nuevo en un momento.',
  503: 'El chat no está configurado (falta la llave de OpenAI en el servicio).',
};

/**
 * @param {{ slug: () => string|null, antesDeEnviar: () => Promise<void>, alCambiar: (abierto) => void }} op
 */
export function crearChat(op) {
  const estado = {
    abierto: false,
    configurado: null,
    conversacionId: null,
    conversaciones: [],
    enviando: false,
    slugCargado: null,
  };

  const panel = $('chat');
  const lista = $('chatMensajes');
  const entrada = $('chatEntrada');
  const selector = $('chatConversaciones');

  function vacio() {
    lista.replaceChildren();
    const v = el('div', 'dv-chat__vacio');
    v.appendChild(el('p', 'dv-chat__vacio-titulo', 'Pregunta sobre este proyecto'));
    v.appendChild(el('p', '', 'La IA lee el diagrama guardado: nodos, conexiones, endpoints y atributos. No cambia nada del lienzo.'));
    const ejemplos = el('div', 'dv-chat__ejemplos');
    for (const texto of ['Resume el flujo principal', '¿Qué endpoints faltan por terminar?', 'Hazme un diagrama del login']) {
      const b = el('button', 'dv-chat__ejemplo', texto);
      b.type = 'button';
      b.addEventListener('click', () => {
        entrada.value = texto;
        enviar();
      });
      ejemplos.appendChild(b);
    }
    v.appendChild(ejemplos);
    lista.appendChild(v);
  }

  function agregarMensaje(rol, contenido, clase) {
    const vacioEl = lista.querySelector('.dv-chat__vacio');
    if (vacioEl) vacioEl.remove();
    const m = el('div', `dv-chat__msg dv-chat__msg--${rol}${clase ? ` ${clase}` : ''}`);
    if (rol === 'assistant') pintarMarkdown(m, contenido);
    else m.textContent = contenido;
    lista.appendChild(m);
    lista.scrollTop = lista.scrollHeight;
    return m;
  }

  function pintarSelector() {
    selector.replaceChildren();
    const nueva = el('option', '', 'Conversación nueva');
    nueva.value = '';
    selector.appendChild(nueva);
    for (const c of estado.conversaciones) {
      const o = el('option', '', c.titulo || 'Sin título');
      o.value = c.id;
      selector.appendChild(o);
    }
    selector.value = estado.conversacionId || '';
  }

  async function cargarConversaciones() {
    const slug = op.slug();
    const r = await apiJson(`/documentacion/proyectos/${encodeURIComponent(slug)}/conversaciones`)
      .catch(() => ({ ok: false }));
    estado.conversaciones = r.ok ? r.data.conversaciones || [] : [];
    pintarSelector();
  }

  async function abrirConversacion(id) {
    estado.conversacionId = id || null;
    if (!id) {
      vacio();
      entrada.focus();
      return;
    }
    lista.replaceChildren(el('div', 'ui-loading', 'Cargando conversación…'));
    const slug = op.slug();
    const r = await apiJson(`/documentacion/proyectos/${encodeURIComponent(slug)}/conversaciones/${encodeURIComponent(id)}`)
      .catch(() => ({ ok: false, status: 0 }));
    if (!r.ok) {
      showToast(ERRORES[r.status] || 'No se pudo abrir la conversación.', 'error');
      estado.conversacionId = null;
      pintarSelector();
      vacio();
      return;
    }
    lista.replaceChildren();
    for (const m of r.data.mensajes || []) agregarMensaje(m.rol, m.contenido);
    if (!(r.data.mensajes || []).length) vacio();
  }

  async function revisarConfiguracion() {
    if (estado.configurado !== null) return estado.configurado;
    const r = await apiJson('/documentacion/agente').catch(() => ({ ok: false }));
    estado.configurado = Boolean(r.ok && r.data.configurado);
    return estado.configurado;
  }

  async function abrir() {
    estado.abierto = true;
    panel.hidden = false;
    $('abrirChat').setAttribute('aria-pressed', 'true');
    op.alCambiar(true);
    const configurado = await revisarConfiguracion();
    $('chatApagado').hidden = configurado;
    $('chatForm').hidden = !configurado;
    if (!configurado) {
      lista.replaceChildren();
      return;
    }
    if (estado.slugCargado !== op.slug()) {
      estado.slugCargado = op.slug();
      estado.conversacionId = null;
      vacio();
      await cargarConversaciones();
    }
    entrada.focus();
  }

  function cerrar() {
    estado.abierto = false;
    panel.hidden = true;
    $('abrirChat').setAttribute('aria-pressed', 'false');
    op.alCambiar(false);
  }

  async function enviar() {
    const mensaje = entrada.value.trim();
    if (!mensaje || estado.enviando) return;
    estado.enviando = true;
    $('chatEnviar').disabled = true;
    entrada.value = '';
    agregarMensaje('user', mensaje);
    const pensando = agregarMensaje('assistant', 'Pensando…', 'is-pensando');

    // La IA lee lo guardado: que vea lo último que se dibujó.
    await op.antesDeEnviar();
    const slug = op.slug();
    const body = { mensaje };
    if (estado.conversacionId) body.conversacion_id = estado.conversacionId;
    const r = await apiJson(`/documentacion/proyectos/${encodeURIComponent(slug)}/chat`, { method: 'POST', body })
      .catch(() => ({ ok: false, status: 0, data: {} }));

    pensando.remove();
    estado.enviando = false;
    $('chatEnviar').disabled = false;
    if (op.slug() !== slug) return; // se cambió de proyecto mientras tanto

    if (!r.ok) {
      const m = agregarMensaje('assistant', ERRORES[r.status] || 'No se pudo enviar.', 'is-error');
      m.setAttribute('role', 'alert');
      if (!entrada.value) entrada.value = mensaje;
      return;
    }
    agregarMensaje('assistant', r.data.markdown);
    if (!estado.conversacionId) {
      estado.conversacionId = r.data.conversacion_id;
      await cargarConversaciones();
    }
  }

  $('abrirChat').addEventListener('click', () => (estado.abierto ? cerrar() : abrir()));
  $('cerrarChat').addEventListener('click', cerrar);
  $('chatNueva').addEventListener('click', () => {
    abrirConversacion(null);
    pintarSelector();
  });
  selector.addEventListener('change', () => abrirConversacion(selector.value));
  $('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    enviar();
  });
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      enviar();
    }
  });

  return {
    abierto: () => estado.abierto,
    cerrar,
    /** Al cambiar de proyecto: se olvida la conversación del anterior. */
    reiniciar() {
      estado.slugCargado = null;
      estado.conversacionId = null;
      if (estado.abierto) cerrar();
    },
  };
}
