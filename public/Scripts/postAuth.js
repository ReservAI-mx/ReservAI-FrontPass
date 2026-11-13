import SessionStorageManager from './AppStorage.js';
import { apiFetch, goLogin } from './api.js';
import { consumeReturnTo } from './oauthReturnTo.js';
import { legalesPendientes, rutaAceptarLegales } from './legal.js';

function routing() {
  return globalThis.PassAuthRouting;
}

export function saveAuthenticatedSession(data = {}) {
  const current = SessionStorageManager.getSession();
  const type = routing()?.resolveAccountType(data.account_type, current.account_type);
  if (!type) return null;

  SessionStorageManager.saveSession({
    account_type: type,
    account_name: data.account_name ?? current.account_name,
    token_type: data.token_type ?? current.token_type,
    verified: data.verified ?? current.verified,
    twofaenabled: data.twofaenabled ?? current.twofaenabled,
  });
  return type;
}

export async function redirectAfterAuthentication({ allowReturnTo = true } = {}) {
  const session = SessionStorageManager.getSession();
  const type = routing()?.normalizeAccountType(session.account_type);
  if (!type) {
    goLogin();
    return;
  }

  const returnTo = allowReturnTo ? consumeReturnTo() : null;
  let destination = returnTo || routing().destinationForAccountType(type);
  if (type !== 'client') {
    window.location.href = destination;
    return;
  }

  try {
    if (!returnTo) destination = await clientDestination(destination);
  } catch (error) {
    if (error && error.message === 'Session expired') return;
  }
  try {
    // Términos / Aviso de Privacidad nuevos: se aceptan antes de seguir.
    const pendientes = await legalesPendientes();
    if (pendientes.length) destination = rutaAceptarLegales(destination);
  } catch (error) {
    if (error && error.message === 'Session expired') return;
  }
  window.location.href = destination;
}

async function clientDestination(direct) {
  const onboard = globalThis.PassOnboard;
  const res = await apiFetch('/billing/setup?page=1', {
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  let setups = [];
  if (res.status === 200) {
    const body = await res.json().catch(() => ({}));
    setups = body.data || body.provisions || [];
  }
  if (onboard && onboard.shouldRedirectToBilling({
    role: 'client',
    dismissed: onboard.isDismissed(),
    status: res.status,
    setups,
  })) {
    return '/billing';
  }
  return direct;
}
