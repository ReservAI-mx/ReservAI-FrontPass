// Conexión con el servicio de Tickets (/api/tickets) y datos compartidos por
// todas las vistas (yo, personas, áreas, estados, etiquetas, membresías).
// Usa la sesión del pass: sin sesión (418) manda al login y regresa aquí.
import { cargando } from "./ui.js";

const API = "/api/tickets";

export const datos = {
  yo: null,       // { id, nombre, correo, tipo, nivel, es_admin, correo_avisos }
  personas: [],   // cuentas con acceso a Tickets
  areas: [],      // con mi_rol
  miembros: [],   // rol efectivo de cada persona en cada área
  miembrosExplicitos: [],
  estados: [],
  etiquetas: [],
};

// Mensajes para los códigos de error del servicio.
const MENSAJES = {
  sin_permiso: "No tienes permiso para hacer eso.",
  no_encontrado: "No existe o no tienes acceso.",
  duplicado: "Eso ya existe.",
  referencia_invalida: "Algo de lo que elegiste ya no existe. Recarga la página.",
  area_invalida: "Esa área no existe o está archivada.",
  persona_sin_acceso: "Esa persona no tiene acceso a Tickets.",
  etiqueta_de_otra_area: "Esa etiqueta es de otra área.",
  subtarea_no_cambia_area: "Una subtarea no cambia de área: mueve el ticket principal.",
  estado_con_tickets: "Ese estado tiene tickets. Muévelos a otro estado antes de borrarlo.",
  ultimo_estado: "El área necesita al menos un estado.",
  cuenta_es_admin: "Los admins ya entran a todas las áreas.",
  archivo_grande: "El archivo pesa más de 10 MB.",
  archivo_invalido: "No se pudo leer el archivo.",
  payload_too_large: "Es demasiado grande para subirlo.",
  rate_limited: "Demasiadas peticiones. Espera un momento.",
  accion_desconocida: "Acción desconocida.",
};
const CAMPOS = {
  titulo: "el título", vence: "la fecha de vencimiento", inicio: "la fecha de inicio", fin: "la hora de fin",
  texto: "el texto", nombre: "el nombre", color: "el color", prioridad: "la prioridad",
};

export class ErrorApi extends Error {
  constructor(status, cuerpo) {
    const codigo = cuerpo && cuerpo.error;
    let msg = (cuerpo && cuerpo.mensaje) || MENSAJES[codigo];
    if (!msg && codigo === "dato_invalido") msg = `Revisa ${CAMPOS[cuerpo.campo] || "los datos"}.`;
    if (!msg && status >= 500) msg = "El servidor tuvo un problema. Intenta de nuevo.";
    super(msg || codigo || `Error ${status}`);
    this.status = status;
    this.codigo = codigo;
    this.cuerpo = cuerpo;
  }
}

// La sesión del pass dura 30 min: al acabarse se va al login y, al entrar,
// regresa a esta misma pantalla.
function irAlLogin() {
  const regreso = location.pathname + location.search + location.hash;
  location.href = "/login?return_to=" + encodeURIComponent(regreso);
}

/**
 * Llama al servicio. Lanza ErrorApi con un mensaje legible.
 * Toda escritura va en JSON (también DELETE: el servicio lo exige).
 */
export async function api(ruta, { method = "GET", body, silencioso = false } = {}) {
  const escribe = method !== "GET";
  if (!silencioso) cargando(true);
  let res;
  try {
    res = await fetch(API + ruta, {
      method,
      credentials: "include",
      headers: escribe ? { "Content-Type": "application/json" } : {},
      body: escribe ? JSON.stringify(body || {}) : undefined,
    });
  } catch (_) {
    throw new ErrorApi(0, { mensaje: "Sin conexión con el servidor." });
  } finally {
    if (!silencioso) cargando(false);
  }
  if (res.status === 418) {
    irAlLogin();
    throw new ErrorApi(418, { mensaje: "Tu sesión terminó." });
  }
  if (res.status === 204) return null;
  let cuerpo = null;
  try { cuerpo = await res.json(); } catch (_) { /* sin cuerpo */ }
  if (!res.ok) throw new ErrorApi(res.status, cuerpo);
  return cuerpo;
}

export const consulta = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, v === true ? "1" : v);
  const s = p.toString();
  return s ? "?" + s : "";
};

export async function cargarCatalogos() {
  const c = await api("/catalogos");
  Object.assign(datos, {
    yo: c.yo,
    personas: c.personas,
    areas: c.areas,
    miembros: c.miembros,
    miembrosExplicitos: c.miembros_explicitos || [],
    estados: c.estados,
    etiquetas: c.etiquetas,
  });
}

export const persona = (id) => datos.personas.find((p) => p.id === id);
export const area = (id) => datos.areas.find((a) => a.id === id);
export const areaPorClave = (clave) => datos.areas.find((a) => a.clave === clave);
export const estado = (id) => datos.estados.find((e) => e.id === id);
export const estadosDe = (areaId) => datos.estados.filter((e) => e.area_id === areaId);
export const etiquetasDe = (areaId) => datos.etiquetas.filter((e) => e.area_id === areaId);
export const etiqueta = (id) => datos.etiquetas.find((e) => e.id === id);
export const personasActivas = () => datos.personas;

// Personas con rol en el área (para asignar, filtrar y mencionar).
export function miembrosDe(areaId) {
  const ids = new Set(datos.miembros.filter((m) => m.area_id === areaId).map((m) => m.persona_id));
  return datos.personas.filter((p) => ids.has(p.id));
}

// Rol efectivo en un área: 'admin' | 'miembro' | 'lector' | null (lo calcula el servicio).
export function rol(areaId) {
  return area(areaId)?.mi_rol || null;
}
export const puedeEditar = (areaId) => ["admin", "miembro"].includes(rol(areaId));
export const administra = (areaId) => rol(areaId) === "admin";
export const esAdmin = () => !!datos.yo?.es_admin;
export const puedoEscribir = () => datos.yo?.nivel === "editar";

// Áreas donde tengo rol (todas si soy admin), sin archivadas.
export function misAreas() {
  return datos.areas.filter((a) => !a.archivada && a.mi_rol);
}

export function primerEstado(areaId) {
  return estadosDe(areaId)[0] || null;
}

// --------------------------------------------------------------- tickets

export const tickets = {
  listar: async (filtros) => (await api("/tickets" + consulta(filtros))).tickets,
  detalle: (numero) => api(`/tickets/${numero}`),
  crear: (datosTicket) => api("/tickets", { method: "POST", body: datosTicket }),
  cambiar: (id, cambios) => api(`/tickets/${id}`, { method: "PATCH", body: cambios }),
  borrar: (id) => api(`/tickets/${id}`, { method: "DELETE" }),
  asignar: (id, persona) => api(`/tickets/${id}/asignados/${persona}`, { method: "PUT" }),
  desasignar: (id, persona) => api(`/tickets/${id}/asignados/${persona}`, { method: "DELETE" }),
  etiquetar: (id, etq) => api(`/tickets/${id}/etiquetas/${etq}`, { method: "PUT" }),
  desetiquetar: (id, etq) => api(`/tickets/${id}/etiquetas/${etq}`, { method: "DELETE" }),
  checklist: (id, textos) => api(`/tickets/${id}/checklist`, { method: "POST", body: { textos } }),
  cambiarPaso: (paso, cambios) => api(`/checklist/${paso}`, { method: "PATCH", body: cambios }),
  borrarPaso: (paso) => api(`/checklist/${paso}`, { method: "DELETE" }),
  comentar: (id, texto, menciones) => api(`/tickets/${id}/comentarios`, { method: "POST", body: { texto, menciones } }),
  editarComentario: (c, texto) => api(`/comentarios/${c}`, { method: "PATCH", body: { texto } }),
  borrarComentario: (c) => api(`/comentarios/${c}`, { method: "DELETE" }),
  borrarAdjunto: (a) => api(`/adjuntos/${a}`, { method: "DELETE" }),
  urlAdjunto: (a, descargar = false) => `${API}/adjuntos/${a}${descargar ? "?descargar=1" : ""}`,
};

const ADJUNTO_MAX = 10 * 1024 * 1024;

function aBase64(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result).split(",")[1] || "");
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(archivo);
  });
}

// Sube un archivo del navegador (máx. 10 MB) a un ticket.
export async function subirAdjunto(ticketId, archivo) {
  if (archivo.size > ADJUNTO_MAX) throw new ErrorApi(413, { error: "archivo_grande" });
  const base64 = await aBase64(archivo);
  return api(`/tickets/${ticketId}/adjuntos`, {
    method: "POST",
    body: { nombre: archivo.name, tipo: archivo.type || "", datos: base64 },
  });
}

// --------------------------------------------------------------- cambios en vivo

// Cada pocos segundos se pregunta al servicio un contador de cambios; si se
// movió, cada vista que escucha vuelve a cargar lo suyo. Con la pestaña
// oculta no se pregunta.
const oyentes = new Set();
const oyentesAvisos = new Set();
let ultimo = { cambios: null, ultimo_aviso: null };
let sondeo = null;
const CADA_MS = 8000;

async function preguntar() {
  if (document.hidden) return;
  let p;
  try {
    p = await api("/pulso", { silencioso: true });
  } catch (_) {
    return;
  }
  const cambio = ultimo.cambios !== null && p.cambios !== ultimo.cambios;
  const aviso = ultimo.ultimo_aviso !== null && p.ultimo_aviso !== ultimo.ultimo_aviso;
  ultimo = p;
  if (cambio) for (const f of oyentes) f();
  for (const f of oyentesAvisos) f(p, aviso);
}

function arrancarSondeo() {
  if (sondeo) return;
  sondeo = setInterval(preguntar, CADA_MS);
  preguntar();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) preguntar(); });
}

// Escucha cambios; devuelve una función para dejar de escuchar.
export function escuchar(_nombre, _tablas, alCambiar) {
  arrancarSondeo();
  oyentes.add(alCambiar);
  return () => oyentes.delete(alCambiar);
}

// Avisos: f(pulso, hayNuevo).
export function escucharAvisos(f) {
  arrancarSondeo();
  oyentesAvisos.add(f);
}

// Después de un cambio propio no hace falta esperar al siguiente sondeo.
export function refrescarPronto() {
  setTimeout(preguntar, 300);
}
