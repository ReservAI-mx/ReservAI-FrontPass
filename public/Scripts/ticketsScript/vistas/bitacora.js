// Ventas → Bitácora: leads, encargados, prospectos, clientes y comisiones que vienen
// de la Bitácora de calle (bitacora.visitas en la base del pass). El vendedor ve
// sus visitas y el admin todas. Solo lectura: la Bitácora es la fuente; aquí se
// ve y se convierte en tickets.
import {
  h, vaciar, error, toast, modal, esqueletos, fechaCorta, claseVence, hoyIso, debounce, isoDia,
} from "../ui.js";
import { api, datos, esAdmin, puedeEditar, escuchar } from "../datos.js";
import { verTicket } from "../rutas.js";
import { cargarChart } from "./dashboard.js";
import { icono } from "../iconos.js";

const CERRADO = "Cerrado";
// Mismos resultados "en juego" que usa la Bitácora para contar prospectos.
const EN_JUEGO = ["Interés bajo (recontactar)", "Demo hecha", "Propuesta enviada", "En negociación", "Reagendar visita"];
const ORDEN = ["Reagendar visita", "Interés bajo (recontactar)", "Demo hecha", "Propuesta enviada", "En negociación", CERRADO, "No interesado"];
const COLOR = {
  "Reagendar visita": "#7cc4f5", "Interés bajo (recontactar)": "#a0a0a0", "Demo hecha": "#0983d6",
  "Propuesta enviada": "#9085e9", "En negociación": "#ffb547", [CERRADO]: "#6fcf73", "No interesado": "#f87171",
};
const pesos = (n) => "$" + Math.round(n || 0).toLocaleString("es-MX");
const si = (v) => /^s[ií]/i.test(String(v || ""));

export async function render(zona, a) {
  let leads = [], perfiles = [], regla = { tipo: "fijo", monto: 500 }, vinculados = [];
  const filtros = { dias: "90", vendedor: "", texto: "" };
  const contenido = h("div", esqueletos(5));
  // Comisión por cliente cerrado: monto fijo único (lo de hoy: $500) o una parte del MRR.
  const comision = (l) => regla.tipo === "mrr"
    ? (Number(l.mrr) || 0) * (Number(regla.meses) || 0) * (Number(regla.porcentaje) || 0) / 100
    : Number(regla.monto) || 0;
  const describirRegla = () => regla.tipo === "mrr"
    ? `${regla.meses} mes(es) de MRR al ${regla.porcentaje}%`
    : `${pesos(regla.monto)} por cliente cerrado (pago único)`;
  const nombreVendedor = (l) => perfiles.find((p) => p.id === l.vendedor)?.nombre || l.visitador || "—";

  const cargar = async () => {
    try {
      const b = await api("/bitacora");
      leads = b.visitas.filter((l) => !l.archivada);
      perfiles = b.vendedores;
      if (b.regla) regla = b.regla;
      vinculados = b.vinculados;
      pintar();
    } catch (e) {
      error(e, "No se cargó la Bitácora");
    }
  };

  const filtrados = () => {
    const desde = filtros.dias === "todo" ? null : isoDia(new Date(Date.now() - Number(filtros.dias) * 86400000));
    const texto = filtros.texto.toLowerCase();
    return leads.filter((l) =>
      (!desde || (l.fecha || "") >= desde || (l.f_cierre || "") >= desde) &&
      (!filtros.vendedor || l.vendedor === filtros.vendedor) &&
      (!texto || [l.negocio, l.giro, l.municipio, l.contacto, l.colonia].some((x) => String(x || "").toLowerCase().includes(texto))));
  };

  let pintadas = 0;
  const pintar = () => {
    // La animación de entrada solo la primera vez (no en cada actualización en vivo).
    contenido.classList.toggle("sin-animacion", pintadas++ > 0);
    const lista = filtrados();
    if (!leads.length) {
      return vaciar(contenido, h("div.tarjeta.vacio", h("span.grande", "◎"), h("strong", "Todavía no hay visitas que puedas ver"),
        "Aquí aparecen las visitas que capturan los vendedores en la Bitácora."));
    }
    const hoy = hoyIso();
    const cerrados = lista.filter((l) => l.resultado === CERRADO);
    const enJuego = lista.filter((l) => EN_JUEGO.includes(l.resultado));
    const vencidos = enJuego.filter((l) => l.f_seguimiento && l.f_seguimiento < hoy);
    const mrr = cerrados.reduce((s, l) => s + (Number(l.mrr) || 0), 0);
    const kpi = (etq, valor, sub, clase) => h("div.tarjeta", { class: clase || "" }, h("div.etq", etq), h("div.valor", valor), sub && h("div.sub", sub));

    const embudo = [
      ["Visitas", lista.length],
      ["Habló con el decisor", lista.filter((l) => si(l.decisor)).length],
      ["Demo", lista.filter((l) => si(l.demo)).length],
      ["Propuesta", lista.filter((l) => si(l.propuesta) || l.f_propuesta).length],
      ["Cerrados", cerrados.length],
    ];
    const canvas = h("canvas");
    vaciar(contenido,
      h("div.kpi.escalonado",
        kpi("Visitas", lista.length, filtros.dias === "todo" ? "Desde el inicio" : `Últimos ${filtros.dias} días`, "destacada"),
        kpi("Prospectos en juego", enJuego.length),
        kpi("Seguimientos vencidos", vencidos.length, vencidos.length ? "Hay que recontactar" : "Al día", vencidos.length ? "alerta" : "bien"),
        kpi("Clientes cerrados", cerrados.length, lista.length ? `${Math.round((cerrados.length / lista.length) * 100)}% de las visitas` : null),
        kpi("MRR cerrado", pesos(mrr), cerrados.length ? `${pesos(mrr / cerrados.length)} por cliente` : null),
        kpi("Comisiones", pesos(cerrados.reduce((s, l) => s + comision(l), 0)), describirRegla())),
      h("div.graficas",
        h("div.tarjeta.grafica",
          h("h3", "Embudo de ventas"),
          h("div", { style: { position: "relative", height: "220px" } }, canvas)),
        h("div.tarjeta.grafica",
          h("div.fila.espaciada", h("h3", "Seguimientos (vencidos y próximos)"), h("span.cuenta", enJuego.filter((l) => l.f_seguimiento).length)),
          h("div", { style: { maxHeight: "220px", overflowY: "auto", display: "grid", gap: "6px" } },
            enJuego.filter((l) => l.f_seguimiento).sort((x, y) => x.f_seguimiento.localeCompare(y.f_seguimiento)).slice(0, 30).map((l) =>
              h("div.check-item", { style: { cursor: "pointer" }, onclick: () => detalle(l) },
                h("span.fecha", { class: claseVence(l.f_seguimiento) }, "◷ " + fechaCorta(l.f_seguimiento)),
                h("span", h("b", l.negocio || "—"), h("span.dim", " · " + nombreVendedor(l))),
                h("span.estado-pill", { style: { "--c": COLOR[l.resultado] || "#a0a0a0", marginLeft: "auto" } }, l.resultado)))))),
      h("div.grupo-simple", h("div.grupo-cab", h("h3", "Leads por etapa"), h("span.cuenta", lista.length)),
        h("div.tablero.escalonado", [...ORDEN, ...new Set(lista.map((l) => l.resultado).filter((r) => r && !ORDEN.includes(r)))].map((etapa) => {
          const col = lista.filter((l) => (l.resultado || "Sin resultado") === etapa);
          return h("div.columna",
            h("div.columna-cab", { style: { "--c": COLOR[etapa] || "#6f6f6f" } },
              h("span.estado-pill", { style: { "--c": COLOR[etapa] || "#a0a0a0" } }, etapa), h("span.cuenta", col.length)),
            h("div.columna-cuerpo", col.length ? col.slice(0, 60).map((l) => cartaLead(l)) : h("div.vacio.dim", "Nada aquí")));
        }))),
      h("div.rejilla-2", { style: { alignItems: "start" } },
        h("div.grupo-simple", h("div.grupo-cab", h("h3", "Por encargado")),
          h("div.grupo.tabla-wrap", h("table.tabla",
            h("thead", h("tr", h("th", "Vendedor"), h("th", "Visitas"), h("th", "En juego"), h("th", "Cerrados"), h("th", "MRR"), h("th", "Comisión"))),
            h("tbody", porVendedor(lista).map((x) => h("tr", { style: { cursor: "pointer" }, onclick: () => { filtros.vendedor = x.id || ""; pintarFiltros(); pintar(); } },
              h("td", h("b", x.nombre)), h("td", x.visitas), h("td", x.enJuego), h("td", x.cerrados),
              h("td", pesos(x.mrr)), h("td", pesos(x.comision)))))))),
        h("div.grupo-simple", h("div.grupo-cab", h("h3", "Clientes cerrados"), h("span.cuenta", cerrados.length)),
          h("div.grupo.tabla-wrap", h("table.tabla",
            h("thead", h("tr", h("th", "Negocio"), h("th", "Plan"), h("th", "MRR"), h("th", "Cierre"), h("th", "Implementación"))),
            h("tbody", cerrados.length ? cerrados.sort((x, y) => (y.f_cierre || "").localeCompare(x.f_cierre || "")).map((l) => h("tr.ticket", { onclick: () => detalle(l) },
              h("td.titulo-celda", h("span.t", l.negocio || "—"), h("div.dim", { style: { fontSize: ".8rem" } }, nombreVendedor(l))),
              h("td", l.plan_contratado || "—"), h("td", pesos(l.mrr)),
              h("td", l.f_cierre ? fechaCorta(l.f_cierre) : "—"),
              h("td", l.f_implementacion ? h("span.fecha", { class: claseVence(l.f_implementacion) }, fechaCorta(l.f_implementacion)) : h("span.dim", "Sin fecha"))))
              : h("tr", h("td.vacio", { colspan: 5 }, "Todavía no hay cierres en este periodo."))))))));
    cargarChart().then((Chart) => {
      new Chart(canvas, {
        type: "bar",
        data: { labels: embudo.map((x) => x[0]), datasets: [{ label: "Leads", data: embudo.map((x) => x[1]), backgroundColor: "#0983d6", borderRadius: 4, borderSkipped: "start", maxBarThickness: 26 }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw} (${embudo[0][1] ? Math.round((c.raw / embudo[0][1]) * 100) : 0}% de las visitas)` } } },
          scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } },
        },
      });
    });
  };

  const porVendedor = (lista) => {
    const m = new Map();
    for (const l of lista) {
      const id = l.vendedor || l.visitador;
      const x = m.get(id) || { id: l.vendedor, nombre: nombreVendedor(l), visitas: 0, enJuego: 0, cerrados: 0, mrr: 0, comision: 0 };
      x.visitas++;
      if (EN_JUEGO.includes(l.resultado)) x.enJuego++;
      if (l.resultado === CERRADO) { x.cerrados++; x.mrr += Number(l.mrr) || 0; x.comision += comision(l); }
      m.set(id, x);
    }
    return [...m.values()].sort((x, y) => y.mrr - x.mrr || y.cerrados - x.cerrados || y.visitas - x.visitas);
  };

  const cartaLead = (l) => h("div.carta", { onclick: () => detalle(l), style: { "--franja": COLOR[l.resultado] || "transparent" } },
    h("div.arriba", h("span.chip", l.giro || "Sin giro"), l.municipio && h("span.dim", { style: { fontSize: ".78rem" } }, l.municipio)),
    h("div.titulo", l.negocio || "Sin nombre"),
    h("div.pie",
      l.interes ? h("span.meta", { title: "Interés" }, "★".repeat(Math.min(5, l.interes)) + "☆".repeat(Math.max(0, 5 - l.interes))) : null,
      l.mrr ? h("span.meta", pesos(l.mrr) + "/mes") : null,
      l.f_seguimiento && l.resultado !== CERRADO && h("span.fecha", { class: claseVence(l.f_seguimiento) }, "◷ " + fechaCorta(l.f_seguimiento)),
      h("span.chip", { style: { marginLeft: "auto" } }, nombreVendedor(l).split(" ")[0])));

  // Detalle del lead + crear un ticket vinculado (seguimiento, implementación, etc.).
  const detalle = (l) => {
    const campo = (k, v) => v !== null && v !== undefined && v !== "" && h("div.prop", h("div.k", k), h("div.valor", String(v)));
    const tickets = vinculados.filter((t) => t.origen_nodo === l.id);
    const editables = datos.areas.filter((x) => !x.archivada && puedeEditar(x.id));
    modal(l.negocio || "Lead", (cerrar) => [
      h("div.cuerpo",
        h("div.fila", h("span.estado-pill", { style: { "--c": COLOR[l.resultado] || "#a0a0a0" } }, l.resultado || "Sin resultado"),
          h("span.chip", "Encargado: " + nombreVendedor(l)), l.fecha && h("span.dim", "Visita " + fechaCorta(l.fecha))),
        h("div.rejilla-2",
          h("div.props", campo("Giro", l.giro), campo("Municipio", [l.municipio, l.colonia].filter(Boolean).join(", ")), campo("Dirección", l.direccion),
            campo("Contacto", [l.contacto, l.puesto].filter(Boolean).join(" · ")), campo("Teléfono", l.telefono), campo("Instagram", l.instagram),
            campo("Sistema actual", l.sistema), campo("Sucursales", l.sucursales)),
          h("div.props", campo("Interés (1-5)", l.interes), campo("Habló con el decisor", l.decisor), campo("Demo", l.demo),
            campo("Propuesta", l.propuesta), campo("Plan sugerido", l.plan_sugerido), campo("Objeción", l.objecion),
            campo("Siguiente seguimiento", l.f_seguimiento && fechaCorta(l.f_seguimiento)), campo("Seguimientos hechos", l.n_seguimientos),
            campo("Plan contratado", l.plan_contratado), campo("MRR", l.mrr && pesos(l.mrr)),
            l.resultado === CERRADO && campo("Comisión", pesos(comision(l))),
            campo("Implementación", l.f_implementacion && fechaCorta(l.f_implementacion)), campo("Motivo de pérdida", l.motivo_perdida))),
        l.notas && h("div.descripcion-vista", l.notas),
        h("div.seccion", h("h3", "Tickets de este lead"),
          tickets.length ? tickets.map((t) => h("a", { href: "#", onclick: (e) => { e.preventDefault(); cerrar(); verTicket(t.numero); } }, `T-${t.numero} · ${t.titulo}${t.cerrado ? " (terminado)" : ""}`))
            : h("div.dim", "Ninguno todavía."))),
      h("div.pie",
        h("button.btn", { onclick: () => cerrar() }, "Cerrar"),
        // Un lead tiene a lo más un ticket ligado (índice único en la base).
        editables.length > 0 && !tickets.length && h("button.btn.primario", {
          onclick: async () => {
            cerrar();
            const destino = editables.find((x) => x.clave === (l.resultado === CERRADO ? "admin" : "ventas")) || editables[0];
            const { nuevoTicket } = await import("./area.js");
            nuevoTicket(destino, cargar, {
              titulo: l.resultado === CERRADO ? `Implementar a ${l.negocio}` : `Seguimiento a ${l.negocio}`,
              descripcion: [
                `Lead de la Bitácora (${nombreVendedor(l)}).`,
                l.contacto && `Contacto: ${l.contacto}${l.telefono ? " · " + l.telefono : ""}`,
                l.plan_contratado && `Plan: ${l.plan_contratado} · MRR ${pesos(l.mrr)}`,
                l.objecion && `Objeción: ${l.objecion}`, l.notas && `Notas: ${l.notas}`,
              ].filter(Boolean).join("\n"),
              vence: l.resultado === CERRADO ? l.f_implementacion : l.f_seguimiento,
              prioridad: l.f_seguimiento && l.f_seguimiento < hoyIso() ? "alta" : "normal",
              origen: { origen: "bitacora", origen_nodo: l.id },
            });
          },
        }, "+ Crear ticket de este lead")),
    ], { ancho: true });
  };

  // Filtros y regla de comisión
  const filtrosCaja = h("div.filtros");
  const pintarFiltros = () => vaciar(filtrosCaja,
    h("input", { type: "search", placeholder: "Buscar negocio, giro, municipio…", value: filtros.texto, oninput: debounce((e) => { filtros.texto = e.target.value; pintar(); }, 200) }),
    h("select", { onchange: (e) => { filtros.vendedor = e.target.value; pintar(); } },
      h("option", { value: "" }, "Todos los encargados"),
      perfiles.filter((p) => leads.some((l) => l.vendedor === p.id)).map((p) => h("option", { value: p.id, selected: filtros.vendedor === p.id }, p.nombre))),
    h("select", { onchange: (e) => { filtros.dias = e.target.value; pintar(); } },
      [["30", "Últimos 30 días"], ["90", "Últimos 90 días"], ["365", "Último año"], ["todo", "Todo"]].map(([v, t]) => h("option", { value: v, selected: filtros.dias === v }, t))),
    esAdmin() && h("button.btn.chico", { onclick: editarRegla }, icono("engrane", { tam: 14 }), "Regla de comisión"));

  const editarRegla = () => {
    const tipo = h("select",
      h("option", { value: "fijo", selected: regla.tipo !== "mrr" }, "Monto fijo por cliente cerrado (pago único)"),
      h("option", { value: "mrr", selected: regla.tipo === "mrr" }, "Parte del MRR del cliente"));
    const monto = h("input", { type: "number", min: 0, step: 50, value: regla.monto ?? 500 });
    const meses = h("input", { type: "number", min: 0, step: 0.5, value: regla.meses ?? 1 });
    const porcentaje = h("input", { type: "number", min: 0, max: 100, step: 1, value: regla.porcentaje ?? 100 });
    const campos = h("div");
    const pintarCampos = () => vaciar(campos, tipo.value === "mrr"
      ? h("div.rejilla-2", h("label.campo", h("span", "Meses de MRR"), meses), h("label.campo", h("span", "Porcentaje"), porcentaje))
      : h("label.campo", h("span", "Monto por cliente (MXN)"), monto));
    tipo.addEventListener("change", pintarCampos);
    pintarCampos();
    modal("Regla de comisión", (cerrar) => [
      h("div.cuerpo",
        h("p.muted", "Cuánto gana el encargado por cada cliente que la Bitácora marca como Cerrado."),
        h("label.campo", h("span", "Tipo"), tipo), campos),
      h("div.pie", h("button.btn", { onclick: () => cerrar() }, "Cancelar"),
        h("button.btn.primario", {
          onclick: async () => {
            try {
              const valor = tipo.value === "mrr"
                ? { tipo: "mrr", meses: Number(meses.value) || 0, porcentaje: Number(porcentaje.value) || 0 }
                : { tipo: "fijo", monto: Number(monto.value) || 0 };
              regla = (await api("/ajustes/comisiones", { method: "PUT", body: valor })).regla;
              cerrar();
              toast("Regla guardada");
              pintar();
            } catch (e) { error(e, "No se guardó"); }
          },
        }, "Guardar")),
    ]);
  };

  vaciar(zona,
    h("p.muted", { style: { marginTop: 0 } }, "Lo que capturan los vendedores en la Bitácora de calle: leads, encargado, etapa, cierres y comisiones. Se actualiza solo."),
    filtrosCaja, contenido);
  await cargar();
  pintarFiltros();
  return escuchar("bitacora", ["tk_tickets"], debounce(cargar, 1500));
}
