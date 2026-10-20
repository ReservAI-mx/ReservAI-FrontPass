/**
 * Utilidades compartidas de las pantallas de admin (ver StylesUI.css).
 */

function escribiendo(target) {
  const tag = (target && target.tagName) || '';
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (target && target.isContentEditable);
}

/** "/" enfoca el buscador; Esc dentro del buscador le quita el foco. */
export function bindSearchShortcut(input) {
  if (!input) return;
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (escribiendo(e.target)) {
      if (e.key === 'Escape' && e.target === input) input.blur();
      return;
    }
    if (document.querySelector('.modal.show, .profile.is-open')) return;
    if (e.key === '/') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

/** Lee parámetros de la URL; devuelve solo los que existen. */
export function readQuery(keys) {
  const p = new URLSearchParams(window.location.search);
  const out = {};
  keys.forEach((k) => {
    const v = p.get(k);
    if (v != null && v !== '') out[k] = v;
  });
  return out;
}

/**
 * Reemplaza la query de la URL sin recargar, omitiendo valores por defecto
 * para que el enlace limpio siga siendo el de siempre.
 */
export function writeQuery(values, defaults = {}) {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v == null || v === '' || String(v) === String(defaults[k] ?? '')) return;
    p.set(k, String(v));
  });
  const qs = p.toString();
  history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

/** Marca un control segmentado: aria-pressed en el botón cuyo data-[attr] coincide. */
export function syncPressed(buttons, attr, value) {
  buttons.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset[attr] || '') === value)));
}
