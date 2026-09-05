import SessionStorageManager from './AppStorage.js';
import { apiFetch, requireAdminSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';
import { setButtonLoading } from './buttonLoading.js';

const session = requireAdminSession();
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const DEBOUNCE_MS = 350;

/** Estados que devuelve el API, con su etiqueta y su chip de color. */
const ESTADOS = {
  pending_provision:     { label: 'En provisión',       chip: 'chip--pending' },
  ready_for_subscription:{ label: 'Lista para mensual', chip: 'chip--ready' },
  active:                { label: 'Activo',             chip: 'chip--accepted' },
  unpaid:                { label: 'Impago',             chip: 'chip--unpaid' },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Hasta dos iniciales del subdominio, para el cuadro de color de la tarjeta. */
function iniciales(subdomain) {
  return String(subdomain || '')
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join('') || '?';
}

function formatFecha(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function aviso(texto, tipo = 'info', duracion = 3800) {
  const cont = document.getElementById('messageContainer');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = `message message-${tipo}`;
  el.textContent = texto;
  el.style.animation = 'slideIn 0.3s ease-in-out';
  cont.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideOut 0.3s ease-in-out';
    setTimeout(() => el.remove(), 300);
  }, duracion);
}

let page = 1;
let status = 'all';
let debounce = null;
let borrarId = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!session) return; // requireAdminSession ya redirigió

  setupAccountMenu(session);

  const listaEl = document.getElementById('tenant-list');
  const searchEl = document.getElementById('tenant-search');
  const errorEl = document.getElementById('listaError');
  const totalEl = document.getElementById('totalTenants');
  const paginacion = document.getElementById('tenant-pagination');
  const infoEl = document.getElementById('pageinfoTenant');
  const prevBtn = document.getElementById('prevTenant');
  const nextBtn = document.getElementById('nextTenant');
  const confirmarBorrarBtn = document.getElementById('confirmarBorrarBtn');

  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      SessionStorageManager.clearSession();
      window.location.href = '/login';
    });
  }

  // ---------- Render ----------

  function filaTenant(row) {
    const id = escapeHtml(row.id);
    const subdomain = escapeHtml(row.subdomain || 'sin-subdominio');
    const estado = ESTADOS[row.status] || { label: row.status || 'desconocido', chip: 'chip--rol' };

    const cuenta = row.account_name
      ? `<span class="tenant-item__cuenta">${escapeHtml(row.account_name)}</span>`
      : '<span class="tenant-item__cuenta">Sin cuenta</span>';

    const fecha = formatFecha(row.created_at);
    const fechaEl = fecha
      ? `<span class="tenant-item__sep" aria-hidden="true"></span><span>${escapeHtml(fecha)}</span>`
      : '';

    const plan = row.planned_plan
      ? `<span class="chip chip--plan">${escapeHtml(row.planned_plan)}</span>`
      : '';

    // Marcar lista y borrar solo aplican mientras está en provisión. Cuando no
    // aplican dejan un hueco del mismo ancho, para que "Hash" no cambie de
    // sitio de una fila a otra.
    const pendiente = row.status === 'pending_provision';
    const listaBtn = pendiente
      ? `<button type="button" class="accion accion--lista js-ready" data-id="${id}">Marcar lista</button>`
      : '<span class="accion-hueco accion-hueco--lista" aria-hidden="true"></span>';
    const borrarBtn = pendiente
      ? `<button type="button" class="accion accion--borrar js-delete" data-id="${id}"
                 data-subdomain="${subdomain}" data-cuenta="${escapeHtml(row.account_name || 'sin cuenta')}">Borrar</button>`
      : '<span class="accion-hueco accion-hueco--borrar" aria-hidden="true"></span>';

    return `
      <li class="tenant-item">
        <span class="tenant-item__avatar" aria-hidden="true">${escapeHtml(iniciales(row.subdomain))}</span>
        <span class="tenant-item__body">
          <span class="tenant-item__subdomain">${subdomain}</span>
          <span class="tenant-item__meta">
            ${cuenta}
            ${fechaEl}
          </span>
        </span>
        <span class="tenant-item__estado">
          <span class="chip ${estado.chip}">${escapeHtml(estado.label)}</span>
        </span>
        <span class="tenant-item__plan">${plan}</span>
        <span class="tenant-item__acciones">
          ${listaBtn}
          <button type="button" class="accion accion--hash js-hash" data-id="${id}" data-subdomain="${subdomain}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M9.25 3.75 7.5 20.25M16.5 3.75 14.75 20.25M4.25 8.75h15.5M3.75 15.25h15.5"/>
            </svg>
            Hash
          </button>
          ${borrarBtn}
        </span>
      </li>
    `;
  }

  function pintarEsqueleto() {
    listaEl.innerHTML = Array.from(
      { length: 4 },
      () => '<li class="tenant-skeleton" aria-hidden="true"></li>'
    ).join('');
  }

  function pintarVacio() {
    const filtrando = status !== 'all' || searchEl.value.trim() !== '';
    listaEl.innerHTML = `
      <li class="tenant-empty">
        <span class="tenant-empty__titulo">No hay tenants</span>
        ${filtrando
          ? 'Ningún tenant coincide con el filtro o la búsqueda.'
          : 'Todavía no se ha dado de alta ningún tenant.'}
      </li>`;
  }

  async function cargar(nuevaPagina = page) {
    page = nuevaPagina;
    errorEl.textContent = '';
    pintarEsqueleto();
    paginacion.hidden = true;

    const search = searchEl.value.trim() || 'all';
    const qs = new URLSearchParams({ page: String(page), search, status });

    let res;
    let data = {};
    try {
      res = await apiFetch(`/billing/tenants?${qs}`, { headers: HEADERS });
      data = await res.json().catch(() => ({}));
    } catch (err) {
      listaEl.innerHTML = '';
      errorEl.textContent = 'Error de red al cargar los tenants.';
      totalEl.hidden = true;
      return;
    }

    if (!res.ok) {
      listaEl.innerHTML = '';
      errorEl.textContent = data.error || `No se pudieron cargar los tenants (${res.status}).`;
      totalEl.hidden = true;
      return;
    }

    const rows = data.data || [];
    if (rows.length === 0) {
      pintarVacio();
    } else {
      listaEl.innerHTML = rows.map(filaTenant).join('');
    }

    // El API pagina de 6 en 6 y "total" es lo de esta página, no el global.
    const total = rows.length;
    totalEl.textContent = total === 1 ? '1 tenant' : `${total} tenants`;
    totalEl.hidden = total === 0;

    const hayPaginas = page > 1 || Boolean(data.next_page);
    paginacion.hidden = !hayPaginas;
    infoEl.textContent = `Página ${data.current_page || page}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = !data.next_page;
  }

  // ---------- Modales ----------

  function abrirModal(id) { document.getElementById(id).classList.add('show'); }
  function cerrarModal(id) { document.getElementById(id).classList.remove('show'); }

  document.querySelectorAll('[data-cerrar]').forEach((btn) => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.cerrar));
  });
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('show');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'));
  });

  // ---------- Acciones de la lista ----------

  listaEl.addEventListener('click', async (e) => {
    const readyBtn = e.target.closest('.js-ready');
    const hashBtn = e.target.closest('.js-hash');
    const deleteBtn = e.target.closest('.js-delete');

    if (readyBtn) {
      setButtonLoading(readyBtn, true, 'Marcando...');
      try {
        const res = await apiFetch(`/billing/tenants/${readyBtn.dataset.id}`, {
          method: 'PATCH',
          headers: HEADERS,
          body: JSON.stringify({ status: 'ready_for_subscription' }),
        });
        if (!res.ok) {
          aviso('No se pudo marcar como lista', 'error');
          setButtonLoading(readyBtn, false);
          return;
        }
        aviso('Tenant marcado como lista para mensual', 'success');
        await cargar();
      } catch {
        aviso('Error de red al marcar la tenant', 'error');
        setButtonLoading(readyBtn, false);
      }
      return;
    }

    if (hashBtn) {
      abrirHash(hashBtn);
      return;
    }

    if (deleteBtn) {
      borrarId = deleteBtn.dataset.id;
      document.getElementById('borrarSubdomain').textContent = deleteBtn.dataset.subdomain;
      document.getElementById('borrarCuenta').textContent = deleteBtn.dataset.cuenta;
      document.getElementById('borrarError').textContent = '';
      abrirModal('borrarModal');
    }
  });

  // ---------- Borrar ----------

  confirmarBorrarBtn.addEventListener('click', async () => {
    if (!borrarId) return;
    const errorBorrar = document.getElementById('borrarError');
    errorBorrar.textContent = '';
    setButtonLoading(confirmarBorrarBtn, true, 'Borrando...');
    try {
      const res = await apiFetch(`/billing/tenants/${borrarId}`, {
        method: 'DELETE',
        headers: HEADERS,
      });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        errorBorrar.textContent = data.error || 'No se pudo borrar el tenant.';
        return;
      }
      cerrarModal('borrarModal');
      aviso('Tenant borrado', 'success');
      borrarId = null;
      await cargar();
    } catch {
      errorBorrar.textContent = 'Error de red al borrar el tenant.';
    } finally {
      setButtonLoading(confirmarBorrarBtn, false);
    }
  });

  // ---------- Hash inbound ----------

  const hashValor = document.getElementById('hashValor');
  const hashVerBtn = document.getElementById('hashVerBtn');
  const hashCopiarBtn = document.getElementById('hashCopiarBtn');
  const hashError = document.getElementById('hashError');
  let hashActual = '';

  function ocultarHash() {
    hashValor.classList.add('is-hidden');
    hashValor.textContent = '•'.repeat(24);
    hashVerBtn.setAttribute('aria-label', 'Mostrar hash');
  }

  async function abrirHash(btn) {
    hashActual = '';
    hashError.textContent = '';
    document.getElementById('hashSubdomain').textContent = btn.dataset.subdomain;
    ocultarHash();
    abrirModal('hashModal');

    try {
      const res = await apiFetch(`/billing/tenants/${btn.dataset.id}/reveal-hash`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.hash) {
        hashError.textContent = data.error || 'No se pudo obtener el hash.';
        return;
      }
      hashActual = data.hash;
    } catch {
      hashError.textContent = 'Error de red al obtener el hash.';
    }
  }

  hashVerBtn.addEventListener('click', () => {
    if (!hashActual) return;
    if (hashValor.classList.contains('is-hidden')) {
      hashValor.classList.remove('is-hidden');
      hashValor.textContent = hashActual;
      hashVerBtn.setAttribute('aria-label', 'Ocultar hash');
    } else {
      ocultarHash();
    }
  });

  hashCopiarBtn.addEventListener('click', async () => {
    if (!hashActual) return;
    try {
      await navigator.clipboard.writeText(hashActual);
      hashCopiarBtn.classList.add('is-ok');
      setTimeout(() => hashCopiarBtn.classList.remove('is-ok'), 1400);
      aviso('Hash copiado', 'success');
    } catch {
      // Sin permiso de portapapeles: al menos que se pueda seleccionar.
      hashValor.classList.remove('is-hidden');
      hashValor.textContent = hashActual;
      hashError.textContent = 'No se pudo copiar. Selecciona el hash y cópialo a mano.';
    }
  });

  // Al cerrar, el hash no se queda en el DOM.
  document.querySelectorAll('[data-cerrar="hashModal"]').forEach((btn) => {
    btn.addEventListener('click', () => { hashActual = ''; ocultarHash(); });
  });

  // ---------- Filtros, búsqueda y paginación ----------

  document.querySelectorAll('.filtro').forEach((btn) => {
    btn.addEventListener('click', () => {
      status = btn.dataset.status;
      document.querySelectorAll('.filtro').forEach((f) => {
        f.setAttribute('aria-pressed', String(f === btn));
      });
      cargar(1);
    });
  });

  searchEl.addEventListener('input', () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => cargar(1), DEBOUNCE_MS);
  });

  searchEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (debounce) clearTimeout(debounce);
    cargar(1);
  });

  prevBtn.addEventListener('click', () => {
    if (page > 1) cargar(page - 1);
  });

  nextBtn.addEventListener('click', () => cargar(page + 1));

  cargar(1);
});
