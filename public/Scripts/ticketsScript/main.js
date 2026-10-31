// Arranque: sesión, estructura de la app y rutas (#/...).
import { h, vaciar, error, avatar, marca, cargando } from "./ui.js";
import { api, datos, cargarCatalogos, misAreas, esAdmin } from "./datos.js";
import { pantallaSinAcceso } from "./vistas/login.js";
import { montarAvisos } from "./avisos.js";
import { montarCronometro } from "./cronometro.js";
import { abrirTicket, cerrarPanel } from "./vistas/ticket.js";
import { leerRuta, ir, verTicket } from "./rutas.js";

const raiz = document.getElementById("raiz");
let limpiarVista = null;
let contenido, lateral, rutaActual = "";

const VISTAS = {
  mis: () => import("./vistas/mis.js"),
  buscar: () => import("./vistas/mis.js"),
  area: () => import("./vistas/area.js"),
  solicitudes: () => import("./vistas/solicitudes.js"),
  tiempo: () => import("./vistas/tiempo.js"),
  admin: () => import("./vistas/admin.js"),
  dashboard: () => import("./vistas/dashboard.js"),
  asistente: () => import("./vistas/asistente.js"),
  perfil: () => import("./vistas/perfil.js"),
};

async function arrancar() {
  // Sin sesión del pass, api() manda al login y regresa aquí.
  let yo;
  try {
    yo = await api("/yo");
  } catch (e) {
    return error(e, "No se pudo abrir Tickets");
  }
  if (yo.nivel === "ninguno") return pantallaSinAcceso(raiz, yo);
  try {
    await cargarCatalogos();
  } catch (e) {
    return error(e, "No se pudieron cargar los datos");
  }
  montarApp();
  window.addEventListener("hashchange", enrutar);
  // Una vista cambió sus filtros en la ruta sin pedir que la repintemos.
  window.addEventListener("tk:ruta", () => { rutaActual = claveDeVista(); });
  window.addEventListener("tk:catalogos", async () => {
    try {
      await cargarCatalogos();
      pintarLateral();
    } catch (e) {
      error(e, "No se pudieron recargar los datos");
    }
  });
  if (!location.hash || location.hash === "#" || location.hash === "#/") {
    history.replaceState(null, "", "#/mis");
  }
  enrutar();
}

function montarApp() {
  lateral = h("aside.lateral");
  contenido = h("main.contenido");
  const buscar = h("input", {
    type: "search", placeholder: "Buscar tickets o T-123…",
    onkeydown: (e) => {
      if (e.key !== "Enter") return;
      const texto = e.target.value.trim();
      const num = texto.match(/^(?:t-?)?(\d+)$/i);
      if (num) verTicket(Number(num[1]));
      else if (texto) ir("#/buscar?q=" + encodeURIComponent(texto));
    },
  });
  const barra = h("header.barra",
    h("button.btn.fantasma.menu-movil", { onclick: () => lateral.classList.toggle("abierta"), "aria-label": "Menú" }, "☰"),
    h("div.buscar-caja", buscar),
    h("div.derecha", h("span#cronometro"), h("span#avisos")));
  vaciar(raiz, h("div.app", lateral, h("div.principal", barra, contenido)));
  pintarLateral();
  montarCronometro(document.getElementById("cronometro"));
  montarAvisos(document.getElementById("avisos"));
}

function pintarLateral() {
  const enlace = (ruta, texto, extra) =>
    h("a", { href: ruta, "data-ruta": ruta, onclick: () => lateral.classList.remove("abierta") }, extra, texto);
  vaciar(lateral,
    marca(),
    h("nav.nav",
      enlace("#/mis", "Mis tickets", h("span.ico", "◎")),
      enlace("#/dashboard", "Dashboard", h("span.ico", "▦")),
      enlace("#/asistente", "Asistente IA", h("span.ico", "✦")),
      enlace("#/solicitudes", "Solicitudes", h("span.ico", "⇄")),
      enlace("#/tiempo", "Tiempo", h("span.ico", "◷")),
      h("div.titulo", "Áreas"),
      misAreas().map((a) => enlace(`#/area/${a.clave}`, a.nombre, h("span.punto", { style: { background: a.color } }))),
      esAdmin() && [h("div.titulo", "Administración"), enlace("#/admin/personas", "Acceso y áreas", h("span.ico", "⚙"))]),
    h("div.pie",
      h("a.yo", { href: "#/perfil" }, avatar(datos.yo), h("div", h("b", datos.yo.nombre), h("div.dim", { style: { fontSize: ".8rem" } }, "Mi perfil")))));
  marcarActivo();
}

function marcarActivo() {
  const { partes } = leerRuta();
  const actual = "#/" + partes.slice(0, partes[0] === "area" ? 2 : 1).join("/");
  for (const a of lateral.querySelectorAll("a[data-ruta]")) {
    const ruta = a.dataset.ruta.split("?")[0];
    a.classList.toggle("activo", ruta === actual || (partes[0] === "admin" && ruta.startsWith("#/admin")));
  }
}

// Solo los cambios de ruta (no de ?t=) vuelven a pintar la vista.
function claveDeVista() {
  const { partes, params } = leerRuta();
  return partes.join("/") + "?" + [...params].filter(([k]) => k !== "t").map((p) => p.join("=")).join("&");
}

async function enrutar() {
  const { partes, params } = leerRuta();
  const numTicket = params.get("t");
  const claveVista = claveDeVista();
  if (claveVista !== rutaActual) {
    rutaActual = claveVista;
    marcarActivo();
    limpiarVista && limpiarVista();
    limpiarVista = null;
    const cargar = VISTAS[partes[0]] || VISTAS.mis;
    cargando(true);
    try {
      const modulo = await cargar();
      vaciar(contenido);
      // Reinicia la animación de entrada de la vista.
      contenido.classList.remove("vista");
      void contenido.offsetWidth;
      contenido.classList.add("vista");
      window.scrollTo(0, 0);
      limpiarVista = (await modulo.render(contenido, partes.slice(1), params)) || null;
    } catch (e) {
      error(e, "No se pudo abrir la vista");
    } finally {
      cargando(false);
    }
  }
  if (numTicket) abrirTicket(Number(numTicket));
  else cerrarPanel();
}

arrancar();
