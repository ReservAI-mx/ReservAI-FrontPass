/**
 * Copia local de la bitácora en IndexedDB.
 *
 * La captura escribe aquí primero y nunca espera a la red: en la calle la
 * señal va y viene. sync.js sube lo pendiente y baja lo nuevo.
 *
 * Cada visita lleva:
 *   _cuenta     id de la cuenta del pass dueña de esta copia (un mismo
 *               teléfono puede usarlo otra persona después)
 *   _pendiente  true mientras no se confirme en el servidor
 *   _rev        sube con cada cambio local; así una respuesta del servidor
 *               no borra el "pendiente" de un cambio hecho mientras subía
 */

const DB_NOMBRE = 'bitacora-pass';
const DB_VERSION = 1;

let dbPromesa = null;

function abrir() {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise((resolver, rechazar) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('visitas')) {
        const visitas = db.createObjectStore('visitas', { keyPath: 'id' });
        visitas.createIndex('cuenta', '_cuenta');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'clave' });
      }
    };
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rechazar(req.error);
  });
  return dbPromesa;
}

function promesa(req) {
  return new Promise((resolver, rechazar) => {
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rechazar(req.error);
  });
}

function fin(tx) {
  return new Promise((resolver, rechazar) => {
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  });
}

export async function visitasDe(cuenta) {
  const db = await abrir();
  const tx = db.transaction('visitas', 'readonly');
  return promesa(tx.objectStore('visitas').index('cuenta').getAll(cuenta));
}

export async function pendientesDe(cuenta) {
  return (await visitasDe(cuenta)).filter((v) => v._pendiente);
}

/** Guarda un cambio hecho en el teléfono. Queda pendiente de subir. */
export async function guardarLocal(cuenta, visita) {
  const db = await abrir();
  const tx = db.transaction('visitas', 'readwrite');
  const store = tx.objectStore('visitas');
  const actual = await promesa(store.get(visita.id));
  const registro = {
    ...visita,
    _cuenta: cuenta,
    _pendiente: true,
    _rev: ((actual && actual._rev) || 0) + 1,
  };
  store.put(registro);
  await fin(tx);
  return registro;
}

/**
 * Tras subir: quita el pendiente sólo si nadie la cambió mientras tanto
 * (mismo _rev que se mandó).
 * @param {Array<{id, actualizado_en, _rev}>} confirmadas
 */
export async function confirmarSubidas(confirmadas) {
  const db = await abrir();
  const tx = db.transaction('visitas', 'readwrite');
  const store = tx.objectStore('visitas');
  for (const c of confirmadas) {
    const actual = await promesa(store.get(c.id));
    if (!actual) continue;
    actual.actualizado_en = c.actualizado_en;
    if (actual._rev === c._rev) actual._pendiente = false;
    store.put(actual);
  }
  await fin(tx);
}

/** Visitas que el servidor rechazó: se quedan marcadas para revisarlas. */
export async function marcarRechazadas(rechazadas) {
  const db = await abrir();
  const tx = db.transaction('visitas', 'readwrite');
  const store = tx.objectStore('visitas');
  for (const r of rechazadas) {
    if (!r.id) continue;
    const actual = await promesa(store.get(r.id));
    if (!actual) continue;
    actual._pendiente = false;
    actual._rechazo = r.motivo === 'ajena'
      ? 'Esta visita es de otro vendedor.'
      : (r.errores || []).join(' · ') || 'El servidor la rechazó.';
    store.put(actual);
  }
  await fin(tx);
}

/**
 * Lo que bajó del servidor. Si en el teléfono hay un cambio sin subir, gana
 * el del teléfono: se sube en la siguiente vuelta.
 */
export async function aplicarDelServidor(cuenta, visitas) {
  const db = await abrir();
  const tx = db.transaction('visitas', 'readwrite');
  const store = tx.objectStore('visitas');
  for (const v of visitas) {
    const actual = await promesa(store.get(v.id));
    if (actual && actual._pendiente) continue;
    store.put({ ...v, _cuenta: cuenta, _pendiente: false, _rev: (actual && actual._rev) || 0 });
  }
  await fin(tx);
}

export async function leerMeta(clave, porDefecto = null) {
  const db = await abrir();
  const tx = db.transaction('meta', 'readonly');
  const r = await promesa(tx.objectStore('meta').get(clave));
  return r ? r.valor : porDefecto;
}

export async function guardarMeta(clave, valor) {
  const db = await abrir();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ clave, valor });
  await fin(tx);
}

/** Saber si el navegador dejó guardar algo (modo privado de Safari, etc.). */
export async function disponible() {
  try {
    await abrir();
    return true;
  } catch {
    return false;
  }
}
