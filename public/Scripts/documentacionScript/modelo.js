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

  /** Recorta la pila de navegación a lo que todavía existe. */
  function podarPila(doc, pila) {
    const out = [];
    for (let i = 0; i < pila.length; i++) {
      const id = pila[i];
      if (!doc.diagrams[id]) break;
      if (i > 0 && !nodoQueAbre(doc, out[i - 1], id)) break;
      out.push(id);
    }
    return out.length ? out : [doc.rootDiagramId];
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
    abrirHijo, quitarHijo, nodoQueAbre, podarPila, subarbol,
    puertos, puerto, rutaArista, caja, encuadre,
    datosHttp, conteoEstados,
  };
});
