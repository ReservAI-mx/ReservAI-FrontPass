import { apiFetch } from '../api.js';
import { bindSearchShortcut } from '../uiShell.js';

const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

/**
 * Indicadores de los accesos rápidos. Solo los que el API puede contar
 * con una llamada; si una falla, el acceso se queda sin indicador.
 */
const INDICADORES = [
  {
    key: 'jobs',
    url: '/billing/jobs?page=1&status=failed%2Cdead',
    texto: (n) => (n === 1 ? '1 fallido' : `${n} fallidos`),
  },
  {
    key: 'traces',
    url: '/traces?limit=1&page=1&resolution=open',
    texto: (n) => (n === 1 ? '1 sin resolver' : `${n} sin resolver`),
  },
];

async function cargarIndicador({ key, url, texto }) {
  const badge = document.querySelector(`[data-badge="${key}"]`);
  if (!badge) return;
  try {
    const res = await apiFetch(url, { headers: HEADERS, redirectOn418: false });
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    const n = Number(data.total) || 0;
    badge.textContent = n > 0 ? texto(n) : 'Todo en orden';
    badge.classList.toggle('is-alert', n > 0);
    badge.hidden = false;
  } catch {
    // Sin indicador: el acceso sigue funcionando.
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindSearchShortcut(document.getElementById('account-search'));
  INDICADORES.forEach(cargarIndicador);
});
