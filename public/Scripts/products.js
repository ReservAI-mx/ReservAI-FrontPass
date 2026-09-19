import SessionStorageManager from './AppStorage.js';
import { apiFetch, goLogout, requireAdminSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';
import { setButtonLoading } from './buttonLoading.js';

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
  const cont = document.getElementById('messageContainer');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = `message message--${tipo}`;
  el.textContent = texto;
  cont.appendChild(el);
  setTimeout(() => el.remove(), duracion);
}

function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function renderList(products) {
  const list = document.getElementById('product-list');
  const badge = document.getElementById('totalProducts');
  const err = document.getElementById('listaError');
  if (err) err.textContent = '';
  if (badge) {
    badge.hidden = false;
    badge.textContent = String(products.length);
  }
  if (!list) return;

  if (!products.length) {
    list.innerHTML = '<li class="product-card"><p>No hay productos todavía.</p></li>';
    return;
  }

  list.innerHTML = products.map((p) => {
    const active = !!p.active;
    return `
      <li class="product-card" data-id="${escapeHtml(p.id)}">
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
            : '<p class="product-card__desc product-card__pending">Pendiente Facturama</p>'}
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
    if (err) err.textContent = e.message || 'Error al cargar';
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
