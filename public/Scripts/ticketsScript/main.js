// Arranque: sesión, estructura de la app y rutas (#/...).
// Escritorio: menú lateral y barra de arriba con la búsqueda. Teléfono: barra
// de arriba compacta y pestañas abajo (Inicio, área, crear, avisos, más),
// como una app instalada.
import { h, vaciar, error, avatar, marca, cargando, modal, toast } from "./ui.js";
import { api, datos, cargarCatalogos, misAreas, esAdmin, puedeEditar, puedoEscribir, refrescarPronto } from "./datos.js";
import { pantallaSinAcceso } from "./vistas/login.js";
import { montarAvisos, alCambiarSinLeer } from "./avisos.js";
import { montarCronometro } from "./cronometro.js";
import { abrirTicket, cerrarPanel } from "./vistas/ticket.js";
import { leerRuta, ir, verTicket } from "./rutas.js";
import { icono } from "./iconos.js";
import { montarPwa, puedeInstalar, instalar, esInstalada } from "./pwa.js";
import { goLogout } from "../api.js";

const raiz = document.getElementById("raiz");
let limpiarVista = null;
let contenido, lateral, abajo, rutaActual = "";

const VISTAS = {
  mis: () => import("./vistas/mis.js"),
  buscar: () => import("./vistas/mis.js"),
  area: () => import("./vistas/area.js"),
  areas: () => import("./vistas/areas.js"),
  avisos: () => import("./vistas/avisos.js"),
  solicitudes: () => import("./vistas/solicitudes.js"),
  tiempo: () => import("./vistas/tiempo.js"),
  admin: () => import("./vistas/admin.js"),
  dashboard: () => import("./vistas/dashboard.js"),
  asistente: () => import("./vistas/asistente.js"),
  perfil: () => import("./vistas/perfil.js"),
};

async function arrancar() {
  montarPwa();
  // Sin sesión, api() manda al login y regresa aquí.
  let yo;
  try {
    yo = await api("/yo");
  } catch (e) {
    if (e.status === 0) return sinConexion();
    return error(e, "No se pudo abrir Tickets");
  }
  // La barra del pass (nombre, enlaces de admin) se llena con esto: en la app
  // instalada no hay sessionStorage del login.
  window.dispatchEvent(new CustomEvent("tk:yo", { detail: yo }));
  if (yo.nivel === "ninguno") return pantallaSinAcceso(raiz, yo);
  pedirSesionDelTelefono(yo);
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
      pintarAbajo();
    } catch (e) {
      error(e, "No se pudieron recargar los datos");
    }
  });
  if (!location.hash || location.hash === "#" || location.hash === "#/") {
    history.replaceState(null, "", "#/mis");
  }
  enrutar();
}

// La app instalada abre sin señal (service worker), pero los tickets vienen
// del servicio: se dice claro y se reintenta solo al volver la señal.
function sinConexion() {
  const reintentar = () => location.reload();
  window.addEventListener("online", reintentar, { once: true });
  vaciar(raiz, h("div.login", h("div.tarjeta.caja",
    marca(),
    h("h2", "Sin conexión"),
    h("p.muted", "Tickets necesita internet para traer tus pendientes. En cuanto vuelva la señal se abre solo."),
    h("button.btn.primario", { onclick: reintentar }, icono("actualizar", { tam: 16 }), "Reintentar"))));
}

/**
 * En el teléfono (o en la app instalada) la sesión del pass dura 30 min:
 * con ella se pide la de Tickets de 30 días, como hace la Bitácora. En la
 * compu se queda la normal. Si falla, se sigue con la del pass.
 */
function pedirSesionDelTelefono(yo) {
  const telefono = esInstalada() || window.matchMedia("(pointer: coarse)").matches;
  if (!telefono || yo.sesion !== "pass" || yo.dispositivo) return;
  api("/sesion", { method: "POST", body: {}, silencioso: true }).catch((e) => console.warn("Sesión del teléfono:", e.message));
}

function montarApp() {
  lateral = h("aside.lateral");
  contenido = h("main.contenido");
  abajo = h("nav.abajo", { "aria-label": "Secciones" });
  const buscar = h("input", {
    type: "search", placeholder: "Buscar tickets o T-123…", enterkeyhint: "search",
    onkeydown: (e) => {
      if (e.key !== "Enter") return;
      const texto = e.target.value.trim();
      const num = texto.match(/^(?:t-?)?(\d+)$/i);
      e.target.blur();
      barra.classList.remove("buscando");
      if (num) verTicket(Number(num[1]));
      else if (texto) ir("#/buscar?q=" + encodeURIComponent(texto));
    },
  });
  const barra = h("header.barra",
    h("a.marca-movil", { href: "#/mis", "aria-label": "Tickets: inicio" },
      h("img", { src: "/static/Images/ReservAiLogo.png", alt: "" }), h("span", "Tickets")),
    h("div.buscar-caja", buscar,
      h("button.btn.fantasma.cancelar-busqueda", {
        onclick: () => { buscar.value = ""; barra.classList.remove("buscando"); },
      }, "Cancelar")),
    h("div.derecha",
      h("span#cronometro"),
      h("button.btn.fantasma.icono.solo-movil", {
        "aria-label": "Buscar",
        onclick: () => { barra.classList.add("buscando"); buscar.focus(); },
      }, icono("buscar", { tam: 22 })),
      h("span#avisos.solo-escritorio"),
      // En la compu, crear desde cualquier pantalla (en el teléfono es el + de abajo).
      puedoEscribir() && h("button.btn.primario.chico.solo-escritorio", {
        onclick: crearRapido, title: "Nuevo ticket (N)",
      }, icono("mas", { tam: 16 }), "Nuevo ticket")));
  // Atajo: N abre "Nuevo ticket" si no estás escribiendo en un campo.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "n" && e.key !== "N") return;
    if (e.ctrlKey || e.metaKey || e.altKey || !puedoEscribir()) return;
    if (document.querySelector(".modal") || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (document.activeElement?.isContentEditable) return;
    e.preventDefault();
    crearRapido();
  });
  vaciar(raiz, h("div.app", lateral, h("div.principal", barra, contenido)), abajo);
  // En la compu la barra del pass queda fija arriba; el menú y la barra de
  // buscar se pegan debajo de ella (--alto-pass en StylesTickets.css).
  const pass = document.querySelector("body > .navbar");
  if (pass && "ResizeObserver" in window) {
    new ResizeObserver(() => document.documentElement.style.setProperty("--alto-pass", pass.offsetHeight + "px")).observe(pass);
  }
  pintarLateral();
  pintarAbajo();
  montarCronometro(document.getElementById("cronometro"));
  montarAvisos(document.getElementById("avisos"));
  alCambiarSinLeer(pintarGlobo);
}

function pintarLateral() {
  const enlace = (ruta, texto, extra) =>
    h("a", { href: ruta, "data-ruta": ruta }, extra, texto);
  const ico = (n) => h("span.ico", icono(n, { tam: 18 }));
  vaciar(lateral,
    marca(),
    h("nav.nav",
      enlace("#/mis", "Mis tickets", ico("check")),
      enlace("#/dashboard", "Dashboard", ico("grafica")),
      enlace("#/asistente", "Asistente IA", ico("chispa")),
      enlace("#/solicitudes", "Solicitudes", ico("flechas")),
      enlace("#/tiempo", "Tiempo", ico("reloj")),
      h("div.titulo", "Áreas"),
      misAreas().map((a) => enlace(`#/area/${a.clave}`, a.nombre, h("span.punto", { style: { background: a.color } }))),
      esAdmin() && [h("div.titulo", "Administración"), enlace("#/admin/personas", "Acceso y áreas", ico("engrane"))]),
    h("div.pie",
      h("a.yo", { href: "#/perfil" }, avatar(datos.yo), h("div", h("b", datos.yo.nombre), h("div.dim", { style: { fontSize: ".8rem" } }, "Mi perfil")))));
  marcarActivo();
}

// Pestañas de abajo (teléfono). Con una sola área se va directo a ella.
function pintarAbajo() {
  const areas = misAreas();
  const rutaAreas = areas.length === 1 ? `#/area/${areas[0].clave}` : "#/areas";
  const pestana = (ruta, nombre, texto, extra) => h("a.pestana", { href: ruta, "data-ruta": ruta }, icono(nombre, { tam: 24 }), h("span", texto), extra);
  vaciar(abajo,
    pestana("#/mis", "check", "Mis tickets"),
    pestana(rutaAreas, "cuadros", areas.length === 1 ? areas[0].nombre : "Áreas"),
    puedoEscribir()
      ? h("button.pestana.crear", { "aria-label": "Crear ticket", onclick: crearRapido }, h("span.mas", icono("mas", { tam: 26 })))
      : h("span.pestana.hueco"),
    pestana("#/avisos", "campana", "Avisos", h("span.globo#globoAvisos", { hidden: true })),
    h("button.pestana", { onclick: menuMas, "data-ruta": "mas" }, icono("menu", { tam: 24 }), h("span", "Más")));
  marcarActivo();
}

function pintarGlobo(sinLeer) {
  const globo = document.getElementById("globoAvisos");
  if (!globo) return;
  globo.hidden = !sinLeer;
  globo.textContent = sinLeer > 99 ? "99+" : String(sinLeer);
}

/**
 * Botón "+" del teléfono: ticket nuevo en el área que estás viendo (o en la
 * primera donde puedes editar). Si no editas en ninguna, pedir uno.
 */
async function crearRapido() {
  const { partes } = leerRuta();
  const actual = partes[0] === "area" ? misAreas().find((a) => a.clave === partes[1]) : null;
  const destino = actual && puedeEditar(actual.id) ? actual : misAreas().find((a) => puedeEditar(a.id));
  if (!destino) return ir("#/solicitudes?pedir=" + (actual ? actual.clave : ""));
  const { nuevoTicket } = await import("./vistas/area.js");
  // La vista de abajo se entera sola en cuanto el servicio cuenta el cambio.
  nuevoTicket(destino, refrescarPronto);
}

// "Más" en el teléfono: el resto de Tickets, la cuenta y las otras herramientas del pass.
function menuMas() {
  const yo = datos.yo;
  const tipo = yo.tipo;
  modal("Más", (cerrar) => {
    const fila = (ruta, nombre, texto, sub) => h("a.menu-fila", {
      href: ruta,
      onclick: (e) => {
        cerrar();
        if (ruta.startsWith("#")) { e.preventDefault(); ir(ruta); }
      },
    }, h("span.menu-ico", icono(nombre, { tam: 20 })), h("span.menu-texto", texto, sub && h("small", sub)), icono("adelante", { tam: 18 }));
    const instalarFila = !esInstalada() && h("button.menu-fila.destacada", {
      onclick: async () => {
        cerrar();
        const r = await instalar();
        if (r === "ios") instruccionesIos();
        else if (r === "aceptada") toast("Listo: Tickets quedó en tu pantalla de inicio");
      },
    }, h("span.menu-ico", icono("telefono", { tam: 20 })),
    h("span.menu-texto", "Agregar a la pantalla de inicio", h("small", puedeInstalar() ? "Se abre como app y no te pide entrar cada vez" : "Para abrirla como app")),
    icono("instalar", { tam: 18 }));
    return h("div.cuerpo.menu-mas",
      h("a.menu-yo", { href: "#/perfil", onclick: (e) => { e.preventDefault(); cerrar(); ir("#/perfil"); } },
        avatar(yo), h("span.menu-texto", h("b", yo.nombre), h("small", yo.correo)), icono("adelante", { tam: 18 })),
      instalarFila,
      h("div.menu-grupo",
        fila("#/dashboard", "grafica", "Dashboard"),
        fila("#/asistente", "chispa", "Asistente IA"),
        fila("#/solicitudes", "flechas", "Solicitudes"),
        fila("#/tiempo", "reloj", "Tiempo"),
        misAreas().length > 1 && fila("#/areas", "cuadros", "Áreas"),
        esAdmin() && fila("#/admin/personas", "engrane", "Acceso y áreas", "Quién entra y qué puede hacer")),
      h("div.menu-titulo", "Pass Manager"),
      h("div.menu-grupo",
        (tipo === "admin" || tipo === "seller") && fila("/bitacora/", "bitacora", "Bitácora de visitas"),
        tipo === "admin" && fila("/documentacion/", "documentacion", "Documentación"),
        tipo === "admin" && fila("/inicioAdmin", "candado", "Gestión de cuentas"),
        tipo !== "client" && fila("/invitations", "correo", "Invitaciones")),
      h("button.menu-fila.peligro", { onclick: () => { cerrar(); goLogout(); } },
        h("span.menu-ico", icono("salir", { tam: 20 })), h("span.menu-texto", "Cerrar sesión", h("small", "También en este teléfono")), null));
  }, { clase: "menu" });
}

function instruccionesIos() {
  modal("Agregar a la pantalla de inicio", (cerrar) => [
    h("div.cuerpo",
      h("ol.pasos",
        h("li", "Toca ", h("b", "Compartir"), " (el cuadro con la flecha hacia arriba) en la barra de Safari."),
        h("li", "Elige ", h("b", "Agregar a pantalla de inicio"), "."),
        h("li", "Toca ", h("b", "Agregar"), ". Tickets queda como app y entra sin pedirte la contraseña por 30 días.")),
      h("p.muted", "Si estás en otro navegador (Chrome, Gmail, WhatsApp), ábrela primero en Safari.")),
    h("div.pie", h("button.btn.primario", { onclick: () => cerrar() }, "Entendido")),
  ]);
}

function marcarActivo() {
  const { partes } = leerRuta();
  const actual = "#/" + partes.slice(0, partes[0] === "area" ? 2 : 1).join("/");
  for (const cont of [lateral, abajo]) {
    if (!cont) continue;
    for (const a of cont.querySelectorAll("[data-ruta]")) {
      const ruta = a.dataset.ruta.split("?")[0];
      a.classList.toggle("activo", ruta === actual ||
        (partes[0] === "admin" && ruta.startsWith("#/admin")) ||
        (partes[0] === "area" && ruta === "#/areas"));
    }
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
