/**
 * Toast flotante compartido (arriba al centro).
 * Crea #messageContainer si la página no lo tiene.
 */

function ensureContainer() {
  let el = document.getElementById('messageContainer');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'messageContainer';
  el.className = 'message-container';
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  return el;
}

function inferType(message) {
  const m = String(message || '').toLowerCase();
  if (
    /\berror\b|falló|fallo|no se pudo|obligatorio|no coinciden|inválid|invalid|rechaz|faltan|necesario/.test(m)
  ) {
    return 'error';
  }
  if (/por favor|selecciona|atención|aviso/.test(m)) return 'warning';
  if (
    /correctamente|guardad|actualizad|eliminad|generad|activad|desactivad|enviad|éxito|exito/.test(m)
  ) {
    return 'success';
  }
  return 'info';
}

/**
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} [type]
 * @param {number} [duration]
 */
export function showToast(message, type, duration = 3800) {
  if (!message) return;
  const resolved = type || inferType(message);
  const container = ensureContainer();
  const el = document.createElement('div');
  el.className = `message message-${resolved}`;
  el.setAttribute('role', resolved === 'error' ? 'alert' : 'status');
  el.textContent = message;
  el.style.animation = 'slideIn 0.3s ease-in-out';
  container.appendChild(el);

  const ms = resolved === 'error' ? Math.max(duration, 4500) : duration;
  setTimeout(() => {
    el.style.animation = 'slideOut 0.3s ease-in-out';
    setTimeout(() => el.remove(), 300);
  }, ms);
}
