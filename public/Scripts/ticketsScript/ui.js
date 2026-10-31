// Utilidades de interfaz: crear elementos, avisos flotantes, modales y formatos.

// h("div.clase#id", {atributos o on*}, ...hijos)
export function h(selector, props, ...hijos) {
  const [, tag = "div", resto = ""] = selector.match(/^([a-z0-9-]*)(.*)$/i);
  const el = document.createElement(tag || "div");
  for (const parte of resto.match(/[.#][^.#]+/g) || []) {
    if (parte[0] === ".") el.classList.add(parte.slice(1));
    else el.id = parte.slice(1);
  }
  // Si el segundo argumento no es un objeto de atributos, es un hijo más (incluido 0).
  if (props !== null && props !== undefined && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) {
    hijos.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className += " " + v;
    else if (k === "style" && typeof v === "object") {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith("--")) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    }
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.appendChild(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

export function vaciar(el, ...hijos) {
  el.replaceChildren();
  agregar(el, hijos);
  return el;
}

export function toast(texto, tipo = "") {
  const t = h("div.toast", { class: tipo }, texto);
  document.getElementById("toasts").appendChild(t);
  setTimeout(() => t.remove(), tipo === "error" ? 6000 : 3000);
}

export function error(e, contexto = "") {
  // La sesión se acabó: ya se va al login, no hace falta avisar.
  if (e && e.status === 418) return;
  console.error(contexto, e);
  const msg = (e && (e.message || e.error_description)) || String(e);
  toast((contexto ? contexto + ": " : "") + traducirError(msg), "error");
}

function traducirError(msg) {
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sin conexión con el servidor.";
  return msg;
}

// Modal genérico. Devuelve {cerrar}. contenido puede ser nodo o función(cerrar) => nodo.
export function modal(titulo, contenido, { ancho = false, alCerrar } = {}) {
  let fondo;
  const cerrar = () => {
    fondo.remove();
    document.removeEventListener("keydown", esc);
    alCerrar && alCerrar();
  };
  const esc = (e) => e.key === "Escape" && cerrar();
  const cuerpo = typeof contenido === "function" ? contenido(cerrar) : contenido;
  fondo = h("div.modal", { onmousedown: (e) => e.target === fondo && cerrar() },
    h("div.caja", { class: ancho ? "ancha" : "" },
      h("div.cab", h("h2", titulo)),
      cuerpo));
  document.body.appendChild(fondo);
  document.addEventListener("keydown", esc);
  const primero = fondo.querySelector("input, textarea, select");
  primero && setTimeout(() => primero.focus(), 30);
  return { cerrar };
}

export function confirmar(texto, { si = "Sí", peligro = false } = {}) {
  return new Promise((resolver) => {
    let decidido = false;
    const m = modal("Confirmar", (cerrar) => [
      h("div.cuerpo", h("p", texto)),
      h("div.pie",
        h("button.btn", { onclick: () => cerrar() }, "Cancelar"),
        h("button.btn.primario", { class: peligro ? "peligro" : "", onclick: () => { decidido = true; resolver(true); cerrar(); } }, si)),
    ], { alCerrar: () => !decidido && resolver(false) });
    return m;
  });
}

// ---------- Formatos ----------

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

// "2026-10-28" → Date local a mediodía (evita saltos por zona horaria).
export function fechaLocal(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d, 12);
}

export function isoDia(fecha) {
  const p = (n) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

export function hoyIso() {
  return isoDia(new Date());
}

export function fechaCorta(iso) {
  const f = fechaLocal(iso);
  if (!f) return "";
  const hoy = fechaLocal(hoyIso());
  const dif = Math.round((f - hoy) / 86400000);
  if (dif === 0) return "hoy";
  if (dif === 1) return "mañana";
  if (dif === -1) return "ayer";
  const anio = f.getFullYear() !== hoy.getFullYear() ? " " + f.getFullYear() : "";
  return `${f.getDate()} ${MESES[f.getMonth()]}${anio}`;
}

export function claseVence(iso, cerrado) {
  if (!iso || cerrado) return "";
  const dif = Math.round((fechaLocal(iso) - fechaLocal(hoyIso())) / 86400000);
  if (dif < 0) return "tarde";
  if (dif <= 1) return "pronto";
  return "";
}

export function haceCuanto(ts) {
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  const f = new Date(ts);
  return `${f.getDate()} ${MESES[f.getMonth()]} ${f.getFullYear()}`;
}

export function fechaHora(ts) {
  const f = new Date(ts);
  return `${f.getDate()} ${MESES[f.getMonth()]} ${String(f.getHours()).padStart(2, "0")}:${String(f.getMinutes()).padStart(2, "0")}`;
}

export function duracion(minutos) {
  const m = Math.max(0, Math.round(minutos));
  const hrs = Math.floor(m / 60);
  return hrs ? `${hrs} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}

export function reloj(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

// ---------- Piezas visuales ----------

export const PRIORIDADES = [
  { id: "urgente", nombre: "Urgente" },
  { id: "alta", nombre: "Alta" },
  { id: "normal", nombre: "Normal" },
  { id: "baja", nombre: "Baja" },
];
export const nombrePrioridad = (id) => (PRIORIDADES.find((p) => p.id === id) || {}).nombre || id;

const COLORES_AVATAR = ["#1AACF5", "#3DD68C", "#E8A33D", "#F0655C", "#B48CF2", "#4FD1C5", "#F28CC0", "#A3D65C"];

export function iniciales(nombre) {
  const partes = String(nombre || "?").trim().split(/\s+/);
  return ((partes[0] || "?")[0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export function avatar(persona, titulo = true) {
  const nombre = persona ? persona.nombre : "?";
  let suma = 0;
  for (const c of persona ? persona.id : "x") suma += c.charCodeAt(0);
  return h("span.avatar", { title: titulo ? nombre : null, style: { background: COLORES_AVATAR[suma % COLORES_AVATAR.length] } }, iniciales(nombre));
}

export function chipEstado(estado) {
  if (!estado) return h("span.chip", "—");
  return h("span.estado-pill", { style: { "--c": estado.color } }, estado.nombre);
}

export function chipEtiqueta(etiqueta, alQuitar) {
  return h("span.etiqueta", { style: { "--c": etiqueta.color } },
    etiqueta.nombre,
    alQuitar && h("span.quitar", { title: "Quitar", onclick: (e) => { e.stopPropagation(); alQuitar(); } }, "×"));
}

export function chipFecha(iso, cerrado, prefijo = "") {
  if (!iso) return null;
  return h("span.fecha", { class: claseVence(iso, cerrado), title: iso }, "◷ " + prefijo + fechaCorta(iso));
}

export function avatares(ids, buscar) {
  if (!ids.length) return h("span.sin-asignar", { title: "Sin asignar" });
  return h("span.avatares", ids.slice(0, 4).map((id) => avatar(buscar(id))),
    ids.length > 4 && h("span.avatar", { style: { background: "var(--hover)", color: "var(--ink)" } }, "+" + (ids.length - 4)));
}

// Color de la franja izquierda de un ticket según prioridad.
export const COLOR_PRIO = { urgente: "var(--red)", alta: "var(--amber)", normal: "transparent", baja: "transparent" };

export function textoConMenciones(texto, personas) {
  // Resalta "@Nombre Apellido" de personas conocidas y convierte URLs en enlaces.
  const nombres = personas.map((p) => p.nombre).filter(Boolean).sort((a, b) => b.length - a.length);
  const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patron = new RegExp(
    `(https?://[^\\s]+)` + (nombres.length ? `|@(${nombres.map(escapar).join("|")})` : ""), "g");
  const frag = document.createDocumentFragment();
  let ultimo = 0;
  for (const m of texto.matchAll(patron)) {
    frag.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
    if (m[1]) frag.appendChild(h("a", { href: m[1], target: "_blank", rel: "noopener" }, m[1]));
    else frag.appendChild(h("span.mencion", "@" + m[2]));
    ultimo = m.index + m[0].length;
  }
  frag.appendChild(document.createTextNode(texto.slice(ultimo)));
  return frag;
}

export function descargarCsv(nombre, filas) {
  const celda = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = h("a", { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Encabezado del menú lateral (el logo de ReservAI ya está en la barra del pass).
export function marca() {
  return h("div.marca", h("span.producto", "Tickets"));
}

// Barra de carga arriba de la página (cuenta cargas simultáneas).
let cargas = 0;
export function cargando(activo) {
  const barra = document.getElementById("carga");
  if (!barra) return;
  cargas = Math.max(0, cargas + (activo ? 1 : -1));
  if (cargas > 0) {
    barra.classList.remove("lista");
    barra.classList.add("activa");
  } else {
    barra.classList.remove("activa");
    barra.classList.add("lista");
  }
}
export async function conCarga(promesa) {
  cargando(true);
  try {
    return await promesa;
  } finally {
    cargando(false);
  }
}

export function esqueletos(n = 4) {
  return h("div.esqueletos", Array.from({ length: n }, () => h("div.esqueleto")));
}

export function puntos() {
  return h("span.puntos", h("i"), h("i"), h("i"));
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
