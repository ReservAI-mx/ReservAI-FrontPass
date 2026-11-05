import SessionStorageManager from '../AppStorage.js';
import { goLogout } from '../api.js';
import { setupAccountMenu } from '../accountMenu.js';
import { mostrarHerramientasPermitidas } from '../herramientas.js';

const INICIO = {
  admin: { url: '/inicioAdmin', logo: 'ReservAI Admin' },
  seller: { url: '/invitations', logo: 'ReservAI Ventas' },
  client: { url: '/inicio', logo: 'ReservAI' },
};

const session = SessionStorageManager.getSession();
const tipo = String(session?.account_type || '').trim().toLowerCase();
const inicio = INICIO[tipo] || INICIO.client;

const logo = document.getElementById('logoPass');
const logoTexto = document.getElementById('logoTexto');
if (logo) logo.href = inicio.url;
if (logoTexto) logoTexto.textContent = inicio.logo;

for (const n of document.querySelectorAll('.js-admin-only')) {
  n.hidden = tipo !== 'admin';
}

setupAccountMenu(session);
mostrarHerramientasPermitidas();

document.getElementById('logout')?.addEventListener('click', (e) => {
  e.preventDefault();
  goLogout();
});
