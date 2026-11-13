import { apiJson } from './api.js';
// Como módulo no hay `module`, así que define globalThis.PassLegal.
import './legalRouting.js';

function L() {
  return globalThis.PassLegal;
}

/**
 * Documentos que la cuenta tiene que aceptar. Ante cualquier error devuelve
 * [] para no dejar a nadie fuera por una falla de red: el backend tampoco
 * bloquea si no pudo leer la versión vigente.
 */
export async function legalesPendientes() {
  if (!L()) return [];
  try {
    const { ok, data } = await apiJson('/legal/pendientes', {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    return ok ? L().pendientesValidos(data.pendientes) : [];
  } catch (error) {
    if (error && error.message === 'Session expired') throw error;
    return [];
  }
}

export function rutaAceptarLegales(siguiente) {
  return L() ? L().rutaAceptar(siguiente) : siguiente;
}

/**
 * Para las pantallas del cliente: si hay algo pendiente, manda a aceptarlo y
 * devuelve true (la pantalla no debe seguir cargando).
 */
export async function exigirLegales(siguiente = window.location.pathname + window.location.search) {
  const pendientes = await legalesPendientes();
  if (!pendientes.length) return false;
  window.location.replace(rutaAceptarLegales(siguiente));
  return true;
}
