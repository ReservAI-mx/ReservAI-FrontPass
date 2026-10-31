/**
 * Modelo de Doc visual: tipos de nodo, estados, puertos y operaciones sobre
 * el documento. Sin DOM, para probarlo con jest (tests/documentacion.test.js).
 *
 * El documento es el mismo ProjectDocument de la app anterior
 * (DocumentacionBackend/shared/types.ts) y lo valida el servicio con el mismo
 * esquema: node.data sólo admite sus campos conocidos, así que aquí nunca se
 * le agregan claves propias.
 *
 * Todas las operaciones devuelven un documento nuevo; no cambian el que reciben.
 */
(function (raiz, fabrica) {
  'use strict';
  const modulo = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else raiz.DocModelo = modulo;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Misma tabla que shared/node-kinds.ts: silueta, color y medidas por tipo.
  const TIPOS = {
    gateway: { label: 'Gateway / Proxy', hint: 'Entrada del tráfico: API gateway, load balancer o reverse proxy.', shape: 'hexagon', group: 'infra', accent: '#7c9cff', width: 212, height: 96 },
    service: { label: 'Servicio', hint: 'El proyecto o microservicio desplegado.', shape: 'rack', group: 'infra', accent: '#34d399', width: 212, height: 112 },
    middleware: { label: 'Middleware', hint: 'Validación o lógica intermedia antes del handler.', shape: 'diamond', group: 'infra', accent: '#fbbf24', width: 196, height: 132 },
    errorMiddleware: { label: 'Middleware error', hint: 'Middleware de manejo de errores.', shape: 'diamond', group: 'infra', accent: '#f87171', width: 196, height: 132 },
    endpoint: { label: 'Endpoint', hint: 'Operación HTTP documentada: método + ruta.', shape: 'semicircle', group: 'infra', accent: '#a78bfa', width: 208, height: 126 },
    db: { label: 'Base de datos', hint: 'Almacenamiento persistente: tablas o documentos.', shape: 'cylinder', group: 'infra', accent: '#38bdf8', width: 184, height: 124 },
    cache: { label: 'Cache', hint: 'Almacenamiento volátil: Redis, memoria, CDN.', shape: 'cylinder', group: 'infra', accent: '#2dd4bf', width: 184, height: 124 },
    flowStart: { label: 'Inicio', hint: 'Terminal de arranque de un subflujo.', shape: 'stadium', group: 'flow', accent: '#4ade80', width: 156, height: 64 },
    flowEnd: { label: 'Fin', hint: 'Terminal de cierre de un subflujo.', shape: 'stadium', group: 'flow', accent: '#fb7185', width: 156, height: 64 },
    flowDecision: { label: 'Decisión', hint: 'Bifurcación con salidas nombradas (TRUE / FALSE).', shape: 'diamond', group: 'flow', accent: '#facc15', width: 196, height: 132 },
    flowProcess: { label: 'Proceso', hint: 'Paso de cómputo dentro de un subflujo.', shape: 'rect', group: 'flow', accent: '#93b4e0', width: 204, height: 96 },
  };

  const GRUPOS = [
    { group: 'infra', label: 'Arquitectura' },
    { group: 'flow', label: 'Flujo interno' },
  ];

  const ESTADOS = ['TO DO', 'IN PROGRESS', 'ON HOLD', 'TESTING', 'COMPLETE'];
  const ESTADO_INICIAL = 'TO DO';
  const ESTADO_CORTO = {
    'TO DO': 'To do', 'IN PROGRESS': 'En curso', 'ON HOLD': 'En pausa', TESTING: 'Testing', COMPLETE: 'Listo',
  };
  // Sinónimos de shared/node-status.ts: documentos viejos guardan DONE, WIP, …
  const ALIAS_ESTADO = {
    DONE: 'COMPLETE', COMPLETED: 'COMPLETE', FINISHED: 'COMPLETE', TERMINADO: 'COMPLETE', LISTO: 'COMPLETE',
    TODO: 'TO DO', 'TO-DO': 'TO DO', PENDING: 'TO DO', PENDIENTE: 'TO DO',
    WIP: 'IN PROGRESS', 'IN-PROGRESS': 'IN PROGRESS', INPROGRESS: 'IN PROGRESS', DOING: 'IN PROGRESS', 'EN PROGRESO': 'IN PROGRESS',
    BLOCKED: 'ON HOLD', BLOQUEADO: 'ON HOLD', 'ON-HOLD': 'ON HOLD', PAUSED: 'ON HOLD',
    TEST: 'TESTING', QA: 'TESTING', PRUEBAS: 'TESTING',
  };

  const TIPOS_ATRIBUTO = ['text', 'textarea', 'tags', 'kv', 'json', 'table'];
  const PUERTO = 'next';
  const RAIZ = 'root';

  function normalizarEstado(valor) {
    const crudo = String(valor || '').trim();
    if (!crudo) return ESTADO_INICIAL;
    if (ESTADOS.includes(crudo)) return crudo;
    const mayus = crudo.toUpperCase();
    if (ESTADOS.includes(mayus)) return mayus;
    return ALIAS_ESTADO[mayus] || ESTADO_INICIAL;
  }

  /** "in-progress" para clases CSS. */
  function claseEstado(estado) {
    return normalizarEstado(estado).toLowerCase().replace(/\s+/g, '-');
  }

  /** Como shared/connection-ports.ts: vacío = ['next'], repetidos → next, next-2. */
  function normalizarPuertos(puertos) {
    if (!Array.isArray(puertos) || puertos.length === 0) return [PUERTO];
    const limpios = puertos.map((p) => String(p || '').trim() || PUERTO);
    const vistos = new Map();
    return limpios.map((base) => {
      const n = vistos.get(base) || 0;
      vistos.set(base, n + 1);
      return n === 0 ? base : `${base}-${n + 1}`;
    });
  }

  /** "next, error" → ['next', 'error']. */
  function puertosDesdeTexto(texto) {
    return normalizarPuertos(String(texto || '').split(',').map((p) => p.trim()).filter(Boolean));
  }

  function uuid() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    // Sólo para entornos sin crypto.randomUUID (pruebas viejas): no es para seguridad.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // Mismo formato que shared/ids.ts.
  function nuevoId(prefijo, usados) {
    let id;
    do {
      id = `${prefijo}-${uuid().slice(0, 8)}`;
    } while (usados && usados.has(id));
    return id;
  }

  function clonar(x) {
    return JSON.parse(JSON.stringify(x));
  }

  function documentoVacio(nombre) {
    return {
      meta: { name: nombre, description: '', updatedAt: new Date().toISOString() },
      rootDiagramId: RAIZ,
      diagrams: { [RAIZ]: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } } },
      templatesByNodeType: {},
    };
  }

  /** Minúsculas, sin acentos, sólo [a-z0-9_-]: lo que acepta el servicio. */
  function slugDesdeNombre(nombre) {
    return String(nombre || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 180);
  }

  function slugValido(slug) {
    return typeof slug === 'string' && slug.length > 0 && slug.length <= 180 && /^[a-z0-9_-]+$/.test(slug);
  }

  function idsUsados(doc) {
    const usados = new Set();
    for (const d of Object.values(doc.diagrams)) {
      for (const n of d.nodes) usados.add(n.id);
      for (const e of d.edges) usados.add(e.id);
    }
    return usados;
  }

  function valorInicialAtributo(tipo, explicito) {
    if (explicito !== undefined && explicito !== '') return explicito;
    if (tipo === 'json') return '{\n  \n}';
    if (tipo === 'table') return JSON.stringify({ columns: ['Columna 1', 'Columna 2'], rows: [['', '']] }, null, 2);
    return '';
  }

  /** Datos iniciales de un nodo, con las plantillas del proyecto (template-merge.ts). */
  function datosIniciales(tipo, plantillas) {
    const cfg = TIPOS[tipo];
    const data = {
      name: `Nuevo ${cfg.label}`,
      description: '',
      status: ESTADO_INICIAL,
      connectionInputs: [PUERTO],
      // La decisión nace con sus dos salidas, como dice su ayuda en la paleta.
      connectionOutputs: tipo === 'flowDecision' ? ['TRUE', 'FALSE'] : [PUERTO],
      attributes: [],
    };
    const defs = (plantillas && plantillas[tipo]) || [];
    for (const def of defs) {
      const v = valorInicialAtributo(def.kind, def.defaultValue);
      if (def.key === 'name') data.name = v || data.name;
      else if (def.key === 'description') data.description = v;
      else if (def.key === 'status') data.status = v;
      else data.attributes.push({ key: def.key, kind: def.kind, value: v });
    }
    return data;
  }

  // ---------- Plantillas por tipo de nodo ----------

  // Claves que no van a atributos sino a los campos base del nodo.
  const CLAVES_BASE = new Set(['name', 'description', 'status']);

  /**
   * Revisa y limpia las filas que capturó la persona. Las filas sin clave se
   * descartan; la etiqueta, si falta, es la clave.
   * @returns {{ ok: true, defs: Array } | { ok: false, errores: string[] }}
   */
  function limpiarPlantilla(filas) {
    const defs = [];
    const errores = [];
    const vistas = new Set();
    for (const f of filas || []) {
      const key = String(f.key || '').trim();
      if (!key) continue;
      if (vistas.has(key.toLowerCase())) {
        errores.push(`La clave "${key}" está repetida.`);
        continue;
      }
      vistas.add(key.toLowerCase());
      const kind = TIPOS_ATRIBUTO.includes(f.kind) ? f.kind : 'text';
      if (kind === 'json' && String(f.defaultValue || '').trim()) {
        try {
          JSON.parse(f.defaultValue);
        } catch {
          errores.push(`El valor de "${key}" no es JSON válido.`);
          continue;
        }
      }
      const def = { key, label: String(f.label || '').trim() || key, kind };
      if (f.required) def.required = true;
      if (f.defaultValue !== undefined && f.defaultValue !== '') def.defaultValue = String(f.defaultValue);
      defs.push(def);
    }
    return errores.length ? { ok: false, errores } : { ok: true, defs };
  }

  /** Pone la plantilla de un tipo. Sin campos, el tipo se queda sin plantilla. */
  function ponerPlantilla(doc, tipo, defs) {
    const nuevo = clonar(doc);
    nuevo.templatesByNodeType = { ...(nuevo.templatesByNodeType || {}) };
    if (defs.length) nuevo.templatesByNodeType[tipo] = defs;
    else delete nuevo.templatesByNodeType[tipo];
    return nuevo;
  }

  /** Nodos de un tipo en todo el proyecto. */
  function contarTipo(doc, tipo) {
    let n = 0;
    for (const d of Object.values(doc.diagrams)) for (const x of d.nodes) if (x.type === tipo) n++;
    return n;
  }

  /**
   * Agrega a los nodos que ya existen los campos de la plantilla que les
   * falten. No cambia ningún valor que ya tengan.
   * @returns {{ doc, nodos: number }} cuántos nodos recibieron algo
   */
  function aplicarPlantilla(doc, tipo) {
    const defs = ((doc.templatesByNodeType || {})[tipo] || []).filter((d) => !CLAVES_BASE.has(d.key));
    const nuevo = clonar(doc);
    let nodos = 0;
    for (const d of Object.values(nuevo.diagrams)) {
      for (const n of d.nodes) {
        if (n.type !== tipo) continue;
        const attrs = n.data.attributes || [];
        const tiene = new Set(attrs.map((a) => String(a.key || '').trim().toLowerCase()));
        const faltan = defs.filter((def) => !tiene.has(def.key.toLowerCase()));
        if (!faltan.length) continue;
        n.data.attributes = [...attrs, ...faltan.map((def) => ({
          key: def.key, kind: def.kind, value: valorInicialAtributo(def.kind, def.defaultValue),
        }))];
        nodos++;
      }
    }
    return { doc: nuevo, nodos };
  }

  /** @returns {{ doc, id }} */
  function agregarNodo(doc, diagramaId, tipo, posicion) {
    if (!TIPOS[tipo]) throw new Error(`Tipo de nodo desconocido: ${tipo}`);
    const nuevo = clonar(doc);
    const d = nuevo.diagrams[diagramaId];
    const id = nuevoId('node', idsUsados(nuevo));
    d.nodes.push({
      id,
      type: tipo,
      position: { x: Math.round(posicion.x), y: Math.round(posicion.y) },
      data: datosIniciales(tipo, nuevo.templatesByNodeType),
    });
    return { doc: nuevo, id };
  }

  function moverNodos(doc, diagramaId, ids, dx, dy) {
    const nuevo = clonar(doc);
    const set = new Set(ids);
    for (const n of nuevo.diagrams[diagramaId].nodes) {
      if (set.has(n.id)) {
        n.position = { x: Math.round(n.position.x + dx), y: Math.round(n.position.y + dy) };
      }
    }
    return nuevo;
  }

  /** IDs de todos los diagramas que cuelgan de raizId (incluido). */
  function subarbol(diagramas, raizId) {
    const vistos = new Set();
    const pila = [raizId];
    while (pila.length) {
      const id = pila.pop();
      if (vistos.has(id)) continue;
      vistos.add(id);
      const d = diagramas[id];
      if (!d) continue;
      for (const n of d.nodes) if (n.data.childDiagramId) pila.push(n.data.childDiagramId);
    }
    return vistos;
  }

  /**
   * Quita nodos y aristas. Las aristas que tocaban esos nodos se van con
   * ellos, y también los diagramas hijo de los nodos quitados (quedarían
   * huérfanos sin forma de llegar a ellos).
   */
  function quitar(doc, diagramaId, nodoIds, aristaIds) {
    const nuevo = clonar(doc);
    const d = nuevo.diagrams[diagramaId];
    const nodos = new Set(nodoIds || []);
    const aristas = new Set(aristaIds || []);
    const hijos = new Set();
    for (const n of d.nodes) {
      if (nodos.has(n.id) && n.data.childDiagramId) {
        for (const id of subarbol(nuevo.diagrams, n.data.childDiagramId)) hijos.add(id);
      }
    }
    d.nodes = d.nodes.filter((n) => !nodos.has(n.id));
    d.edges = d.edges.filter((e) => !aristas.has(e.id) && !nodos.has(e.source) && !nodos.has(e.target));
    for (const id of hijos) if (id !== nuevo.rootDiagramId) delete nuevo.diagrams[id];
    return nuevo;
  }

  /**
   * Conecta una salida con una entrada. null si no se puede: el mismo nodo,
   * un puerto que no existe o una conexión repetida.
   */
  function conectar(doc, diagramaId, origen, puertoOrigen, destino, puertoDestino) {
    if (origen === destino) return null;
    const d = doc.diagrams[diagramaId];
    const a = d.nodes.find((n) => n.id === origen);
    const b = d.nodes.find((n) => n.id === destino);
    if (!a || !b) return null;
    if (!normalizarPuertos(a.data.connectionOutputs).includes(puertoOrigen)) return null;
    if (!normalizarPuertos(b.data.connectionInputs).includes(puertoDestino)) return null;
    const repetida = d.edges.some((e) => e.source === origen && e.target === destino
      && (e.sourceHandle || PUERTO) === puertoOrigen && (e.targetHandle || PUERTO) === puertoDestino);
    if (repetida) return null;
    const nuevo = clonar(doc);
    nuevo.diagrams[diagramaId].edges.push({
      id: nuevoId('e', idsUsados(nuevo)),
      source: origen,
      target: destino,
      sourceHandle: puertoOrigen,
      targetHandle: puertoDestino,
    });
    return nuevo;
  }

  /** Cambia los datos de un nodo. Quita aristas de puertos que ya no existen. */
  function cambiarDatos(doc, diagramaId, nodoId, datos) {
    const nuevo = clonar(doc);
    const d = nuevo.diagrams[diagramaId];
    const n = d.nodes.find((x) => x.id === nodoId);
    if (!n) return nuevo;
    n.data = datos;
    const entradas = normalizarPuertos(datos.connectionInputs);
    const salidas = normalizarPuertos(datos.connectionOutputs);
    d.edges = d.edges.filter((e) => {
      if (e.source === nodoId && !salidas.includes(e.sourceHandle || PUERTO)) return false;
      if (e.target === nodoId && !entradas.includes(e.targetHandle || PUERTO)) return false;
      return true;
    });
    return nuevo;
  }

  /**
   * Diagrama hijo de un nodo: si no tiene, lo crea vacío.
   * @returns {{ doc, hijoId, creado: boolean }}
   */
  function abrirHijo(doc, diagramaId, nodoId) {
    const n = doc.diagrams[diagramaId].nodes.find((x) => x.id === nodoId);
    if (!n) return { doc, hijoId: null, creado: false };
    const actual = n.data.childDiagramId;
    if (actual && doc.diagrams[actual]) return { doc, hijoId: actual, creado: false };
    const nuevo = clonar(doc);
    const hijoId = uuid();
    nuevo.diagrams[hijoId] = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    nuevo.diagrams[diagramaId].nodes.find((x) => x.id === nodoId).data.childDiagramId = hijoId;
    return { doc: nuevo, hijoId, creado: true };
  }

  /** Desliga y borra el diagrama hijo de un nodo (con lo que cuelgue de él). */
  function quitarHijo(doc, diagramaId, nodoId) {
    const nuevo = clonar(doc);
    const n = nuevo.diagrams[diagramaId].nodes.find((x) => x.id === nodoId);
    if (!n || !n.data.childDiagramId) return nuevo;
    for (const id of subarbol(nuevo.diagrams, n.data.childDiagramId)) {
      if (id !== nuevo.rootDiagramId) delete nuevo.diagrams[id];
    }
    n.data.childDiagramId = null;
    return nuevo;
  }

  /** Nodo de `diagramaPadre` que abre `hijoId` (para las migas de pan). */
  function nodoQueAbre(doc, diagramaPadre, hijoId) {
    const d = doc.diagrams[diagramaPadre];
    return d ? d.nodes.find((n) => n.data.childDiagramId === hijoId) || null : null;
  }

  /**
   * Recorta la pila de navegación a lo que todavía existe. Un diagrama que
   * nadie abre (huérfano) se permite colgado de la raíz: así el panel de
   * problemas puede mostrarlo antes de descartarlo.
   */
  function podarPila(doc, pila) {
    const out = [];
    for (let i = 0; i < pila.length; i++) {
      const id = pila[i];
      if (!doc.diagrams[id] || (i === 0 && id !== doc.rootDiagramId)) break;
      const abierto = i === 0 || nodoQueAbre(doc, out[i - 1], id);
      const huerfano = i === 1 && !abierto && !nodoQueAbreEnAlguno(doc, id);
      if (!abierto && !huerfano) break;
      out.push(id);
    }
    return out.length ? out : [doc.rootDiagramId];
  }

  function nodoQueAbreEnAlguno(doc, id) {
    return Object.values(doc.diagrams).some((d) => d.nodes.some((n) => n.data.childDiagramId === id));
  }

  /**
   * Elimina un diagrama al que no apunta ningún nodo, con lo que cuelgue de
   * él. No hace nada si es la raíz o si alguien lo abre.
   */
  function descartarDiagrama(doc, id) {
    if (id === doc.rootDiagramId || !doc.diagrams[id] || nodoQueAbreEnAlguno(doc, id)) return doc;
    const nuevo = clonar(doc);
    for (const x of subarbol(nuevo.diagrams, id)) if (x !== nuevo.rootDiagramId) delete nuevo.diagrams[x];
    return nuevo;
  }

  // ---------- Geometría (coordenadas del diagrama) ----------

  // Tramo del ancho sobre el que se reparten los puertos (handle-layout.ts).
  const TRAMO = {
    diamond: { in: 0.44, out: 0.44 },
    semicircle: { in: 0.86, out: 0.46 },
    cylinder: { in: 0.68, out: 0.68 },
    hexagon: { in: 0.72, out: 0.72 },
    stadium: { in: 0.6, out: 0.6 },
    rect: { in: 0.86, out: 0.86 },
    rack: { in: 0.86, out: 0.86 },
  };
  const BORDE = 3;

  /**
   * Puertos de un nodo en coordenadas del diagrama: entradas arriba, salidas
   * abajo. Un rombo con dos salidas es una decisión: van a los vértices
   * izquierdo y derecho, como en los diagramas de flujo.
   * @returns {Array<{ nombre, x, y, lado: 'in'|'out', dir: 'up'|'down'|'left'|'right' }>}
   */
  function puertos(nodo) {
    const cfg = TIPOS[nodo.type];
    const { x, y } = nodo.position;
    const w = cfg.width;
    const h = cfg.height;
    const out = [];
    const entradas = normalizarPuertos(nodo.data.connectionInputs);
    const salidas = normalizarPuertos(nodo.data.connectionOutputs);
    const repartir = (i, total, tramo) => w * (0.5 + tramo * ((i + 1) / (total + 1) - 0.5));

    entradas.forEach((nombre, i) => {
      out.push({ nombre, lado: 'in', dir: 'up', x: x + repartir(i, entradas.length, TRAMO[cfg.shape].in), y });
    });
    if (cfg.shape === 'diamond' && salidas.length === 2) {
      out.push({ nombre: salidas[0], lado: 'out', dir: 'left', x: x + BORDE, y: y + h / 2 });
      out.push({ nombre: salidas[1], lado: 'out', dir: 'right', x: x + w - BORDE, y: y + h / 2 });
    } else {
      salidas.forEach((nombre, i) => {
        out.push({ nombre, lado: 'out', dir: 'down', x: x + repartir(i, salidas.length, TRAMO[cfg.shape].out), y: y + h });
      });
    }
    return out;
  }

  function puerto(nodo, lado, nombre) {
    const lista = puertos(nodo).filter((p) => p.lado === lado);
    return lista.find((p) => p.nombre === (nombre || PUERTO)) || lista[0] || null;
  }

  const DIRECCION = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  /** Curva de una arista: sale en la dirección del puerto y entra desde arriba. */
  function rutaArista(a, b) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const c = Math.max(36, Math.min(160, dist / 2));
    const [ax, ay] = DIRECCION[a.dir];
    const [bx, by] = DIRECCION[b.dir];
    return `M ${a.x} ${a.y} C ${a.x + ax * c} ${a.y + ay * c}, ${b.x + bx * c} ${b.y + by * c}, ${b.x} ${b.y}`;
  }

  /** Caja que contiene todos los nodos (para encuadrar). null si no hay. */
  function caja(diagrama) {
    if (!diagrama.nodes.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of diagrama.nodes) {
      const cfg = TIPOS[n.type];
      x1 = Math.min(x1, n.position.x);
      y1 = Math.min(y1, n.position.y);
      x2 = Math.max(x2, n.position.x + cfg.width);
      y2 = Math.max(y2, n.position.y + cfg.height);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /** Viewport que muestra toda la caja en un área de ancho × alto. */
  function encuadre(diagrama, ancho, alto, margen) {
    const c = caja(diagrama);
    if (!c) return { x: ancho / 2, y: alto / 3, zoom: 1 };
    const m = margen === undefined ? 60 : margen;
    const zoom = Math.max(0.2, Math.min(1.25, Math.min((ancho - m * 2) / c.w, (alto - m * 2) / c.h)));
    return {
      x: Math.round(ancho / 2 - (c.x + c.w / 2) * zoom),
      y: Math.round(alto / 2 - (c.y + c.h / 2) * zoom),
      zoom: Math.round(zoom * 1000) / 1000,
    };
  }

  // ---------- Dibujo (lo comparten el lienzo y la exportación) ----------

  // Fondo del lienzo: base de la mezcla del relleno (node-colors.ts).
  const FONDO = '#0d1119';
  const COLOR_ARISTA = '#6b7a93';
  const COLOR_ESTADO = {
    'TO DO': '#9aa3b2', 'IN PROGRESS': '#7cc4f5', 'ON HOLD': '#fbbf24', TESTING: '#c4b5fd', COMPLETE: '#4ade80',
  };

  function rgb(hex) {
    const c = hex.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  }

  /** Relleno, trazo y detalle de un nodo (colores planos: también sirven en la imagen). */
  function pintura(acento, seleccionado) {
    const a = rgb(acento);
    const b = rgb(FONDO);
    const mezcla = a.map((v, i) => Math.round(v * 0.13 + b[i] * 0.87));
    const alfa = (v) => `rgba(${a.join(', ')}, ${v})`;
    return {
      relleno: `rgb(${mezcla.join(', ')})`,
      trazo: seleccionado ? acento : alfa(0.58),
      grosor: seleccionado ? 2.4 : 1.5,
      detalle: alfa(0.38),
    };
  }

  const MARGEN_TRAZO = 3;
  const CIL_RY = 13;
  const SEMI_PLANO = 0.34;

  /**
   * Silueta de un nodo como lista de figuras SVG (NodeShape.tsx).
   * @returns {Array<{ tag, attrs, detalle: boolean }>}
   */
  function siluetas(shape, w, h) {
    const I = MARGEN_TRAZO;
    const cx = w / 2;
    const cy = h / 2;
    const f = (tag, attrs, detalle) => ({ tag, attrs, detalle: Boolean(detalle) });
    switch (shape) {
      case 'diamond':
        return [f('path', { d: `M ${cx} ${I} L ${w - I} ${cy} L ${cx} ${h - I} L ${I} ${cy} Z` })];
      case 'hexagon': {
        const k = Math.min(26, w / 4);
        return [f('path', { d: `M ${k} ${I} L ${w - k} ${I} L ${w - I} ${cy} L ${w - k} ${h - I} L ${k} ${h - I} L ${I} ${cy} Z` })];
      }
      case 'semicircle': {
        const plano = I + (h - I * 2) * SEMI_PLANO;
        const rx = (w - I * 2) / 2;
        return [f('path', { d: `M ${I} ${I} L ${w - I} ${I} L ${w - I} ${plano} A ${rx} ${h - I - plano} 0 0 1 ${I} ${plano} Z` })];
      }
      case 'cylinder': {
        const rx = (w - I * 2) / 2;
        const arriba = I + CIL_RY;
        const abajo = h - I - CIL_RY;
        return [
          f('path', { d: `M ${I} ${arriba} A ${rx} ${CIL_RY} 0 0 1 ${w - I} ${arriba} L ${w - I} ${abajo} A ${rx} ${CIL_RY} 0 0 1 ${I} ${abajo} Z` }),
          f('ellipse', { cx, cy: arriba, rx, ry: CIL_RY }, true),
        ];
      }
      case 'stadium':
        return [f('rect', { x: I, y: I, width: w - I * 2, height: h - I * 2, rx: (h - I * 2) / 2 })];
      case 'rack': {
        const partes = [f('rect', { x: I, y: I, width: w - I * 2, height: h - I * 2, rx: 12 })];
        for (const i of [-1, 0, 1]) partes.push(f('line', { x1: w - 26, x2: w - 13, y1: cy + i * 8, y2: cy + i * 8 }, true));
        partes.push(f('circle', { cx: 16, cy: cy - 5, r: 2.2 }, true));
        partes.push(f('circle', { cx: 16, cy: cy + 5, r: 2.2 }, true));
        return partes;
      }
      default:
        return [f('rect', { x: I, y: I, width: w - I * 2, height: h - I * 2, rx: 14 })];
    }
  }

  // Miniatura de cada silueta para la paleta, en un viewBox de 40 × 28
  // (ShapeGlyph de NodeShape.tsx): lo que se ve es lo que se va a colocar.
  const GLIFOS = {
    diamond: ['M20 3 L37 14 L20 25 L3 14 Z'],
    hexagon: ['M11 3 H29 L37 14 L29 25 H11 L3 14 Z'],
    semicircle: ['M4 4 H36 V12 A16 12 0 0 1 4 12 Z'],
    cylinder: ['M6 9 A14 5 0 0 1 34 9 V19 A14 5 0 0 1 6 19 Z', 'M6 9 A14 5 0 0 0 34 9'],
    stadium: ['M11 7 H29 A7 7 0 0 1 29 21 H11 A7 7 0 0 1 11 7 Z'],
    rect: ['M8 6 H32 A4 4 0 0 1 36 10 V18 A4 4 0 0 1 32 22 H8 A4 4 0 0 1 4 18 V10 A4 4 0 0 1 8 6 Z'],
    rack: ['M7 6 H33 A3 3 0 0 1 36 9 V19 A3 3 0 0 1 33 22 H7 A3 3 0 0 1 4 19 V9 A3 3 0 0 1 7 6 Z', 'M27 11h5M27 14h5M27 17h5'],
  };

  // Zona del texto dentro de cada silueta: [x, y, ancho, alto] en fracciones.
  const AREA_TEXTO = {
    diamond: [0.24, 0.2, 0.52, 0.6],
    hexagon: [0.13, 0.08, 0.74, 0.84],
    semicircle: [0.07, 0.06, 0.86, 0.6],
    cylinder: [0.07, 0.25, 0.86, 0.66],
    stadium: [0.12, 0.08, 0.76, 0.84],
    rect: [0.06, 0.08, 0.88, 0.84],
    rack: [0.1, 0.08, 0.74, 0.84],
  };

  /**
   * Dónde está cada diagrama: los ids y los nombres de la raíz al diagrama,
   * siguiendo los nodos que lo abren (node-search.ts buildDiagramPaths). Los
   * diagramas a los que no llega nadie no aparecen.
   * @returns {Map<string, { ids: string[], nombres: string[] }>}
   */
  function caminosDiagramas(doc) {
    const out = new Map();
    const raizNombre = String(doc.meta.name || '').trim() || 'Principal';
    const cola = [{ id: doc.rootDiagramId, ids: [doc.rootDiagramId], nombres: [raizNombre] }];
    while (cola.length) {
      const actual = cola.shift();
      if (out.has(actual.id)) continue;
      out.set(actual.id, { ids: actual.ids, nombres: actual.nombres });
      const d = doc.diagrams[actual.id];
      if (!d) continue;
      for (const n of d.nodes) {
        const hijo = n.data.childDiagramId;
        if (!hijo || out.has(hijo) || !doc.diagrams[hijo]) continue;
        cola.push({
          id: hijo,
          ids: [...actual.ids, hijo],
          nombres: [...actual.nombres, String(n.data.name || '').trim() || TIPOS[n.type].label],
        });
      }
    }
    return out;
  }

  /** Sólo los nombres de cada camino. @returns {Map<string, string[]>} */
  function rutasDiagramas(doc) {
    const out = new Map();
    for (const [id, c] of caminosDiagramas(doc)) out.set(id, c.nombres);
    return out;
  }

  // ---------- Lectura ----------

  const HTTP = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']);
  const CLAVES_METODO = new Set(['metodo', 'method', 'verbo', 'verb', 'httpmethod', 'http']);
  const CLAVES_RUTA = new Set(['endpoint', 'endpoints', 'ruta', 'route', 'path', 'url', 'uri']);

  function normalizarClave(k) {
    return String(k).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_-]+/g, '');
  }

  /** Método y ruta de un endpoint, de sus atributos (node-facts.ts). */
  function datosHttp(data) {
    let metodo = null;
    let ruta = null;
    for (const attr of data.attributes || []) {
      if (!attr || !attr.key) continue;
      const k = normalizarClave(attr.key);
      const v = String(attr.value || '').trim();
      if (!v) continue;
      if (!metodo && CLAVES_METODO.has(k) && HTTP.has(v.toUpperCase())) metodo = v.toUpperCase();
      else if (!ruta && CLAVES_RUTA.has(k) && !v.startsWith('{')) ruta = v;
    }
    if (!ruta && typeof data.endpoints === 'string' && data.endpoints.trim()) ruta = data.endpoints.trim();
    return { metodo, ruta };
  }

  // ---------- Buscar y filtrar ----------

  /** Sin acentos ni mayúsculas: "verificacion" encuentra "Verificación". */
  function sinAcentos(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // Un nombre que empieza con lo buscado pesa más que una mención en la
  // descripción, para que lo obvio salga primero (node-search.ts).
  function puntaje(texto, buscado, peso) {
    if (!texto) return 0;
    const i = texto.indexOf(buscado);
    if (i < 0) return 0;
    if (texto === buscado) return peso * 3;
    if (i === 0) return peso * 2;
    return peso;
  }

  /**
   * Nodos de todo el proyecto (también dentro de diagramas de detalle).
   * @returns {Array<{ nodoId, diagramaId, ids, migas, tipo, nombre, descripcion, metodo, ruta, estado, puntaje }>}
   */
  function buscarNodos(doc, texto, limite) {
    const q = sinAcentos(String(texto || '').trim());
    if (!q) return [];
    const out = [];
    for (const [diagramaId, camino] of caminosDiagramas(doc)) {
      for (const n of doc.diagrams[diagramaId].nodes) {
        const cfg = TIPOS[n.type];
        const nombre = String(n.data.name || '').trim() || cfg.label;
        const descripcion = String(n.data.description || '').trim();
        const { metodo, ruta } = datosHttp(n.data);
        const p = puntaje(sinAcentos(nombre), q, 100)
          + puntaje(sinAcentos(ruta), q, 80)
          + puntaje(sinAcentos(metodo), q, 60)
          + puntaje(sinAcentos(cfg.label), q, 20)
          + puntaje(sinAcentos(descripcion), q, 10);
        if (!p) continue;
        out.push({
          nodoId: n.id, diagramaId, ids: camino.ids, migas: camino.nombres, tipo: n.type,
          nombre, descripcion, metodo, ruta, estado: normalizarEstado(n.data.status), puntaje: p,
        });
      }
    }
    return out.sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre)).slice(0, limite || 40);
  }

  // ---------- Flujo de un request (request-flow-paths.ts) ----------

  const SEP_VERTICAL = 210;
  const SEP_HORIZONTAL = 360;

  /**
   * Acomoda sólo los nodos de los caminos: de arriba (inicio) a abajo
   * (destino). Con varios caminos, cada nodo va a la profundidad máxima en la
   * que aparece y, en su fila, según el promedio de los caminos que lo usan.
   */
  function acomodarFlujo(diagrama, rutas) {
    const pos = new Map();
    if (rutas.length === 1) {
      rutas[0].nodos.forEach((id, i) => pos.set(id, { x: 0, y: i * SEP_VERTICAL }));
    } else {
      const datos = new Map();
      rutas.forEach((r, ri) => r.nodos.forEach((id, prof) => {
        const d = datos.get(id) || { prof: 0, rutas: [] };
        d.prof = Math.max(d.prof, prof);
        d.rutas.push(ri);
        datos.set(id, d);
      }));
      const filas = new Map();
      for (const [id, d] of datos) filas.set(d.prof, [...(filas.get(d.prof) || []), id]);
      const prom = (id) => {
        const r = datos.get(id).rutas;
        return r.reduce((a, b) => a + b, 0) / r.length;
      };
      for (const [prof, ids] of filas) {
        const orden = [...ids].sort((a, b) => prom(a) - prom(b) || a.localeCompare(b));
        orden.forEach((id, i) => pos.set(id, { x: (i - (orden.length - 1) / 2) * SEP_HORIZONTAL, y: prof * SEP_VERTICAL }));
      }
    }
    return {
      nodes: diagrama.nodes.map((n) => ({ ...n, position: pos.get(n.id) || n.position })),
      edges: diagrama.edges,
    };
  }

  /**
   * Todos los caminos que llegan a `destinoId` dentro de un diagrama,
   * siguiendo las conexiones hacia atrás hasta un nodo sin entradas.
   * @returns {{ diagrama, inicios: string[], rutas: Array<{ nodos, aristas }>, avisos: string[] }}
   *   diagrama: sólo los nodos y conexiones de los caminos, ya acomodados.
   */
  function flujoRequest(diagrama, destinoId) {
    const vacio = (aviso) => ({ diagrama: { nodes: [], edges: [] }, inicios: [], rutas: [], avisos: [aviso] });
    if (!diagrama.nodes.length) return vacio('El diagrama no tiene nodos.');
    const porId = new Map(diagrama.nodes.map((n) => [n.id, n]));
    if (!porId.has(destinoId)) return vacio('Ese nodo no está en este diagrama.');

    const entradas = new Map();
    const conectados = new Set();
    for (const e of diagrama.edges) {
      if (!porId.has(e.source) || !porId.has(e.target)) continue;
      conectados.add(e.source);
      conectados.add(e.target);
      entradas.set(e.target, [...(entradas.get(e.target) || []), e]);
    }
    if (!conectados.has(destinoId)) return vacio('Este nodo no tiene conexiones.');

    const inicios = new Set();
    const nodos = new Set();
    const aristas = new Set();
    const ciclos = new Set();
    const rutas = [];
    // Tope para diagramas muy ramificados: el número de caminos crece rápido.
    const MAX_RUTAS = 200;

    const visitar = (id, camino, caminoAristas) => {
      if (rutas.length >= MAX_RUTAS) return;
      if (camino.includes(id)) {
        ciclos.add(id);
        return;
      }
      const siguiente = [...camino, id];
      const llegan = entradas.get(id) || [];
      if (!llegan.length) {
        inicios.add(id);
        const ruta = { nodos: [...siguiente].reverse(), aristas: [...caminoAristas].reverse() };
        rutas.push(ruta);
        ruta.nodos.forEach((x) => nodos.add(x));
        ruta.aristas.forEach((x) => aristas.add(x));
        return;
      }
      for (const e of llegan) visitar(e.source, siguiente, [...caminoAristas, e.id]);
    };
    visitar(destinoId, [], []);

    const avisos = [];
    if (!rutas.length) avisos.push('Ningún camino llega a este nodo desde un inicio: todo lo que entra viene de un ciclo.');
    if (ciclos.size) {
      const nombres = [...ciclos].map((id) => String(porId.get(id).data.name || '').trim() || TIPOS[porId.get(id).type].label);
      avisos.push(`Hay ciclos; no se repiten las vueltas en: ${nombres.join(', ')}.`);
    }
    if (rutas.length >= MAX_RUTAS) avisos.push(`Se muestran sólo los primeros ${MAX_RUTAS} caminos.`);

    const sub = {
      nodes: diagrama.nodes.filter((n) => nodos.has(n.id)),
      edges: diagrama.edges.filter((e) => aristas.has(e.id)),
    };
    return { diagrama: acomodarFlujo(sub, rutas), inicios: [...inicios], rutas, avisos };
  }

  /** Destino por omisión al abrir el flujo de un diagrama hijo: su primer endpoint, o un nodo final conectado. */
  function destinoPorOmision(diagrama) {
    const ep = diagrama.nodes.find((n) => n.type === 'endpoint');
    if (ep) return ep.id;
    const salen = new Set(diagrama.edges.map((e) => e.source));
    const final = diagrama.nodes.find((n) => !salen.has(n.id) && diagrama.edges.some((e) => e.target === n.id));
    return (final || diagrama.nodes[0] || {}).id || null;
  }

  // ---------- Problemas del proyecto (diagnostics.ts) ----------

  /**
   * Lo que impide que la documentación esté completa. Errores primero y,
   * dentro de cada nivel, agrupados por ubicación.
   * @returns {Array<{ id, nivel: 'error'|'aviso', titulo, sujeto, detalle, donde,
   *   ids: string[]|null, nodoId: string|null, descartable?: string }>}
   */
  function problemas(doc) {
    const out = [];
    const caminos = caminosDiagramas(doc);
    const plantillas = doc.templatesByNodeType || {};

    // Diagramas a los que no se llega desde la raíz.
    for (const [id, d] of Object.entries(doc.diagrams)) {
      if (caminos.has(id)) continue;
      const nombres = d.nodes.map((n) => String(n.data.name || '').trim() || TIPOS[n.type].label);
      const resto = nombres.length - 3;
      out.push({
        id: `huerfano:${id}`,
        nivel: 'aviso',
        titulo: 'Diagrama inalcanzable',
        sujeto: nombres.length ? `${nombres.slice(0, 3).join(', ')}${resto > 0 ? ` y ${resto} más` : ''}` : 'Diagrama vacío y sin enlazar',
        detalle: nombres.length
          ? `Ningún nodo lo abre, así que no aparece al navegar. Tiene ${d.nodes.length} nodo(s): ábrelo para revisarlo, o descártalo.`
          : 'Ningún nodo lo abre y está vacío: es un resto en el proyecto y se puede descartar.',
        donde: 'Fuera de la navegación',
        ids: d.nodes.length ? [doc.rootDiagramId, id] : null,
        nodoId: d.nodes.length ? d.nodes[0].id : null,
        descartable: id,
      });
    }

    for (const [id, d] of Object.entries(doc.diagrams)) {
      const camino = caminos.get(id);
      const donde = camino ? camino.nombres.join(' / ') : 'Fuera de la navegación';
      if (camino && !d.nodes.length && id !== doc.rootDiagramId) {
        out.push({
          id: `vacio:${id}`, nivel: 'aviso', titulo: 'Diagrama vacío',
          sujeto: camino.nombres[camino.nombres.length - 1],
          detalle: 'El diagrama de detalle existe pero no tiene ningún nodo.',
          donde, ids: camino.ids, nodoId: null,
        });
      }

      const conectados = new Set();
      for (const e of d.edges) {
        conectados.add(e.source);
        conectados.add(e.target);
      }

      for (const n of d.nodes) {
        const cfg = TIPOS[n.type];
        const nombre = String(n.data.name || '').trim();
        const base = { donde, ids: camino ? camino.ids : null, nodoId: n.id, sujeto: nombre || `(${cfg.label} sin nombre)` };

        if (!nombre) {
          out.push({ id: `sinnombre:${n.id}`, nivel: 'aviso', titulo: 'Nodo sin nombre',
            detalle: `Sale como «${cfg.label}» en el lienzo y en la documentación exportada.`, ...base });
        }
        if (d.nodes.length > 1 && !conectados.has(n.id)) {
          out.push({ id: `suelto:${n.id}`, nivel: 'aviso', titulo: 'Nodo suelto',
            detalle: 'No tiene ninguna conexión, así que no forma parte de ningún flujo.', ...base });
        }
        if (n.type === 'endpoint') {
          const { metodo, ruta } = datosHttp(n.data);
          if (!ruta) {
            out.push({ id: `sinruta:${n.id}`, nivel: 'error', titulo: 'Endpoint sin ruta',
              detalle: 'Le falta el atributo Endpoint (o el campo Endpoints): no muestra su ruta en el lienzo ni en el Markdown.', ...base });
          }
          if (!metodo) {
            out.push({ id: `sinmetodo:${n.id}`, nivel: 'error', titulo: 'Endpoint sin método',
              detalle: 'Le falta el atributo Metodo con un verbo HTTP válido (GET, POST, …).', ...base });
          }
        }
        const hijo = n.data.childDiagramId;
        if (hijo && !doc.diagrams[hijo]) {
          out.push({ id: `rota:${n.id}`, nivel: 'error', titulo: 'Referencia rota a diagrama de detalle',
            detalle: 'Apunta a un diagrama de detalle que ya no existe en el proyecto.', ...base });
        }

        // Campos que la plantilla de su tipo marca como obligatorios.
        for (const def of plantillas[n.type] || []) {
          if (!def.required) continue;
          let valor;
          if (CLAVES_BASE.has(def.key)) valor = n.data[def.key];
          else {
            const attr = (n.data.attributes || []).find((a) => String(a.key || '').trim().toLowerCase() === def.key.toLowerCase());
            valor = attr && attr.value;
          }
          if (!String(valor || '').trim()) {
            out.push({ id: `obligatorio:${n.id}:${def.key}`, nivel: 'aviso', titulo: 'Campo obligatorio vacío',
              detalle: `La plantilla de ${cfg.label} pide «${def.label || def.key}» y este nodo no lo tiene lleno.`, ...base });
          }
        }
      }
    }

    const peso = (x) => (x.nivel === 'error' ? 0 : 1);
    return out.sort((a, b) => peso(a) - peso(b) || a.donde.localeCompare(b.donde));
  }

  /** Cuántos nodos hay de cada estado en una lista. */
  function conteoPorEstado(nodos) {
    const c = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    for (const n of nodos) c[normalizarEstado(n.data.status)]++;
    return c;
  }

  /** Conteo por estado de todos los nodos del proyecto. */
  function conteoEstados(doc) {
    const c = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    for (const d of Object.values(doc.diagrams)) for (const n of d.nodes) c[normalizarEstado(n.data.status)]++;
    return c;
  }

  return {
    TIPOS, GRUPOS, ESTADOS, ESTADO_CORTO, TIPOS_ATRIBUTO, PUERTO, RAIZ,
    normalizarEstado, claseEstado, normalizarPuertos, puertosDesdeTexto,
    nuevoId, documentoVacio, slugDesdeNombre, slugValido, clonar,
    agregarNodo, moverNodos, quitar, conectar, cambiarDatos,
    limpiarPlantilla, ponerPlantilla, contarTipo, aplicarPlantilla,
    problemas, descartarDiagrama,
    flujoRequest, destinoPorOmision,
    abrirHijo, quitarHijo, nodoQueAbre, podarPila, subarbol,
    puertos, puerto, rutaArista, caja, encuadre,
    FONDO, COLOR_ARISTA, COLOR_ESTADO, AREA_TEXTO, GLIFOS, pintura, siluetas, rutasDiagramas,
    caminosDiagramas, buscarNodos, conteoPorEstado, sinAcentos,
    datosHttp, conteoEstados,
  };
});
