// Avisos: llegan solos (el sondeo de datos.js) y se marcan como leídos al
// abrirlos. En la compu, campana en la barra de arriba; en el teléfono,
// pestaña "Avisos" abajo (vistas/avisos.js) con el número sin leer.
import { h, vaciar, error, haceCuanto } from "./ui.js";
import { api, escucharAvisos } from "./datos.js";
import { verTicket } from "./rutas.js";
import { icono } from "./iconos.js";

let nodo, avisos = [], abierto = false;
const oyentes = new Set();

export function montarAvisos(contenedor) {
  nodo = contenedor;
  cargar();
  escucharAvisos(async (_pulso, hayNuevo) => {
    if (!hayNuevo) return;
    const antes = new Set(avisos.map((a) => a.id));
    await cargar();
    // Notificación del sistema sólo si la pestaña no está a la vista.
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      for (const a of avisos.filter((x) => !antes.has(x.id) && !x.leido).slice(0, 3)) {
        new Notification("Tickets ReservAI", { body: a.texto, icon: "/static/Images/tickets/app-192.png" });
      }
    }
  });
  document.addEventListener("click", (e) => {
    // composedPath: el botón ya pudo haberse repintado cuando llega el clic.
    if (abierto && !e.composedPath().includes(nodo)) { abierto = false; pintar(); }
  });
}

// f(sinLeer): para el número de la pestaña de abajo y la vista de avisos.
export function alCambiarSinLeer(f) {
  oyentes.add(f);
  f(sinLeer());
  return () => oyentes.delete(f);
}

const sinLeer = () => avisos.filter((a) => !a.leido).length;
export const hayPorLeer = () => sinLeer() > 0;

export async function cargar() {
  try {
    avisos = (await api("/avisos", { silencioso: true })).avisos;
  } catch (e) {
    error(e, "No se cargaron los avisos");
  }
  pintar();
}

function pintar() {
  const n = sinLeer();
  document.title = (n ? `(${n}) ` : "") + "ReservAI - Tickets";
  for (const f of oyentes) f(n);
  if (!nodo) return;
  vaciar(nodo, h("span.campana",
    h("button.btn.fantasma.icono", {
      title: "Avisos", "aria-label": "Avisos",
      onclick: () => {
        abierto = !abierto;
        if (abierto && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
        pintar();
      },
    }, icono("campana", { tam: 20 }), n > 0 && h("span.globo", n > 99 ? "99+" : n)),
    abierto && h("div.desplegable",
      h("div.fila.espaciada", { style: { padding: "10px 14px", borderBottom: "1px solid var(--line)" } },
        h("b", "Avisos"),
        n > 0 && h("button.btn.fantasma.chico", { onclick: marcarTodos }, "Marcar todo como leído")),
      lista())));
}

// Lista de avisos (la usa también la vista del teléfono).
export function lista() {
  if (!avisos.length) {
    return h("div.vacio", h("span.grande", icono("campana", { tam: 34 })), h("strong", "Sin avisos"),
      "Aquí llega lo que te asignan, te mencionan o cambia en tus tickets.");
  }
  return h("div.lista-avisos", avisos.map((a) => h("button.item", { class: a.leido ? "" : "nuevo", onclick: () => abrir(a) },
    h("span.punto-aviso", { "aria-hidden": "true" }),
    h("span.item-texto", h("span", a.texto), h("small", haceCuanto(a.creado))))));
}

async function abrir(a) {
  abierto = false;
  if (!a.leido) {
    a.leido = true;
    api(`/avisos/${a.id}/leido`, { method: "POST", silencioso: true }).catch(() => {});
  }
  pintar();
  if (a.numero) verTicket(a.numero);
}

export async function marcarTodos() {
  try {
    await api("/avisos/leidos", { method: "POST" });
    avisos.forEach((a) => (a.leido = true));
    pintar();
  } catch (e) { error(e); }
}
