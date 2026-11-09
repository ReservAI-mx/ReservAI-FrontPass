import SessionStorageManager from './AppStorage.js';
import { apiFetch, goLogin } from './api.js';
import { consumeReturnTo } from './oauthReturnTo.js';

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

  if (allowReturnTo) {
    const returnTo = consumeReturnTo();
    if (returnTo) {
      window.location.href = returnTo;
      return;
    }
  }

  const direct = routing().destinationForAccountType(type);
  if (type !== 'client') {
    window.location.href = direct;
    return;
  }

  let destination = direct;
  try {
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
      role: type,
      dismissed: onboard.isDismissed(),
      status: res.status,
      setups,
    })) {
      destination = '/billing';
    }
  } catch (error) {
    if (error && error.message === 'Session expired') return;
  }
  window.location.href = destination;
}
