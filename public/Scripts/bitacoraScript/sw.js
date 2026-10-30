/* ------------------------------------------------------------------
   Service worker de la Bitácora (passmanager.reservai.com.mx/bitacora/).

   Se sirve en /bitacora/sw.js, así que su alcance es /bitacora/: no toca
   ninguna otra pantalla del pass.

   Hace que la bitácora abra sin señal, que es lo normal en la calle.
   Lo aprendido en la Bitácora anterior (v1–v18) sigue aquí:
   - cada archivo se guarda por separado, con límite de tiempo y
     reintentos: un solo archivo colgado no debe tumbar la instalación;
   - la página se pide a la red con límite y, si no llega, sale la copia;
   - nada de /api pasa por aquí: guardar respuestas de la API serviría
     datos viejos y mezclaría cuentas.

   ⚠️ Si cambias cualquier archivo de ARCHIVOS, sube VERSION. Si no, los
   teléfonos que ya la abrieron siguen con la copia vieja.
   ------------------------------------------------------------------ */

const VERSION = 'bitacora-pass-v5';

const PAGINA = '/bitacora/';

/* Sin estos la bitácora no arranca: si fallan, la instalación falla. */
const CRITICOS = [
  PAGINA,
  '/static/estilos/StylesInicio.css',
  '/static/estilos/StylesUI.css',
  '/static/estilos/StylesBitacora.css',
  '/static/Scripts/api.js',
  '/static/Scripts/AppStorage.js',
  '/static/Scripts/toast.js',
  '/static/Scripts/accountMenu.js',
  '/static/Scripts/bitacoraScript/campos.js',
  '/static/Scripts/bitacoraScript/calculos.js',
  '/static/Scripts/bitacoraScript/excel.js',
  '/static/Scripts/bitacoraScript/store.js',
  '/static/Scripts/bitacoraScript/sync.js',
  '/static/Scripts/bitacoraScript/app.js',
];

/* Ayudan pero no son indispensables. */
const OPCIONALES = [
  '/bitacora/manifest.webmanifest',
  '/static/Images/ReservAiLogo.png',
  '/static/Images/bitacora/app-192.png',
  '/static/Images/bitacora/app-512.png',
  '/static/Images/bitacora/app-maskable-512.png',
  '/static/Images/bitacora/app-ios-180.png',
];

const LIMITE_INSTALACION = 15000;
const INTENTOS = 3;

function conLimite(peticion, ms) {
  return new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error('tardó demasiado')), ms);
    fetch(peticion).then(
      (r) => { clearTimeout(reloj); resolver(r); },
      (e) => { clearTimeout(reloj); rechazar(e); }
    );
  });
}

/* `cache: 'reload'` salta el caché HTTP: al instalar queremos lo del
   servidor, no una copia vieja del navegador. */
async function bajar(ruta) {
  let ultimoFallo;
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      const res = await conLimite(new Request(ruta, { cache: 'reload', credentials: 'same-origin' }), LIMITE_INSTALACION);
      if (res && res.ok) return res;
      ultimoFallo = new Error('HTTP ' + (res && res.status) + ' en ' + ruta);
    } catch (e) {
      ultimoFallo = e;
    }
    if (intento < INTENTOS) await new Promise((r) => setTimeout(r, 1000 * intento));
  }
  throw ultimoFallo || new Error('No se pudo bajar ' + ruta);
}

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    for (const ruta of CRITICOS) {
      await cache.put(ruta, await bajar(ruta));
    }
    await Promise.all(OPCIONALES.map(async (ruta) => {
      try {
        await cache.put(ruta, await bajar(ruta));
      } catch { /* que falte un icono no rompe nada */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(
      claves.filter((k) => k.startsWith('bitacora-pass-') && k !== VERSION).map((k) => caches.delete(k))
    );
    await self.clients.claim();
    // La pestaña abierta sigue con el código viejo hasta recargar: se le
    // avisa para que ofrezca "Actualizar".
    const abiertas = await self.clients.matchAll({ type: 'window' });
    abiertas.forEach((c) => c.postMessage({ nueva: VERSION }));
  })());
});

/* La app pregunta si ya puede funcionar sin conexión (Ajustes). */
self.addEventListener('message', (evento) => {
  if (evento.data === 'estado' && evento.source) {
    caches.open(VERSION)
      .then((c) => c.match(PAGINA))
      .then((r) => evento.source.postMessage({ listo: !!r, version: VERSION }));
  }
});

self.addEventListener('fetch', (evento) => {
  const pet = evento.request;
  if (pet.method !== 'GET') return;

  const url = new URL(pet.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  /* La página (/bitacora/ y /bitacora/tablero son el mismo HTML). */
  if (pet.mode === 'navigate') {
    evento.respondWith((async () => {
      const guardada = await caches.match(PAGINA);
      if (self.navigator && self.navigator.onLine === false && guardada) return guardada;
      try {
        const res = await conLimite(pet, 3500);
        if (res && res.ok && url.pathname === PAGINA) {
          (await caches.open(VERSION)).put(PAGINA, res.clone());
        }
        return res;
      } catch {
        return guardada || Response.error();
      }
    })());
    return;
  }

  /* Archivos de la app: primero la copia guardada (rápido y sin señal);
     lo que no esté guardado va a la red. */
  evento.respondWith((async () => {
    const guardada = await caches.match(pet, { ignoreSearch: true });
    if (guardada) return guardada;
    return fetch(pet);
  })());
});
