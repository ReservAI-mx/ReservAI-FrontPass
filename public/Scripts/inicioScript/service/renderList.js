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
        const buscando = Boolean(document.getElementById('search')?.value.trim());
        listEl.innerHTML = `<li class="ui-empty">
            <span class="ui-empty__icono ui-empty__icono--neutral" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                     stroke-linecap="round" stroke-linejoin="round">
                    <rect x="4.25" y="10.25" width="15.5" height="9.5" rx="2.25"/>
                    <path d="M8 10.25V7.5a4 4 0 0 1 8 0v2.75"/>
                </svg>
            </span>
            <span class="ui-empty__titulo">${buscando ? 'Sin coincidencias' : 'Tu bóveda está vacía'}</span>
            <span class="ui-empty__sub">${buscando
                ? 'Ninguna contraseña coincide con la búsqueda.'
                : 'Usa el botón + para guardar tu primera contraseña.'}</span>
        </li>`;
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