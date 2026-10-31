/**
 * Lienzo SVG del editor: dibuja un diagrama y traduce el ratón (o el dedo)
 * en intenciones — mover, seleccionar, conectar, desplazar, acercar. No
 * cambia el documento: avisa con callbacks y la app decide.
 *
 * Coordenadas: los nodos viven en coordenadas del diagrama; el viewport
 * { x, y, zoom } las lleva a pantalla (pantalla = diagrama * zoom + x).
 */

const M = globalThis.DocModelo;
const SVG = 'http://www.w3.org/2000/svg';
const XHTML = 'http://www.w3.org/1999/xhtml';
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const UMBRAL_ARRASTRE = 4;
function svg(tag, attrs) {
  const el = document.createElementNS(SVG, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export class Lienzo {
  /**
   * @param {HTMLElement} contenedor
   * @param {Object} cb onSeleccion(sel), onMover(ids, dx, dy), onConectar(o, po, d, pd),
   *   onAbrir(nodoId), onViewport(vp), onSoltarTipo(tipo, punto)
   * @param {Object} [op] { minimapa: boolean } (por omisión, con minimapa)
   */
  constructor(contenedor, cb, op = {}) {
    this.cont = contenedor;
    this.cb = cb;
    this.diagrama = null;
    this.vp = { x: 0, y: 0, zoom: 1 };
    this.sel = { nodos: new Set(), aristas: new Set() };
    this.soloLectura = true;
    this.estadosOcultos = new Set();

    this.svg = svg('svg', { class: 'dv-svg', role: 'application', 'aria-label': 'Lienzo del diagrama' });
    const defs = svg('defs');
    const flecha = svg('marker', {
      id: 'dv-flecha', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse',
    });
    flecha.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'dv-flecha' }));
    const flechaSel = flecha.cloneNode(true);
    flechaSel.setAttribute('id', 'dv-flecha-sel');
    flechaSel.firstChild.setAttribute('class', 'dv-flecha dv-flecha--sel');
    defs.append(flecha, flechaSel);
    this.svg.appendChild(defs);

    this.mundo = svg('g', { class: 'dv-mundo' });
    this.capaAristas = svg('g');
    this.capaNodos = svg('g');
    this.capaTemporal = svg('g');
    this.mundo.append(this.capaAristas, this.capaNodos, this.capaTemporal);
    this.svg.appendChild(this.mundo);
    this.cont.appendChild(this.svg);

    this.gesto = null;
    this.svg.addEventListener('pointerdown', (e) => this.alPresionar(e));
    this.svg.addEventListener('pointermove', (e) => this.alMover(e));
    this.svg.addEventListener('pointerup', (e) => this.alSoltar(e));
    this.svg.addEventListener('pointercancel', () => this.cancelarGesto());
    this.svg.addEventListener('wheel', (e) => this.alRueda(e), { passive: false });
    // El doble clic se detecta en pointerdown: con setPointerCapture el
    // evento dblclick llega al <svg> y ya no se sabe sobre qué nodo fue.
    this.ultimoToque = { id: null, t: 0 };
    this.encuadrarAlCrecer = false;
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        if (this.encuadrarAlCrecer) this.encuadrar(false);
      }).observe(this.cont);
    }
    // Clic derecho es para seleccionar en cuadro, no para el menú del navegador.
    this.svg.addEventListener('contextmenu', (e) => e.preventDefault());
    if (op.minimapa !== false) this.crearMinimapa();
    this.cont.addEventListener('dragover', (e) => {
      if (!this.soloLectura && e.dataTransfer.types.includes('text/x-dv-tipo')) e.preventDefault();
    });
    this.cont.addEventListener('drop', (e) => {
      const tipo = e.dataTransfer.getData('text/x-dv-tipo');
      if (!tipo || this.soloLectura) return;
      e.preventDefault();
      this.cb.onSoltarTipo(tipo, this.aDiagrama(e.clientX, e.clientY));
    });
  }

  // ---------- Coordenadas ----------

  aDiagrama(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    return { x: (clientX - r.left - this.vp.x) / this.vp.zoom, y: (clientY - r.top - this.vp.y) / this.vp.zoom };
  }

  centro() {
    const r = this.svg.getBoundingClientRect();
    return this.aDiagrama(r.left + r.width / 2, r.top + r.height / 2);
  }

  tamano() {
    const r = this.svg.getBoundingClientRect();
    return { ancho: r.width, alto: r.height };
  }

  aplicarViewport() {
    const { x, y, zoom } = this.vp;
    this.pintarMinimapa();
    this.mundo.setAttribute('transform', `translate(${x} ${y}) scale(${zoom})`);
    // La cuadrícula del fondo se mueve con el lienzo (CSSOM: no lo frena la CSP).
    const paso = 22 * zoom;
    this.cont.style.backgroundSize = `${paso}px ${paso}px`;
    this.cont.style.backgroundPosition = `${x}px ${y}px`;
  }

  fijarViewport(vp, avisar) {
    this.vp = { x: vp.x, y: vp.y, zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, vp.zoom)) };
    this.aplicarViewport();
    if (avisar) this.cb.onViewport({ ...this.vp });
  }

  encuadrar(avisar = true) {
    if (!this.diagrama) return;
    const { ancho, alto } = this.tamano();
    // Recién mostrado (un diálogo que se acaba de abrir) puede medir 0 todavía:
    // se encuadra en cuanto tenga tamaño.
    if (!ancho || !alto) {
      this.encuadrarAlCrecer = true;
      return;
    }
    this.encuadrarAlCrecer = false;
    this.fijarViewport(M.encuadre(this.diagrama, ancho, alto), avisar);
  }

  /** Lleva un nodo al centro de la vista (al buscarlo). */
  centrarEn(nodoId) {
    const n = this.diagrama && this.diagrama.nodes.find((x) => x.id === nodoId);
    if (!n) return;
    const cfg = M.TIPOS[n.type];
    const { ancho, alto } = this.tamano();
    const zoom = Math.max(this.vp.zoom, 0.9);
    this.fijarViewport({
      x: ancho / 2 - (n.position.x + cfg.width / 2) * zoom,
      y: alto / 2 - (n.position.y + cfg.height / 2) * zoom,
      zoom,
    }, true);
  }

  /** Zoom de los botones: animado en ~150 ms para que se sienta gradual. */
  acercar(factor) {
    const { ancho, alto } = this.tamano();
    cancelAnimationFrame(this.animZoom);
    const pasos = 9;
    const porPaso = Math.pow(factor, 1 / pasos);
    let i = 0;
    const paso = () => {
      this.zoomEn(ancho / 2, alto / 2, porPaso, i === pasos - 1);
      if (++i < pasos) this.animZoom = requestAnimationFrame(paso);
    };
    paso();
  }

  zoomEn(px, py, factor, avisar = true) {
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.vp.zoom * factor));
    const k = zoom / this.vp.zoom;
    this.fijarViewport({ x: px - (px - this.vp.x) * k, y: py - (py - this.vp.y) * k, zoom }, avisar);
  }

  // ---------- Dibujo ----------

  /**
   * @param {Object} diagrama { nodes, edges, viewport }
   * @param {Object} op { soloLectura, conservarVista, ignorarVista, estadosOcultos }
   *   ignorarVista: encuadrar aunque el diagrama traiga su vista guardada
   *   (la guardada viene de otra pantalla, p. ej. de la compu al teléfono).
   */
  dibujar(diagrama, op = {}) {
    const nuevo = this.diagrama !== diagrama;
    this.diagrama = diagrama;
    this.soloLectura = Boolean(op.soloLectura);
    this.estadosOcultos = op.estadosOcultos || new Set();
    this.svg.classList.toggle('is-lectura', this.soloLectura);

    const ids = new Set(diagrama.nodes.map((n) => n.id));
    for (const id of [...this.sel.nodos]) if (!ids.has(id)) this.sel.nodos.delete(id);
    const aristas = new Set(diagrama.edges.map((e) => e.id));
    for (const id of [...this.sel.aristas]) if (!aristas.has(id)) this.sel.aristas.delete(id);

    if (nuevo && !op.conservarVista) {
      if (diagrama.viewport && !op.ignorarVista) this.fijarViewport(diagrama.viewport, false);
      else this.encuadrar(false);
    } else {
      this.aplicarViewport();
    }
    this.pintar();
  }

  pintar() {
    const d = this.diagrama;
    if (!d) return;
    const porId = new Map(d.nodes.map((n) => [n.id, n]));
    const visible = (n) => !this.estadosOcultos.has(M.normalizarEstado(n.data.status));

    this.capaAristas.replaceChildren();
    for (const e of d.edges) {
      const a = porId.get(e.source);
      const b = porId.get(e.target);
      if (!a || !b) continue;
      const pa = M.puerto(a, 'out', e.sourceHandle);
      const pb = M.puerto(b, 'in', e.targetHandle);
      if (!pa || !pb) continue;
      const sel = this.sel.aristas.has(e.id);
      const g = svg('g', { class: `dv-arista${sel ? ' is-sel' : ''}${visible(a) && visible(b) ? '' : ' is-atenuada'}`, 'data-arista': e.id });
      const ruta = M.rutaArista(pa, pb);
      g.appendChild(svg('path', { d: ruta, class: 'dv-arista__toque' }));
      g.appendChild(svg('path', { d: ruta, class: 'dv-arista__linea', 'marker-end': `url(#${sel ? 'dv-flecha-sel' : 'dv-flecha'})` }));
      this.capaAristas.appendChild(g);
    }

    this.capaNodos.replaceChildren();
    for (const n of d.nodes) this.capaNodos.appendChild(this.nodoSvg(n, visible(n)));
    this.pintarMinimapa();
  }

  // ---------- Minimapa (abajo a la derecha) ----------

  crearMinimapa() {
    this.mini = document.createElement('div');
    this.mini.className = 'dv-minimapa';
    this.mini.title = 'Minimapa: clic o arrastra para moverte';
    this.miniSvg = svg('svg', { class: 'dv-minimapa__svg', 'aria-hidden': 'true' });
    this.mini.appendChild(this.miniSvg);
    this.cont.appendChild(this.mini);
    this.miniMarco = null;
    const mover = (e) => {
      if (!this.miniMarco) return;
      const r = this.miniSvg.getBoundingClientRect();
      const { bx, by, esc, ox, oy } = this.miniMarco;
      const dx = (e.clientX - r.left - ox) / esc + bx;
      const dy = (e.clientY - r.top - oy) / esc + by;
      const { ancho, alto } = this.tamano();
      const z = this.vp.zoom;
      this.fijarViewport({ x: ancho / 2 - dx * z, y: alto / 2 - dy * z, zoom: z }, false);
    };
    this.mini.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      try { this.mini.setPointerCapture(e.pointerId); } catch { /* sin captura: igual funciona */ }
      this.miniArrastrando = true;
      mover(e);
    });
    this.mini.addEventListener('pointermove', (e) => {
      if (this.miniArrastrando) mover(e);
    });
    const soltar = () => {
      if (!this.miniArrastrando) return;
      this.miniArrastrando = false;
      this.cb.onViewport({ ...this.vp });
      this.pintarMinimapa();
    };
    this.mini.addEventListener('pointerup', soltar);
    this.mini.addEventListener('pointercancel', soltar);
  }

  pintarMinimapa() {
    if (!this.mini) return;
    const d = this.diagrama;
    const c = d && M.caja(d);
    this.mini.hidden = !c;
    if (!c) return;
    const W = 200;
    const H = 130;
    const { ancho, alto } = this.tamano();
    const z = this.vp.zoom;
    const vista = { x: -this.vp.x / z, y: -this.vp.y / z, w: ancho / z, h: alto / z };
    // Mientras se arrastra en el minimapa el marco no cambia: si siguiera a
    // la vista, el mapa se movería bajo el dedo.
    if (!this.miniArrastrando || !this.miniMarco) {
      const m = 40;
      const bx = Math.min(c.x, vista.x) - m;
      const by = Math.min(c.y, vista.y) - m;
      const bw = Math.max(c.x + c.w, vista.x + vista.w) + m - bx;
      const bh = Math.max(c.y + c.h, vista.y + vista.h) + m - by;
      const esc = Math.min(W / bw, H / bh);
      this.miniMarco = { bx, by, esc, ox: (W - bw * esc) / 2, oy: (H - bh * esc) / 2 };
    }
    const { bx, by, esc, ox, oy } = this.miniMarco;
    const X = (v) => ox + (v - bx) * esc;
    const Y = (v) => oy + (v - by) * esc;
    this.miniSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.miniSvg.replaceChildren();
    for (const n of d.nodes) {
      const cfg = M.TIPOS[n.type];
      this.miniSvg.appendChild(svg('rect', {
        x: X(n.position.x), y: Y(n.position.y),
        width: Math.max(2, cfg.width * esc), height: Math.max(2, cfg.height * esc),
        rx: 2, fill: cfg.accent, 'fill-opacity': this.sel.nodos.has(n.id) ? 1 : 0.55,
      }));
    }
    this.miniSvg.appendChild(svg('rect', {
      x: X(vista.x), y: Y(vista.y), width: vista.w * esc, height: vista.h * esc,
      class: 'dv-minimapa__vista',
    }));
  }

  nodoSvg(n, visible) {
    const cfg = M.TIPOS[n.type];
    const w = cfg.width;
    const h = cfg.height;
    const sel = this.sel.nodos.has(n.id);
    const g = svg('g', {
      class: `dv-nodo${sel ? ' is-sel' : ''}${visible ? '' : ' is-atenuado'}`,
      transform: `translate(${n.position.x} ${n.position.y})`,
      'data-nodo': n.id,
    });

    const forma = svg('g', { class: 'dv-forma' });
    const color = M.pintura(cfg.accent, sel);
    for (const f of M.siluetas(cfg.shape, w, h)) {
      forma.appendChild(svg(f.tag, f.detalle
        ? { ...f.attrs, class: 'dv-detalle', fill: 'none', stroke: color.detalle }
        : { ...f.attrs, fill: color.relleno, stroke: color.trazo, 'stroke-width': color.grosor }));
    }
    g.appendChild(forma);

    // Texto en HTML dentro del SVG: así se ajusta en varias líneas.
    const [fx, fy, fw, fh] = M.AREA_TEXTO[cfg.shape];
    const fo = svg('foreignObject', { x: w * fx, y: h * fy, width: w * fw, height: h * fh });
    const caja = document.createElementNS(XHTML, 'div');
    caja.className = `dv-nodo__texto dv-nodo__texto--${cfg.shape}`;
    const tipo = document.createElementNS(XHTML, 'span');
    tipo.className = 'dv-nodo__tipo';
    tipo.textContent = cfg.label;
    tipo.style.color = cfg.accent;
    const nombre = document.createElementNS(XHTML, 'span');
    nombre.className = 'dv-nodo__nombre';
    nombre.textContent = (n.data.name || '').trim() || cfg.label;
    caja.append(tipo, nombre);

    const { metodo, ruta } = M.datosHttp(n.data);
    if (metodo || ruta) {
      const http = document.createElementNS(XHTML, 'span');
      http.className = 'dv-nodo__http';
      http.textContent = [metodo, ruta].filter(Boolean).join(' ');
      caja.appendChild(http);
    }
    const estado = M.normalizarEstado(n.data.status);
    const pie = document.createElementNS(XHTML, 'span');
    pie.className = 'dv-nodo__pie';
    const chip = document.createElementNS(XHTML, 'span');
    chip.className = `dv-estado dv-estado--${M.claseEstado(estado)}`;
    chip.textContent = M.ESTADO_CORTO[estado];
    pie.appendChild(chip);
    if (n.data.childDiagramId) {
      const hijo = document.createElementNS(XHTML, 'span');
      hijo.className = 'dv-nodo__hijo';
      hijo.textContent = '▸ detalle';
      hijo.title = 'Tiene diagrama hijo (doble clic para abrir)';
      pie.appendChild(hijo);
    }
    caja.appendChild(pie);
    fo.appendChild(caja);
    g.appendChild(fo);

    // Puertos. El nombre sólo se escribe si hay más de uno de ese lado.
    const lista = M.puertos(n);
    const varios = { in: lista.filter((p) => p.lado === 'in').length > 1, out: lista.filter((p) => p.lado === 'out').length > 1 };
    for (const p of lista) {
      const px = p.x - n.position.x;
      const py = p.y - n.position.y;
      const pg = svg('g', { class: `dv-puerto dv-puerto--${p.lado}`, 'data-puerto': p.nombre, 'data-lado': p.lado });
      pg.appendChild(svg('circle', { cx: px, cy: py, r: 11, class: 'dv-puerto__toque' }));
      pg.appendChild(svg('circle', { cx: px, cy: py, r: 4.5, class: 'dv-puerto__punto', stroke: cfg.accent }));
      if (varios[p.lado]) {
        const off = { up: [0, -10], down: [0, 16], left: [-10, 4], right: [10, 4] }[p.dir];
        const t = svg('text', {
          x: px + off[0], y: py + off[1], class: 'dv-puerto__nombre',
          'text-anchor': p.dir === 'left' ? 'end' : p.dir === 'right' ? 'start' : 'middle',
        });
        t.textContent = p.nombre;
        pg.appendChild(t);
      }
      g.appendChild(pg);
    }
    return g;
  }

  // ---------- Selección ----------

  seleccionar(nodos, aristas, avisar = true) {
    this.sel = { nodos: new Set(nodos || []), aristas: new Set(aristas || []) };
    this.pintar();
    if (avisar) this.cb.onSeleccion({ nodos: [...this.sel.nodos], aristas: [...this.sel.aristas] });
  }

  seleccion() {
    return { nodos: [...this.sel.nodos], aristas: [...this.sel.aristas] };
  }

  // ---------- Gestos ----------

  alPresionar(e) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    if (e.button === 2) {
      this.capturar(e);
      this.gesto = { tipo: 'caja', inicio: { x: e.clientX, y: e.clientY }, sumar: e.shiftKey || e.ctrlKey || e.metaKey, movido: false };
      return;
    }
    const puertoEl = e.target.closest('[data-puerto]');
    const nodoEl = e.target.closest('[data-nodo]');
    const aristaEl = e.target.closest('[data-arista]');
    const inicio = { x: e.clientX, y: e.clientY };
    this.capturar(e);

    if (puertoEl && nodoEl && puertoEl.dataset.lado === 'out' && !this.soloLectura) {
      const nodo = this.diagrama.nodes.find((n) => n.id === nodoEl.dataset.nodo);
      const p = M.puerto(nodo, 'out', puertoEl.dataset.puerto);
      this.gesto = { tipo: 'conectar', origen: nodo.id, puerto: p.nombre, desde: p, inicio };
      return;
    }
    if (nodoEl) {
      const id = nodoEl.dataset.nodo;
      const ahora = performance.now();
      const doble = this.ultimoToque.id === id && ahora - this.ultimoToque.t < 400;
      this.ultimoToque = { id: doble ? null : id, t: ahora };
      if (doble) {
        this.gesto = null;
        this.cb.onAbrir(id);
        return;
      }
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const nodos = new Set(this.sel.nodos);
        if (nodos.has(id)) nodos.delete(id);
        else nodos.add(id);
        this.seleccionar(nodos, this.sel.aristas);
        this.gesto = null;
        return;
      }
      if (!this.sel.nodos.has(id)) this.seleccionar([id], []);
      this.gesto = { tipo: 'mover', ids: [...this.sel.nodos], inicio, movido: false };
      return;
    }
    if (aristaEl) {
      this.seleccionar([], [aristaEl.dataset.arista]);
      this.gesto = null;
      return;
    }
    if (e.shiftKey) {
      this.gesto = { tipo: 'caja', inicio, sumar: true, movido: false };
      return;
    }
    this.gesto = { tipo: 'desplazar', inicio, vp: { ...this.vp }, movido: false };
  }

  /** Captura el puntero para seguir el gesto aunque salga del lienzo. */
  capturar(e) {
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch { /* p. ej. un puntero que ya se soltó: el gesto sigue sin captura */ }
  }

  /** Nodos que toca el rectángulo entre dos puntos de pantalla. */
  nodosEnCaja(a, b) {
    const p1 = this.aDiagrama(Math.min(a.x, b.x), Math.min(a.y, b.y));
    const p2 = this.aDiagrama(Math.max(a.x, b.x), Math.max(a.y, b.y));
    return this.diagrama.nodes.filter((n) => {
      const cfg = M.TIPOS[n.type];
      return n.position.x < p2.x && n.position.x + cfg.width > p1.x
        && n.position.y < p2.y && n.position.y + cfg.height > p1.y;
    }).map((n) => n.id);
  }

  alMover(e) {
    const g = this.gesto;
    if (!g) return;
    const dx = e.clientX - g.inicio.x;
    const dy = e.clientY - g.inicio.y;
    if (!g.movido && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return;
    g.movido = true;

    if (g.tipo === 'desplazar') {
      this.fijarViewport({ x: g.vp.x + dx, y: g.vp.y + dy, zoom: g.vp.zoom }, false);
      this.svg.classList.add('is-desplazando');
    } else if (g.tipo === 'caja') {
      const p1 = this.aDiagrama(Math.min(g.inicio.x, e.clientX), Math.min(g.inicio.y, e.clientY));
      const p2 = this.aDiagrama(Math.max(g.inicio.x, e.clientX), Math.max(g.inicio.y, e.clientY));
      this.capaTemporal.replaceChildren(svg('rect', {
        x: p1.x, y: p1.y, width: p2.x - p1.x, height: p2.y - p1.y, class: 'dv-caja',
      }));
      const dentro = new Set(this.nodosEnCaja(g.inicio, { x: e.clientX, y: e.clientY }));
      for (const el of this.capaNodos.querySelectorAll('[data-nodo]')) el.classList.toggle('is-en-caja', dentro.has(el.dataset.nodo));
    } else if (g.tipo === 'mover') {
      if (this.soloLectura) return;
      const k = this.vp.zoom;
      for (const id of g.ids) {
        const el = this.capaNodos.querySelector(`[data-nodo="${CSS.escape(id)}"]`);
        const n = this.diagrama.nodes.find((x) => x.id === id);
        if (el && n) el.setAttribute('transform', `translate(${n.position.x + dx / k} ${n.position.y + dy / k})`);
      }
      this.capaAristas.classList.add('is-oculta');
    } else if (g.tipo === 'conectar') {
      const hasta = this.aDiagrama(e.clientX, e.clientY);
      this.capaTemporal.replaceChildren(svg('path', {
        d: M.rutaArista(g.desde, { x: hasta.x, y: hasta.y, dir: 'up' }),
        class: 'dv-arista__linea dv-arista--temporal',
      }));
      const destino = document.elementFromPoint(e.clientX, e.clientY);
      for (const p of this.capaNodos.querySelectorAll('.dv-puerto--in.is-blanco')) p.classList.remove('is-blanco');
      const pIn = destino && destino.closest('.dv-puerto--in');
      if (pIn) pIn.classList.add('is-blanco');
    }
  }

  alSoltar(e) {
    const g = this.gesto;
    this.gesto = null;
    this.svg.classList.remove('is-desplazando');
    this.capaAristas.classList.remove('is-oculta');
    this.capaTemporal.replaceChildren();
    if (!g) return;

    if (g.tipo === 'desplazar') {
      if (g.movido) this.cb.onViewport({ ...this.vp });
      else this.seleccionar([], []);
    } else if (g.tipo === 'caja') {
      if (!g.movido) return;
      const ids = this.nodosEnCaja(g.inicio, { x: e.clientX, y: e.clientY });
      this.seleccionar(g.sumar ? new Set([...this.sel.nodos, ...ids]) : ids, []);
    } else if (g.tipo === 'mover') {
      if (g.movido && !this.soloLectura) {
        const k = this.vp.zoom;
        this.cb.onMover(g.ids, (e.clientX - g.inicio.x) / k, (e.clientY - g.inicio.y) / k);
      }
    } else if (g.tipo === 'conectar') {
      const destino = document.elementFromPoint(e.clientX, e.clientY);
      const pIn = destino && destino.closest('.dv-puerto--in');
      const nodoEl = pIn && pIn.closest('[data-nodo]');
      if (nodoEl) this.cb.onConectar(g.origen, g.puerto, nodoEl.dataset.nodo, pIn.dataset.puerto);
      else this.pintar();
    }
  }

  cancelarGesto() {
    this.gesto = null;
    this.svg.classList.remove('is-desplazando');
    this.capaAristas.classList.remove('is-oculta');
    this.capaTemporal.replaceChildren();
    this.pintar();
  }

  alRueda(e) {
    e.preventDefault();
    const r = this.svg.getBoundingClientRect();
    // Pellizco del trackpad (ctrlKey) o rueda: acercar. Shift + rueda: desplazar.
    if (e.shiftKey && !e.ctrlKey) {
      this.fijarViewport({ x: this.vp.x - e.deltaY, y: this.vp.y - e.deltaX, zoom: this.vp.zoom }, true);
      return;
    }
    // Pasos chicos: un "clic" de rueda (deltaY ≈ 100) es ~8 %; el pellizco del
    // trackpad manda muchos deltas pequeños, por eso su factor es mayor.
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.006 : 0.0008));
    this.zoomEn(e.clientX - r.left, e.clientY - r.top, factor);
  }
}
