import { apiFetch, goLogout, requireAdminSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';
import { setButtonLoading } from './buttonLoading.js';
import { bindSearchShortcut, syncPressed } from './uiShell.js';
import { showToast } from './toast.js';

const session = requireAdminSession();

const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const DEBOUNCE_MS = 350;
const DEFAULT_STATUS = 'failed,dead';
const DEFAULT_ACTION = 'all';
const LIVE_KEY = 'jobs.live';
const LIVE_EVERY_MS = 15 * 1000;
const KPI_STATUSES = ['failed,dead', 'queued', 'in_flight', 'succeeded', 'all'];

const ESTADOS = {
  queued: { label: 'En cola', mod: 'estado--pending', accent: 'warn' },
  in_flight: { label: 'En vuelo', mod: 'estado--ready', accent: 'info' },
  succeeded: { label: 'OK', mod: 'estado--active', accent: 'ok' },
  failed: { label: 'Fallido', mod: 'estado--unpaid', accent: 'error' },
  dead: { label: 'Dead', mod: 'estado--unpaid', accent: 'error' },
};

const ACTIONS = {
  provision: 'Provision',
  disable_renewal: 'Disable renewal',
  enable_renewal: 'Enable renewal',
  payment_notify: 'Payment notify',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFecha(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function aviso(texto, tipo = 'info', duracion = 3800) {
  const cont = document.getElementById('messageContainer');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = `message message-${tipo}`;
  el.textContent = texto;
  cont.appendChild(el);
  setTimeout(() => el.remove(), duracion);
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  let page = parseInt(params.get('page'), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const status = params.get('status') || DEFAULT_STATUS;
  const action = params.get('action') || DEFAULT_ACTION;
  const search = params.get('search') || '';
  return { page, status, action, search };
}

function writeUrlState({ page, status, action, search }) {
  // Solo lo que difiere del default, para que el enlace limpio siga igual.
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (status && status !== DEFAULT_STATUS) params.set('status', status);
  if (action && action !== DEFAULT_ACTION) params.set('action', action);
  if (search) params.set('search', search);
  const qs = params.toString();
  const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(null, '', next);
  }
}

function syncFilterButtons(status, action) {
  syncPressed(document.querySelectorAll('.ui-kpi[data-status]'), 'status', status);
  syncPressed(document.querySelectorAll('#actionSeg .ui-seg__btn'), 'action', action);
}

let page = 1;
let status = DEFAULT_STATUS;
let action = DEFAULT_ACTION;
let debounce = null;
let cargaId = 0;

document.addEventListener('DOMContentLoaded', () => {
  if (!session) return;
  setupAccountMenu(session);

  const listaEl = document.getElementById('job-list');
  const searchEl = document.getElementById('job-search');
  const errorEl = document.getElementById('listaError');
  const totalEl = document.getElementById('totalJobs');
  const paginacion = document.getElementById('job-pagination');
  const infoEl = document.getElementById('pageinfoJob');
  const prevBtn = document.getElementById('prevJob');
  const nextBtn = document.getElementById('nextJob');
  const reloadBtn = document.getElementById('reloadBtn');
  const liveBtn = document.getElementById('liveBtn');
  const updatedEl = document.getElementById('updatedLabel');
  let lastUpdated = 0;
  let liveTimer = null;

  const initial = readUrlState();
  page = initial.page;
  status = initial.status;
  action = initial.action;
  searchEl.value = initial.search;
  syncFilterButtons(status, action);

  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      goLogout();
    });
  }

  document.querySelectorAll('.ui-kpi[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      status = btn.dataset.status;
      page = 1;
      syncFilterButtons(status, action);
      cargar();
    });
  });

  document.querySelectorAll('#actionSeg .ui-seg__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      action = btn.dataset.action;
      page = 1;
      syncFilterButtons(status, action);
      cargar();
    });
  });

  searchEl.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      page = 1;
      cargar();
    }, DEBOUNCE_MS);
  });

  prevBtn.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      cargar();
    }
  });
  nextBtn.addEventListener('click', () => {
    page += 1;
    cargar();
  });

  window.addEventListener('popstate', () => {
    const state = readUrlState();
    page = state.page;
    status = state.status;
    action = state.action;
    searchEl.value = state.search;
    syncFilterButtons(status, action);
    cargar({ skipUrl: true });
  });

  reloadBtn.addEventListener('click', () => cargar());
  bindSearchShortcut(searchEl);

  // ---------- En vivo ----------

  function tickUpdated() {
    if (!lastUpdated) return;
    const seg = Math.round((Date.now() - lastUpdated) / 1000);
    updatedEl.textContent = seg < 5 ? 'Actualizado ahora'
      : seg < 60 ? `Actualizado hace ${seg} s`
      : `Actualizado hace ${Math.round(seg / 60)} min`;
  }
  setInterval(tickUpdated, 5000);

  function setLive(on) {
    liveBtn.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem(LIVE_KEY, on ? '1' : '0'); } catch { /* sin storage */ }
    clearInterval(liveTimer);
    liveTimer = on
      ? setInterval(() => { if (!document.hidden) cargar(); }, LIVE_EVERY_MS)
      : null;
  }

  liveBtn.addEventListener('click', () => {
    const on = liveBtn.getAttribute('aria-pressed') !== 'true';
    setLive(on);
    if (on) cargar();
  });

  let liveGuardado = false;
  try { liveGuardado = localStorage.getItem(LIVE_KEY) === '1'; } catch { /* sin storage */ }
  setLive(liveGuardado);

  // ---------- KPIs ----------

  let kpiId = 0;

  /** Un conteo por estado (solo interesa "total") con la acción y búsqueda actuales. */
  async function cargarKpis() {
    const id = ++kpiId;
    const search = searchEl.value.trim();
    const totales = await Promise.all(KPI_STATUSES.map(async (st) => {
      try {
        const qs = new URLSearchParams({ page: '1', status: st, action, search });
        const res = await apiFetch(`/billing/jobs?${qs}`, { headers: HEADERS });
        if (!res.ok) return null;
        const data = await res.json().catch(() => ({}));
        return Number(data.total) || 0;
      } catch {
        return null;
      }
    }));
    if (id !== kpiId) return;
    KPI_STATUSES.forEach((st, i) => {
      const el = document.querySelector(`[data-num="${st}"]`);
      if (el) el.textContent = totales[i] == null ? '—' : String(totales[i]);
    });
  }

  // Clic en el id del job lo copia.
  listaEl.addEventListener('click', async (e) => {
    const idEl = e.target.closest('.js-copy-id');
    if (!idEl) return;
    try {
      await navigator.clipboard.writeText(idEl.dataset.id);
      showToast('ID del job copiado.', 'success', 2200);
    } catch {
      showToast('No se pudo copiar el ID.', 'error');
    }
  });

  listaEl.addEventListener('click', async (e) => {
    const retryBtn = e.target.closest('.js-retry-job');
    if (!retryBtn) return;
    setButtonLoading(retryBtn, true, 'Reintentando...');
    try {
      const res = await apiFetch(`/billing/jobs/${retryBtn.dataset.id}/retry`, {
        method: 'POST',
        headers: HEADERS,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        aviso(data.error || 'No se pudo reintentar', 'error');
        setButtonLoading(retryBtn, false);
        return;
      }
      aviso('Job reencolado', 'success');
      await cargar();
    } catch {
      aviso('Error de red al reintentar', 'error');
      setButtonLoading(retryBtn, false);
    }
  });

  async function cargar(opts = {}) {
    const id = ++cargaId;
    errorEl.textContent = '';
    const search = searchEl.value.trim();
    reloadBtn.classList.add('is-spinning');
    cargarKpis();

    if (!opts.skipUrl) {
      writeUrlState({ page, status, action, search });
    }

    const qs = new URLSearchParams({
      page: String(page),
      status,
      action,
      search,
    });

    let res;
    try {
      res = await apiFetch(`/billing/jobs?${qs}`, { headers: HEADERS });
    } catch {
      if (id !== cargaId) return;
      reloadBtn.classList.remove('is-spinning');
      errorEl.textContent = 'Error de red al cargar los jobs.';
      listaEl.innerHTML = '';
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (id !== cargaId) return;
    reloadBtn.classList.remove('is-spinning');
    lastUpdated = Date.now();
    tickUpdated();

    if (!res.ok) {
      errorEl.textContent = data.error || `No se pudieron cargar los jobs (${res.status}).`;
      listaEl.innerHTML = '';
      return;
    }

    const jobs = data.jobs || [];
    const total = data.total || 0;
    totalEl.hidden = false;
    totalEl.textContent = total === 1 ? '1 job' : `${total} jobs`;

    if (!jobs.length) {
      pintarVacio(search);
    } else {
      listaEl.innerHTML = jobs.map(renderJob).join('');
    }

    const pages = data.total_pages || Math.max(1, Math.ceil(total / (data.limit || 20)));
    page = data.current_page || page;
    paginacion.hidden = pages <= 1;
    infoEl.textContent = `Página ${page} de ${pages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= pages || !data.next_page;
  }

  function actionInitials(actionKey) {
    const map = {
      provision: 'PR',
      disable_renewal: 'DR',
      enable_renewal: 'ER',
      payment_notify: 'PN',
    };
    return map[actionKey] || '?';
  }

  function renderJob(row) {
    const st = ESTADOS[row.status] || { label: row.status, mod: '', accent: '' };
    const act = ACTIONS[row.action] || row.action;
    const canRetry = row.status === 'failed' || row.status === 'dead';
    const hasError = Boolean(row.last_error);
    const err = hasError ? escapeHtml(String(row.last_error).slice(0, 160)) : '';
    const cliente = escapeHtml(row.account_email || row.account_name || 'sin cliente');
    const tenant = escapeHtml(row.subdomain || 'sin tenant');
    const intentos = `${row.attempts ?? 0}/${row.max_attempts ?? 5}`;
    const fecha = formatFecha(row.created_at);
    const retryBtn = canRetry
      ? `<button type="button" class="accion accion--retry js-retry-job" data-id="${escapeHtml(row.id)}">Retry</button>`
      : '<span class="accion-hueco accion-hueco--retry" aria-hidden="true"></span>';

    return `
      <li class="tenant-item job-item ui-stripe${st.accent ? ` tenant-item--${st.accent}` : ''}">
        <span class="tenant-item__avatar job-item__avatar" aria-hidden="true">${actionInitials(row.action)}</span>
        <span class="tenant-item__body">
          <span class="tenant-item__subdomain">${escapeHtml(act)}</span>
          <span class="tenant-item__meta">
            <span class="tenant-item__dato tenant-item__cuenta">${tenant}</span>
            <span class="tenant-item__dato">
              <span class="tenant-item__sep" aria-hidden="true"></span>${cliente}
            </span>
            <span class="tenant-item__dato">
              <span class="tenant-item__sep" aria-hidden="true"></span>${intentos} intentos
            </span>
            ${fecha
              ? `<span class="tenant-item__dato">
                   <span class="tenant-item__sep" aria-hidden="true"></span>${escapeHtml(fecha)}
                 </span>`
              : ''}
          </span>
          <button type="button" class="job-item__id js-copy-id" data-id="${escapeHtml(row.id)}"
                  title="Copiar ID">${escapeHtml(row.id)}</button>
          ${hasError
            ? `<span class="job-item__error" title="${escapeHtml(row.last_error)}">${err}</span>`
            : ''}
        </span>
        <span class="tenant-item__estado">
          <span class="estado ${st.mod}">
            <span class="estado__punto" aria-hidden="true"></span>${escapeHtml(st.label)}
          </span>
        </span>
        <span class="tenant-item__acciones">
          ${retryBtn}
        </span>
      </li>
    `;
  }

  function pintarVacio(search) {
    const filtrando = status !== DEFAULT_STATUS || action !== DEFAULT_ACTION || Boolean(search);
    listaEl.innerHTML = `
      <li class="tenant-empty">
        <span class="tenant-empty__titulo">No hay jobs</span>
        ${filtrando
          ? 'Ningún job coincide con el filtro o la búsqueda.'
          : 'Todavía no hay jobs registrados.'}
      </li>`;
  }

  cargar();
});
