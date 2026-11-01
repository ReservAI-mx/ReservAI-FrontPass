/* ------------------------------------------------------------------
   Service worker de Tickets (passmanager.reservai.com.mx/tickets/).

   Se sirve en /tickets/sw.js, así que su alcance es /tickets/: no toca
   ninguna otra pantalla del pass.

   Tickets necesita la red (los datos vienen del servicio), así que aquí
   la red va primero para todo; la copia guardada sólo se usa si no hay
   señal o la red tarda, para que la app abra y diga "sin conexión" en vez
   de una pantalla en blanco. Como la red va primero, un cambio en el
   front llega solo, sin esperar a que se suba VERSION.

   - Cada archivo se guarda por separado, con límite de tiempo y
     reintentos: uno colgado no tumba la instalación.
   - Nada de /api pasa por aquí: guardar respuestas de la API serviría
     datos viejos y mezclaría cuentas.

   ⚠️ Si agregas un módulo a ticketsScript, agrégalo a ARCHIVOS (la prueba
   tests/tickets.test.js lo revisa) y sube VERSION.
   ------------------------------------------------------------------ */

const VERSION = 'tickets-pass-v2';

const PAGINA = '/tickets/';
const S = '/static/Scripts/ticketsScript/';

/* Sin estos la app no arranca: si fallan, la instalación falla. */
const CRITICOS = [
  PAGINA,
  '/static/estilos/StylesInicio.css',
  '/static/estilos/StylesUI.css',
  '/static/estilos/StylesTickets.css',
  '/static/Scripts/api.js',
  '/static/Scripts/AppStorage.js',
  '/static/Scripts/accountMenu.js',
  S + 'pagina.js',
  S + 'main.js',
  S + 'ui.js',
  S + 'datos.js',
  S + 'rutas.js',
  S + 'iconos.js',
  S + 'pwa.js',
  S + 'avisos.js',
  S + 'cronometro.js',
  S + 'ia.js',
  S + 'vistas/login.js',
  S + 'vistas/ticket.js',
  S + 'vistas/mis.js',
  S + 'vistas/area.js',
  S + 'vistas/areas.js',
  S + 'vistas/avisos.js',
  S + 'vistas/solicitudes.js',
  S + 'vistas/tiempo.js',
  S + 'vistas/dashboard.js',
  S + 'vistas/asistente.js',
  S + 'vistas/perfil.js',
  S + 'vistas/admin.js',
  S + 'vistas/bitacora.js',
];

/* Ayudan pero no son indispensables. */
const OPCIONALES = [
  '/tickets/manifest.webmanifest',
  S + 'vendor/chart-4.5.1.umd.min.js',
  '/static/Images/ReservAiLogo.png',
  '/static/Images/tickets/app-192.png',
  '/static/Images/tickets/app-512.png',
  '/static/Images/tickets/app-maskable-512.png',
  '/static/Images/tickets/app-ios-180.png',
];

const LIMITE_INSTALACION = 15000;
const LIMITE_RED = 4000;
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
    const viejas = claves.filter((k) => k.startsWith('tickets-pass-') && k !== VERSION);
    await Promise.all(viejas.map((k) => caches.delete(k)));
    await self.clients.claim();
    // Sólo si reemplazó una versión anterior: la pestaña abierta sigue con
    // el código viejo hasta recargar y se le avisa para que ofrezca
    // "Actualizar". En la primera instalación no hay nada que avisar.
    if (viejas.length) {
      const abiertas = await self.clients.matchAll({ type: 'window' });
      abiertas.forEach((c) => c.postMessage({ nueva: VERSION }));
    }
  })());
});

/* Red primero (con límite); si no hay, la copia guardada. Lo que llega bien
   de la red se guarda para la próxima vez sin señal. */
async function redPrimero(pet, clave) {
  try {
    const res = await conLimite(pet, LIMITE_RED);
    if (res && res.ok) {
      const copia = res.clone();
      caches.open(VERSION).then((c) => c.put(clave, copia)).catch(() => {});
    }
    return res;
  } catch (e) {
    const guardada = await caches.match(clave, { ignoreSearch: true });
    if (guardada) return guardada;
    throw e;
  }
}

self.addEventListener('fetch', (evento) => {
  const pet = evento.request;
  if (pet.method !== 'GET') return;

  const url = new URL(pet.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  /* La página (/tickets/ y lo que cuelga del hash es el mismo HTML). */
  if (pet.mode === 'navigate') {
    if (url.pathname !== PAGINA) return;
    evento.respondWith(redPrimero(pet, PAGINA).catch(() => Response.error()));
    return;
  }

  const nuestro = url.pathname.startsWith(S) || url.pathname.startsWith('/static/estilos/') ||
    url.pathname.startsWith('/static/Images/') || CRITICOS.includes(url.pathname);
  if (!nuestro) return;
  evento.respondWith(redPrimero(pet, url.pathname));
});
