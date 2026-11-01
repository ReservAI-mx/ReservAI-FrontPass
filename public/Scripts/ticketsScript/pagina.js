import SessionStorageManager from '../AppStorage.js';
import { goLogout } from '../api.js';
import { setupAccountMenu } from '../accountMenu.js';
import './main.js';

/**
 * /tickets/: la barra del pass (logo, menú de cuenta) alrededor de la app de
 * Tickets (main.js). La sesión la revisa el servicio: sin sesión, la app
 * manda al login y regresa aquí.
 *
 * En la app instalada del teléfono se entra con la sesión de 30 días y no
 * hay sessionStorage del login: el nombre y el tipo de cuenta salen de
 * /api/tickets/yo (evento tk:yo de main.js).
 */

const INICIO = {
  admin: { url: '/inicioAdmin', logo: 'ReservAI Admin' },
  seller: { url: '/invitations', logo: 'ReservAI Ventas' },
  client: { url: '/inicio', logo: 'ReservAI' },
};

function aplicar(tipo, nombre) {
  const inicio = INICIO[tipo] || INICIO.client;
  document.getElementById('logoPass').href = inicio.url;
  document.getElementById('logoTexto').textContent = inicio.logo;
  for (const n of document.querySelectorAll('.js-admin-only')) n.hidden = tipo !== 'admin';
  if (nombre) document.getElementById('accountName').textContent = nombre;
}

const session = SessionStorageManager.getSession();
setupAccountMenu(session);
aplicar(session && session.account_type, session && session.account_name);
window.addEventListener('tk:yo', (e) => aplicar(e.detail.tipo, e.detail.nombre));

document.getElementById('logout').addEventListener('click', (e) => {
  e.preventDefault();
  goLogout();
});
