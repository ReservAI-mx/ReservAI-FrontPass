import { requireAdminSession } from '../api.js';
import SessionStorageManager from '../AppStorage.js';
import { setupAccountMenu } from '../accountMenu.js';
import { setButtonLoading, shakeElement } from '../buttonLoading.js';
import {
  fetchInvitations,
  createInvitation,
  resendInvitation,
  revokeInvitation,
} from './services/invitationService.js';
import {
  estadoEfectivo,
  ETIQUETAS,
  puedeReenviar,
  puedeRevocar,
  tiempoRelativo,
  fechaCorta,
} from './estado.js';

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const DEBOUNCE_MS = 350;

const session = requireAdminSession();

function escapa(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function iniciales(correo) {
  return String(correo || '')
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join('') || '?';
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

document.addEventListener('DOMContentLoaded', () => {
  if (!session) return; // requireAdminSession ya redirigió

  setupAccountMenu(session);

  const listaEl = document.getElementById('invitation-list');
  const searchEl = document.getElementById('search');
  const totalEl = document.getElementById('totalInvitaciones');
  const errorEl = document.getElementById('listaError');
  const paginacion = document.getElementById('pagination');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const pageInfo = document.getElementById('page-info');
  const resumen = document.getElementById('resumen');

  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      SessionStorageManager.clearSession();
      window.location.href = '/login';
    });
  }

  let pagina = 1;
  let busqueda = '';
  let filtro = 'todas';
  let debounce = null;
  let ultimaPagina = [];

  // ---------------------------------------------------------------- render

  function pintarResumen(invitaciones) {
    const cuenta = { pending: 0, accepted: 0, expired: 0, revoked: 0 };
    invitaciones.forEach((inv) => {
      const e = estadoEfectivo(inv);
      if (cuenta[e] !== undefined) cuenta[e] += 1;
    });
    document.getElementById('numTodas').textContent = invitaciones.length;
    document.getElementById('numPending').textContent = cuenta.pending;
    document.getElementById('numAccepted').textContent = cuenta.accepted;
    document.getElementById('numExpired').textContent = cuenta.expired;
    document.getElementById('numRevoked').textContent = cuenta.revoked;
    resumen.hidden = invitaciones.length === 0;
  }

  function filaInvitacion(inv) {
    const estado = estadoEfectivo(inv);
    const id = escapa(inv.id ?? inv.invitation_id ?? '');
    const correo = escapa(inv.email || 'Sin correo');
    const rol = String(inv.role || '').toLowerCase() === 'admin' ? 'Admin' : 'Cliente';

    const vence = estado === 'pending'
      ? `Vence ${tiempoRelativo(inv.expires_at)}`
      : estado === 'expired'
        ? `Venció ${tiempoRelativo(inv.expires_at)}`
        : estado === 'accepted'
          ? `Aceptada el ${fechaCorta(inv.accepted_at)}`
          : `Enviada el ${fechaCorta(inv.created_at)}`;

    const acciones = [];
    if (puedeReenviar(estado)) {
      acciones.push(`<button type="button" class="accion accion--reenviar" data-accion="reenviar"
          data-id="${id}" data-email="${correo}">Reenviar</button>`);
    }
    if (puedeRevocar(estado)) {
      acciones.push(`<button type="button" class="accion accion--revocar" data-accion="revocar"
          data-id="${id}" data-email="${correo}">Revocar</button>`);
    }

    return `<li class="invitation-item" data-estado="${estado}" data-id="${id}">
      <span class="invitation-item__avatar" aria-hidden="true">${escapa(iniciales(inv.email))}</span>
      <span class="invitation-item__body">
        <span class="invitation-item__email">${correo}</span>
        <span class="invitation-item__meta">${escapa(vence)}</span>
      </span>
      <span class="chip chip--rol">${rol}</span>
      <span class="chip chip--estado chip--${estado}">${ETIQUETAS[estado] || estado}</span>
      <span class="invitation-item__acciones">${acciones.join('')}</span>
    </li>`;
  }

  function pintarLista(invitaciones) {
    const visibles = filtro === 'todas'
      ? invitaciones
      : invitaciones.filter((inv) => estadoEfectivo(inv) === filtro);

    if (!visibles.length) {
      listaEl.innerHTML = `<li class="invitation-empty">${
        invitaciones.length
          ? 'Ninguna invitación con ese estado en esta página.'
          : 'Todavía no hay invitaciones.'
      }</li>`;
      return;
    }
    listaEl.innerHTML = visibles.map(filaInvitacion).join('');
  }

  // ---------------------------------------------------------------- carga

  async function cargar(nuevaPagina = pagina) {
    errorEl.textContent = '';
    listaEl.innerHTML = '<li class="invitation-cargando">Cargando invitaciones...</li>';
    paginacion.hidden = true;

    try {
      const { invitaciones, total, paginaActual, siguientePagina } =
        await fetchInvitations({ page: nuevaPagina, search: busqueda });

      pagina = paginaActual;
      ultimaPagina = invitaciones;

      pintarResumen(invitaciones);
      pintarLista(invitaciones);

      totalEl.textContent = total === 1 ? '1 invitación' : `${total} invitaciones`;
      totalEl.hidden = total === 0;

      pageInfo.textContent = `Página ${pagina}`;
      prevBtn.disabled = pagina <= 1;
      nextBtn.disabled = !siguientePagina;
      paginacion.hidden = invitaciones.length === 0;
    } catch (err) {
      if (err.message === 'Session expired') return; // apiFetch ya redirigió
      listaEl.innerHTML = '';
      resumen.hidden = true;
      totalEl.hidden = true;
      errorEl.textContent = err.message || 'No se pudieron cargar las invitaciones.';
    }
  }

  // ---------------------------------------------------------------- filtros

  resumen.addEventListener('click', (e) => {
    const card = e.target.closest('[data-filtro]');
    if (!card) return;
    filtro = card.dataset.filtro;
    resumen.querySelectorAll('[data-filtro]').forEach((c) => {
      c.setAttribute('aria-pressed', String(c.dataset.filtro === filtro));
    });
    pintarLista(ultimaPagina);
  });

  searchEl.addEventListener('input', () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      busqueda = searchEl.value.trim();
      cargar(1);
    }, DEBOUNCE_MS);
  });

  searchEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (debounce) clearTimeout(debounce);
    busqueda = searchEl.value.trim();
    cargar(1);
  });

  prevBtn.addEventListener('click', () => { if (pagina > 1) cargar(pagina - 1); });
  nextBtn.addEventListener('click', () => cargar(pagina + 1));

  // ---------------------------------------------------------------- acciones

  listaEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-accion]');
    if (!btn) return;

    const { accion, id, email } = btn.dataset;
    if (accion === 'revocar') {
      abrirRevocar(id, email);
      return;
    }

    setButtonLoading(btn, true, 'Enviando...');
    try {
      await resendInvitation(id);
      aviso(`Invitación reenviada a ${email}`, 'success');
      await cargar(pagina);
    } catch (err) {
      if (err.message === 'Session expired') return;
      aviso(err.message, 'error', 5000);
      if (document.body.contains(btn)) setButtonLoading(btn, false);
    }
  });

  // ---------------------------------------------------------------- modales

  function abrirModal(id) { document.getElementById(id).classList.add('show'); }
  function cerrarModal(id) { document.getElementById(id).classList.remove('show'); }

  document.querySelectorAll('[data-cerrar]').forEach((btn) => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.cerrar));
  });
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'));
  });

  // --- Revocar ---
  const revocarModal = document.getElementById('revocarModal');
  const revocarEmail = document.getElementById('revocarEmail');
  const revocarError = document.getElementById('revocarError');
  const confirmarRevocarBtn = document.getElementById('confirmarRevocarBtn');
  let idARevocar = null;

  function abrirRevocar(id, email) {
    idARevocar = id;
    revocarEmail.textContent = email;
    revocarError.textContent = '';
    abrirModal('revocarModal');
  }

  confirmarRevocarBtn.addEventListener('click', async () => {
    if (!idARevocar) return;
    revocarError.textContent = '';
    setButtonLoading(confirmarRevocarBtn, true, 'Revocando...');
    try {
      await revokeInvitation(idARevocar);
      cerrarModal('revocarModal');
      aviso('Invitación revocada', 'success');
      await cargar(pagina);
    } catch (err) {
      if (err.message === 'Session expired') return;
      revocarError.textContent = err.message;
      shakeElement(revocarModal.querySelector('.modal-content'));
    } finally {
      if (document.body.contains(confirmarRevocarBtn)) {
        setButtonLoading(confirmarRevocarBtn, false);
      }
    }
  });

  // --- Crear ---
  const crearForm = document.getElementById('crearForm');
  const nuevoEmail = document.getElementById('nuevoEmail');
  const nuevoEmailError = document.getElementById('nuevoEmailError');
  const nuevoRol = document.getElementById('nuevoRol');
  const enviarBtn = document.getElementById('enviarInvitacionBtn');
  const labelClient = document.getElementById('labelClient');
  const labelAdmin = document.getElementById('labelAdmin');

  function pintarRol() {
    labelClient.classList.toggle('is-active', !nuevoRol.checked);
    labelAdmin.classList.toggle('is-active', nuevoRol.checked);
  }
  nuevoRol.addEventListener('change', pintarRol);
  labelClient.addEventListener('click', () => { nuevoRol.checked = false; pintarRol(); });
  labelAdmin.addEventListener('click', () => { nuevoRol.checked = true; pintarRol(); });

  document.getElementById('nuevaInvitacionBtn').addEventListener('click', () => {
    crearForm.reset();
    pintarRol();
    nuevoEmailError.textContent = '';
    nuevoEmail.closest('.input-group').classList.remove('has-error');
    abrirModal('crearModal');
    nuevoEmail.focus();
  });

  nuevoEmail.addEventListener('input', () => {
    nuevoEmailError.textContent = '';
    nuevoEmail.closest('.input-group').classList.remove('has-error');
  });

  crearForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = nuevoEmail.value.trim();

    if (!email || !EMAIL_RE.test(email)) {
      nuevoEmail.closest('.input-group').classList.add('has-error');
      nuevoEmailError.textContent = email
        ? 'Ese correo no tiene un formato válido'
        : 'El correo es necesario';
      shakeElement(crearForm);
      nuevoEmail.focus();
      return;
    }

    const role = nuevoRol.checked ? 'admin' : 'client';
    setButtonLoading(enviarBtn, true, 'Enviando...');
    try {
      await createInvitation({ email, role });
      cerrarModal('crearModal');
      aviso(`Invitación enviada a ${email} como ${role === 'admin' ? 'administrador' : 'cliente'}`, 'success', 4500);
      searchEl.value = '';
      busqueda = '';
      filtro = 'todas';
      resumen.querySelectorAll('[data-filtro]').forEach((c) => {
        c.setAttribute('aria-pressed', String(c.dataset.filtro === 'todas'));
      });
      await cargar(1);
    } catch (err) {
      if (err.message === 'Session expired') return;
      nuevoEmail.closest('.input-group').classList.add('has-error');
      nuevoEmailError.textContent = err.message;
      shakeElement(crearForm);
    } finally {
      if (document.body.contains(enviarBtn)) setButtonLoading(enviarBtn, false);
    }
  });

  pintarRol();
  cargar(1);
});
