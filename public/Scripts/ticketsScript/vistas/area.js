// Vista de un área: filtros + Lista | Tablero | Calendario.
import {
  h, vaciar, error, avatar, avatares, chipEstado, chipEtiqueta, chipFecha, nombrePrioridad, COLOR_PRIO, esqueletos,
  PRIORIDADES, MESES_LARGOS, DIAS, isoDia, hoyIso, debounce, modal, toast,
} from "../ui.js";
import {
  datos, areaPorClave, estadosDe, estado, etiquetasDe, etiqueta, persona, miembrosDe,
  puedeEditar, administra, escuchar, tickets as api, puedoEscribir,
} from "../datos.js";
import { verTicket, ir, cambiarParam } from "../rutas.js";
import { crearConIA, buscarParecidos } from "../ia.js";

const PESO_PRIO = { urgente: 0, alta: 1, normal: 2, baja: 3 };
const ORDENES = {
  prioridad: ["Prioridad", (x, y) => PESO_PRIO[x.prioridad] - PESO_PRIO[y.prioridad] || (x.vence || "9999").localeCompare(y.vence || "9999") || x.numero - y.numero],
  vence: ["Vencimiento", (x, y) => (x.vence || "9999").localeCompare(y.vence || "9999") || PESO_PRIO[x.prioridad] - PESO_PRIO[y.prioridad]],
  recientes: ["Más recientes", (x, y) => y.numero - x.numero],
  actualizados: ["Actualizados", (x, y) => (y.actualizado || "").localeCompare(x.actualizado || "")],
};

// Grupos colapsados de la lista (se recuerdan en este navegador).
function gruposCerrados() {
  try { return new Set(JSON.parse(localStorage.getItem("tk-grupos-cerrados") || "[]")); } catch { return new Set(); }
}
function guardarGrupos(set) {
  try { localStorage.setItem("tk-grupos-cerrados", JSON.stringify([...set])); } catch { /* sin almacenamiento */ }
}

export async function render(cont, [clave, vista = "lista"], params) {
  const a = areaPorClave(clave);
  if (!a) {
    vaciar(cont, h("div.vacio", "No existe esa área."));
    return;
  }
  const editable = puedeEditar(a.id);
  const filtros = {
    texto: params.get("q") || "",
    persona: params.get("persona") || "",
    prioridad: params.get("prioridad") || "",
    etiqueta: params.get("etiqueta") || "",
    orden: params.get("orden") || "prioridad",
    cerrados: params.get("cerrados") === "1",
    mes: params.get("mes") || hoyIso().slice(0, 7),
  };
  let tickets = [];
  const zona = h("div", esqueletos(5));

  const cargar = async () => {
    try {
      const filtrosApi = { area: a.id, raiz: true, orden: "orden", limite: 1000 };
      if (!filtros.cerrados && vista !== "calendario") filtrosApi.abiertos = true;
      if (vista === "calendario") {
        const [anio, mes] = filtros.mes.split("-").map(Number);
        filtrosApi.vence_desde = isoDia(new Date(anio, mes - 1, 1 - 7));
        filtrosApi.vence_hasta = isoDia(new Date(anio, mes, 7));
      }
      // Cada ticket ya trae el avance de su checklist y sus subtareas.
      tickets = await api.listar(filtrosApi);
      pintar();
    } catch (e) {
      error(e, "No se cargaron los tickets");
    }
  };

  const filtrados = () => tickets.filter((t) =>
    (!filtros.texto || (t.titulo + " T-" + t.numero).toLowerCase().includes(filtros.texto.toLowerCase())) &&
    (!filtros.persona || (filtros.persona === "nadie" ? !t.asignados.length : t.asignados.includes(filtros.persona))) &&
    (!filtros.prioridad || t.prioridad === filtros.prioridad) &&
    (!filtros.etiqueta || t.etiquetas.includes(filtros.etiqueta)));

  let pintadas = 0;
  const pintar = () => {
    // La animación de entrada solo la primera vez (no en cada actualización en vivo).
    zona.classList.toggle("sin-animacion", pintadas++ > 0);
    const lista = filtrados();
    if (vista === "tablero") vaciar(zona, tablero(a, lista, editable, cargar));
    else if (vista === "calendario") vaciar(zona, calendario(a, lista, editable, filtros, cargar));
    else vaciar(zona, listaAgrupada(a, lista, editable, cargar, ORDENES[filtros.orden]?.[1] || ORDENES.prioridad[1]));
  };

  const pestana = (id, texto) => h("a", { href: `#/area/${a.clave}/${id}`, class: vista === id ? "activo" : "" }, texto);
  const cambiarFiltro = (nombre, valor) => {
    filtros[nombre] = valor;
    // Guardamos el filtro en la ruta sin repintar toda la vista.
    const [ruta, consulta = ""] = location.hash.slice(1).split("?");
    const p = new URLSearchParams(consulta);
    const llave = nombre === "texto" ? "q" : nombre;
    if (valor === "" || valor === false) p.delete(llave);
    else p.set(llave, valor === true ? "1" : valor);
    history.replaceState(null, "", "#" + ruta + (p.toString() ? "?" + p : ""));
    window.dispatchEvent(new Event("tk:ruta"));
    nombre === "cerrados" ? cargar() : pintar();
  };

  const miembros = miembrosDe(a.id);
  vaciar(cont,
    h("div.encabezado",
      h("span.icono-area", { style: { background: a.color } }, a.nombre[0]),
      h("h1", a.nombre),
      h("nav.pestanas", pestana("lista", "Lista"), pestana("tablero", "Tablero"), pestana("calendario", "Calendario"),
        a.clave === "ventas" && pestana("bitacora", "◎ Bitácora")),
      h("div.acciones",
        administra(a.id) && h("button.btn", { onclick: () => ir("#/admin/area/" + a.clave), title: "Estados, etiquetas, miembros y automatizaciones" }, "⚙ Configurar"),
        h("button.btn", { onclick: () => ir("#/dashboard?area=" + a.clave) }, "▦ Dashboard"),
        editable && h("button.btn.ia", { onclick: () => crearConIA(a, cargar) }, "✦ Crear con IA"),
        editable
          ? h("button.btn.primario", { onclick: () => nuevoTicket(a, cargar) }, "+ Nuevo ticket")
          : puedoEscribir() && h("button.btn.primario", { onclick: () => ir("#/solicitudes?pedir=" + a.clave) }, "Pedir un ticket a " + a.nombre))),
    h("div.filtros",
      h("input", { type: "search", placeholder: "Filtrar por título o T-…", value: filtros.texto, oninput: debounce((e) => cambiarFiltro("texto", e.target.value), 200) }),
      h("select", { onchange: (e) => cambiarFiltro("persona", e.target.value) },
        h("option", { value: "" }, "Todos los responsables"),
        h("option", { value: datos.yo.id, selected: filtros.persona === datos.yo.id }, "Asignados a mí"),
        h("option", { value: "nadie", selected: filtros.persona === "nadie" }, "Sin asignar"),
        miembros.filter((p) => p.id !== datos.yo.id).map((p) => h("option", { value: p.id, selected: filtros.persona === p.id }, p.nombre))),
      h("select", { onchange: (e) => cambiarFiltro("prioridad", e.target.value) },
        h("option", { value: "" }, "Cualquier prioridad"),
        PRIORIDADES.map((p) => h("option", { value: p.id, selected: filtros.prioridad === p.id }, p.nombre))),
      etiquetasDe(a.id).length > 0 && h("select", { onchange: (e) => cambiarFiltro("etiqueta", e.target.value) },
        h("option", { value: "" }, "Cualquier etiqueta"),
        etiquetasDe(a.id).map((x) => h("option", { value: x.id, selected: filtros.etiqueta === x.id }, x.nombre))),
      vista === "lista" && h("select", { title: "Ordenar", onchange: (e) => cambiarFiltro("orden", e.target.value) },
        Object.entries(ORDENES).map(([id, [nombre]]) => h("option", { value: id, selected: filtros.orden === id }, "Ordenar: " + nombre))),
      vista !== "calendario" && h("label.chk",
        h("input", { type: "checkbox", checked: filtros.cerrados, onchange: (e) => cambiarFiltro("cerrados", e.target.checked) }),
        "Mostrar terminados")),
    zona);

  if (vista === "bitacora") {
    // La Bitácora tiene su propia vista: se quitan los filtros de tickets.
    cont.querySelector(".filtros")?.remove();
    return (await import("./bitacora.js")).render(zona, a);
  }
  await cargar();
  return escuchar("area-" + a.id, ["tk_tickets", "tk_asignados", "tk_checklist", "tk_ticket_etiquetas"], debounce(cargar, 500));
}

// ---------- Nuevo ticket ----------

export function nuevoTicket(a, alCrear, valores = {}) {
  const titulo = h("input", { type: "text", placeholder: "¿Qué hay que hacer?", value: valores.titulo || "" });
  const desc = h("textarea", { rows: 4, placeholder: "Detalles (opcional)", value: valores.descripcion || "" });
  const estadoSel = h("select", estadosDe(a.id).map((e) => h("option", { value: e.id, selected: e.id === valores.estado_id }, e.nombre)));
  const prio = h("select", PRIORIDADES.map((p) => h("option", { value: p.id, selected: p.id === (valores.prioridad || "normal") }, p.nombre)));
  const resp = h("select", h("option", { value: "" }, "Sin asignar"),
    miembrosDe(a.id).map((p) => h("option", { value: p.id, selected: p.id === valores.responsable }, p.nombre)));
  const vence = h("input", { type: "date", value: valores.vence || "" });
  const parecidos = h("div");
  titulo.addEventListener("blur", () => buscarParecidos(a.id, titulo.value, parecidos));
  if (valores.titulo) buscarParecidos(a.id, valores.titulo, parecidos);
  const checklist = valores.checklist || [];
  modal("Nuevo ticket en " + a.nombre, (cerrar) => {
    const crear = async (abrir) => {
      if (!titulo.value.trim()) return toast("Ponle un título.");
      try {
        // Todo en una sola petición: responsable, checklist y etiquetas.
        const t = await api.crear({
          area_id: a.id, titulo: titulo.value.trim(), descripcion: desc.value, estado_id: estadoSel.value,
          prioridad: prio.value, vence: vence.value || null,
          asignados: resp.value ? [resp.value] : [], checklist, etiquetas: valores.etiquetas || [],
          ...(valores.origen ? { origen: valores.origen } : {}),
        });
        cerrar();
        alCrear && alCrear();
        if (abrir) verTicket(t.numero);
        else toast(`T-${t.numero} creado`);
      } catch (e) {
        error(e, "No se creó");
      }
    };
    titulo.addEventListener("keydown", (e) => e.key === "Enter" && crear(false));
    return [
      h("div.cuerpo",
        h("label.campo", h("span", "Título"), titulo),
        parecidos,
        h("label.campo", h("span", "Descripción"), desc),
        h("div.rejilla-2",
          h("label.campo", h("span", "Estado"), estadoSel),
          h("label.campo", h("span", "Prioridad"), prio),
          h("label.campo", h("span", "Responsable"), resp),
          h("label.campo", h("span", "Vence"), vence)),
        checklist.length > 0 && h("div.caja-ia",
          h("div.cab-ia", "✦ Checklist sugerido"),
          checklist.map((c) => h("div.check-item", h("span", "☐ " + c))))),
      h("div.pie",
        h("button.btn", { onclick: () => cerrar() }, "Cancelar"),
        h("button.btn", { onclick: () => crear(true) }, "Crear y abrir"),
        h("button.btn.primario", { onclick: () => crear(false) }, "Crear")),
    ];
  });
}

// ---------- Piezas comunes ----------

function etiquetasDeTicket(t) {
  return t.etiquetas.map((id) => etiqueta(id)).filter(Boolean).map((x) => chipEtiqueta(x));
}

function avance(t) {
  const total = t.checklist.total + (t.subtareas?.total || 0);
  if (!total) return null;
  const hechas = t.checklist.hechos + (t.subtareas?.hechas || 0);
  return h("span.meta", { title: `${hechas} de ${total} (checklist y subtareas)` },
    h("span.mini-barra", h("i", { style: { width: `${(hechas / total) * 100}%` } })), `${hechas}/${total}`);
}

function extras(t) {
  return [
    avance(t),
    t.comentarios > 0 && h("span.meta", { title: "Comentarios" }, `💬 ${t.comentarios}`),
    t.solicitado_por && h("span.chip", { title: "Pedido por " + (persona(t.solicitado_por)?.nombre || "otra área") }, "⇄ " + (persona(t.solicitado_por)?.nombre.split(" ")[0] || "Solicitud")),
  ];
}

// ---------- Lista ----------

function listaAgrupada(a, tickets, editable, recargar, ordenar) {
  const estados = estadosDe(a.id);
  const cerrados = gruposCerrados();
  if (!tickets.length && !editable) return h("div.vacio", h("span.grande", "☰"), "No hay tickets con estos filtros.");
  return h("div.escalonado", estados.map((e) => {
    const grupo = tickets.filter((t) => t.estado_id === e.id).sort(ordenar);
    if (!grupo.length && e.tipo === "cerrado") return null;
    const rapido = editable && h("tr.agregar-rapido", h("td", { colspan: 5 },
      h("input", {
        type: "text", placeholder: "+ Agregar ticket en " + e.nombre + " (Enter)",
        onkeydown: async (ev) => {
          if (ev.key !== "Enter" || !ev.target.value.trim()) return;
          try {
            await api.crear({ area_id: a.id, estado_id: e.id, titulo: ev.target.value.trim() });
            ev.target.value = "";
            recargar();
          } catch (err) { error(err, "No se creó"); }
        },
      })));
    const caja = h("div.grupo", { class: cerrados.has(e.id) ? "cerrado" : "" },
      h("div.grupo-cab", {
        onclick: () => {
          caja.classList.toggle("cerrado");
          caja.classList.contains("cerrado") ? cerrados.add(e.id) : cerrados.delete(e.id);
          guardarGrupos(cerrados);
        },
      }, h("span.flecha", "▼"), chipEstado(e), h("span.cuenta", grupo.length)),
      h("div.grupo-cuerpo.tabla-wrap",
        h("table.tabla",
          grupo.length > 0 && h("thead", h("tr",
            h("th", "Ticket"), h("th.opcional", "Responsables"), h("th", "Prioridad"), h("th.opcional", "Vence"), h("th.opcional", ""))),
          h("tbody",
            grupo.map((t) => h("tr.ticket", { class: t.cerrado ? "cerrado" : "", style: { "--franja": COLOR_PRIO[t.prioridad] }, onclick: () => verTicket(t.numero) },
              h("td.titulo-celda",
                h("div.fila", { style: { gap: "10px", flexWrap: "nowrap" } }, h("span.num", "T-" + t.numero), h("span.t", t.titulo)),
                h("div.debajo", etiquetasDeTicket(t), extras(t))),
              h("td.opcional", avatares(t.asignados, persona)),
              h("td", h("span.prio", { class: t.prioridad }, nombrePrioridad(t.prioridad))),
              h("td.opcional", chipFecha(t.vence, t.cerrado) || h("span.dim", "—")),
              h("td.opcional", { style: { textAlign: "right" } }, h("span.dim", "›")))),
            rapido))));
    return caja;
  }));
}

// ---------- Tablero (Kanban) ----------

function tablero(a, tickets, editable, recargar) {
  const estados = estadosDe(a.id);
  let arrastrado = null;

  const soltar = async (estadoId, antesDe) => {
    const t = arrastrado;
    arrastrado = null;
    if (!t) return;
    // Orden nuevo: entre la carta anterior y la siguiente de la columna destino.
    const columna = tickets.filter((x) => x.estado_id === estadoId && x.id !== t.id).sort((x, y) => x.orden - y.orden);
    const idx = antesDe ? columna.findIndex((x) => x.id === antesDe) : columna.length;
    const previo = columna[idx - 1], siguiente = columna[idx];
    const orden = previo && siguiente ? (previo.orden + siguiente.orden) / 2
      : previo ? previo.orden + 1000 : siguiente ? siguiente.orden - 1000 : Date.now() / 1000;
    const cambios = { orden };
    if (t.estado_id !== estadoId) cambios.estado_id = estadoId;
    t.orden = orden;
    t.estado_id = estadoId;
    try {
      await api.cambiar(t.id, cambios);
    } catch (e) {
      error(e, "No se movió");
    }
    recargar();
  };

  return h("div.tablero.escalonado", estados.map((e) => {
    const columna = tickets.filter((t) => t.estado_id === e.id).sort((x, y) => x.orden - y.orden);
    const col = h("div.columna", {
      ondragover: (ev) => { if (editable && arrastrado) { ev.preventDefault(); col.classList.add("encima"); } },
      ondragleave: (ev) => { if (!col.contains(ev.relatedTarget)) col.classList.remove("encima"); },
      ondrop: (ev) => { ev.preventDefault(); col.classList.remove("encima"); soltar(e.id, null); },
    },
      h("div.columna-cab", { style: { "--c": e.color } }, chipEstado(e), h("span.cuenta", columna.length)),
      h("div.columna-cuerpo",
        columna.map((t) => {
          const carta = h("div.carta", {
            style: { "--franja": COLOR_PRIO[t.prioridad] },
            draggable: editable ? "true" : null,
            onclick: () => verTicket(t.numero),
            ondragstart: (ev) => { arrastrado = t; carta.classList.add("arrastrando"); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", t.id); },
            ondragend: () => carta.classList.remove("arrastrando"),
            ondragover: (ev) => editable && ev.preventDefault(),
            ondrop: (ev) => { ev.preventDefault(); ev.stopPropagation(); col.classList.remove("encima"); soltar(e.id, t.id); },
          },
            h("div.arriba", h("span.num", "T-" + t.numero), etiquetasDeTicket(t)),
            h("div.titulo", t.titulo),
            h("div.pie",
              t.prioridad !== "normal" && h("span.prio", { class: t.prioridad }, nombrePrioridad(t.prioridad)),
              chipFecha(t.vence, t.cerrado),
              extras(t),
              avatares(t.asignados, persona)));
          return carta;
        }),
        editable && h("input", {
          type: "text", placeholder: "+ Agregar", style: { background: "transparent", border: "1px dashed var(--line-2)" },
          onkeydown: async (ev) => {
            if (ev.key !== "Enter" || !ev.target.value.trim()) return;
            try {
              await api.crear({ area_id: a.id, estado_id: e.id, titulo: ev.target.value.trim() });
              ev.target.value = "";
              recargar();
            } catch (err) { error(err, "No se creó"); }
          },
        })));
    return col;
  }));
}

// ---------- Calendario ----------

function calendario(a, tickets, editable, filtros, recargar) {
  const [anio, mes] = filtros.mes.split("-").map(Number);
  const primero = new Date(anio, mes - 1, 1, 12);
  // La semana empieza en lunes.
  const inicio = new Date(primero);
  inicio.setDate(1 - ((primero.getDay() + 6) % 7));
  const hoy = hoyIso();
  let arrastrado = null;

  const moverMes = (delta) => {
    const f = new Date(anio, mes - 1 + delta, 1);
    cambiarParam("mes", `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`);
  };

  const dias = [];
  for (let i = 0; i < 42; i++) {
    const f = new Date(inicio);
    f.setDate(inicio.getDate() + i);
    const iso = isoDia(f);
    const delDia = tickets.filter((t) => t.vence === iso);
    const celda = h("div.dia", {
      class: [f.getMonth() !== mes - 1 ? "fuera" : "", iso === hoy ? "hoy" : ""].join(" "),
      ondragover: (ev) => { if (arrastrado) { ev.preventDefault(); celda.classList.add("encima"); } },
      ondragleave: () => celda.classList.remove("encima"),
      ondrop: async (ev) => {
        ev.preventDefault();
        celda.classList.remove("encima");
        const t = arrastrado;
        arrastrado = null;
        if (!t || t.vence === iso) return;
        try {
          await api.cambiar(t.id, { vence: iso });
        } catch (e) { error(e, "No se movió"); }
        recargar();
      },
      ondblclick: () => editable && nuevoTicket(a, recargar, { vence: iso }),
    },
      h("span.n", f.getDate()),
      delDia.map((t) => h("div.evento", {
        class: t.cerrado ? "cerrado" : "",
        style: { borderLeftColor: estado(t.estado_id)?.color || "var(--blue)" },
        title: `T-${t.numero} · ${t.titulo}`,
        draggable: editable ? "true" : null,
        ondragstart: () => { arrastrado = t; },
        onclick: () => verTicket(t.numero),
      }, t.asignados[0] ? [avatar(persona(t.asignados[0]), false), " "] : null, t.titulo)));
    dias.push(celda);
    if (i >= 34 && f.getMonth() !== mes - 1 && (i + 1) % 7 === 0) break;
  }
  return h("div",
    h("div.cal-cab",
      h("button.btn.chico", { onclick: () => moverMes(-1) }, "‹"),
      h("h2", `${MESES_LARGOS[mes - 1][0].toUpperCase() + MESES_LARGOS[mes - 1].slice(1)} ${anio}`),
      h("button.btn.chico", { onclick: () => moverMes(1) }, "›"),
      h("button.btn.chico.fantasma", { onclick: () => cambiarParam("mes", hoy.slice(0, 7)) }, "Hoy"),
      h("span.dim", { style: { marginLeft: "auto" } }, editable ? "Arrastra un ticket para cambiar su fecha · doble clic en un día para crear" : "")),
    h("div.cal", DIAS.map((d) => h("div.dia-nombre", d)), dias),
    !tickets.length && h("p.dim", "No hay tickets con vencimiento este mes."));
}
