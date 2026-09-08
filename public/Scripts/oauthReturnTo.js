const STORAGE_KEY = 'oauth_return_to';

function isAllowedReturnTo(raw) {
  if (!raw || typeof raw !== 'string') return false;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.pathname === '/api/oauth/authorize' || url.pathname === '/oauth/authorize';
  } catch {
    return false;
  }
}

export function captureReturnTo() {
  const raw = new URLSearchParams(window.location.search).get('return_to');
  if (isAllowedReturnTo(raw)) {
    sessionStorage.setItem(STORAGE_KEY, raw);
  }
}

export function hasStoredReturnTo() {
  return isAllowedReturnTo(sessionStorage.getItem(STORAGE_KEY));
}

export function consumeReturnTo() {
  const fromQuery = new URLSearchParams(window.location.search).get('return_to');
  const raw = isAllowedReturnTo(fromQuery) ? fromQuery : sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  return isAllowedReturnTo(raw) ? raw : null;
}
