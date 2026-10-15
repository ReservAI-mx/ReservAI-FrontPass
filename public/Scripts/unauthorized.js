function kbLogin(raw) {
  try {
    const u = new URL(raw);
    if (u.pathname !== '/login') return null;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return `${u.origin}/login`;
    if (u.protocol === 'https:' && host.startsWith('knowledge.') && host.endsWith('.reservai.com.mx')) {
      return `${u.origin}/login`;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

const next = kbLogin(new URLSearchParams(window.location.search).get('next') || '');
const dest = next || '/login';
const link = document.getElementById('backLink');
if (link) link.href = dest;

const ESPERA_S = 3;
const cuentaEl = document.getElementById('cuentaTexto');
let restante = ESPERA_S;
const tick = setInterval(() => {
  restante -= 1;
  if (cuentaEl && restante > 0) cuentaEl.textContent = `Te llevamos al login en ${restante} s…`;
  if (restante <= 0) clearInterval(tick);
}, 1000);

setTimeout(() => {
  window.location.replace(dest);
}, ESPERA_S * 1000);
