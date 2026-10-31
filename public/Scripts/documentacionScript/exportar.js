/**
 * Exportaciones de Doc visual, sin DOM (se prueban con jest):
 * - markdownProyecto: documentación Markdown de todo el proyecto, como
 *   export-markdown.ts de la app anterior (índice de endpoints + fichas).
 * - svgDiagrama: un diagrama como SVG independiente, con texto SVG y colores
 *   planos. No usa foreignObject ni las hojas de estilo de la página: así se
 *   puede pasar a PNG en un canvas sin que el navegador lo bloquee.
 */
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./modelo'));
  } else {
    raiz.DocExportar = fabrica(raiz.DocModelo);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';

  // ==================== Markdown ====================

  const ORDEN_METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];

  function celda(v) {
    return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  }

  function ancla(nodo, metodo, ruta) {
    const base = [metodo, ruta, nodo.data.name].filter(Boolean).join(' ');
    return base.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || nodo.id;
  }

  function tabla(valor) {
    try {
      const t = JSON.parse(valor);
      const columnas = Array.isArray(t.columns) && t.columns.length ? t.columns.map(String) : ['Columna 1'];
      const filas = Array.isArray(t.rows) ? t.rows.map((r) => columnas.map((_, i) => String((r || [])[i] ?? ''))) : [];
      return { columnas, filas };
    } catch {
      return null;
    }
  }

  /** Un atributo según su tipo: tabla como tabla, JSON en bloque de código. */
  function atributo(attr) {
    const clave = String(attr.key || '').trim() || '(sin clave)';
    const valor = String(attr.value || '').trim();
    if (!valor) return [];
    if (attr.kind === 'table') {
      const t = tabla(valor);
      if (!t || !t.filas.length) return [`**${clave}**`, '', '_Sin filas._', ''];
      return [
        `**${clave}**`, '',
        `| ${t.columnas.map(celda).join(' | ')} |`,
        `| ${t.columnas.map(() => '---').join(' | ')} |`,
        ...t.filas.map((f) => `| ${f.map(celda).join(' | ')} |`),
        '',
      ];
    }
    if (attr.kind === 'json') {
      let bonito = valor;
      try {
        bonito = JSON.stringify(JSON.parse(valor), null, 2);
      } catch { /* tal cual si no es JSON válido */ }
      return [`**${clave}**`, '', '```json', bonito, '```', ''];
    }
    if (attr.kind === 'textarea' || valor.includes('\n')) return [`**${clave}**`, '', valor, ''];
    return [`**${clave}**: \`${valor}\``, ''];
  }

  /**
   * @param {Object} doc ProjectDocument
   * @param {string} fecha texto de la fecha de generación
   */
  function markdownProyecto(doc, fecha) {
    const lineas = [];
    const rutas = M.rutasDiagramas(doc);
    lineas.push(`# ${String(doc.meta.name || '').trim() || 'Proyecto sin nombre'}`, '');
    if (String(doc.meta.description || '').trim()) lineas.push(doc.meta.description.trim(), '');
    lineas.push(`> Generado desde Documentación (Pass Manager) el ${fecha}.`, '');

    const endpoints = [];
    const otros = [];
    for (const [id, d] of Object.entries(doc.diagrams)) {
      const donde = rutas.get(id);
      if (!donde) continue;
      for (const nodo of d.nodes) {
        const { metodo, ruta } = M.datosHttp(nodo.data);
        const e = { nodo, metodo, ruta, donde };
        if (nodo.type === 'endpoint') endpoints.push(e);
        else otros.push(e);
      }
    }
    endpoints.sort((a, b) => (a.ruta || '').localeCompare(b.ruta || '')
      || ORDEN_METODOS.indexOf(a.metodo || '') - ORDEN_METODOS.indexOf(b.metodo || ''));

    const estado = (n) => M.normalizarEstado(n.data.status);
    const nombre = (n) => String(n.data.name || '').trim() || 'Sin nombre';

    if (endpoints.length) {
      lineas.push('## Índice de endpoints', '', '| Método | Ruta | Nombre | Estado |', '| --- | --- | --- | --- |');
      for (const e of endpoints) {
        lineas.push(`| ${e.metodo ? `\`${e.metodo}\`` : '—'} | ${e.ruta ? `\`${e.ruta}\`` : '—'} | [${celda(nombre(e.nodo))}](#${ancla(e.nodo, e.metodo, e.ruta)}) | ${estado(e.nodo)} |`);
      }
      lineas.push('', '## Endpoints', '');
      for (const e of endpoints) {
        lineas.push(`### ${[e.metodo, e.ruta, `— ${nombre(e.nodo)}`].filter(Boolean).join(' ')}`, '');
        lineas.push(`\`${estado(e.nodo)}\` · ubicado en ${e.donde.join(' / ')}`, '');
        if (String(e.nodo.data.description || '').trim()) lineas.push(e.nodo.data.description.trim(), '');
        for (const a of e.nodo.data.attributes || []) {
          // Método y ruta ya encabezan la ficha.
          const k = String(a.key || '').trim().toLowerCase();
          if (k === 'metodo' || k === 'método' || k === 'endpoint') continue;
          lineas.push(...atributo(a));
        }
        lineas.push('');
      }
    }

    const documentados = otros.filter((e) => String(e.nodo.data.description || '').trim() || (e.nodo.data.attributes || []).length);
    if (documentados.length) {
      lineas.push('## Otros componentes', '');
      const porTipo = new Map();
      for (const e of documentados) {
        const etiqueta = M.TIPOS[e.nodo.type].label;
        porTipo.set(etiqueta, [...(porTipo.get(etiqueta) || []), e]);
      }
      for (const [etiqueta, lista] of [...porTipo].sort((a, b) => a[0].localeCompare(b[0]))) {
        lineas.push(`### ${etiqueta}`, '');
        for (const e of lista) {
          lineas.push(`#### ${nombre(e.nodo)}`, '');
          lineas.push(`\`${estado(e.nodo)}\` · ubicado en ${e.donde.join(' / ')}`, '');
          if (String(e.nodo.data.description || '').trim()) lineas.push(e.nodo.data.description.trim(), '');
          for (const a of e.nodo.data.attributes || []) lineas.push(...atributo(a));
          lineas.push('');
        }
      }
    }

    return `${lineas.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
  }

  // ==================== SVG ====================

  const MARGEN = 64;
  const LETRA = "'Segoe UI', Arial, sans-serif";
  const MONO = "Consolas, 'Courier New', monospace";

  function xml(v) {
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function etiqueta(tag, attrs, contenido) {
    const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${xml(v)}"`).join('');
    return contenido === undefined ? `<${tag}${a}/>` : `<${tag}${a}>${contenido}</${tag}>`;
  }

  /** Corta un texto en hasta `max` líneas que quepan en `ancho` (estimado). */
  function envolver(texto, ancho, tam, max) {
    const porLinea = Math.max(4, Math.floor(ancho / (tam * 0.56)));
    const palabras = String(texto).split(/\s+/).filter(Boolean);
    const lineas = [];
    let actual = '';
    for (const p of palabras) {
      const intento = actual ? `${actual} ${p}` : p;
      if (intento.length <= porLinea) {
        actual = intento;
        continue;
      }
      if (actual) lineas.push(actual);
      actual = p.length > porLinea ? `${p.slice(0, porLinea - 1)}…` : p;
    }
    if (actual) lineas.push(actual);
    if (lineas.length > max) {
      const corte = lineas.slice(0, max);
      corte[max - 1] = `${corte[max - 1].slice(0, porLinea - 1)}…`;
      return corte;
    }
    return lineas;
  }

  function recortar(texto, ancho, tam) {
    const max = Math.max(4, Math.floor(ancho / (tam * 0.6)));
    return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
  }

  function textoNodo(n, cfg) {
    const [fx, fy, fw, fh] = M.AREA_TEXTO[cfg.shape];
    const x0 = cfg.width * fx;
    const ancho = cfg.width * fw;
    const cx = x0 + ancho / 2;
    const texto = String(n.data.name || '').trim() || cfg.label;
    const { metodo, ruta } = M.datosHttp(n.data);
    const http = metodo || ruta ? recortar([metodo, ruta].filter(Boolean).join(' '), ancho, 10.5) : null;
    const estado = M.normalizarEstado(n.data.status);

    // En figuras bajitas (Inicio, Fin) no cabe todo: primero se va la
    // etiqueta del tipo y luego la segunda línea del nombre.
    const disponible = cfg.height * fh;
    const medir = (conTipo, lineas) => (conTipo ? 15 : 0) + lineas * 16 + (http ? 15 : 0) + 3 + 15;
    let conTipo = true;
    let nombre = envolver(texto, ancho, 13, 2);
    if (medir(conTipo, nombre.length) > disponible) conTipo = false;
    if (medir(conTipo, nombre.length) > disponible) nombre = envolver(texto, ancho, 13, 1);

    let y = cfg.height * fy + (disponible - medir(conTipo, nombre.length)) / 2;
    const partes = [];
    if (conTipo) {
      partes.push(etiqueta('text', {
        x: cx, y: y + 9, 'text-anchor': 'middle', fill: cfg.accent, 'font-family': LETRA, 'font-size': 9.5, 'font-weight': 700, 'letter-spacing': 0.6,
      }, xml(cfg.label.toUpperCase())));
      y += 15;
    }
    for (const l of nombre) {
      partes.push(etiqueta('text', {
        x: cx, y: y + 12, 'text-anchor': 'middle', fill: '#e8edf6', 'font-family': LETRA, 'font-size': 13, 'font-weight': 600,
      }, xml(l)));
      y += 16;
    }
    if (http) {
      partes.push(etiqueta('text', {
        x: cx, y: y + 11, 'text-anchor': 'middle', fill: '#c4b5fd', 'font-family': MONO, 'font-size': 10.5,
      }, xml(http)));
      y += 15;
    }
    y += 3;
    const chip = M.ESTADO_CORTO[estado];
    const anchoChip = chip.length * 5.8 + 12;
    const hijo = n.data.childDiagramId ? '▸ detalle' : '';
    const anchoTotal = anchoChip + (hijo ? 6 + hijo.length * 5.5 : 0);
    const xChip = cx - anchoTotal / 2;
    partes.push(etiqueta('rect', {
      x: xChip, y, width: anchoChip, height: 14, rx: 7, fill: 'none', stroke: M.COLOR_ESTADO[estado], 'stroke-width': 1,
    }));
    partes.push(etiqueta('text', {
      x: xChip + anchoChip / 2, y: y + 10.5, 'text-anchor': 'middle', fill: M.COLOR_ESTADO[estado], 'font-family': LETRA, 'font-size': 9.5, 'font-weight': 600,
    }, xml(chip)));
    if (hijo) {
      partes.push(etiqueta('text', {
        x: xChip + anchoChip + 6, y: y + 10.5, fill: '#7cc4f5', 'font-family': LETRA, 'font-size': 10,
      }, xml(hijo)));
    }
    return partes.join('');
  }

  /**
   * Un diagrama como SVG independiente.
   * @returns {{ svg: string, ancho: number, alto: number } | null} null si no hay nodos
   */
  function svgDiagrama(diagrama, opciones) {
    const op = opciones || {};
    const c = M.caja(diagrama);
    if (!c) return null;
    const arriba = op.titulo ? MARGEN + 28 : MARGEN;
    const ancho = Math.ceil(c.w + MARGEN * 2);
    const alto = Math.ceil(c.h + arriba + MARGEN);
    const dx = MARGEN - c.x;
    const dy = arriba - c.y;
    const porId = new Map(diagrama.nodes.map((n) => [n.id, n]));
    const out = [];

    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">`);
    out.push(`<defs><marker id="f" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${M.COLOR_ARISTA}"/></marker></defs>`);
    out.push(etiqueta('rect', { x: 0, y: 0, width: ancho, height: alto, fill: M.FONDO }));
    if (op.titulo) {
      out.push(etiqueta('text', { x: 32, y: 44, fill: '#ffffff', 'font-family': LETRA, 'font-size': 18, 'font-weight': 700 }, xml(op.titulo)));
    }
    out.push(`<g transform="translate(${dx} ${dy})">`);

    for (const e of diagrama.edges) {
      const a = porId.get(e.source);
      const b = porId.get(e.target);
      if (!a || !b) continue;
      const pa = M.puerto(a, 'out', e.sourceHandle);
      const pb = M.puerto(b, 'in', e.targetHandle);
      if (!pa || !pb) continue;
      out.push(etiqueta('path', { d: M.rutaArista(pa, pb), fill: 'none', stroke: M.COLOR_ARISTA, 'stroke-width': 1.6, 'marker-end': 'url(#f)' }));
    }

    for (const n of diagrama.nodes) {
      const cfg = M.TIPOS[n.type];
      const color = M.pintura(cfg.accent, false);
      out.push(`<g transform="translate(${n.position.x} ${n.position.y})">`);
      for (const f of M.siluetas(cfg.shape, cfg.width, cfg.height)) {
        out.push(etiqueta(f.tag, f.detalle
          ? { ...f.attrs, fill: 'none', stroke: color.detalle, 'stroke-width': 1.2 }
          : { ...f.attrs, fill: color.relleno, stroke: color.trazo, 'stroke-width': color.grosor }));
      }
      out.push(textoNodo(n, cfg));
      const lista = M.puertos(n);
      const varios = { in: lista.filter((p) => p.lado === 'in').length > 1, out: lista.filter((p) => p.lado === 'out').length > 1 };
      for (const p of lista) {
        const px = p.x - n.position.x;
        const py = p.y - n.position.y;
        out.push(etiqueta('circle', { cx: px, cy: py, r: 4.5, fill: M.FONDO, stroke: cfg.accent, 'stroke-width': 1.6 }));
        if (varios[p.lado]) {
          const off = { up: [0, -10], down: [0, 16], left: [-10, 4], right: [10, 4] }[p.dir];
          out.push(etiqueta('text', {
            x: px + off[0], y: py + off[1], fill: '#c7cfdc', 'font-family': MONO, 'font-size': 10,
            'text-anchor': p.dir === 'left' ? 'end' : p.dir === 'right' ? 'start' : 'middle',
          }, xml(p.nombre)));
        }
      }
      out.push('</g>');
    }
    out.push('</g></svg>');
    return { svg: out.join(''), ancho, alto };
  }

  return { markdownProyecto, svgDiagrama, envolver };
});
