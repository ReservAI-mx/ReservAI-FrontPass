/**
 * Sincronización de un proyecto de Doc visual con Tickets, sin DOM (se
 * prueba con jest):
 * - bloquesParaTickets: los nodos de todos los diagramas, como los pide
 *   POST /api/tickets/documentacion/sincronizar.
 * - aplicarTickets: pone en cada nodo el estado que regresó Tickets y su
 *   número de ticket (atributo "ticket"), sin tocar lo demás.
 */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./modelo'));
  } else {
    raiz.DocTickets = fabrica(raiz.DocModelo);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';

  // Inicio y fin de un subflujo no son trabajo: no llevan ticket.
  const SIN_TICKET = new Set(['flowStart', 'flowEnd']);
  const ATRIBUTO = 'ticket';

  function texto(v, max) {
    return typeof v === 'string' ? v.trim().slice(0, max) : '';
  }

  // Atributos con estos nombres viajan como campos del ticket.
  const CAMPOS = {
    feature: 'feature', endpoints: 'endpoints', endpoint: 'endpoints', ruta: 'endpoints', route: 'endpoints',
    input: 'input', entrada: 'input', output: 'output', salida: 'output', codigos: 'codigos', codes: 'codigos',
  };

  /** Nombre del nodo que abre cada diagrama hijo (para "Diagrama: X › Y"). */
  function nombresDeDiagramas(doc) {
    const nombres = {};
    for (const d of Object.values(doc.diagrams || {})) {
      for (const n of d.nodes || []) {
        if (n.data && n.data.childDiagramId) nombres[n.data.childDiagramId] = texto(n.data.name, 150);
      }
    }
    return nombres;
  }

  function bloquesParaTickets(doc) {
    const nombres = nombresDeDiagramas(doc);
    const bloques = [];
    for (const [id, d] of Object.entries(doc.diagrams || {})) {
      for (const n of d.nodes || []) {
        if (SIN_TICKET.has(n.type) || !n.data || !texto(n.data.name, 150)) continue;
        const b = {
          id: n.id,
          nombre: texto(n.data.name, 150),
          descripcion: texto(n.data.description, 4000),
          estado: M.normalizarEstado(n.data.status),
          tipo: n.type,
          diagrama: id === doc.rootDiagramId ? '' : nombres[id] || '',
        };
        for (const a of n.data.attributes || []) {
          const campo = CAMPOS[String(a.key || '').toLowerCase()];
          if (campo && typeof a.value === 'string' && a.value.trim()) b[campo] = texto(a.value, 1000);
        }
        bloques.push(b);
      }
    }
    return bloques;
  }

  /**
   * @param {Array<{nodo_id, estado, numero}>} paraDoc lo que regresó Tickets
   * @returns {{ doc, cambios: number }} doc nuevo (el original no se toca)
   */
  function aplicarTickets(doc, paraDoc) {
    const porNodo = new Map((paraDoc || []).map((x) => [x.nodo_id, x]));
    const nuevo = JSON.parse(JSON.stringify(doc));
    let cambios = 0;
    for (const d of Object.values(nuevo.diagrams || {})) {
      for (const n of d.nodes || []) {
        const r = porNodo.get(n.id);
        if (!r) continue;
        const estado = M.normalizarEstado(r.estado);
        const etiqueta = `T-${r.numero}`;
        const attrs = n.data.attributes || [];
        const actual = attrs.find((a) => a.key === ATRIBUTO);
        let cambio = false;
        if (M.normalizarEstado(n.data.status) !== estado) {
          n.data.status = estado;
          cambio = true;
        }
        if (!actual) {
          n.data.attributes = [...attrs, { key: ATRIBUTO, kind: 'text', value: etiqueta }];
          cambio = true;
        } else if (actual.value !== etiqueta) {
          actual.value = etiqueta;
          cambio = true;
        }
        if (cambio) cambios++;
      }
    }
    return { doc: nuevo, cambios };
  }

  return { bloquesParaTickets, aplicarTickets };
});
