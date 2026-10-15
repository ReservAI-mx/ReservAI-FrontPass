import { apiFetch, goLogout, requireAdminSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';
import { showToast } from './toast.js';

const session = requireAdminSession();
const API_LIST = '/traces';
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const LIVE_KEY = 'traces.live';
const LIVE_EVERY_MS = 30 * 1000;

document.addEventListener('DOMContentLoaded', () => {
  if (!session) return;
  setupAccountMenu(session);
  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      goLogout();
    });
  }

  const LIMIT = 20;

  const elList = document.getElementById('traceList');
  const elError = document.getElementById('listaError');
  const elService = document.getElementById('serviceFilter');
  const elRange = document.getElementById('rangePreset');
  const elFrom = document.getElementById('fromDate');
  const elTo = document.getElementById('toDate');
  const elCustom = document.getElementById('customRange');
  const elReload = document.getElementById('reloadBtn');
  const elLive = document.getElementById('liveBtn');
  const elUpdated = document.getElementById('updatedLabel');
  const elClear = document.getElementById('clearFilters');
  const elRangeLabel = document.getElementById('rangeLabel');
  const elPanel = document.getElementById('detailPanel');
  const elBackdrop = document.getElementById('detailBackdrop');
  const elPlaceholder = document.getElementById('detailPlaceholder');
  const elDetail = document.getElementById('detailContent');
  const elPager = document.getElementById('pager');
  const elPagerLabel = document.getElementById('pagerLabel');
  const elPrev = document.getElementById('prevPage');
  const elNext = document.getElementById('nextPage');
  const levelBtns = Array.from(document.querySelectorAll('#levelSeg .ui-seg__btn'));
  const resolutionBtns = Array.from(document.querySelectorAll('#resolutionSeg .ui-seg__btn'));
  const kpiBtns = Array.from(document.querySelectorAll('.ui-kpi'));
  const narrow = window.matchMedia('(max-width: 960px)');

  let level = '';
  let resolution = '';
  let page = 1;
  let totalPages = 0;
  let selectedId = null;
  let listSeq = 0;
  let kpiSeq = 0;
  let detailSeq = 0;
  let currentDetail = null;
  let lastUpdated = 0;
  let loading = false;
  let liveTimer = null;

  // ---------- Formato ----------

  const timeFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'medium' });
  const clockFmt = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const relFmt = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });
  const numFmt = new Intl.NumberFormat('es-MX');

  function fmtTime(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return timeFmt.format(new Date(n));
  }

  function fmtRelative(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '—';
    const diff = (n - Date.now()) / 1000;
    const abs = Math.abs(diff);
    if (abs < 45) return 'justo ahora';
    if (abs < 3600) return relFmt.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return relFmt.format(Math.round(diff / 3600), 'hour');
    if (abs < 7 * 86400) return relFmt.format(Math.round(diff / 86400), 'day');
    return timeFmt.format(new Date(n));
  }

  function fmtDuration(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n < 1000) return `${Math.round(n)} ms`;
    return `${(n / 1000).toFixed(n < 10000 ? 2 : 1)} s`;
  }

  function fmtOffset(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return '';
    const sign = n < 0 ? '−' : '+';
    const a = Math.abs(n);
    if (a < 1000) return `${sign}${Math.round(a)} ms`;
    return `${sign}${(a / 1000).toFixed(2)} s`;
  }

  /** Lento a partir de 1 s, regular a partir de 300 ms. */
  function speedClass(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n)) return '';
    if (n >= 1000) return 'is-slow';
    if (n >= 300) return 'is-mid';
    return 'is-fast';
  }

  function statusClass(code) {
    const n = Number(code);
    if (!Number.isFinite(n)) return 'neutral';
    if (n >= 500) return 'error';
    if (n >= 400) return 'warning';
    if (n >= 300) return 'info';
    return 'ok';
  }

  function methodClass(method) {
    const m = String(method || '').toUpperCase();
    if (m === 'GET') return 'get';
    if (m === 'POST') return 'post';
    if (m === 'PUT' || m === 'PATCH') return 'put';
    if (m === 'DELETE') return 'delete';
    return 'other';
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Date → valor de <input type="datetime-local"> en hora local. */
  function toLocalInput(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
      + `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function startOfLocalDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  function dayKey(ms) {
    const d = new Date(Number(ms));
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function dayLabel(ms) {
    const d = new Date(Number(ms));
    const today = startOfLocalDay(new Date());
    const that = startOfLocalDay(d);
    const days = Math.round((today - that) / 86400000);
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    const txt = dayFmt.format(d);
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  /** Calcula from/to (epoch ms) según el preset del dropdown. */
  function rangeBounds() {
    const preset = elRange.value;
    const now = new Date();
    if (preset === 'all') return { from: null, to: null };
    if (preset === 'custom') {
      const from = elFrom.value ? Date.parse(elFrom.value) : null;
      const to = elTo.value ? Date.parse(elTo.value) : null;
      return {
        from: Number.isFinite(from) ? from : null,
        to: Number.isFinite(to) ? to : null,
      };
    }
    if (preset === 'today') {
      return { from: startOfLocalDay(now).getTime(), to: now.getTime() };
    }
    const ms = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }[preset];
    if (!ms) return { from: null, to: null };
    return { from: now.getTime() - ms, to: now.getTime() };
  }

  function syncCustomVisibility() {
    const custom = elRange.value === 'custom';
    elCustom.hidden = !custom;
    if (custom && !elFrom.value && !elTo.value) {
      const now = new Date();
      elFrom.value = toLocalInput(startOfLocalDay(now));
      elTo.value = toLocalInput(now);
    }
  }

  function levelLabel(lvl) {
    const v = String(lvl || '').toLowerCase();
    if (v === 'error') return 'ERROR';
    if (v === 'warning' || v === 'warn') return 'WARNING';
    if (v === 'info') return 'INFO';
    return v ? v.toUpperCase() : '—';
  }

  function levelClass(lvl) {
    const v = String(lvl || '').toLowerCase();
    if (v === 'error') return 'error';
    if (v === 'warning' || v === 'warn') return 'warning';
    return 'info';
  }

  function resolutionLabel(r) {
    return r === 'resolved' ? 'Resuelto' : 'Abierto';
  }

  function sourceLabel(trace) {
    if (!trace || !trace.error_file) return null;
    const line = trace.error_line != null ? `:${trace.error_line}` : '';
    const fn = trace.error_function ? ` · ${trace.error_function}` : '';
    return `${trace.error_file}${line}${fn}`;
  }

  function shortError(payload, fallback) {
    const msg = payload && typeof payload.error === 'string' ? payload.error.trim() : '';
    if (msg && msg.length <= 120 && !/\n/.test(msg)) return msg;
    return fallback;
  }

  // ---------- DOM ----------

  /** createElement con clase, texto y atributos; nunca innerHTML con datos. */
  function el(tag, className, text, attrs) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v != null) node.setAttribute(k, v); });
    return node;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    copy: ['M9 9h9.5v9.5H9z', 'M15 9V5.5H5.5V15H9'],
    link: ['M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1', 'M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'],
    close: ['M7 7l10 10', 'M17 7 7 17'],
    check: ['m5.5 12.5 4 4 9-9'],
    undo: ['M9 7.5 4.5 12 9 16.5', 'M4.5 12h10a5 5 0 0 1 0 10h-2'],
    code: ['m8.5 8-4 4 4 4', 'm15.5 8 4 4-4 4'],
    alert: ['M12 4 2.5 20h19z', 'M12 10v4.5', 'M12 17.5v.01'],
    inbox: ['M3.5 13.5 6 5.5h12l2.5 8', 'M3.5 13.5v5h17v-5h-5l-1 2h-5l-1-2z'],
    file: ['M6.5 3.5h7l4 4v13h-11z', 'M13.5 3.5v4h4'],
  };

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    (ICONS[name] || []).forEach((d) => {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  async function copyText(text, okMsg) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = el('textarea', null, null, { readonly: '', 'aria-hidden': 'true' });
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      showToast(okMsg, 'success', 2200);
    } catch (_) {
      showToast('No se pudo copiar al portapapeles.', 'error');
    }
  }

  // ---------- API ----------

  async function apiGet(url) {
    const res = await apiFetch(url, { headers: HEADERS });
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    return { res, body };
  }

  async function apiPatch(url, payload) {
    const res = await apiFetch(url, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(payload),
    });
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    return { res, body };
  }

  /** Filtros comunes (servicio + rango) que comparten lista y KPIs. */
  function baseQuery() {
    const q = new URLSearchParams();
    const service = elService.value.trim();
    if (service) q.set('service', service);
    const { from, to } = rangeBounds();
    if (from != null) q.set('from', String(from));
    if (to != null) q.set('to', String(to));
    return q;
  }

  function listUrl() {
    const q = baseQuery();
    q.set('limit', String(LIMIT));
    q.set('page', String(page));
    if (level) q.set('level', level);
    if (resolution) q.set('resolution', resolution);
    return `${API_LIST}?${q}`;
  }

  // ---------- Estado en la URL (enlaces compartibles) ----------

  function readUrlState() {
    const p = new URLSearchParams(window.location.search);
    const lv = p.get('level');
    if (lv === 'error' || lv === 'warning' || lv === 'info') level = lv;
    const rs = p.get('res');
    if (rs === 'open' || rs === 'resolved') resolution = rs;
    if (p.get('service')) elService.value = p.get('service');
    const range = p.get('range');
    if (range && Array.from(elRange.options).some((o) => o.value === range)) elRange.value = range;
    if (range === 'custom') {
      if (p.get('from')) elFrom.value = p.get('from');
      if (p.get('to')) elTo.value = p.get('to');
    }
    const pg = Number(p.get('page'));
    if (Number.isInteger(pg) && pg > 1) page = pg;
    if (p.get('trace')) selectedId = p.get('trace');
  }

  function writeUrlState() {
    const p = new URLSearchParams();
    if (level) p.set('level', level);
    if (resolution) p.set('res', resolution);
    const service = elService.value.trim();
    if (service) p.set('service', service);
    if (elRange.value !== 'today') p.set('range', elRange.value);
    if (elRange.value === 'custom') {
      if (elFrom.value) p.set('from', elFrom.value);
      if (elTo.value) p.set('to', elTo.value);
    }
    if (page > 1) p.set('page', String(page));
    if (selectedId) p.set('trace', selectedId);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }

  function traceLink(traceId) {
    const url = new URL(window.location.href);
    url.searchParams.set('trace', traceId);
    return url.toString();
  }

  // ---------- Filtros ----------

  function hasFilters() {
    return Boolean(level || resolution || elService.value.trim() || elRange.value !== 'today');
  }

  function syncFilterUi() {
    levelBtns.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.level || '') === level)));
    resolutionBtns.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.resolution || '') === resolution)));
    kpiBtns.forEach((b) => {
      const k = b.dataset.kpi;
      let on = false;
      if (k === 'all') on = !level && !resolution;
      else if (k === 'open') on = resolution === 'open';
      else on = level === k;
      b.setAttribute('aria-pressed', String(on));
    });
    elClear.hidden = !hasFilters();
  }

  function applyFilters() {
    page = 1;
    syncFilterUi();
    refresh();
  }

  // ---------- KPIs ----------

  async function countFor(extra) {
    const q = baseQuery();
    q.set('limit', '1');
    q.set('page', '1');
    Object.entries(extra).forEach(([k, v]) => q.set(k, v));
    const { res, body } = await apiGet(`${API_LIST}?${q}`);
    if (!res.ok) throw new Error('count');
    return Number(body && body.total) || 0;
  }

  async function loadKpis() {
    const seq = ++kpiSeq;
    const keys = ['all', 'error', 'warning', 'info', 'open'];
    const queries = [{}, { level: 'error' }, { level: 'warning' }, { level: 'info' }, { resolution: 'open' }];
    const results = await Promise.allSettled(queries.map(countFor));
    if (seq !== kpiSeq) return;

    const values = {};
    keys.forEach((k, i) => {
      values[k] = results[i].status === 'fulfilled' ? results[i].value : null;
    });

    keys.forEach((k) => {
      const num = document.querySelector(`[data-num="${k}"]`);
      if (num) num.textContent = values[k] == null ? '—' : numFmt.format(values[k]);
    });

    const total = values.all || 0;
    ['error', 'warning', 'info'].forEach((k) => {
      const bar = document.querySelector(`[data-bar="${k}"]`);
      if (!bar) return;
      const pct = total > 0 && values[k] != null ? Math.min(100, (values[k] / total) * 100) : 0;
      bar.style.width = `${pct}%`;
      bar.parentElement.title = total > 0 ? `${pct.toFixed(1)} % del total` : '';
    });

    const openCard = document.querySelector('.ui-kpi--open');
    if (openCard) openCard.classList.toggle('has-pending', Number(values.open) > 0);
  }

  // ---------- Lista ----------

  function setListError(text) {
    elError.textContent = text || '';
  }

  function showSkeletons() {
    elList.replaceChildren();
    for (let i = 0; i < 5; i++) {
      const li = el('li', 'tr-skeleton', null, { 'aria-hidden': 'true' });
      li.appendChild(el('span', 'tr-skeleton__pill'));
      const lines = el('span', 'tr-skeleton__lines');
      lines.appendChild(el('span'));
      lines.appendChild(el('span'));
      li.appendChild(lines);
      elList.appendChild(li);
    }
  }

  function showEmpty(title, sub, opts = {}) {
    elList.replaceChildren();
    const li = el('li', 'ui-empty' + (opts.error ? ' ui-empty--error' : ''));
    const ic = el('span', 'ui-empty__icono');
    ic.appendChild(icon(opts.error ? 'alert' : 'inbox'));
    li.appendChild(ic);
    li.appendChild(el('span', 'ui-empty__titulo', title));
    if (sub) li.appendChild(el('span', 'ui-empty__sub', sub));
    if (opts.action) {
      const btn = el('button', 'ui-btn ui-btn--ghost', opts.action.label, { type: 'button' });
      btn.addEventListener('click', opts.action.run);
      li.appendChild(btn);
    }
    elList.appendChild(li);
  }

  function chip(text, mod, title) {
    return el('span', `tr-chip tr-chip--${mod}`, text, title ? { title } : null);
  }

  function buildRow(trace) {
    const lvl = levelClass(trace.level);
    const btn = el('button', `tr-row is-${lvl}`, null, { type: 'button' });
    btn.dataset.traceId = trace.trace_id;
    if (selectedId === trace.trace_id) btn.setAttribute('aria-current', 'true');

    // Sin método = trace interno (pool de DB, gRPC, jobs), no una petición HTTP.
    const method = trace.http_method ? String(trace.http_method).toUpperCase().slice(0, 6) : 'SYS';
    btn.appendChild(el('span', `tr-method tr-method--${methodClass(trace.http_method)}`, method, {
      title: trace.http_method ? null : 'Trace interno, sin petición HTTP',
    }));

    const main = el('div', 'tr-row__main');
    const top = el('div', 'tr-row__top');
    const route = trace.route || '';
    top.appendChild(el('span', 'tr-row__route', route || trace.service_name || '—', { title: route || null }));
    if (route && trace.service_name) top.appendChild(chip(trace.service_name, 'svc'));
    main.appendChild(top);

    if (trace.message) {
      main.appendChild(el('div', 'tr-row__msg', trace.message, { title: String(trace.message) }));
    }

    const meta = el('div', 'tr-row__meta');
    meta.appendChild(chip(levelLabel(trace.level), lvl));
    if (trace.status_code != null && trace.status_code !== '') {
      meta.appendChild(chip(String(trace.status_code), `status-${statusClass(trace.status_code)}`, 'HTTP status'));
    }
    const dur = fmtDuration(trace.duration_ms);
    if (dur) {
      const d = el('span', `tr-dur ${speedClass(trace.duration_ms)}`, null, { title: 'Duración' });
      d.appendChild(el('span', 'tr-dur__punto', null, { 'aria-hidden': 'true' }));
      d.appendChild(document.createTextNode(dur));
      meta.appendChild(d);
    }
    const src = sourceLabel(trace);
    if (src) {
      const s = el('span', 'tr-src', null, { title: src });
      s.appendChild(icon('file'));
      s.appendChild(document.createTextNode(src));
      meta.appendChild(s);
    }
    main.appendChild(meta);
    btn.appendChild(main);

    const side = el('div', 'tr-row__side');
    const time = el('time', 'tr-row__time', fmtRelative(trace.start_time), { title: fmtTime(trace.start_time) });
    time.dataset.ts = String(trace.start_time || '');
    side.appendChild(time);
    const resolved = trace.resolution === 'resolved';
    const res = el('span', `tr-res tr-res--${resolved ? 'resolved' : 'open'}`);
    if (resolved) res.appendChild(icon('check'));
    res.appendChild(document.createTextNode(resolutionLabel(trace.resolution)));
    side.appendChild(res);
    btn.appendChild(side);

    btn.addEventListener('click', () => selectTrace(trace.trace_id));
    return btn;
  }

  function renderList(traces) {
    elList.replaceChildren();
    let lastDay = null;
    traces.forEach((trace) => {
      const ts = Number(trace.start_time);
      if (Number.isFinite(ts) && ts > 0) {
        const key = dayKey(ts);
        if (key !== lastDay) {
          lastDay = key;
          elList.appendChild(el('li', 'tr-day', dayLabel(ts), { role: 'presentation' }));
        }
      }
      const li = el('li');
      li.appendChild(buildRow(trace));
      elList.appendChild(li);
    });
  }

  function updatePager(total, pages, count) {
    totalPages = pages;
    if (total > 0 && count > 0) {
      const start = (page - 1) * LIMIT + 1;
      const end = start + count - 1;
      elRangeLabel.textContent = `Mostrando ${numFmt.format(start)}–${numFmt.format(end)} de ${numFmt.format(total)}`;
    } else {
      elRangeLabel.textContent = 'Sin resultados';
    }
    if (pages <= 1) {
      elPager.hidden = true;
      return;
    }
    elPager.hidden = false;
    elPagerLabel.textContent = `Página ${page} de ${pages}`;
    elPrev.disabled = page <= 1;
    elNext.disabled = page >= pages;
  }

  async function loadList({ silent = false } = {}) {
    const seq = ++listSeq;
    loading = true;
    setListError('');
    elList.setAttribute('aria-busy', 'true');
    elReload.classList.add('is-spinning');
    if (!silent) {
      showSkeletons();
      elRangeLabel.textContent = 'Cargando…';
      elPrev.disabled = true;
      elNext.disabled = true;
    }
    writeUrlState();

    try {
      const { res, body } = await apiGet(listUrl());
      if (seq !== listSeq) return;

      if (res.status === 401 || res.status === 403) {
        showEmpty('No autorizado', 'Tu sesión no tiene permiso para ver traces.', { error: true });
        setListError(shortError(body, 'No autorizado.'));
        elPager.hidden = true;
        elRangeLabel.textContent = '';
        return;
      }
      if (!res.ok) {
        showEmpty('No se pudo cargar la lista', 'El servicio de observabilidad no respondió.', {
          error: true,
          action: { label: 'Reintentar', run: () => loadList() },
        });
        setListError(shortError(body, ''));
        elPager.hidden = true;
        elRangeLabel.textContent = '';
        return;
      }

      const traces = Array.isArray(body && body.traces) ? body.traces : [];
      const total = Number(body && body.total) || 0;
      const pages = Number(body && body.total_pages) || 0;
      if (body && body.page) page = Number(body.page) || page;
      updatePager(total, pages, traces.length);
      lastUpdated = Date.now();
      tickClock();

      if (traces.length === 0) {
        showEmpty(
          'Todo en orden',
          hasFilters() ? 'No hay traces para estos filtros.' : 'No se registraron traces en este rango.',
          hasFilters() ? { action: { label: 'Limpiar filtros', run: clearFilters } } : {}
        );
        return;
      }
      renderList(traces);
    } catch (_) {
      if (seq !== listSeq) return;
      showEmpty('No se pudo cargar la lista', 'Revisa tu conexión e inténtalo de nuevo.', {
        error: true,
        action: { label: 'Reintentar', run: () => loadList() },
      });
      elPager.hidden = true;
      elRangeLabel.textContent = '';
    } finally {
      if (seq === listSeq) {
        loading = false;
        elList.removeAttribute('aria-busy');
        elReload.classList.remove('is-spinning');
      }
    }
  }

  function refresh(opts) {
    loadList(opts);
    loadKpis();
  }

  // ---------- Detalle ----------

  function openDrawer() {
    if (!narrow.matches) return;
    elPanel.classList.add('is-open');
    elBackdrop.hidden = false;
    document.body.classList.add('tr-lock');
  }

  function closeDrawer() {
    elPanel.classList.remove('is-open');
    elBackdrop.hidden = true;
    document.body.classList.remove('tr-lock');
  }

  function clearSelection() {
    const prev = selectedId;
    selectedId = null;
    detailSeq++;
    elList.querySelectorAll('.tr-row[aria-current]').forEach((r) => r.removeAttribute('aria-current'));
    showDetailPlaceholder();
    closeDrawer();
    writeUrlState();
    const row = prev && elList.querySelector(`.tr-row[data-trace-id="${CSS.escape(prev)}"]`);
    if (row) row.focus({ preventScroll: true });
  }

  function showDetailPlaceholder() {
    elPlaceholder.hidden = false;
    elDetail.hidden = true;
    elDetail.replaceChildren();
    currentDetail = null;
  }

  function closeButton() {
    const btn = el('button', 'ui-icon-btn ui-icon-btn--sm tr-detail__close', null, {
      type: 'button', 'aria-label': 'Cerrar detalle', title: 'Cerrar (Esc)',
    });
    btn.appendChild(icon('close'));
    btn.addEventListener('click', clearSelection);
    return btn;
  }

  function showDetailStatus(text, isError, retryId) {
    elPlaceholder.hidden = true;
    elDetail.hidden = false;
    elDetail.replaceChildren();
    const bar = el('div', 'tr-detail__bar');
    bar.appendChild(el('span'));
    bar.appendChild(closeButton());
    elDetail.appendChild(bar);

    if (!isError) {
      const sk = el('div', 'tr-detail-skeleton', null, { 'aria-hidden': 'true' });
      for (let i = 0; i < 6; i++) sk.appendChild(el('span'));
      elDetail.appendChild(sk);
      elDetail.appendChild(el('p', 'sr-only', text));
      return;
    }
    const box = el('div', 'tr-detail-status');
    const ic = el('span', 'ui-empty__icono');
    ic.appendChild(icon('alert'));
    box.appendChild(ic);
    box.appendChild(el('p', null, text));
    if (retryId) {
      const btn = el('button', 'ui-btn ui-btn--ghost', 'Reintentar', { type: 'button' });
      btn.addEventListener('click', () => selectTrace(retryId));
      box.appendChild(btn);
    }
    elDetail.appendChild(box);
  }

  async function setResolution(traceId, next) {
    const { res, body } = await apiPatch(
      `${API_LIST}/${encodeURIComponent(traceId)}/resolution`,
      { resolution: next }
    );
    if (!res.ok) {
      showToast(shortError(body, 'No se pudo actualizar la resolución.'), 'error');
      return false;
    }
    return true;
  }

  function actionBtn(label, iconName, mod, onClick, title) {
    const btn = el('button', `ui-btn ${mod}`, null, { type: 'button', title: title || null });
    btn.appendChild(icon(iconName));
    btn.appendChild(el('span', null, label));
    btn.addEventListener('click', onClick);
    return btn;
  }

  function infoItem(grid, label, value, opts = {}) {
    const item = el('div', 'tr-info' + (opts.wide ? ' tr-info--wide' : ''));
    item.appendChild(el('dt', null, label));
    const dd = el('dd', opts.mono ? 'is-mono' : null);
    if (value instanceof Node) dd.appendChild(value);
    else dd.textContent = value == null || value === '' ? '—' : String(value);
    item.appendChild(dd);
    grid.appendChild(item);
  }

  function renderStack(stack) {
    const pre = el('pre', 'tr-stack');
    let appMarked = false;
    String(stack).split('\n').forEach((line, i) => {
      const t = line.trim();
      let cls = 'tr-stack__line';
      if (i === 0 && !t.startsWith('at ')) cls += ' is-head';
      else if (t.startsWith('at ')) {
        if (t.includes('node_modules') || t.includes('node:')) cls += ' is-lib';
        else if (!appMarked) { cls += ' is-app'; appMarked = true; }
      }
      pre.appendChild(el('span', cls, line));
    });
    return pre;
  }

  function section(title, count, extra) {
    const head = el('div', 'tr-section');
    const h = el('h3', null, title);
    if (count != null) h.appendChild(el('span', 'tr-section__count', String(count)));
    head.appendChild(h);
    if (extra) head.appendChild(extra);
    return head;
  }

  function renderDetail(payload) {
    const trace = (payload && payload.trace) || {};
    const logs = Array.isArray(payload && payload.logs) ? payload.logs.slice() : [];
    currentDetail = { trace, logs };
    const lvl = levelClass(trace.level);
    const isResolved = trace.resolution === 'resolved';

    elPlaceholder.hidden = true;
    elDetail.hidden = false;
    elDetail.replaceChildren();

    // Barra superior: chips + cerrar
    const bar = el('div', 'tr-detail__bar');
    const chips = el('div', 'tr-detail__chips');
    chips.appendChild(chip(levelLabel(trace.level), lvl));
    if (trace.status_code != null && trace.status_code !== '') {
      chips.appendChild(chip(`HTTP ${trace.status_code}`, `status-${statusClass(trace.status_code)}`));
    }
    const res = el('span', `tr-res tr-res--${isResolved ? 'resolved' : 'open'}`);
    if (isResolved) res.appendChild(icon('check'));
    res.appendChild(document.createTextNode(resolutionLabel(trace.resolution)));
    chips.appendChild(res);
    bar.appendChild(chips);
    bar.appendChild(closeButton());
    elDetail.appendChild(bar);

    // Encabezado
    const head = el('div', `tr-detail__head is-${lvl}`);
    const routeLine = el('div', 'tr-detail__route');
    if (trace.http_method) {
      routeLine.appendChild(el('span', `tr-method tr-method--${methodClass(trace.http_method)}`, String(trace.http_method).toUpperCase()));
    }
    routeLine.appendChild(el('span', 'tr-detail__path', trace.route || trace.service_name || '—'));
    head.appendChild(routeLine);
    if (trace.message) head.appendChild(el('p', 'tr-detail__msg', trace.message));

    const idRow = el('div', 'tr-detail__id');
    idRow.appendChild(el('code', null, trace.trace_id || '—'));
    if (trace.trace_id) {
      const cp = el('button', 'ui-icon-btn ui-icon-btn--xs', null, { type: 'button', 'aria-label': 'Copiar ID', title: 'Copiar ID' });
      cp.appendChild(icon('copy'));
      cp.addEventListener('click', () => copyText(trace.trace_id, 'ID copiado.'));
      idRow.appendChild(cp);
    }
    head.appendChild(idRow);
    elDetail.appendChild(head);

    // Acciones
    const actions = el('div', 'tr-detail__actions');
    const resolveBtn = actionBtn(
      isResolved ? 'Reabrir' : 'Marcar resuelto',
      isResolved ? 'undo' : 'check',
      isResolved ? 'ui-btn--ghost' : 'ui-btn--ok',
      async () => {
        resolveBtn.disabled = true;
        resolveBtn.classList.add('is-loading');
        const ok = await setResolution(trace.trace_id, isResolved ? 'open' : 'resolved');
        resolveBtn.disabled = false;
        resolveBtn.classList.remove('is-loading');
        if (ok) {
          showToast(isResolved ? 'Trace reabierto.' : 'Trace marcado como resuelto.', 'success');
          await selectTrace(trace.trace_id, { keepScroll: true });
          refresh({ silent: true });
        }
      }
    );
    actions.appendChild(resolveBtn);
    actions.appendChild(actionBtn('Enlace', 'link', 'ui-btn--ghost',
      () => copyText(traceLink(trace.trace_id), 'Enlace copiado.'), 'Copiar enlace a este trace'));
    actions.appendChild(actionBtn('JSON', 'code', 'ui-btn--ghost',
      () => copyText(JSON.stringify(currentDetail, null, 2), 'JSON copiado.'), 'Copiar trace y logs como JSON'));
    elDetail.appendChild(actions);

    // Datos
    const grid = el('dl', 'tr-info-grid');
    infoItem(grid, 'Servicio', trace.service_name);
    infoItem(grid, 'Estado', trace.trace_status);
    infoItem(grid, 'Inicio', fmtTime(trace.start_time));
    const dur = fmtDuration(trace.duration_ms);
    if (dur) {
      const d = el('span', `tr-dur ${speedClass(trace.duration_ms)}`);
      d.appendChild(el('span', 'tr-dur__punto', null, { 'aria-hidden': 'true' }));
      d.appendChild(document.createTextNode(dur));
      infoItem(grid, 'Duración', d);
    } else {
      infoItem(grid, 'Duración', null);
    }
    if (trace.resolved_at) infoItem(grid, 'Resuelto', fmtTime(trace.resolved_at));
    const src = sourceLabel(trace);
    if (src) infoItem(grid, 'Origen', src, { mono: true, wide: true });
    elDetail.appendChild(grid);

    // Stack
    if (trace.stack) {
      const cp = el('button', 'ui-icon-btn ui-icon-btn--xs', null, { type: 'button', 'aria-label': 'Copiar stack', title: 'Copiar stack' });
      cp.appendChild(icon('copy'));
      cp.addEventListener('click', () => copyText(String(trace.stack), 'Stack copiado.'));
      elDetail.appendChild(section('Stack', null, cp));
      elDetail.appendChild(renderStack(trace.stack));
    }

    // Logs en línea de tiempo
    const ts = (log) => Number(log.start_time ?? log.timestamp ?? log.logged_at);
    logs.sort((a, b) => (ts(a) || 0) - (ts(b) || 0));
    elDetail.appendChild(section('Logs', logs.length));

    if (logs.length === 0) {
      elDetail.appendChild(el('p', 'tr-detail__empty', 'Este trace no tiene logs.'));
      return;
    }

    const start = Number(trace.start_time);
    const ul = el('ol', 'tr-timeline');
    logs.forEach((log) => {
      const ll = levelClass(log.level);
      const li = el('li', `tr-log is-${ll}`);
      li.appendChild(el('span', 'tr-log__dot', null, { 'aria-hidden': 'true' }));
      const top = el('div', 'tr-log__top');
      top.appendChild(el('span', `tr-log__lvl`, levelLabel(log.level)));
      const t = ts(log);
      if (Number.isFinite(t) && t > 0) {
        top.appendChild(el('time', 'tr-log__time', clockFmt.format(new Date(t)), { title: fmtTime(t) }));
        if (Number.isFinite(start) && start > 0) top.appendChild(el('span', 'tr-log__offset', fmtOffset(t - start)));
      }
      if (log.event) top.appendChild(el('span', 'tr-log__event', log.event));
      li.appendChild(top);
      li.appendChild(el('div', 'tr-log__msg', log.message != null ? String(log.message) : ''));
      ul.appendChild(li);
    });
    elDetail.appendChild(ul);
  }

  async function selectTrace(traceId, opts = {}) {
    if (!traceId) return;
    selectedId = traceId;
    writeUrlState();
    elList.querySelectorAll('.tr-row').forEach((row) => {
      if (row.dataset.traceId === traceId) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    openDrawer();

    const seq = ++detailSeq;
    const scroll = elPanel.scrollTop;
    if (!opts.keepScroll) showDetailStatus('Cargando trace…', false);

    try {
      const { res, body } = await apiGet(`${API_LIST}/${encodeURIComponent(traceId)}`);
      if (seq !== detailSeq) return;

      if (res.status === 404) {
        showDetailStatus('Ese trace ya no está.', true);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        showDetailStatus('No autorizado.', true);
        return;
      }
      if (!res.ok) {
        showDetailStatus(shortError(body, 'No se pudo cargar el trace.'), true, traceId);
        return;
      }
      renderDetail(body);
      elPanel.scrollTop = opts.keepScroll ? scroll : 0;
    } catch (_) {
      if (seq !== detailSeq) return;
      showDetailStatus('No se pudo cargar el trace.', true, traceId);
    }
  }

  // ---------- Reloj, en vivo ----------

  function tickClock() {
    if (lastUpdated) {
      const s = Math.round((Date.now() - lastUpdated) / 1000);
      if (s < 5) elUpdated.textContent = 'Actualizado ahora';
      else if (s < 60) elUpdated.textContent = `Actualizado hace ${s} s`;
      else elUpdated.textContent = `Actualizado ${fmtRelative(lastUpdated)}`;
    }
    elList.querySelectorAll('time[data-ts]').forEach((t) => {
      t.textContent = fmtRelative(t.dataset.ts);
    });
  }

  function readLive() {
    try { return localStorage.getItem(LIVE_KEY) === '1'; } catch (_) { return false; }
  }

  function setLive(on) {
    elLive.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem(LIVE_KEY, on ? '1' : '0'); } catch (_) { /* sin storage */ }
    clearInterval(liveTimer);
    liveTimer = null;
    if (on) {
      liveTimer = setInterval(() => {
        if (document.hidden || loading) return;
        refresh({ silent: true });
      }, LIVE_EVERY_MS);
    }
  }

  // ---------- Eventos ----------

  function clearFilters() {
    level = '';
    resolution = '';
    elService.value = '';
    elRange.value = 'today';
    syncCustomVisibility();
    applyFilters();
  }

  levelBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      level = btn.dataset.level || '';
      applyFilters();
    });
  });

  resolutionBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      resolution = btn.dataset.resolution || '';
      applyFilters();
    });
  });

  kpiBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.kpi;
      if (k === 'all') {
        level = '';
        resolution = '';
      } else if (k === 'open') {
        resolution = resolution === 'open' ? '' : 'open';
      } else {
        level = level === k ? '' : k;
      }
      applyFilters();
    });
  });

  let serviceTimer = null;
  elService.addEventListener('input', () => {
    clearTimeout(serviceTimer);
    serviceTimer = setTimeout(applyFilters, 300);
  });
  elService.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(serviceTimer);
      applyFilters();
    }
  });

  elRange.addEventListener('change', () => {
    syncCustomVisibility();
    applyFilters();
  });
  elFrom.addEventListener('change', applyFilters);
  elTo.addEventListener('change', applyFilters);
  elReload.addEventListener('click', () => refresh());
  elLive.addEventListener('click', () => {
    const on = elLive.getAttribute('aria-pressed') !== 'true';
    setLive(on);
    if (on) refresh({ silent: true });
  });
  elClear.addEventListener('click', clearFilters);
  elBackdrop.addEventListener('click', clearSelection);
  elPrev.addEventListener('click', () => {
    if (page > 1) { page -= 1; loadList(); }
  });
  elNext.addEventListener('click', () => {
    if (page < totalPages) { page += 1; loadList(); }
  });

  narrow.addEventListener('change', () => {
    if (narrow.matches && selectedId) openDrawer();
    else closeDrawer();
  });

  function moveSelection(delta) {
    const rows = Array.from(elList.querySelectorAll('.tr-row'));
    if (rows.length === 0) return;
    let idx = rows.findIndex((r) => r.dataset.traceId === selectedId);
    idx = idx === -1 ? (delta > 0 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, idx + delta));
    const row = rows[idx];
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (row.dataset.traceId !== selectedId) selectTrace(row.dataset.traceId);
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (typing) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (document.querySelector('.profile.is-open')) return;

    if (e.key === '/') {
      e.preventDefault();
      elService.focus();
      elService.select();
    } else if (e.key === 'r' || e.key === 'R') {
      refresh();
    } else if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'Escape' && selectedId) {
      clearSelection();
    }
  });

  setInterval(tickClock, 5000);

  readUrlState();
  syncCustomVisibility();
  syncFilterUi();
  showDetailPlaceholder();
  setLive(readLive());
  refresh();
  if (selectedId) selectTrace(selectedId);
});
