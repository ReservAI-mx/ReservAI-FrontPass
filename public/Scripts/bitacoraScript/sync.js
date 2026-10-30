import { apiFetch } from '../api.js';
import {
  pendientesDe, confirmarSubidas, marcarRechazadas, aplicarDelServidor, leerMeta, guardarMeta,
} from './store.js';

const { paraSubir, desdeServidor } = globalThis.BitacoraCampos;

/* El servicio acepta hasta 200 por petición. */
const LOTE = 200;
const HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

export class SinSesion extends Error {}
export class SinRed extends Error {}

/* fetch tira TypeError cuando no hay red; apiFetch no lo distingue. */
async function pedir(ruta, opciones = {}) {
  let res;
  try {
    res = await apiFetch(ruta, { ...opciones, headers: HEADERS, redirectOn418: false });
  } catch (err) {
    throw new SinRed(err && err.message);
  }
  if (res.status === 418) throw new SinSesion('Sesión terminada');
  // El gateway responde 502/503/504 cuando no alcanza al servicio (o la
  // señal se cortó a medio camino): para el vendedor es lo mismo que sin red.
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new SinRed(`HTTP ${res.status}`);
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const e = new Error((data && data.error) || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

export function yo() {
  return pedir('/bitacora/yo');
}

/** Una fila por vendedor, también los que no han capturado nada. Sólo admin. */
export function equipo() {
  return pedir('/bitacora/resumen');
}

/** Deja en el teléfono la sesión larga (30 días). Sólo con la sesión del pass. */
export function pedirSesionDispositivo() {
  return pedir('/bitacora/sesion', { method: 'POST', body: '{}' });
}

async function subir(cuenta) {
  const pendientes = await pendientesDe(cuenta);
  let rechazadas = 0;
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE);
    const revs = new Map(lote.map((v) => [v.id, v._rev]));
    const data = await pedir('/bitacora/visitas', {
      method: 'POST',
      body: JSON.stringify({ visitas: lote.map(paraSubir) }),
    });
    await confirmarSubidas((data.guardadas || []).map((g) => ({ ...g, _rev: revs.get(g.id) })));
    if (data.rechazadas && data.rechazadas.length) {
      rechazadas += data.rechazadas.length;
      await marcarRechazadas(data.rechazadas);
    }
  }
  return { subidas: pendientes.length - rechazadas, rechazadas };
}

async function bajar(cuenta) {
  const clave = `cursor:${cuenta}`;
  let cursor = await leerMeta(clave);
  let bajadas = 0;
  for (let vuelta = 0; vuelta < 100; vuelta++) {
    const qs = cursor
      ? `?desde=${encodeURIComponent(cursor.desde)}&desde_id=${encodeURIComponent(cursor.desde_id)}`
      : '';
    const data = await pedir(`/bitacora/visitas${qs}`);
    const visitas = (data.visitas || []).map(desdeServidor);
    await aplicarDelServidor(cuenta, visitas);
    bajadas += visitas.length;
    if (data.cursor) {
      cursor = data.cursor;
      await guardarMeta(clave, cursor);
    }
    if (data.completo) break;
  }
  return { bajadas };
}

/**
 * Una vuelta completa: primero sube (lo del teléfono es lo que se puede
 * perder), luego baja lo que cambió.
 */
export async function sincronizar(cuenta) {
  const subida = await subir(cuenta);
  const bajada = await bajar(cuenta);
  await guardarMeta(`ultimaSync:${cuenta}`, new Date().toISOString());
  return { ...subida, ...bajada };
}
