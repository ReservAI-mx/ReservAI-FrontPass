// Reporte de tiempo por persona, área y ticket, con exportación a CSV.
import { h, vaciar, error, duracion, avatar, isoDia, descargarCsv, fechaHora } from "../ui.js";
import { api, consulta, datos, area, persona, misAreas, esAdmin } from "../datos.js";
import { verTicket } from "../rutas.js";

export async function render(cont) {
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const desde = h("input", { type: "date", value: isoDia(lunes) });
  const hasta = h("input", { type: "date", value: isoDia(hoy) });
  const areaSel = h("select", h("option", { value: "" }, "Todas mis áreas"),
    misAreas().map((a) => h("option", { value: a.id }, a.nombre)));
  const personaSel = h("select",
    h("option", { value: datos.yo.id }, "Solo yo"),
    h("option", { value: "" }, "Todas las personas"),
    datos.personas.filter((p) => p.id !== datos.yo.id).map((p) => h("option", { value: p.id }, p.nombre)));
  const zona = h("div");
  let filas = [];

  const cargar = async () => {
    try {
      filas = (await api("/tiempo" + consulta({
        desde: new Date(desde.value + "T00:00:00").toISOString(),
        hasta: new Date(new Date(hasta.value + "T00:00:00").getTime() + 86400000).toISOString(),
        area: areaSel.value,
        persona: personaSel.value,
      }))).tiempo;
      pintar();
    } catch (e) {
      error(e, "No se cargó el tiempo");
    }
  };

  const sumar = (clave) => {
    const m = new Map();
    for (const f of filas) m.set(f[clave], (m.get(f[clave]) || 0) + f.minutos);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const pintar = () => {
    const total = filas.reduce((s, f) => s + f.minutos, 0);
    const porTicket = new Map();
    for (const f of filas) {
      const x = porTicket.get(f.ticket_id) || { numero: f.numero, titulo: f.titulo, area_id: f.area_id, minutos: 0 };
      x.minutos += f.minutos;
      porTicket.set(f.ticket_id, x);
    }
    vaciar(zona,
      h("div.kpi",
        h("div.tarjeta", h("div.muted", "Total"), h("div.valor", duracion(total))),
        h("div.tarjeta", h("div.muted", "Registros"), h("div.valor", filas.length)),
        h("div.tarjeta", h("div.muted", "Tickets"), h("div.valor", porTicket.size))),
      !filas.length ? h("div.vacio", "No hay tiempo registrado en ese periodo.") : [
        h("div.rejilla-2",
          h("div.grupo", h("div.grupo-cab", { style: { cursor: "default" } }, h("h3", "Por persona")),
            h("table.tabla", h("tbody", sumar("persona_id").map(([id, m]) =>
              h("tr", h("td", h("span.fila", avatar(persona(id)), persona(id)?.nombre || "—")), h("td", duracion(m))))))),
          h("div.grupo", h("div.grupo-cab", { style: { cursor: "default" } }, h("h3", "Por área")),
            h("table.tabla", h("tbody", sumar("area_id").map(([id, m]) =>
              h("tr", h("td", area(id)?.nombre || "—"), h("td", duracion(m)))))))),
        h("div.grupo", h("div.grupo-cab", { style: { cursor: "default" } }, h("h3", "Por ticket")),
          h("table.tabla", h("tbody", [...porTicket.values()].sort((a, b) => b.minutos - a.minutos).map((x) =>
            h("tr.ticket", { onclick: () => verTicket(x.numero) },
              h("td", h("span.num", "T-" + x.numero)), h("td.titulo-celda", x.titulo),
              h("td.opcional", area(x.area_id)?.nombre || ""), h("td", duracion(x.minutos))))))),
      ]);
  };

  const exportar = () => descargarCsv(`tiempo-${desde.value}-a-${hasta.value}.csv`, [
    ["Fecha", "Persona", "Área", "Ticket", "Título", "Minutos", "Horas", "Nota"],
    ...filas.slice().reverse().map((f) => [
      fechaHora(f.inicio), persona(f.persona_id)?.nombre || "", area(f.area_id)?.nombre || "",
      "T-" + f.numero, f.titulo, f.minutos, (f.minutos / 60).toFixed(2), f.nota,
    ]),
  ]);

  for (const control of [desde, hasta, areaSel, personaSel]) control.addEventListener("change", cargar);
  vaciar(cont,
    h("div.encabezado", h("h1", "Tiempo"),
      h("div.acciones", h("button.btn", { onclick: exportar }, "Exportar CSV"))),
    h("div.filtros",
      h("label.chk", "Desde", desde), h("label.chk", "Hasta", hasta), areaSel, personaSel),
    !esAdmin() && h("p.dim", "Ves el tiempo de los tickets de tus áreas y el tuyo."),
    zona);
  await cargar();
}
