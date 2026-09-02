import SessionStorageManager from './AppStorage.js';
import { apiFetch, requireAdminSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';

const session = requireAdminSession();
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function aviso(texto) {
  const cont = document.getElementById('messageContainer');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = 'message message-info';
  el.textContent = texto;
  cont.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

let page = 1;

async function loadTenants() {
  const list = document.getElementById('tenant-list');
  const loading = document.getElementById('tenants-loading');
  const search = document.getElementById('tenant-search').value.trim() || 'all';
  const status = document.getElementById('tenant-status').value || 'all';
  const qs = new URLSearchParams({ page: String(page), search, status });
  if (loading) loading.style.display = 'block';
  const res = await apiFetch(`/billing/tenants?${qs}`, { headers: HEADERS });
  const data = await res.json().catch(() => ({}));
  if (loading) loading.style.display = 'none';
  if (!res.ok) {
    list.innerHTML = `<p>No se pudieron cargar tenants (${res.status}).</p>`;
    return;
  }
  const rows = data.data || [];
  if (rows.length === 0) {
    list.innerHTML = '<p>No hay tenants.</p>';
  } else {
    list.innerHTML = rows.map((row) => {
      const id = escapeHtml(row.id);
      const readyBtn = row.status === 'pending_provision'
        ? `<button type="button" class="js-ready" data-id="${id}">Marcar lista</button>`
        : '';
      const deleteBtn = row.status === 'pending_provision'
        ? `<button type="button" class="js-delete" data-id="${id}">Borrar</button>`
        : '';
      return `
        <article class="inv-card" style="margin-bottom:1rem;padding:1rem;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#000;">
          <strong>${escapeHtml(row.subdomain)}</strong>
          · ${escapeHtml(row.account_name || '')}
          · ${escapeHtml(row.status)}
          · ${escapeHtml(row.planned_plan || '')}
          <div style="margin-top:0.7rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${readyBtn}
            <button type="button" class="js-hash" data-id="${id}">Hash inbound</button>
            ${deleteBtn}
          </div>
        </article>
      `;
    }).join('');
  }

  const pag = document.getElementById('tenant-pagination');
  const info = document.getElementById('pageinfoTenant');
  pag.style.display = 'flex';
  info.textContent = `Página ${data.current_page || page}`;
  document.getElementById('prevTenant').disabled = page <= 1;
  document.getElementById('nextTenant').disabled = !data.next_page;

  list.querySelectorAll('.js-ready').forEach((btn) => {
    btn.addEventListener('click', () => markReady(btn.dataset.id));
  });
  list.querySelectorAll('.js-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteTenant(btn.dataset.id));
  });
  list.querySelectorAll('.js-hash').forEach((btn) => {
    btn.addEventListener('click', () => revealHash(btn.dataset.id));
  });
}

async function markReady(id) {
  const res = await apiFetch(`/billing/tenants/${id}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ status: 'ready_for_subscription' }),
  });
  if (!res.ok) {
    aviso('No se pudo marcar lista');
    return;
  }
  await loadTenants();
}

async function deleteTenant(id) {
  const res = await apiFetch(`/billing/tenants/${id}`, {
    method: 'DELETE',
    headers: HEADERS,
  });
  if (res.status !== 204) {
    aviso('No se pudo borrar');
    return;
  }
  await loadTenants();
}

async function revealHash(id) {
  const res = await apiFetch(`/billing/tenants/${id}/reveal-hash`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.hash) {
    aviso('No se pudo obtener el hash');
    return;
  }
  try {
    await navigator.clipboard.writeText(data.hash);
    aviso('Hash copiado');
  } catch {
    aviso(data.hash);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!session) return;
  setupAccountMenu(session);
  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      SessionStorageManager.clearSession();
      window.location.href = '/login';
    });
  }
  document.getElementById('tenant-search').addEventListener('change', () => {
    page = 1;
    loadTenants();
  });
  document.getElementById('tenant-status').addEventListener('change', () => {
    page = 1;
    loadTenants();
  });
  document.getElementById('prevTenant').addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      loadTenants();
    }
  });
  document.getElementById('nextTenant').addEventListener('click', () => {
    page += 1;
    loadTenants();
  });
  loadTenants();
});
