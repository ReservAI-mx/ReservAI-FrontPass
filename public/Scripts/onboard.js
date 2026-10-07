'use strict';

const ONBOARD_KEY = 'pm_onboard_dismissed';

const ONBOARD_COPY = {
  1: { kicker: 'Paso 1 de 3', body: 'Pulsa Configurar ahora para poder cobrar el anticipo.' },
  2: { kicker: 'Paso 2 de 3', body: 'Pulsa Nueva sucursal y elige el slug. Será tu-negocio.reservai.com.mx.' },
  3: { kicker: 'Paso 3 de 3', body: 'Escribe el slug de la sucursal.' },
};

function shouldRedirectToBilling({ role, dismissed, status, setups }) {
  if (String(role || '').toLowerCase() === 'admin' || dismissed) return false;
  if (status === 404) return true;
  if (status !== 200) return false;
  return !(setups && setups.length);
}

function isDismissed() {
  try {
    return sessionStorage.getItem(ONBOARD_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    sessionStorage.setItem(ONBOARD_KEY, '1');
  } catch {
    /* pestaña sin sessionStorage */
  }
}

function recall() {
  try {
    sessionStorage.removeItem(ONBOARD_KEY);
  } catch {
    /* pestaña sin sessionStorage */
  }
}

const api = { ONBOARD_KEY, ONBOARD_COPY, shouldRedirectToBilling, isDismissed, dismiss, recall };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.PassOnboard = api;
}
