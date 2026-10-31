import SessionStorageManager from '../AppStorage.js';
import { goLogout } from '../api.js';
import { setupAccountMenu } from '../accountMenu.js';
import './main.js';

/**
 * /tickets/: la barra del pass (logo, menú de cuenta) alrededor de la app de
 * Tickets (main.js). La sesión la revisa el servicio: sin sesión, la app
 * manda al login y regresa aquí.
 */

const INICIO = {
  admin: { url: '/inicioAdmin', logo: 'ReservAI Admin' },
  seller: { url: '/invitations', logo: 'ReservAI Ventas' },
  client: { url: '/inicio', logo: 'ReservAI' },
};

const session = SessionStorageManager.getSession();
const tipo = session && session.account_type;
const inicio = INICIO[tipo] || INICIO.client;

setupAccountMenu(session);
document.getElementById('logoPass').href = inicio.url;
document.getElementById('logoTexto').textContent = inicio.logo;
for (const n of document.querySelectorAll('.js-admin-only')) n.hidden = tipo !== 'admin';
document.getElementById('logout').addEventListener('click', (e) => {
  e.preventDefault();
  goLogout();
});
