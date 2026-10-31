// "Mis tickets" (lo asignado a mí, en tablero por fecha o en lista) y la búsqueda general (#/buscar?q=).
import {
  h, vaciar, error, avatares, chipEstado, chipEtiqueta, chipFecha, nombrePrioridad, fechaLocal, hoyIso,
  debounce, esqueletos, COLOR_PRIO,
} from "../ui.js";
import { area, estado, etiqueta, persona, escuchar, tickets as api } from "../datos.js";
import { verTicket } from "../rutas.js";

const PESO_PRIO = { urgente: 0, alta: 1, normal: 2, baja: 3 };

function modoGuardado() {
  try { return localStorage.getItem("tk-mis-modo") || "tablero"; } catch { return "tablero"; }
}

export async function render(cont, _partes, params) {
  const busqueda = location.hash.startsWith("#/buscar") ? (params.get("q") || "").trim() : null;
  let modo = busqueda !== null ? "lista" : modoGuardado();
  let tickets = [];
  const zona = h("div", esqueletos(4));
  const resumen = h("span.sub");

  const pestanas = h("div.pestanas");
  const pintarPestanas = () => vaciar(pestanas,
    [["tablero", "▥ Tablero"], ["lista", "☰ Lista"]].map(([id, texto]) => h("button", {
      class: modo === id ? "activo" : "",
      onclick: () => {
        modo = id;
        try { localStorage.setItem("tk-mis-modo", id); } catch { /* sin almacenamiento */ }
        pintarPestanas();
        pintar();
      },
    }, texto)));
  pintarPestanas();

  vaciar(cont,
    h("div.encabezado",
      h("div",
        h("h1", busqueda !== null ? `Resultados para “${busqueda}”` : "Mis tickets"),
        resumen),
      busqueda === null && h("div.acciones", pestanas)),
    zona);

  const cargar = async () => {
    try {
      tickets = busqueda !== null
        ? await api.listar({ q: busqueda, orden: "actualizado", limite: 100 })
        : await api.listar({ asignado: "yo", abiertos: true });
      pintar();
    } catch (e) {
      error(e, "No se cargaron los tickets");
    }
  };

  const grupos = () => {
    const hoy = fechaLocal(hoyIso());
    const dias = (t) => (fechaLocal(t.vence) - hoy) / 86400000;
    return [
      { nombre: "Vencidos", color: "#f87171", filtro: (t) => t.vence && dias(t) < 0 },
      { nombre: "Hoy", color: "#ffb547", filtro: (t) => t.vence && dias(t) === 0 },
      { nombre: "Próximos 7 días", color: "#0983d6", filtro: (t) => t.vence && dias(t) > 0 && dias(t) <= 7 },
      { nombre: "Después", color: "#7cc4f5", filtro: (t) => t.vence && dias(t) > 7 },
      { nombre: "Sin fecha", color: "#6f6f6f", filtro: (t) => !t.vence },
    ].map((g) => ({
      ...g,
      tickets: tickets.filter(g.filtro).sort((a, b) => (a.vence || "").localeCompare(b.vence || "") || PESO_PRIO[a.prioridad] - PESO_PRIO[b.prioridad]),
    }));
  };

  let pintadas = 0;
  const pintar = () => {
    // La animación de entrada solo la primera vez (no en cada actualización en vivo).
    zona.classList.toggle("sin-animacion", pintadas++ > 0);
    if (busqueda === null) {
      const vencidos = tickets.filter((t) => t.vence && fechaLocal(t.vence) < fechaLocal(hoyIso())).length;
      vaciar(resumen, tickets.length
        ? `${tickets.length} abiertos asignados a ti${vencidos ? ` · ${vencidos} vencido${vencidos > 1 ? "s" : ""}` : ""}`
        : "");
    }
    if (!tickets.length) {
      return vaciar(zona, h("div.tarjeta.vacio",
        h("span.grande", busqueda !== null ? "⌕" : "✓"),
        h("strong", busqueda !== null ? "No encontré tickets con ese texto" : "No tienes tickets abiertos"),
        busqueda === null && "Cuando te asignen uno aparecerá aquí."));
    }
    if (modo === "tablero") {
      return vaciar(zona, h("div.tablero.ajustado.escalonado", grupos().map((g) => h("div.columna",
        h("div.columna-cab", { style: { "--c": g.color } },
          h("span.estado-pill", { style: { "--c": g.color } }, g.nombre), h("span.cuenta", g.tickets.length)),
        h("div.columna-cuerpo",
          g.tickets.length ? g.tickets.map(carta) : h("div.vacio.dim", "Nada aquí"))))));
    }
    if (busqueda !== null) return vaciar(zona, tabla(tickets));
    vaciar(zona, h("div.escalonado", grupos().filter((g) => g.tickets.length).map((g) => h("div.grupo-simple",
      h("div.grupo-cab", h("span.estado-pill", { style: { "--c": g.color } }, g.nombre), h("span.cuenta", g.tickets.length)),
      tabla(g.tickets)))));
  };

  await cargar();
  return escuchar("mis", ["tk_asignados", "tk_tickets"], debounce(cargar, 600));
}

// Tarjeta de ticket (tablero de "Mis tickets").
function carta(t) {
  const a = area(t.area_id);
  const total = t.checklist.total;
  return h("div.carta", { style: { "--franja": COLOR_PRIO[t.prioridad] }, onclick: () => verTicket(t.numero) },
    h("div.arriba",
      h("span.num", "T-" + t.numero),
      chipEstado(estado(t.estado_id)),
      a && h("span.chip.area-carta", h("span.bola", { style: { background: a.color } }), a.nombre)),
    h("div.titulo", t.titulo),
    t.etiquetas.length > 0 && h("div.arriba", t.etiquetas.map((id) => etiqueta(id)).filter(Boolean).map((x) => chipEtiqueta(x))),
    h("div.pie",
      t.prioridad !== "normal" && h("span.prio", { class: t.prioridad }, nombrePrioridad(t.prioridad)),
      chipFecha(t.vence, t.cerrado),
      total > 0 && h("span.meta", h("span.mini-barra", h("i", { style: { width: `${(t.checklist.hechos / total) * 100}%` } })), `${t.checklist.hechos}/${total}`),
      t.comentarios > 0 && h("span.meta", `💬 ${t.comentarios}`),
      avatares(t.asignados, persona)));
}

export function tabla(tickets, { mostrarArea = true } = {}) {
  return h("div.grupo.tabla-wrap", h("table.tabla", h("tbody", tickets.map((t) => {
    const a = area(t.area_id);
    return h("tr.ticket", { class: t.cerrado ? "cerrado" : "", style: { "--franja": COLOR_PRIO[t.prioridad] }, onclick: () => verTicket(t.numero) },
      h("td.titulo-celda",
        h("div.fila", { style: { gap: "10px", flexWrap: "nowrap" } }, h("span.num", "T-" + t.numero), h("span.t", t.titulo)),
        mostrarArea && a && h("div.debajo", h("span.chip", h("span.bola", { style: { background: a.color } }), a.nombre))),
      h("td", chipEstado(estado(t.estado_id))),
      h("td.opcional", avatares(t.asignados, persona)),
      h("td", h("span.prio", { class: t.prioridad }, nombrePrioridad(t.prioridad))),
      h("td.opcional", chipFecha(t.vence, t.cerrado) || h("span.dim", "—")));
  }))));
}
