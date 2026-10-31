import { apiJson } from './api.js';

/**
 * Muestra los enlaces a herramientas internas ([data-herramienta="<clave>"])
 * a quien el admin les dio al menos "ver" (en Documentación, su panel Equipo). Sólo decide qué
 * se pinta: cada servicio vuelve a revisar el permiso en cada petición.
 * Si la consulta falla, los enlaces se quedan ocultos.
 */
export async function mostrarHerramientasPermitidas() {
  const enlaces = document.querySelectorAll('[data-herramienta]');
  if (!enlaces.length) return;
  const r = await apiJson('/permisos/mios', { redirectOn418: false }).catch(() => null);
  if (!r || !r.ok) return;
  const permisos = r.data.permisos || {};
  for (const el of enlaces) {
    const nivel = permisos[el.dataset.herramienta];
    el.hidden = !nivel || nivel === 'ninguno';
  }
}
