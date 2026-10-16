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
  kpis: document.getElementById('paymentsKpis'),
  kpiTotal: document.getElementById('kpiTotal'),
  kpiFacturados: document.getElementById('kpiFacturados'),
  kpiFacturables: document.getElementById('kpiFacturables'),
};

/** Estados de Stripe → etiqueta en español y color del chip. */
const ESTADOS_PAGO = {
  succeeded: { label: 'Pagado', mod: 'ok' },
  paid: { label: 'Pagado', mod: 'ok' },
  complete: { label: 'Pagado', mod: 'ok' },
  pending: { label: 'Pendiente', mod: 'warn' },
  processing: { label: 'En proceso', mod: 'warn' },
  requires_payment_method: { label: 'Requiere pago', mod: 'warn' },
  failed: { label: 'Fallido', mod: 'error' },
  canceled: { label: 'Cancelado', mod: 'neutral' },
  refunded: { label: 'Reembolsado', mod: 'purple' },
};

const ICONOS = {
  ticket: '<path d="M6.5 3.5h11v17l-2.75-1.75L12 20.5l-2.75-1.75L6.5 20.5z"/><path d="M9.5 8h5M9.5 11.5h5"/>',
  pdf: '<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>',
  xml: '<path d="m8.5 9-3 3 3 3M15.5 9l3 3-3 3"/>',
  factura: '<path d="M12 5.5v13M5.5 12h13"/>',
};

function icono(nombre) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONOS[nombre] || '';
  return svg;
}

function botonAccion(texto, nombreIcono, clase, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  if (clase) btn.className = clase;
  btn.appendChild(icono(nombreIcono));
  btn.appendChild(document.createTextNode(texto));
  btn.addEventListener('click', onClick);
  return btn;
}

function pintarKpis(payments) {
  if (!els.kpis) return;
  els.kpis.hidden = total === 0;
  if (els.kpiTotal) els.kpiTotal.textContent = String(total);
  if (els.kpiFacturados) els.kpiFacturados.textContent = String(payments.filter((p) => p.invoice_id).length);
  if (els.kpiFacturables) els.kpiFacturables.textContent = String(payments.filter((p) => p.can_invoice && !p.invoice_id).length);
  // Con varias páginas, facturados/por facturar solo cuentan la visible.
  els.kpis.querySelectorAll('[data-alcance]').forEach((el) => {
    el.textContent = total > PAGE_SIZE ? 'en esta página' : 'con CFDI emitido';
  });
}

let offset = 0;
let total = 0;

function showError(msg) {
  if (els.error) {
    els.error.hidden = false;
    els.error.textContent = msg;
  }
  showToast(msg, 'error');
}

function showFacturamaUnavailableAlert() {
  const text =
    'El servicio de facturación no está disponible en este momento. Contáctanos por WhatsApp al 52 33 1462 7189 o escribe a support@reservai.com.mx.';
  if (els.error) {
    els.error.hidden = false;
    els.error.innerHTML =
      'El servicio de facturación no está disponible en este momento. Contáctanos por ' +
      '<a href="https://wa.me/523314627189" target="_blank" rel="noopener noreferrer">WhatsApp (52 33 1462 7189)</a> ' +
      'o escribe a <a href="mailto:support@reservai.com.mx">support@reservai.com.mx</a>.';
  }
  showToast(text, 'error');
}

function clearError() {
  if (!els.error) return;
  els.error.hidden = true;
  els.error.textContent = '';
  els.error.innerHTML = '';
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

const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function formatAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return moneda.format(n);
}

/** Fecha y hora por separado, para mostrarlas en dos líneas. */
function formatDateParts(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return { fecha: formatDate(value), hora: '' };
  const tz = { timeZone: 'America/Mexico_City' };
  return {
    fecha: d.toLocaleDateString('es-MX', { ...tz, day: 'numeric', month: 'short', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-MX', { ...tz, hour: '2-digit', minute: '2-digit' }),
  };
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
      actions.appendChild(botonAccion('Ticket', 'ticket', '', () => {
        openBillingPath(`/billing/tickets/${encodeURIComponent(p.id)}/pdf`);
      }));
    }

    if (p.invoice_id) {
      actions.appendChild(botonAccion('PDF CFDI', 'pdf', '', () => {
        openBillingPath(`/billing/invoices/${encodeURIComponent(p.invoice_id)}/pdf`);
      }));
      actions.appendChild(botonAccion('XML', 'xml', '', () => {
        openBillingPath(`/billing/invoices/${encodeURIComponent(p.invoice_id)}/xml`);
      }));
    } else if (p.can_invoice) {
      const invBtn = botonAccion('Solicitar factura', 'factura', 'btn-invoice', () => requestInvoice(p.id, invBtn));
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

    // textContent en todo lo que viene del API.
    const { fecha, hora } = formatDateParts(p.created_at);
    const tdFecha = document.createElement('td');
    const fechaEl = document.createElement('span');
    fechaEl.className = 'pay-fecha';
    fechaEl.textContent = fecha;
    tdFecha.appendChild(fechaEl);
    if (hora) {
      const horaEl = document.createElement('span');
      horaEl.className = 'pay-hora';
      horaEl.textContent = hora;
      tdFecha.appendChild(horaEl);
    }

    const tdMonto = document.createElement('td');
    tdMonto.className = 'pay-monto';
    tdMonto.textContent = formatAmount(p.amount);

    const tdEstado = document.createElement('td');
    const est = ESTADOS_PAGO[String(p.status || '').toLowerCase()] || { label: p.status || '—', mod: 'neutral' };
    const chip = document.createElement('span');
    chip.className = `fiscal-chip fiscal-chip--${est.mod}`;
    chip.textContent = est.label;
    tdEstado.appendChild(chip);
    if (p.invoice_id) {
      const fact = document.createElement('span');
      fact.className = 'fiscal-chip fiscal-chip--info pay-facturado';
      fact.textContent = 'Facturado';
      tdEstado.appendChild(fact);
    }

    tr.append(tdFecha, tdMonto, tdEstado);
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
      if (body.error === 'FACTURAMA_UNAVAILABLE' || res.status === 503) {
        showFacturamaUnavailableAlert();
        if (btn) btn.disabled = false;
        return;
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

    pintarKpis(payments);
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
