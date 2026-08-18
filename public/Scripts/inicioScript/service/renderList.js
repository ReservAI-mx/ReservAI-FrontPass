import { escapeHtml } from './uiHelpers.js';

/** Hasta dos iniciales del nombre, para el cuadro de color de cada tarjeta. */
function iniciales(nombre) {
    return String(nombre)
        .trim()
        .split(/[^A-Za-z0-9]+/)
        .slice(0, 2)
        .map((palabra) => palabra.charAt(0).toUpperCase())
        .join('') || '?';
}


export function renderList(passwords, listEl) {
    if (!listEl) return;


    if (!passwords || passwords.length === 0) {
        listEl.innerHTML = '<li class="empty">No se encontraron contraseñas.</li>';
        return;
    }

    listEl.innerHTML = passwords.map((p) => {
        const nombre = p.name || p.nombre || p.title || 'Sin nombre';
        const name = escapeHtml(nombre);
        const id = escapeHtml(String(p.id ?? ''));
        const descripcion = p.description ? escapeHtml(p.description) : 'Sin descripción';
        return `<li class="password-item" data-id="${id}" tabindex="0">
            <span class="password-item__avatar" aria-hidden="true">${escapeHtml(iniciales(nombre))}</span>
            <span class="password-item__body">
                <span class="password-item__name">${name}</span>
                <span class="password-item__meta">${descripcion}</span>
            </span>
        </li>`;
    }).join('');
}