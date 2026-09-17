import { apiFetch, API_BASE, goLogout, requireUiSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';
import { showToast } from './toast.js';

const BILLING_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
};

const PAGE_SIZE = 20;

const session = requireUiSession();
setupAccountMenu(session);

const logout = document.getElementById('logout');
if (logout) {
  logout.addEventListener('click', (e) => {
    e.preventDefault();
    goLogout();
  });
}

const els = {
  loading: document.getElementById('paymentsLoading'),
  error: document.getElementById('paymentsError'),
  message: document.getElementById('paymentsMessage'),
  empty: document.getElementById('paymentsEmpty'),
  table: document.getElementById('paymentsTable'),
  body: document.getElementById('paymentsBody'),
  pager: document.getElementById('paymentsPager'),
  prev: document.getElementById('paymentsPrev'),
  next: document.getElementById('paymentsNext'),
  pageInfo: document.getElementById('paymentsPageInfo'),
};

let offset = 0;
let total = 0;

function showError(msg) {
  if (els.error) {
    els.error.hidden = false;
    els.error.textContent = msg;
  }
  showToast(msg, 'error');
}

function clearError() {
  if (!els.error) return;
  els.error.hidden = true;
  els.error.textContent = '';
}

function showMessage(msg) {
  if (els.message) {
    els.message.hidden = false;
    els.message.textContent = msg;
    setTimeout(() => {
      els.message.hidden = true;
    }, 3500);
  }
  showToast(msg, 'success');
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `MXN ${n.toFixed(2)}`;
}

function blockedLabel(reason) {
  if (reason === 'already_invoiced') return 'Ya facturado';
  if (reason === 'month_expired') return 'Fuera de plazo (solo mes de compra)';
  if (reason === 'fiscal_not_ready') return 'Completa y activa tu información fiscal';
  return '';
}

function openBillingPath(path) {
  window.location.href = `${API_BASE}${path}`;
}

function renderRows(payments) {
  if (!els.body) return;
  els.body.innerHTML = '';

  for (const p of payments) {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;

    const actions = document.createElement('div');
    actions.className = 'payments-actions';

    if (p.ticket_available) {
      const ticketBtn = document.createElement('button');
      ticketBtn.type = 'button';
      ticketBtn.textContent = 'Ticket';
      ticketBtn.addEventListener('click', () => {
        openBillingPath(`/billing/tickets/${encodeURIComponent(p.id)}/pdf`);
      });
      actions.appendChild(ticketBtn);
    }

    if (p.invoice_id) {
      const pdfBtn = document.createElement('button');
      pdfBtn.type = 'button';
      pdfBtn.textContent = 'PDF CFDI';
      pdfBtn.addEventListener('click', () => {
        openBillingPath(`/billing/invoices/${encodeURIComponent(p.invoice_id)}/pdf`);
      });
      actions.appendChild(pdfBtn);

      const xmlBtn = document.createElement('button');
      xmlBtn.type = 'button';
      xmlBtn.textContent = 'XML';
      xmlBtn.addEventListener('click', () => {
        openBillingPath(`/billing/invoices/${encodeURIComponent(p.invoice_id)}/xml`);
      });
      actions.appendChild(xmlBtn);
    } else if (p.can_invoice) {
      const invBtn = document.createElement('button');
      invBtn.type = 'button';
      invBtn.className = 'btn-invoice';
      invBtn.textContent = 'Solicitar factura';
      invBtn.addEventListener('click', () => requestInvoice(p.id, invBtn));
      actions.appendChild(invBtn);
    }

    const hint = blockedLabel(p.invoice_blocked_reason);
    const actionsCell = document.createElement('td');
    actionsCell.appendChild(actions);
    if (hint && !p.can_invoice && !p.invoice_id) {
      const hintEl = document.createElement('div');
      hintEl.className = 'payments-hint';
      hintEl.textContent = hint;
      actionsCell.appendChild(hintEl);
    }

    tr.innerHTML = `
      <td>${formatDate(p.created_at)}</td>
      <td>${formatAmount(p.amount)}</td>
      <td>${p.status || '—'}</td>
    `;
    tr.appendChild(actionsCell);
    els.body.appendChild(tr);
  }
}

async function requestInvoice(paymentHistoryId, btn) {
  clearError();
  if (btn) btn.disabled = true;
  try {
    const res = await apiFetch(
      `/billing/invoices/from-payment/${encodeURIComponent(paymentHistoryId)}`,
      { method: 'POST', headers: BILLING_HEADERS }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.error === 'MONTH_EXPIRED') {
        throw new Error('Fuera de plazo: solo puedes facturar en el mes del cobro.');
      }
      if (body.error === 'FISCAL_NOT_READY') {
        throw new Error('Tu información fiscal no está activa y validada ante el SAT.');
      }
      if (body.error === 'PAYMENT_NOT_FOUND') {
        throw new Error('No se encontró el cobro.');
      }
      if (
        body.error === 'Internal server error' ||
        res.status >= 500 ||
        /certificado|sello|facturama|expedition/i.test(String(body.error || ''))
      ) {
        throw new Error('No se pudo generar la factura. Intenta más tarde.');
      }
      throw new Error('No se pudo generar la factura.');
    }
    showMessage(body.message || 'Factura generada.');
    await loadPayments();
  } catch (err) {
    showError(err.message || 'Error al facturar');
    if (btn) btn.disabled = false;
  }
}

function syncPager() {
  if (!els.pager) return;
  if (total <= PAGE_SIZE) {
    els.pager.hidden = true;
    return;
  }
  els.pager.hidden = false;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (els.pageInfo) els.pageInfo.textContent = `Página ${page} de ${pages}`;
  if (els.prev) els.prev.disabled = offset <= 0;
  if (els.next) els.next.disabled = offset + PAGE_SIZE >= total;
}

async function loadPayments() {
  clearError();
  if (els.loading) els.loading.hidden = false;
  try {
    const res = await apiFetch(
      `/billing/payments?limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: BILLING_HEADERS }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || 'No se pudo cargar el historial');
    }
    const payments = body.data || [];
    total = Number(body.total) || 0;

    if (payments.length === 0) {
      if (els.empty) els.empty.hidden = false;
      if (els.table) els.table.hidden = true;
    } else {
      if (els.empty) els.empty.hidden = true;
      if (els.table) els.table.hidden = false;
      renderRows(payments);
    }
    syncPager();
  } catch (err) {
    showError(err.message || 'Error al cargar');
  } finally {
    if (els.loading) els.loading.hidden = true;
  }
}

els.prev?.addEventListener('click', () => {
  offset = Math.max(0, offset - PAGE_SIZE);
  loadPayments();
});

els.next?.addEventListener('click', () => {
  if (offset + PAGE_SIZE < total) {
    offset += PAGE_SIZE;
    loadPayments();
  }
});

loadPayments();
