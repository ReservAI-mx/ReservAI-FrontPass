import { apiJson } from '../../api.js';

// El backend exige Content-Type incluso en los POST sin body.
const JSON_HEADERS = { 'Content-Type': 'application/json' };


function mensajeError(status, data, porCodigo = {}) {
  if (porCodigo[status]) return porCodigo[status];
  const delServidor = data?.error || data?.message;
  switch (status) {
    case 400: return delServidor || 'La petición no es válida.';
    case 401: return 'Tu sesión no sirve para esta acción. Vuelve a iniciar sesión.';
    case 403: return 'Necesitas una cuenta de administrador verificada y con 2FA activo.';
    case 404: return 'Esa invitación ya no existe.';
    case 409: return delServidor || 'Esa invitación ya no está disponible.';
    case 500: return delServidor || 'El servidor falló. Inténtalo de nuevo.';
    default: return delServidor || `Error ${status}.`;
  }
}

/** GET /invitations — página de 6 por defecto, `search` filtra por correo. */
export async function fetchInvitations({ page = 1, search = '' } = {}) {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);

  const { ok, status, data } = await apiJson(`/invitations?${params.toString()}`);
  if (!ok) throw new Error(mensajeError(status, data));

  return {
    invitaciones: Array.isArray(data.data) ? data.data : [],
    total: Number(data.total ?? 0),
    paginaActual: Number(data.current_page ?? page),
    siguientePagina: data.next_page ?? null,
  };
}

/**
 * GET /invitations/id/:id — solo responde 200 para invitaciones pending y
 * vigentes; las aceptadas, revocadas o vencidas devuelven 409.
 */
export async function fetchInvitationById(id) {
  const { ok, status, data } = await apiJson(`/invitations/id/${encodeURIComponent(id)}`);
  if (!ok) {
    throw new Error(mensajeError(status, data, {
      409: 'Esa invitación ya fue aceptada, revocada o se venció.',
    }));
  }
  return data.data ?? data;
}

/** POST /invitations — crea y envía el correo. */
export async function createInvitation({ email, role }) {
  const { ok, status, data } = await apiJson('/invitations', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: { email, role },
  });
  if (!ok) {
    throw new Error(mensajeError(status, data, {
      409: data?.error?.includes('Account')
        ? 'Ya existe una cuenta con ese correo.'
        : 'Ya hay una invitación pendiente para ese correo.',
      500: 'No se pudo enviar el correo de invitación.',
    }));
  }
  return data.data ?? data;
}

/**
 * POST /invitations/id/:id/resend — sirve con pending (aunque esté vencida)
 * o con expired. Renueva la fecha y anula el enlace anterior.
 */
export async function resendInvitation(id) {
  const { ok, status, data } = await apiJson(`/invitations/id/${encodeURIComponent(id)}/resend`, {
    method: 'POST',
    headers: JSON_HEADERS,
  });
  if (!ok) {
    throw new Error(mensajeError(status, data, {
      409: 'Solo se pueden reenviar invitaciones pendientes o vencidas.',
      500: 'No se pudo enviar el correo.',
    }));
  }
  return data.data ?? data;
}

/** DELETE /invitations/id/:id — marca revoked, no borra la fila. */
export async function revokeInvitation(id) {
  const { ok, status, data } = await apiJson(`/invitations/id/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: JSON_HEADERS,
  });
  if (!ok) {
    throw new Error(mensajeError(status, data, {
      409: 'Solo se pueden revocar invitaciones pendientes y vigentes.',
    }));
  }
  return data.data ?? data;
}
