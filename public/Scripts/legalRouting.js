'use strict';

/**
 * Funciones puras de la pantalla "Actualizamos nuestros términos"
 * (/terminos-actualizados). Clásico + module.exports para poder probarlas con
 * jest, como authRouting.js. El texto legal vive en la landing; el backend
 * dice qué versión le falta aceptar a la cuenta (GET /api/legal/pendientes).
 */
(function () {
  const RUTA = '/terminos-actualizados';
  const DESTINO_DEFECTO = '/inicio';

  /**
   * Sólo rutas de este mismo sitio: "/algo". Nada de "//otro.com",
   * "/\otro.com" ni URLs completas, para que ?siguiente= no sirva para mandar
   * a nadie a otro dominio.
   */
  function siguienteSeguro(valor) {
    if (typeof valor !== 'string') return DESTINO_DEFECTO;
    const v = valor.trim();
    if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return DESTINO_DEFECTO;
    if (/[\u0000-\u001f]/.test(v)) return DESTINO_DEFECTO;
    if (v === RUTA || v.startsWith(RUTA + '?') || v.startsWith(RUTA + '/')) return DESTINO_DEFECTO;
    return v;
  }

  function rutaAceptar(siguiente) {
    return `${RUTA}?siguiente=${encodeURIComponent(siguienteSeguro(siguiente))}`;
  }

  /** Lo que manda el backend, filtrado a lo que la pantalla sabe pintar. */
  function pendientesValidos(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.filter((p) =>
      p && typeof p.documento === 'string' && typeof p.version === 'string' &&
      typeof p.url === 'string' && /^https:\/\//.test(p.url));
  }

  function fechaLarga(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const d = new Date(`${iso}T12:00:00Z`);
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  }

  const legal = { RUTA, siguienteSeguro, rutaAceptar, pendientesValidos, fechaLarga };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = legal;
  } else {
    globalThis.PassLegal = legal;
  }
})();
