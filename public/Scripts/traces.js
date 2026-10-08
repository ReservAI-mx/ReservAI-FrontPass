import { apiFetch, goLogout, requireAdminSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';

const session = requireAdminSession();
const API_LIST = '/traces';
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

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
  const elTotal = document.getElementById('totalTraces');
  const elService = document.getElementById('serviceFilter');
  const elRange = document.getElementById('rangePreset');
  const elFrom = document.getElementById('fromDate');
  const elTo = document.getElementById('toDate');
  const elFromWrap = document.getElementById('fromWrap');
  const elToWrap = document.getElementById('toWrap');
  const elReload = document.getElementById('reloadBtn');
  const elPlaceholder = document.getElementById('detailPlaceholder');
  const elDetail = document.getElementById('detailContent');
  const elPager = document.getElementById('pager');
  const elPagerLabel = document.getElementById('pagerLabel');
  const elPrev = document.getElementById('prevPage');
  const elNext = document.getElementById('nextPage');
  const levelBtns = Array.from(document.querySelectorAll('.filtros:not(.filtros--resolution) .filtro'));
  const resolutionBtns = Array.from(document.querySelectorAll('.filtros--resolution .filtro'));

  let level = '';
  let resolution = '';
  let page = 1;
  let totalPages = 0;
  let selectedId = null;
  let listSeq = 0;
  let detailSeq = 0;
  let currentDetail = null;

  const timeFmt = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'medium',
  });

  function fmtTime(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return timeFmt.format(new Date(n));
  }

  function fmtDuration(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n < 1000) return `${Math.round(n)} ms`;
    return `${(n / 1000).toFixed(n < 10000 ? 2 : 1)} s`;
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
    elFromWrap.hidden = !custom;
    elToWrap.hidden = !custom;
    if (custom && !elFrom.value && !elTo.value) {
      const now = new Date();
      elFrom.value = toLocalInput(startOfLocalDay(now));
      elTo.value = toLocalInput(now);
    }
  }

  function levelLabel(level) {
    const v = String(level || '').toLowerCase();
    if (v === 'error') return 'ERROR';
    if (v === 'warning' || v === 'warn') return 'WARNING';
    if (v === 'info') return 'INFO';
    return v ? v.toUpperCase() : '—';
  }

  function levelClass(level) {
    const v = String(level || '').toLowerCase();
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

  function setFiltersDisabled(disabled) {
    levelBtns.forEach((b) => { b.disabled = disabled; });
    resolutionBtns.forEach((b) => { b.disabled = disabled; });
    elService.disabled = disabled;
    elRange.disabled = disabled;
    elFrom.disabled = disabled;
    elTo.disabled = disabled;
    elReload.disabled = disabled;
    elPrev.disabled = disabled || page <= 1;
    elNext.disabled = disabled || totalPages === 0 || page >= totalPages;
  }

  function setListError(text) {
    elError.textContent = text || '';
  }

  function showSkeletons() {
    elList.replaceChildren();
    for (let i = 0; i < 4; i++) {
      const li = document.createElement('li');
      li.className = 'tenant-skeleton';
      li.setAttribute('aria-hidden', 'true');
      elList.appendChild(li);
    }
  }

  function showEmpty(title, sub) {
    elList.replaceChildren();
    const li = document.createElement('li');
    li.className = 'tenant-empty';
    const t = document.createElement('span');
    t.className = 'tenant-empty__titulo';
    t.textContent = title;
    li.appendChild(t);
    if (sub) {
      const s = document.createElement('span');
      s.textContent = sub;
      li.appendChild(s);
    }
    elList.appendChild(li);
  }

  function metaPart(parent, text, withSep) {
    if (withSep) {
      const sep = document.createElement('span');
      sep.className = 'tenant-item__sep';
      sep.setAttribute('aria-hidden', 'true');
      parent.appendChild(sep);
    }
    const span = document.createElement('span');
    span.className = 'tenant-item__dato';
    span.textContent = text;
    parent.appendChild(span);
  }

  function buildRow(trace) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tenant-item';
    btn.dataset.traceId = trace.trace_id;
    if (selectedId === trace.trace_id) btn.setAttribute('aria-current', 'true');

    const lvl = levelClass(trace.level);
    const avatar = document.createElement('div');
    avatar.className = 'tenant-item__avatar' + (lvl !== 'info' ? ` is-${lvl}` : '');
    avatar.textContent = (trace.http_method || '?').toString().slice(0, 6);
    btn.appendChild(avatar);

    const body = document.createElement('div');
    body.className = 'tenant-item__body';

    const title = document.createElement('div');
    title.className = 'tenant-item__title';
    const route = trace.route || '';
    title.textContent = route
      ? `${trace.service_name || '—'} · ${route}`
      : (trace.service_name || '—');
    body.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'tenant-item__meta';
    metaPart(meta, `Nivel ${levelLabel(trace.level)}`, false);
    if (trace.status_code != null && trace.status_code !== '') {
      metaPart(meta, `HTTP ${trace.status_code}`, true);
    }
    metaPart(meta, resolutionLabel(trace.resolution), true);
    metaPart(meta, fmtTime(trace.start_time), true);
    const src = sourceLabel(trace);
    if (src) metaPart(meta, src, true);
    const dur = fmtDuration(trace.duration_ms);
    if (dur) metaPart(meta, dur, true);
    body.appendChild(meta);

    if (trace.message) {
      const msg = document.createElement('div');
      msg.className = 'tenant-item__msg';
      msg.textContent = String(trace.message);
      body.appendChild(msg);
    }

    btn.appendChild(body);

    const estadoWrap = document.createElement('div');
    estadoWrap.className = 'tenant-item__estado';
    const estado = document.createElement('span');
    estado.className = `estado estado--${lvl}`;
    const punto = document.createElement('span');
    punto.className = 'estado__punto';
    punto.setAttribute('aria-hidden', 'true');
    estado.appendChild(punto);
    estado.appendChild(document.createTextNode(levelLabel(trace.level)));
    estadoWrap.appendChild(estado);

    const resBadge = document.createElement('span');
    resBadge.className = 'res-badge res-badge--' + (trace.resolution === 'resolved' ? 'resolved' : 'open');
    resBadge.textContent = resolutionLabel(trace.resolution);
    estadoWrap.appendChild(resBadge);

    btn.appendChild(estadoWrap);

    btn.addEventListener('click', () => selectTrace(trace.trace_id));
    return btn;
  }

  function renderList(traces) {
    elList.replaceChildren();
    for (let i = 0; i < traces.length; i++) {
      const li = document.createElement('li');
      li.appendChild(buildRow(traces[i]));
      elList.appendChild(li);
    }
  }

  function updatePager(total, pages) {
    totalPages = pages;
    elTotal.hidden = false;
    elTotal.textContent = String(total);
    if (pages <= 0) {
      elPager.hidden = true;
      return;
    }
    elPager.hidden = false;
    elPagerLabel.textContent = `Página ${page} de ${pages}`;
    elPrev.disabled = page <= 1;
    elNext.disabled = page >= pages;
  }

  function listUrl() {
    const q = new URLSearchParams();
    q.set('limit', String(LIMIT));
    q.set('page', String(page));
    const service = elService.value.trim();
    if (service) q.set('service', service);
    if (level) q.set('level', level);
    if (resolution) q.set('resolution', resolution);
    const { from, to } = rangeBounds();
    if (from != null) q.set('from', String(from));
    if (to != null) q.set('to', String(to));
    return `${API_LIST}?${q}`;
  }

  async function loadList() {
    const seq = ++listSeq;
    setListError('');
    setFiltersDisabled(true);
    showSkeletons();
    elTotal.hidden = true;

    try {
      const { res, body } = await apiGet(listUrl());
      if (seq !== listSeq) return;

      if (res.status === 401 || res.status === 403) {
        showEmpty('No autorizado.');
        setListError(shortError(body, 'No autorizado.'));
        elPager.hidden = true;
        return;
      }
      if (!res.ok) {
        showEmpty('No se pudo cargar la lista.');
        setListError(shortError(body, 'No se pudo cargar la lista.'));
        elPager.hidden = true;
        return;
      }

      const traces = Array.isArray(body && body.traces) ? body.traces : [];
      const total = Number(body && body.total) || 0;
      const pages = Number(body && body.total_pages) || 0;
      if (body && body.page) page = Number(body.page) || page;
      updatePager(total, pages);

      if (traces.length === 0) {
        showEmpty('No hay traces para este filtro.');
        return;
      }
      renderList(traces);
    } catch (_) {
      if (seq !== listSeq) return;
      showEmpty('No se pudo cargar la lista.');
      setListError('No se pudo cargar la lista.');
      elPager.hidden = true;
    } finally {
      if (seq === listSeq) setFiltersDisabled(false);
    }
  }

  function showDetailPlaceholder() {
    elPlaceholder.hidden = false;
    elPlaceholder.textContent = 'Selecciona un trace';
    elDetail.hidden = true;
    elDetail.replaceChildren();
    currentDetail = null;
  }

  function showDetailStatus(text, isError, retryId) {
    elPlaceholder.hidden = true;
    elDetail.hidden = false;
    elDetail.replaceChildren();
    const p = document.createElement('p');
    p.className = 'detail-status' + (isError ? ' detail-status--error' : '');
    p.textContent = text;
    elDetail.appendChild(p);
    if (retryId) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-retry';
      btn.textContent = 'Reintentar';
      btn.addEventListener('click', () => selectTrace(retryId));
      elDetail.appendChild(btn);
    }
  }

  async function setResolution(traceId, next) {
    const { res, body } = await apiPatch(
      `${API_LIST}/${encodeURIComponent(traceId)}/resolution`,
      { resolution: next }
    );
    if (!res.ok) {
      setListError(shortError(body, 'No se pudo actualizar la resolución.'));
      return false;
    }
    return true;
  }

  function renderDetail(payload) {
    const trace = (payload && payload.trace) || {};
    const logs = Array.isArray(payload && payload.logs) ? payload.logs : [];
    currentDetail = { trace, logs };

    elPlaceholder.hidden = true;
    elDetail.hidden = false;
    elDetail.replaceChildren();

    const head = document.createElement('div');
    head.className = 'detail-head';

    const id = document.createElement('div');
    id.className = 'detail-id';
    id.textContent = trace.trace_id || '—';
    head.appendChild(id);

    if (trace.message) {
      const msg = document.createElement('div');
      msg.className = 'detail-msg';
      msg.textContent = String(trace.message);
      head.appendChild(msg);
    }

    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    const bits = [
      ['Servicio', trace.service_name || '—'],
      ['Nivel', levelLabel(trace.level)],
      ['Resolución', resolutionLabel(trace.resolution)],
      ['Status', trace.status_code != null ? String(trace.status_code) : '—'],
      ['Estado', trace.trace_status || '—'],
      ['Método', trace.http_method || '—'],
      ['Ruta', trace.route || '—'],
      ['Hora', fmtTime(trace.start_time)],
    ];
    const src = sourceLabel(trace);
    if (src) bits.push(['Origen', src]);
    const dur = fmtDuration(trace.duration_ms);
    if (dur) bits.push(['Duración', dur]);
    if (trace.resolved_at) bits.push(['Resuelto', fmtTime(trace.resolved_at)]);

    bits.forEach(([label, value]) => {
      const span = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = label + ': ';
      span.appendChild(strong);
      span.appendChild(document.createTextNode(value));
      meta.appendChild(span);
    });
    head.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const resolveBtn = document.createElement('button');
    resolveBtn.type = 'button';
    resolveBtn.className = 'btn-resolve';
    const isResolved = trace.resolution === 'resolved';
    resolveBtn.textContent = isResolved ? 'Reabrir' : 'Marcar resuelto';
    resolveBtn.addEventListener('click', async () => {
      resolveBtn.disabled = true;
      const ok = await setResolution(trace.trace_id, isResolved ? 'open' : 'resolved');
      resolveBtn.disabled = false;
      if (ok) {
        await selectTrace(trace.trace_id);
        loadList();
      }
    });
    actions.appendChild(resolveBtn);
    head.appendChild(actions);

    if (trace.stack) {
      const stackTitle = document.createElement('div');
      stackTitle.className = 'logs-title';
      stackTitle.textContent = 'Stack';
      head.appendChild(stackTitle);
      const pre = document.createElement('pre');
      pre.className = 'stack-pre';
      pre.textContent = String(trace.stack);
      head.appendChild(pre);
    }

    elDetail.appendChild(head);

    const title = document.createElement('div');
    title.className = 'logs-title';
    title.textContent = 'Logs';
    elDetail.appendChild(title);

    if (logs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'detail-status';
      empty.textContent = 'Este trace no tiene logs.';
      elDetail.appendChild(empty);
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'log-list';
    logs.forEach((log) => {
      const li = document.createElement('li');
      const lvl = levelClass(log.level);
      li.className = 'log-item' + (lvl !== 'info' ? ` is-${lvl}` : '');

      const top = document.createElement('div');
      top.className = 'log-item__top';
      const t1 = document.createElement('span');
      t1.textContent = levelLabel(log.level);
      const t2 = document.createElement('span');
      t2.textContent = fmtTime(log.start_time ?? log.timestamp ?? log.logged_at);
      top.appendChild(t1);
      top.appendChild(t2);
      if (log.event) {
        const t3 = document.createElement('span');
        t3.textContent = String(log.event);
        top.appendChild(t3);
      }
      li.appendChild(top);

      const m = document.createElement('div');
      m.className = 'log-item__msg';
      m.textContent = log.message != null ? String(log.message) : '';
      li.appendChild(m);
      ul.appendChild(li);
    });
    elDetail.appendChild(ul);
  }

  async function selectTrace(traceId) {
    if (!traceId) return;
    selectedId = traceId;
    elList.querySelectorAll('.tenant-item').forEach((row) => {
      if (row.dataset.traceId === traceId) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });

    const seq = ++detailSeq;
    showDetailStatus('Cargando trace…', false);

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
    } catch (_) {
      if (seq !== detailSeq) return;
      showDetailStatus('No se pudo cargar el trace.', true, traceId);
    }
  }

  levelBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      level = btn.dataset.level || '';
      levelBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      page = 1;
      loadList();
    });
  });

  resolutionBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      resolution = btn.dataset.resolution || '';
      resolutionBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      page = 1;
      loadList();
    });
  });

  let serviceTimer = null;
  elService.addEventListener('input', () => {
    clearTimeout(serviceTimer);
    serviceTimer = setTimeout(() => { page = 1; loadList(); }, 300);
  });
  elService.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(serviceTimer);
      page = 1;
      loadList();
    }
  });

  elRange.addEventListener('change', () => {
    syncCustomVisibility();
    page = 1;
    loadList();
  });
  elFrom.addEventListener('change', () => { page = 1; loadList(); });
  elTo.addEventListener('change', () => { page = 1; loadList(); });
  elReload.addEventListener('click', () => loadList());
  elPrev.addEventListener('click', () => {
    if (page > 1) { page -= 1; loadList(); }
  });
  elNext.addEventListener('click', () => {
    if (page < totalPages) { page += 1; loadList(); }
  });

  syncCustomVisibility();
  showDetailPlaceholder();
  loadList();
});
