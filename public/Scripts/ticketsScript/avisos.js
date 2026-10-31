// Campana de avisos: llegan solos (el sondeo de datos.js) y se marcan como
// leídos al abrirlos.
import { h, vaciar, error, haceCuanto } from "./ui.js";
import { api, escucharAvisos } from "./datos.js";
import { verTicket } from "./rutas.js";

let nodo, avisos = [], abierto = false;

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
        new Notification("Tickets ReservAI", { body: a.texto, icon: "/static/Images/ReservAiLogo.png" });
      }
    }
  });
  document.addEventListener("click", (e) => {
    // composedPath: el botón ya pudo haberse repintado cuando llega el clic.
    if (abierto && !e.composedPath().includes(nodo)) { abierto = false; pintar(); }
  });
}

async function cargar() {
  try {
    avisos = (await api("/avisos", { silencioso: true })).avisos;
  } catch (e) {
    error(e, "No se cargaron los avisos");
  }
  pintar();
}

function pintar() {
  const sinLeer = avisos.filter((a) => !a.leido).length;
  document.title = (sinLeer ? `(${sinLeer}) ` : "") + "ReservAI - Tickets";
  vaciar(nodo, h("span.campana",
    h("button.btn.fantasma", {
      title: "Avisos",
      onclick: () => {
        abierto = !abierto;
        if (abierto && "Notification" in window && Notification.permission === "default") Notification.requestPermission();
        pintar();
      },
    }, "🔔", sinLeer > 0 && h("span.globo", sinLeer > 99 ? "99+" : sinLeer)),
    abierto && h("div.desplegable",
      h("div.fila.espaciada", { style: { padding: "10px 14px", borderBottom: "1px solid var(--line-soft)" } },
        h("b", "Avisos"),
        sinLeer > 0 && h("button.btn.fantasma.chico", { onclick: marcarTodos }, "Marcar todo como leído")),
      !avisos.length && h("div.vacio", "No tienes avisos."),
      avisos.map((a) => h("div.item", { class: a.leido ? "" : "nuevo", onclick: () => abrir(a) },
        h("span", a.texto), h("small", haceCuanto(a.creado)))))));
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

async function marcarTodos() {
  try {
    await api("/avisos/leidos", { method: "POST" });
    avisos.forEach((a) => (a.leido = true));
    pintar();
  } catch (e) { error(e); }
}
