import { escapeHtml } from './uiHelpersAdmin.js';

/** Hasta dos iniciales, para el cuadro de color de cada tarjeta. */
function iniciales(texto) {
    return String(texto || '')
        .trim()
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((parte) => parte.charAt(0).toUpperCase())
        .join('') || '?';
}
import { openAccountPasswordsModal } from '../controllers/accountPasswordsModalController.js';

export function renderAdminAccountList(accounts, listEl) {
    if (!listEl) return;
    if (!accounts.length) {
        listEl.innerHTML = "<div class='account-item account-item--vacio'>No se encontraron cuentas.</div>";
        return;
    }
    const getSafe = (value, fallback) => escapeHtml(value || fallback);
    listEl.innerHTML = accounts.map(acc => {
        const nombre = acc.name || acc.nombre || 'Sin nombre';
        const correo = acc.email || 'Sin correo';
        return `
        <div class="account-item" data-id="${escapeHtml(String(acc.id ?? ''))}" tabindex="0">
            <span class="account-item__avatar" aria-hidden="true">${escapeHtml(iniciales(nombre !== 'Sin nombre' ? nombre : correo))}</span>
            <span class="account-item__body">
                <span class="account-item__name">${getSafe(acc.name || acc.nombre, 'Sin nombre')}</span>
                <span class="account-item__email">${getSafe(acc.email, 'Sin correo')}</span>
            </span>
        </div>`;
    }).join('');
    listEl.querySelectorAll('.account-item:not(.account-item--vacio)').forEach(item => {
        const acc = accounts.find(a => a.id === item.dataset.id);
        item.addEventListener('click', () => {
            openAccountPasswordsModal(acc); 
        });
    });
}


export function renderAdminPasswordList(passwords, listEl) {
    if (!listEl) return;


    if (!passwords || passwords.length === 0) {
        listEl.innerHTML = `<li class="ui-empty">
            <span class="ui-empty__icono ui-empty__icono--neutral" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4.25" y="10.25" width="15.5" height="9.5" rx="2.25"/>
                    <path d="M8 10.25V7.5a4 4 0 0 1 8 0v2.75"/>
                </svg>
            </span>
            <span class="ui-empty__titulo">Sin contraseñas</span>
            <span class="ui-empty__sub">Usa el botón + para guardar la primera de esta cuenta.</span>
        </li>`;
        return;
    }

    listEl.innerHTML = passwords.map((p) => {
        const nombre = p.name || p.nombre || p.title || 'Sin nombre';
        const descripcion = p.description ? escapeHtml(p.description) : 'Sin descripción';
        return `<li class="password-item" data-id="${escapeHtml(String(p.id ?? ''))}" tabindex="0">
            <span class="password-item__avatar" aria-hidden="true">${escapeHtml(iniciales(nombre))}</span>
            <span class="password-item__body">
                <span class="password-item__name">${escapeHtml(nombre)}</span>
                <span class="password-item__meta">${descripcion}</span>
            </span>
        </li>`;
    }).join('');
}