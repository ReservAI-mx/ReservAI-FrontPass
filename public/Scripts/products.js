import SessionStorageManager from './AppStorage.js';
import { apiFetch, goLogout, requireAdminSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';
import { setButtonLoading } from './buttonLoading.js';
import { showToast } from './toast.js';

const session = requireAdminSession();
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function aviso(texto, tipo = 'info', duracion = 3800) {
  showToast(texto, tipo, duracion);
}

let productos = [];
let filtro = 'todos';

const FILTROS = {
  todos: () => true,
  activos: (p) => !!p.active,
  inactivos: (p) => !p.active,
  pendientes: (p) => !p.facturama_product_id,
};

const ICONO_CAJA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7.5 12 3.75 19.5 7.5 12 11.25 4.5 7.5z"/>
  <path d="M4.5 12 12 15.75 19.5 12M4.5 16.5 12 20.25 19.5 16.5"/></svg>`;
const ICONO_ALERTA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>`;

function pintarKpis() {
  const kpis = document.getElementById('productKpis');
  if (!kpis) return;
  kpis.hidden = productos.length === 0;
  Object.keys(FILTROS).forEach((k) => {
    const el = kpis.querySelector(`[data-num="${k}"]`);
    if (el) el.textContent = String(productos.filter(FILTROS[k]).length);
  });
  kpis.querySelectorAll('[data-filtro]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro));
  });
}

function pintarError(mensaje) {
  const list = document.getElementById('product-list');
  if (!list) return;
  list.innerHTML = `<li class="ui-empty ui-empty--error">
      <span class="ui-empty__icono" aria-hidden="true">${ICONO_ALERTA}</span>
      <span class="ui-empty__titulo">No se pudieron cargar los productos</span>
      <span class="ui-empty__sub">${escapeHtml(mensaje)}</span>
      <button type="button" class="ui-btn ui-btn--ghost js-reintentar">Reintentar</button>
    </li>`;
}

function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function renderList(todos) {
  productos = todos;
  pintarKpis();
  const products = productos.filter(FILTROS[filtro] || FILTROS.todos);
  const list = document.getElementById('product-list');
  const badge = document.getElementById('totalProducts');
  const err = document.getElementById('listaError');
  if (err) err.textContent = '';
  if (badge) {
    badge.hidden = false;
    badge.textContent = String(productos.length);
  }
  if (!list) return;

  if (!products.length) {
    const filtrando = productos.length > 0;
    list.innerHTML = `<li class="ui-empty">
        <span class="ui-empty__icono ui-empty__icono--neutral" aria-hidden="true">${ICONO_CAJA}</span>
        <span class="ui-empty__titulo">${filtrando ? 'Ningún producto en este filtro' : 'Todavía no hay productos'}</span>
        <span class="ui-empty__sub">${filtrando
          ? 'Prueba con otro de los contadores de arriba.'
          : 'Crea el primero con "Nuevo producto": se da de alta en Stripe y Facturama.'}</span>
      </li>`;
    return;
  }

  list.innerHTML = products.map((p) => {
    const active = !!p.active;
    return `
      <li class="product-card ui-stripe ${active ? 'product-card--active' : 'product-card--inactive'}" data-id="${escapeHtml(p.id)}">
        <div>
          <h3 class="product-card__title">${escapeHtml(p.name)}</h3>
          <p class="product-card__desc">${escapeHtml(p.description)}</p>
          <dl class="product-card__amounts">
            <div>
              <dt>Mensual</dt>
              <dd>${formatMoney(p.monthly_amount)}</dd>
            </div>
            <div>
              <dt>Instalación</dt>
              <dd>${formatMoney(p.setup_amount)}</dd>
            </div>
          </dl>
          ${p.facturama_product_id
            ? `<p class="product-card__desc">Facturama: ${escapeHtml(p.facturama_product_id)} · ${escapeHtml(p.facturama_code_prod_serv || '')}</p>`
            : ''}
        </div>
        <div class="product-card__side">
          <span class="${active ? 'badge-active' : 'badge-inactive'}">
            ${active ? 'Activo' : 'Inactivo'}
          </span>
          ${!p.facturama_product_id ? '<span class="badge-pending">Pendiente Facturama</span>' : ''}
          <button type="button" class="product-card__toggle" data-active="${active ? 'true' : 'false'}">
            ${active ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </li>`;
  }).join('');
}

async function fetchProducts() {
  const err = document.getElementById('listaError');
  try {
    const res = await apiFetch('/billing/products', { headers: HEADERS });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudieron cargar los productos');
    }
    renderList(data.data || []);
  } catch (e) {
    if (err) err.textContent = '';
    pintarError(e.message || 'Error al cargar');
  }
}

async function createProduct(payload, btn) {
  const errorEl = document.getElementById('crearError');
  if (errorEl) errorEl.textContent = '';
  setButtonLoading(btn, true);
  try {
    const res = await apiFetch('/billing/products', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo crear el producto');
    }
    hideModal('crearModal');
    document.getElementById('crearForm')?.reset();
    if (data.facturama_pending) {
      aviso(
        data.message || 'Producto creado; Facturama pendiente de sincronizar',
        'warning',
        5200
      );
    } else {
      aviso(data.message || 'Producto creado en Stripe, Facturama y DB', 'success');
    }
    await fetchProducts();
  } catch (e) {
    if (errorEl) errorEl.textContent = e.message || 'Error al crear';
  } finally {
    setButtonLoading(btn, false);
  }
}

async function toggleActive(id, nextActive, btn) {
  setButtonLoading(btn, true);
  try {
    const res = await apiFetch(`/billing/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ active: nextActive }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'No se pudo actualizar');
    }
    aviso(nextActive ? 'Producto activado' : 'Producto desactivado', 'success');
    await fetchProducts();
  } catch (e) {
    aviso(e.message || 'Error al actualizar', 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupAccountMenu(session || SessionStorageManager.getSession());

  document.getElementById('logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    goLogout();
  });

  document.querySelectorAll('[data-cerrar]').forEach((btn) => {
    btn.addEventListener('click', () => hideModal(btn.getAttribute('data-cerrar')));
  });

  // El botón del encabezado abre el mismo modal que el grande de abajo.
  document.getElementById('nuevoProductoHeadBtn')?.addEventListener('click', () => {
    document.getElementById('nuevoProductoBtn')?.click();
  });

  document.getElementById('productKpis')?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-filtro]');
    if (!card) return;
    filtro = card.dataset.filtro;
    renderList(productos);
  });

  document.getElementById('nuevoProductoBtn')?.addEventListener('click', () => {
    const err = document.getElementById('crearError');
    if (err) err.textContent = '';
    showModal('crearModal');
  });

  document.getElementById('crearForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('nuevoNombre')?.value.trim();
    const description = document.getElementById('nuevaDescripcion')?.value.trim();
    const monthly_amount = Number(document.getElementById('nuevoMensual')?.value);
    const setup_amount = Number(document.getElementById('nuevoSetup')?.value);
    await createProduct(
      { name, description, monthly_amount, setup_amount },
      document.getElementById('crearProductoBtn')
    );
  });

  document.getElementById('product-list')?.addEventListener('click', async (e) => {
    if (e.target.closest('.js-reintentar')) {
      fetchProducts();
      return;
    }
    const btn = e.target.closest('.product-card__toggle');
    if (!btn) return;
    const card = btn.closest('.product-card');
    const id = card?.getAttribute('data-id');
    if (!id) return;
    const currentlyActive = btn.getAttribute('data-active') === 'true';
    await toggleActive(id, !currentlyActive, btn);
  });

  fetchProducts();
});
