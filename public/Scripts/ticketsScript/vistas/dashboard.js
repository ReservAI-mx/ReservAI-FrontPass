// Dashboard: métricas por área (o de todas mis áreas), gráficas y resumen con IA.
import { h, vaciar, error, esqueletos, puntos, duracion, nombrePrioridad, chipFecha, haceCuanto, PRIORIDADES } from "../ui.js";
import { api, consulta, areaPorClave, persona, misAreas, escuchar } from "../datos.js";
import { verTicket, cambiarParam } from "../rutas.js";
import { llamarIA } from "../ia.js";

// Paleta categórica validada para fondo oscuro (#1A1A1A), azul de la marca primero.
// El rojo queda reservado para "vencido" (estado), nunca como serie.
const SERIE = ["#0983d6", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
const VENCIDO = "#ff8484";

let cargaChart = null;
export function cargarChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  cargaChart ??= new Promise((resolver, rechazar) => {
    const s = document.createElement("script");
    s.src = "/static/Scripts/ticketsScript/vendor/chart-4.5.1.umd.min.js";
    s.onload = () => {
      const C = window.Chart;
      C.defaults.color = "#A0A0A0";
      C.defaults.borderColor = "#2a2a2a";
      C.defaults.font.family = "\"Segoe UI\", system-ui, sans-serif";
      C.defaults.plugins.tooltip.backgroundColor = "#1A1A1A";
      C.defaults.plugins.tooltip.borderColor = "#3a3a3a";
      C.defaults.animation.duration = 600;
      C.defaults.plugins.tooltip.borderWidth = 1;
      C.defaults.plugins.tooltip.padding = 10;
      C.defaults.plugins.legend.labels.boxWidth = 10;
      C.defaults.plugins.legend.labels.boxHeight = 10;
      resolver(C);
    };
    s.onerror = rechazar;
    document.head.appendChild(s);
  });
  return cargaChart;
}

export async function render(cont, _partes, params) {
  const a = params.get("area") ? areaPorClave(params.get("area")) : null;
  const dias = Number(params.get("dias")) || 30;
  const graficas = [];
  const zona = h("div", esqueletos(4));

  vaciar(cont,
    h("div.encabezado",
      h("h1", "Dashboard"),
      h("div.acciones",
        h("select", { onchange: (e) => cambiarParam("area", e.target.value) },
          h("option", { value: "" }, "Todas mis áreas"),
          misAreas().map((x) => h("option", { value: x.clave, selected: a?.id === x.id }, x.nombre))),
        h("select", { onchange: (e) => cambiarParam("dias", e.target.value) },
          [[7, "Últimos 7 días"], [30, "Últimos 30 días"], [90, "Últimos 90 días"]].map(([v, t]) =>
            h("option", { value: v, selected: dias === v }, t))))),
    zona);

  const destruir = () => { graficas.splice(0).forEach((g) => g.destroy()); };

  const cargar = async () => {
    try {
      const [m, Chart] = await Promise.all([
        api("/metricas" + consulta({ area: a?.id, dias })),
        cargarChart(),
      ]);
      destruir();
      pintar(m, Chart);
    } catch (e) {
      error(e, "No se cargó el dashboard");
    }
  };

  const pintar = (m, Chart) => {
    const kpi = (etq, valor, sub, clase) => h("div.tarjeta", { class: clase || "" },
      h("div.etq", etq), h("div.valor", valor), sub && h("div.sub", sub));
    const ciclo = m.horas_ciclo === null ? "—" : m.horas_ciclo >= 48 ? `${(m.horas_ciclo / 24).toFixed(1)} d` : `${m.horas_ciclo} h`;

    // Cada gráfica tiene su vista de tabla para quien no lee la gráfica.
    const tarjetaGrafica = (titulo, config, filas, encabezados, ancha = false) => {
      const canvas = h("canvas");
      const tablaVista = h("div.tabla-wrap.oculto", h("table.tabla",
        h("thead", h("tr", encabezados.map((x) => h("th", x)))),
        h("tbody", filas.map((f) => h("tr", f.map((c) => h("td", c)))))));
      const boton = h("button.btn.fantasma.chico", "Ver tabla");
      boton.addEventListener("click", () => {
        const verTabla = tablaVista.classList.toggle("oculto") === false;
        canvas.parentElement.classList.toggle("oculto", verTabla);
        boton.textContent = verTabla ? "Ver gráfica" : "Ver tabla";
      });
      const caja = h("div.tarjeta.grafica", { class: ancha ? "ancha" : "" },
        h("div.fila.espaciada", h("h3", titulo), boton),
        h("div", { style: { position: "relative", height: "240px" } }, canvas),
        tablaVista);
      if (!filas.length) {
        vaciar(caja, h("h3", titulo), h("div.vacio", "Sin datos en este periodo."));
        return caja;
      }
      pendientes.push([canvas, config]);
      return caja;
    };
    // Las gráficas se crean cuando el canvas ya está en la página (ver final de pintar).
    const pendientes = [];

    const ejes = (apilado = false, horizontal = false) => ({
      responsive: true, maintainAspectRatio: false,
      indexAxis: horizontal ? "y" : "x",
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked: apilado, grid: { display: horizontal }, ticks: { precision: 0 } },
        y: { stacked: apilado, grid: { display: !horizontal }, ticks: { precision: 0 }, beginAtZero: true },
      },
    });
    const barra = { borderRadius: 4, borderSkipped: "start", maxBarThickness: 28, borderWidth: 0 };
    // Líneas de 2px con marcadores de 8px y relleno suave solo en la serie única.
    const linea = (color, relleno = false) => ({
      borderColor: color, backgroundColor: color, borderWidth: 2, tension: 0.3,
      pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: color, pointBorderColor: "#161616", pointBorderWidth: 2,
      fill: relleno ? { target: "origin", above: color + "22" } : false,
    });
    const ejesLinea = { ...ejes(), scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } };

    const semanas = m.por_semana.map((s) => {
      const f = new Date(s.semana + "T12:00:00");
      return `${f.getDate()}/${f.getMonth() + 1}`;
    });
    const nombre = (id) => persona(id)?.nombre || "—";

    vaciar(zona,
      h("div.kpi.escalonado",
        kpi("Abiertos", m.abiertos, "Sin contar subtareas", "destacada"),
        kpi("Vencidos", m.vencidos, m.vencidos ? "Requieren atención" : "Todo al día", m.vencidos > 0 ? "alerta" : "bien"),
        kpi("Vencen esta semana", m.vencen_semana),
        kpi("Sin responsable", m.sin_asignar, null, m.sin_asignar > 0 ? "alerta" : ""),
        kpi(`Creados (${dias} d)`, m.creados),
        kpi(`Terminados (${dias} d)`, m.cerrados),
        kpi("Tiempo promedio para terminar", ciclo),
        kpi("Solicitudes abiertas", m.solicitudes_abiertas)),
      resumenIA(a, dias),
      h("div.graficas.escalonado",
        tarjetaGrafica("Creados vs terminados por semana", {
          type: "line",
          data: {
            labels: semanas, datasets: [
              { label: "Creados", data: m.por_semana.map((s) => s.creados), ...linea(SERIE[0]) },
              { label: "Terminados", data: m.por_semana.map((s) => s.cerrados), ...linea(SERIE[2]) },
            ],
          },
          options: { ...ejesLinea, plugins: { legend: { position: "top", align: "end" } } },
        }, m.por_semana.map((s, i) => [semanas[i], s.creados, s.cerrados]), ["Semana", "Creados", "Terminados"]),

        tarjetaGrafica("Pendiente al cierre de cada semana", {
          type: "line",
          data: { labels: semanas, datasets: [{ label: "Abiertos", data: m.por_semana.map((s) => s.abiertos ?? 0), ...linea(SERIE[0], true) }] },
          options: { ...ejesLinea, plugins: { legend: { display: false } } },
        }, m.por_semana.map((s, i) => [semanas[i], s.abiertos ?? 0]), ["Semana", "Abiertos"]),

        tarjetaGrafica("Abiertos por estado", {
          type: "bar",
          data: {
            labels: m.por_estado.map((x) => (a ? x.estado : `${x.area} · ${x.estado}`)),
            datasets: [{ label: "Tickets", data: m.por_estado.map((x) => x.total), backgroundColor: m.por_estado.map((x) => x.color), ...barra }],
          },
          options: { ...ejes(false, true), plugins: { legend: { display: false } } },
        }, m.por_estado.map((x) => [a ? x.estado : `${x.area} · ${x.estado}`, x.total]), ["Estado", "Tickets"]),

        tarjetaGrafica("Carga por persona (abiertos)", {
          type: "bar",
          data: {
            labels: m.por_persona.map((x) => nombre(x.persona_id)),
            datasets: [
              { label: "Al día", data: m.por_persona.map((x) => x.abiertos - x.vencidos), backgroundColor: SERIE[0], ...barra },
              { label: "Vencidos", data: m.por_persona.map((x) => x.vencidos), backgroundColor: VENCIDO, ...barra },
            ],
          },
          options: { ...ejes(true, true), plugins: { legend: { position: "top", align: "end" } } },
        }, m.por_persona.map((x) => [nombre(x.persona_id), x.abiertos, x.vencidos, x.cerrados]), ["Persona", "Abiertos", "Vencidos", `Terminados (${dias} d)`]),

        tarjetaGrafica("Abiertos por prioridad", {
          type: "bar",
          data: {
            labels: PRIORIDADES.map((p) => p.nombre),
            datasets: [{ label: "Tickets", data: PRIORIDADES.map((p) => m.por_prioridad[p.id] || 0), backgroundColor: SERIE[0], ...barra }],
          },
          options: { ...ejes(), plugins: { legend: { display: false } } },
        }, Object.keys(m.por_prioridad).length ? PRIORIDADES.map((p) => [p.nombre, m.por_prioridad[p.id] || 0]) : [], ["Prioridad", "Tickets"]),

        tarjetaGrafica(`Tiempo registrado (${dias} d)`, {
          type: "bar",
          data: {
            labels: m.tiempo_persona.map((x) => nombre(x.persona_id)),
            datasets: [{ label: "Horas", data: m.tiempo_persona.map((x) => +(x.minutos / 60).toFixed(1)), backgroundColor: SERIE[5], ...barra }],
          },
          options: { ...ejes(false, true), plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${duracion(c.raw * 60)}` } } } },
        }, m.tiempo_persona.map((x) => [nombre(x.persona_id), duracion(x.minutos)]), ["Persona", "Tiempo"]),

        tarjetaGrafica(`Solicitudes recibidas por área de origen (${dias} d)`, {
          type: "bar",
          data: {
            labels: m.solicitudes_origen.map((x) => x.area),
            datasets: [{ label: "Solicitudes", data: m.solicitudes_origen.map((x) => x.total), backgroundColor: SERIE[1], ...barra }],
          },
          options: { ...ejes(false, true), plugins: { legend: { display: false } } },
        }, m.solicitudes_origen.map((x) => [x.area, x.total]), ["Área", "Solicitudes"])),

      m.mas_vencidos.length > 0 && h("div.grupo-simple",
        h("div.grupo-cab", h("h3", "Lo más vencido")),
        h("div.grupo.tabla-wrap", h("table.tabla", h("tbody", m.mas_vencidos.map((t) =>
          h("tr.ticket", { onclick: () => verTicket(t.numero) },
            h("td", h("span.num", "T-" + t.numero)),
            h("td.titulo-celda", h("span.t", t.titulo)),
            h("td", h("span.prio", { class: t.prioridad }, nombrePrioridad(t.prioridad))),
            h("td", chipFecha(t.vence, null)))))))));
    for (const [canvas, config] of pendientes) graficas.push(new Chart(canvas, config));
  };

  await cargar();
  const dejar = escuchar("dashboard", ["tk_tickets"], (() => { let t; return () => { clearTimeout(t); t = setTimeout(cargar, 1500); }; })());
  return () => { dejar(); destruir(); };
}

// Último resumen guardado del área + botón para generar uno nuevo.
function resumenIA(a, dias) {
  const caja = h("div.caja-ia", { style: { marginBottom: "18px" } }, h("div.cargando-ia", puntos(), " Buscando el último resumen"));
  const pintar = (r) => {
    const boton = h("button.btn.ia.chico", r ? "✦ Actualizar resumen" : "✦ Generar resumen");
    boton.addEventListener("click", async () => {
      boton.disabled = true;
      vaciar(caja, h("div.cab-ia", "✦ Resumen del periodo"), h("div.cargando-ia", puntos(), " Revisando los tickets"));
      try {
        const { resumen } = await llamarIA("resumen_area", { area_id: a?.id ?? null, dias: Math.min(dias, 30) });
        pintar({ texto: resumen, creado: new Date().toISOString() });
      } catch (e) {
        error(e, "IA");
        pintar(r);
      }
    });
    vaciar(caja,
      h("div.fila.espaciada", h("div.cab-ia", "✦ Resumen del periodo" + (a ? " · " + a.nombre : "")),
        h("div.fila", r && h("span.dim", haceCuanto(r.creado)), boton)),
      r ? h("div.texto", r.texto) : h("div.muted", "Todavía no hay resumen. La IA lee los números y los tickets del periodo y te dice logros, riesgos y qué atender."));
  };
  api("/resumenes/ultimo" + consulta({ area: a?.id }), { silencioso: true })
    .then((r) => pintar(r.resumen)).catch(() => pintar(null));
  return caja;
}
