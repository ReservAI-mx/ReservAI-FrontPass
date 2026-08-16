import SessionStorageManager from './AppStorage.js';

const isLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

export const API_BASE = isLocal
  ? '/api'
  : 'https://passmanager.reservai.com.mx/api';

export function goLogin() {
  SessionStorageManager.clearSession();
  window.location.href = '/login';
}

export function requireUiSession() {
  const session = SessionStorageManager.getSession();
  if (!session || !session.account_type) {
    goLogin();
    return null;
  }
  return session;
}

export function requireAdminSession() {
  const session = requireUiSession();
  if (!session) return null;
  if (session.account_type !== 'admin') {
    window.location.href = '/inicio';
    return null;
  }
  return session;
}

export async function apiFetch(path, options = {}) {
  const { redirectOn418 = true, ...fetchOptions } = options;
  const headers = { ...(fetchOptions.headers || {}) };
  const isForm = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  if (fetchOptions.body && !isForm && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    credentials: 'include',
    headers,
  });

  if (res.status === 418 && redirectOn418) {
    goLogin();
    throw new Error('Session expired');
  }

  return res;
}

export async function apiJson(path, options = {}) {
  const body = options.body;
  const payload =
    body && typeof body === 'object' && !(body instanceof FormData)
      ? { ...options, body: JSON.stringify(body) }
      : options;
  const res = await apiFetch(path, payload);
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data };
}
