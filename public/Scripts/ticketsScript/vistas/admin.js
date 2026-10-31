// Administración: quién entra a Tickets (permisos del pass), el rol de cada
// persona en cada área, las áreas y la configuración de cada área (miembros,
// estados, etiquetas y automatizaciones).
import { h, vaciar, error, toast, modal, confirmar, avatar, PRIORIDADES, nombrePrioridad, debounce } from "../ui.js";
import {
  api, datos, cargarCatalogos, area, areaPorClave, estadosDe, estado, etiquetasDe, etiqueta, persona,
  personasActivas, esAdmin, administra,
} from "../datos.js";
import { apiJson } from "../../api.js";
import { ir, avisarCatalogos } from "../rutas.js";

const ROLES = [["", "—"], ["lector", "Lector"], ["miembro", "Miembro"], ["admin", "Admin del área"]];
const NIVELES = [["ninguno", "Sin acceso"], ["ver", "Sólo ver"], ["editar", "Ver y editar"]];
const TIPOS = { seller: "Vendedores", client: "Clientes" };
const HERRAMIENTA = "tickets";

export async function render(cont, [seccion = "personas", clave]) {
  const refrescar = async () => {
    await cargarCatalogos();
    avisarCatalogos();
    await render(cont, [seccion, clave]);
  };
  if (seccion === "area") {
    const a = areaPorClave(clave);
    if (!a || !administra(a.id)) return vaciar(cont, h("div.vacio", "No tienes permiso para configurar esta área."));
    return configurarArea(cont, a, refrescar);
  }
  if (!esAdmin()) return vaciar(cont, h("div.vacio", "Solo los administradores entran aquí."));
  const pestana = (id, texto) => h("a", { href: "#/admin/" + id, class: seccion === id ? "activo" : "" }, texto);
  const zona = h("div");
  vaciar(cont,
    h("div.encabezado", h("h1", "Administración"), h("nav.pestanas", pestana("personas", "Acceso y personas"), pestana("areas", "Áreas"))),
    zona);
  if (seccion === "areas") pintarAreas(zona, refrescar);
  else pintarPersonas(zona, refrescar);
}

// ---------------------------------------------------------------- Acceso a Tickets

// Quién entra a Tickets se guarda en los permisos generales del pass
// (/api/permisos, herramienta 'tickets'): los mismos que usa Documentación.
async function pintarAcceso(zona, refrescar) {
  const r = await apiJson("/permisos").catch(() => null);
  if (!r || !r.ok) return vaciar(zona, h("div.dim", "No se pudieron leer los permisos del pass."));
  const porTipo = new Map((r.data.areas || []).filter((x) => x.herramienta === HERRAMIENTA).map((x) => [x.tipo_cuenta, x.nivel]));
  const excepciones = (r.data.excepciones || []).filter((x) => x.herramienta === HERRAMIENTA);

  const guardar = async (ruta, metodo, cuerpo) => {
    const res = await apiJson(ruta, { method: metodo, body: { herramienta: HERRAMIENTA, ...cuerpo } });
    if (!res.ok) throw new Error(res.data?.error === "cuenta_es_admin" ? "Los admins ya pueden todo." : "No se guardó el permiso.");
    toast("Permiso guardado");
    await refrescar();
  };
  const selectNivel = (valor, alCambiar) => h("select", { style: { width: "auto" }, onchange: (e) => e.target.value && alCambiar(e.target.value) },
    !valor && h("option", { value: "", selected: true }, "Darle permiso…"),
    NIVELES.map(([v, t]) => h("option", { value: v, selected: v === valor }, t)));

  const buscar = h("input", { type: "search", placeholder: "Buscar una persona del equipo para darle un permiso propio…" });
  const resultados = h("div.admin-lista");
  buscar.addEventListener("input", debounce(async () => {
    const texto = buscar.value.trim();
    if (texto.length < 2) return vaciar(resultados);
    const res = await apiJson("/permisos/cuentas?buscar=" + encodeURIComponent(texto)).catch(() => null);
    const cuentas = (res && res.ok && (res.data.cuentas || [])) || [];
    vaciar(resultados, cuentas.filter((c) => c.type !== "admin" && !excepciones.some((x) => x.account_id === c.id)).slice(0, 8).map((c) =>
      h("div.tarjeta.admin-fila",
        h("div.crece", h("b", c.name || c.nombre || c.email), h("div.dim", c.email)),
        selectNivel("", async (nivel) => {
          try { await guardar("/permisos/cuenta", "PUT", { account_id: c.id, nivel }); } catch (e) { error(e); }
        }))));
  }, 250));

  vaciar(zona,
    h("p.muted", "Quién puede abrir Tickets. Los admins siempre entran y pueden todo. Son los mismos permisos del pass que usa Documentación."),
    h("div.admin-lista", Object.entries(TIPOS).map(([tipo, nombre]) => h("div.tarjeta.admin-fila",
      h("div.crece", h("b", nombre), h("div.dim", tipo === "seller" ? "Entran al área Ventas como miembros." : "Normalmente sin acceso.")),
      selectNivel(porTipo.get(tipo) || "ninguno", async (nivel) => {
        try { await guardar("/permisos/area", "PUT", { tipo_cuenta: tipo, nivel }); } catch (e) { error(e); }
      })))),
    h("h3", { style: { marginTop: "18px" } }, "Excepciones por persona"),
    !excepciones.length && h("div.dim", "Ninguna: cada quien tiene lo de su tipo de cuenta."),
    h("div.admin-lista", excepciones.map((x) => h("div.tarjeta.admin-fila",
      h("div.crece", h("b", x.nombre || x.name || x.email || x.account_id), h("div.dim", x.email || "")),
      selectNivel(x.nivel, async (nivel) => {
        try { await guardar("/permisos/cuenta", "PUT", { account_id: x.account_id, nivel }); } catch (e) { error(e); }
      }),
      h("button.btn.chico", {
        onclick: async () => {
          try { await guardar("/permisos/cuenta", "DELETE", { account_id: x.account_id }); } catch (e) { error(e); }
        },
      }, "Quitar")))),
    h("div", { style: { marginTop: "10px", display: "grid", gap: "8px" } }, buscar, resultados));
}

// ---------------------------------------------------------------- Personas

function pintarPersonas(zona, refrescar) {
  const areas = datos.areas.filter((a) => !a.archivada);
  const explicito = (personaId, areaId) => datos.miembrosExplicitos.find((m) => m.persona_id === personaId && m.area_id === areaId)?.rol || "";
  const efectivo = (personaId, areaId) => datos.miembros.find((m) => m.persona_id === personaId && m.area_id === areaId)?.rol || null;

  const cambiarRol = async (p, a, rol) => {
    try {
      if (!rol) await api(`/areas/${a.id}/miembros/${p.id}`, { method: "DELETE" });
      else await api(`/areas/${a.id}/miembros/${p.id}`, { method: "PUT", body: { rol } });
      await refrescar();
    } catch (e) { error(e, "No se cambió el rol"); }
  };

  const acceso = h("div", h("div.dim", "Cargando permisos…"));
  vaciar(zona,
    h("section.seccion", h("h3", "¿Quién entra a Tickets?"), acceso),
    h("section.seccion", { style: { marginTop: "22px" } },
      h("h3", "Rol en cada área"),
      h("p.muted", "“Por su tipo” = entra como miembro si su tipo de cuenta es de esa área (Ventas: vendedores). Cámbialo para hacerlo admin del área, sólo lector o dejarlo fuera."),
      h("div", { style: { overflowX: "auto" } },
        h("table.tabla.roles-tabla",
          h("thead", h("tr", h("th", "Persona"), areas.map((a) => h("th", a.nombre)))),
          h("tbody", datos.personas.map((p) => h("tr",
            h("td", h("div.fila", avatar(p), h("div", h("div", p.nombre), h("div.dim", p.correo)))),
            areas.map((a) => h("td", p.tipo === "admin"
              ? h("span.chip", "Admin")
              : h("select", { onchange: (e) => cambiarRol(p, a, e.target.value), title: "Rol efectivo: " + (efectivo(p.id, a.id) || "sin acceso") },
                h("option", { value: "", selected: !explicito(p.id, a.id) }, a.tipos_cuenta.includes(p.tipo) ? "Por su tipo (miembro)" : "Sin acceso"),
                [["admin", "Admin del área"], ["miembro", "Miembro"], ["lector", "Lector"], ["fuera", "Fuera"]]
                  .map(([v, t]) => h("option", { value: v, selected: explicito(p.id, a.id) === v }, t))))))))))));
  pintarAcceso(acceso, refrescar);
}

// ---------------------------------------------------------------- Áreas

function pintarAreas(zona, refrescar) {
  const nueva = async () => {
    const nombre = prompt("Nombre del área nueva (por ejemplo, Soporte):");
    if (!nombre || !nombre.trim()) return;
    try {
      await api("/areas", { method: "POST", body: { nombre: nombre.trim() } });
      toast("Área creada con estados básicos");
      await refrescar();
    } catch (e) { error(e, "No se creó"); }
  };
  const guardar = async (a, cambios) => {
    try {
      await api(`/areas/${a.id}`, { method: "PATCH", body: cambios });
      await refrescar();
    } catch (e) { error(e, "No se guardó"); }
  };
  vaciar(zona,
    h("div.fila.espaciada", { style: { marginBottom: "12px" } },
      h("p.muted", "Cada área tiene sus estados, etiquetas, miembros y automatizaciones. Por ahora la empresa trabaja en Ventas."),
      h("button.btn.primario", { onclick: nueva }, "+ Nueva área")),
    h("div.admin-lista", datos.areas.map((a) => h("div.tarjeta.admin-fila",
      h("input.color-input", { type: "color", value: a.color, onchange: (e) => guardar(a, { color: e.target.value }) }),
      h("input.crece", { type: "text", value: a.nombre, onchange: (e) => e.target.value.trim() && guardar(a, { nombre: e.target.value.trim() }) }),
      h("span.dim", "/" + a.clave),
      h("input", { type: "number", value: a.orden, style: { width: "70px" }, title: "Orden en el menú", onchange: (e) => guardar(a, { orden: Number(e.target.value) || 0 }) }),
      h("label.fila", { title: "Los vendedores entran a esta área sin agregarlos uno por uno" },
        h("input", {
          type: "checkbox", checked: a.tipos_cuenta.includes("seller"),
          onchange: (e) => guardar(a, { tipos_cuenta: e.target.checked ? [...new Set([...a.tipos_cuenta, "seller"])] : a.tipos_cuenta.filter((t) => t !== "seller") }),
        }), "Vendedores"),
      h("label.fila", h("input", { type: "checkbox", checked: a.archivada, onchange: (e) => guardar(a, { archivada: e.target.checked }) }), "Archivada"),
      h("button.btn.chico", { onclick: () => ir("#/admin/area/" + a.clave) }, "Configurar")))));
}

// ---------------------------------------------------------------- Configurar un área

async function configurarArea(cont, a, refrescar) {
  const { automatizaciones } = await api(`/areas/${a.id}/automatizaciones`);
  const zonaMiembros = h("div"), zonaEstados = h("div"), zonaEtiquetas = h("div"), zonaAuto = h("div");
  vaciar(cont,
    h("div.encabezado",
      h("h1", "Configurar " + a.nombre),
      h("div.acciones",
        esAdmin() && h("button.btn", { onclick: () => ir("#/admin/areas") }, "← Áreas"),
        h("button.btn", { onclick: () => ir("#/area/" + a.clave) }, "Ver tickets"))),
    h("div", { style: { display: "grid", gap: "22px", maxWidth: "900px" } },
      h("section.seccion", h("h3", "Miembros"), zonaMiembros),
      h("section.seccion", h("h3", "Estados"), zonaEstados),
      h("section.seccion", h("h3", "Etiquetas"), zonaEtiquetas),
      h("section.seccion", h("h3", "Automatizaciones"), zonaAuto)));
  pintarMiembros(zonaMiembros, a, refrescar);
  pintarEstados(zonaEstados, a, refrescar);
  pintarEtiquetas(zonaEtiquetas, a, refrescar);
  pintarAutomatizaciones(zonaAuto, a, automatizaciones, refrescar);
}

// Rol efectivo de cada quien en el área. "Quitar" deja fuera a alguien que
// entraría por su tipo de cuenta; los admins del pass siempre entran.
function pintarMiembros(zona, a, refrescar) {
  const miembros = datos.miembros.filter((m) => m.area_id === a.id);
  const sinRol = personasActivas().filter((p) => p.tipo !== "admin" && !miembros.some((m) => m.persona_id === p.id));
  const porTipo = (p) => a.tipos_cuenta.includes(p.tipo);
  const cambiar = async (personaId, rol) => {
    try {
      const p = persona(personaId);
      // Volver a "miembro" de alguien que entra por su tipo = quitar la fila explícita.
      if (rol === "miembro" && p && porTipo(p)) await api(`/areas/${a.id}/miembros/${personaId}`, { method: "DELETE" });
      else await api(`/areas/${a.id}/miembros/${personaId}`, { method: "PUT", body: { rol: rol || "fuera" } });
      await refrescar();
    } catch (e) { error(e, "No se cambió"); }
  };
  vaciar(zona,
    a.tipos_cuenta.includes("seller") && h("p.dim", "Los vendedores entran solos como miembros; aquí puedes subirlos a admin del área, dejarlos de lectores o sacarlos."),
    !miembros.length && h("div.dim", "Nadie todavía."),
    h("div.admin-lista", miembros.map((m) => {
      const p = persona(m.persona_id);
      return h("div.tarjeta.admin-fila",
        avatar(p), h("span.crece", p?.nombre || "—"),
        p?.tipo === "admin"
          ? h("span.chip", "Admin general")
          : h("select", { style: { width: "auto" }, onchange: (e) => cambiar(m.persona_id, e.target.value) },
            ROLES.map(([v, t]) => h("option", { value: v, selected: m.rol === v }, v ? t : "Quitar del área"))));
    })),
    sinRol.length > 0 && h("div.fila", { style: { marginTop: "8px" } },
      h("select", { style: { width: "auto" }, onchange: (e) => e.target.value && cambiar(e.target.value, "miembro") },
        h("option", { value: "" }, "+ Agregar persona al área"),
        sinRol.map((p) => h("option", { value: p.id }, p.nombre)))));
}

function pintarEstados(zona, a, refrescar) {
  const estados = estadosDe(a.id);
  const guardar = async (e, cambios) => {
    try {
      await api(`/estados/${e.id}`, { method: "PATCH", body: cambios });
      await refrescar();
    } catch (err) { error(err, "No se guardó"); }
  };
  const mover = async (i, delta) => {
    const otro = estados[i + delta];
    if (!otro) return;
    try {
      const ids = estados.map((x) => x.id);
      [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]];
      await api(`/areas/${a.id}/estados/orden`, { method: "PUT", body: { ids } });
      await refrescar();
    } catch (err) { error(err); }
  };
  const borrar = async (e) => {
    if (!(await confirmar(`¿Borrar el estado "${e.nombre}"? Solo se puede si ningún ticket lo usa.`, { si: "Borrar", peligro: true }))) return;
    try {
      await api(`/estados/${e.id}`, { method: "DELETE" });
      await refrescar();
    } catch (err) {
      error(err);
    }
  };
  vaciar(zona,
    h("p.dim", "El primer estado es donde entran los tickets nuevos. Los de tipo “Terminado” cuentan como cerrados."),
    h("div.admin-lista", estados.map((e, i) => h("div.tarjeta.admin-fila",
      h("input.color-input", { type: "color", value: e.color, onchange: (ev) => guardar(e, { color: ev.target.value }) }),
      h("input.crece", { type: "text", value: e.nombre, onchange: (ev) => ev.target.value.trim() && guardar(e, { nombre: ev.target.value.trim() }) }),
      h("select", { style: { width: "auto" }, onchange: (ev) => guardar(e, { tipo: ev.target.value }) },
        [["abierto", "Por empezar"], ["en_curso", "En curso"], ["cerrado", "Terminado"]].map(([v, t]) => h("option", { value: v, selected: e.tipo === v }, t))),
      h("button.btn.chico", { disabled: i === 0, onclick: () => mover(i, -1) }, "↑"),
      h("button.btn.chico", { disabled: i === estados.length - 1, onclick: () => mover(i, 1) }, "↓"),
      h("button.btn.chico.peligro", { onclick: () => borrar(e) }, "Borrar")))),
    h("div", { style: { marginTop: "8px" } }, h("button.btn.chico", {
      onclick: async () => {
        const nombre = prompt("Nombre del estado nuevo:");
        if (!nombre || !nombre.trim()) return;
        try {
          await api(`/areas/${a.id}/estados`, { method: "POST", body: { nombre: nombre.trim(), tipo: "en_curso" } });
          await refrescar();
        } catch (err) { error(err); }
      },
    }, "+ Estado")));
}

function pintarEtiquetas(zona, a, refrescar) {
  const etiquetas = etiquetasDe(a.id);
  vaciar(zona,
    h("div.multi",
      etiquetas.map((e) => h("span.chip", { style: { borderColor: e.color, color: e.color } },
        h("input.color-input", {
          type: "color", value: e.color, style: { width: "18px", height: "18px", border: "none" },
          onchange: async (ev) => {
            try { await api(`/etiquetas/${e.id}`, { method: "PATCH", body: { color: ev.target.value } }); await refrescar(); } catch (err) { error(err); }
          },
        }),
        e.nombre,
        h("span.quitar", {
          onclick: async () => {
            if (!(await confirmar(`¿Borrar la etiqueta "${e.nombre}"? Se quita de todos los tickets.`, { si: "Borrar", peligro: true }))) return;
            try { await api(`/etiquetas/${e.id}`, { method: "DELETE" }); await refrescar(); } catch (err) { error(err); }
          },
        }, "×"))),
      h("button.btn.chico", {
        onclick: async () => {
          const nombre = prompt("Nombre de la etiqueta:");
          if (!nombre || !nombre.trim()) return;
          try { await api(`/areas/${a.id}/etiquetas`, { method: "POST", body: { nombre: nombre.trim() } }); await refrescar(); } catch (err) { error(err); }
        },
      }, "+ Etiqueta")));
}

// ---------------------------------------------------------------- Automatizaciones

const DISPARADORES = {
  ticket_creado: "Cuando se crea un ticket",
  estado_cambia: "Cuando cambia el estado",
  vence_manana: "Un día antes de que venza",
  vencido: "Cuando se vence",
};
const ACCIONES = {
  asignar: "Asignar a",
  cambiar_estado: "Cambiar el estado a",
  cambiar_prioridad: "Cambiar la prioridad a",
  agregar_etiqueta: "Agregar la etiqueta",
  avisar_solicitante: "Avisar a quien lo pidió",
  avisar_persona: "Avisar a",
};

function describir(r) {
  const c = r.condicion || {};
  const p = r.parametros || {};
  const cond = [
    c.estado_id && `si queda en “${estado(c.estado_id)?.nombre || "?"}”`,
    c.prioridad && `si es ${nombrePrioridad(c.prioridad).toLowerCase()}`,
    c.solicitud && "si lo pidió otra área",
  ].filter(Boolean).join(" y ");
  const objetivo = {
    asignar: persona(p.persona_id)?.nombre,
    cambiar_estado: estado(p.estado_id)?.nombre,
    cambiar_prioridad: nombrePrioridad(p.prioridad),
    agregar_etiqueta: etiqueta(p.etiqueta_id)?.nombre,
    avisar_persona: persona(p.persona_id)?.nombre,
  }[r.accion];
  return `${DISPARADORES[r.disparador]}${cond ? ", " + cond : ""}: ${ACCIONES[r.accion].toLowerCase()}${objetivo ? " " + objetivo : ""}.`;
}

function pintarAutomatizaciones(zona, a, reglas, refrescar) {
  const recargar = () => refrescar();
  vaciar(zona,
    h("p.dim", "Reglas de “cuando pase X, haz Y”. Corren solas en el servidor; en el historial del ticket aparecen como Automatización."),
    !reglas.length && h("div.dim", "No hay automatizaciones."),
    h("div.admin-lista", reglas.map((r) => h("div.tarjeta.admin-fila",
      h("input", {
        type: "checkbox", checked: r.activa, title: "Activa",
        onchange: async (e) => {
          try { await api(`/automatizaciones/${r.id}`, { method: "PATCH", body: { activa: e.target.checked } }); } catch (err) { error(err); }
        },
      }),
      h("div.crece", h("b", r.nombre), h("div.dim", describir(r))),
      h("button.btn.chico", { onclick: () => editorRegla(a, r, recargar) }, "Editar"),
      h("button.btn.chico.peligro", {
        onclick: async () => {
          if (!(await confirmar(`¿Borrar la automatización "${r.nombre}"?`, { si: "Borrar", peligro: true }))) return;
          try { await api(`/automatizaciones/${r.id}`, { method: "DELETE" }); recargar(); } catch (err) { error(err); }
        },
      }, "Borrar")))),
    h("div", { style: { marginTop: "8px" } }, h("button.btn.primario.chico", { onclick: () => editorRegla(a, null, recargar) }, "+ Automatización")));
}

function editorRegla(a, regla, alGuardar) {
  const r = regla || { nombre: "", disparador: "estado_cambia", condicion: {}, accion: "asignar", parametros: {} };
  const estados = estadosDe(a.id);
  const gente = personasActivas();
  const opciones = (lista, valor, vacio) => [vacio && h("option", { value: "" }, vacio), ...lista.map(([v, t]) => h("option", { value: v, selected: v === valor }, t))];

  const nombre = h("input", { type: "text", value: r.nombre, placeholder: "Ej. Revisión la ve Rafael" });
  const disparador = h("select", opciones(Object.entries(DISPARADORES), r.disparador));
  const condEstado = h("select", opciones(estados.map((e) => [e.id, e.nombre]), r.condicion.estado_id, "Cualquier estado"));
  const condPrio = h("select", opciones(PRIORIDADES.map((p) => [p.id, p.nombre]), r.condicion.prioridad, "Cualquier prioridad"));
  const condSolicitud = h("input", { type: "checkbox", checked: !!r.condicion.solicitud });
  const accion = h("select", opciones(Object.entries(ACCIONES), r.accion));
  const parametro = h("div");
  const texto = h("input", { type: "text", value: r.parametros.texto || "", placeholder: "Mensaje del aviso (opcional)" });

  let control = null;
  const pintarParametro = () => {
    const p = r.parametros;
    control = {
      asignar: () => h("select", opciones(gente.map((x) => [x.id, x.nombre]), p.persona_id, "Elige persona")),
      avisar_persona: () => h("select", opciones(gente.map((x) => [x.id, x.nombre]), p.persona_id, "Elige persona")),
      cambiar_estado: () => h("select", opciones(estados.map((e) => [e.id, e.nombre]), p.estado_id, "Elige estado")),
      cambiar_prioridad: () => h("select", opciones(PRIORIDADES.map((x) => [x.id, x.nombre]), p.prioridad, "Elige prioridad")),
      agregar_etiqueta: () => h("select", opciones(etiquetasDe(a.id).map((e) => [e.id, e.nombre]), p.etiqueta_id, "Elige etiqueta")),
      avisar_solicitante: () => null,
    }[accion.value]();
    const avisa = ["avisar_solicitante", "avisar_persona"].includes(accion.value);
    vaciar(parametro, control, avisa && h("label.campo", { style: { marginTop: "8px" } }, h("span", "Mensaje"), texto));
  };
  accion.addEventListener("change", pintarParametro);
  pintarParametro();

  modal(regla ? "Editar automatización" : "Nueva automatización", (cerrar) => [
    h("div.cuerpo",
      h("label.campo", h("span", "Nombre"), nombre),
      h("label.campo", h("span", "Cuándo"), disparador),
      h("div.rejilla-2",
        h("label.campo", h("span", "Solo si el estado es"), condEstado),
        h("label.campo", h("span", "Solo si la prioridad es"), condPrio)),
      h("label.fila", condSolicitud, "Solo tickets pedidos por otra área"),
      h("label.campo", h("span", "Entonces"), accion),
      parametro),
    h("div.pie",
      h("button.btn", { onclick: () => cerrar() }, "Cancelar"),
      h("button.btn.primario", {
        onclick: async () => {
          if (!nombre.value.trim()) return toast("Ponle nombre.");
          const valor = control ? control.value : "";
          if (control && !valor) return toast("Completa a quién o qué aplica la acción.");
          const clave = { asignar: "persona_id", avisar_persona: "persona_id", cambiar_estado: "estado_id", cambiar_prioridad: "prioridad", agregar_etiqueta: "etiqueta_id" }[accion.value];
          const parametros = {};
          if (clave) parametros[clave] = valor;
          if (texto.value.trim() && ["avisar_solicitante", "avisar_persona"].includes(accion.value)) parametros.texto = texto.value.trim();
          const condicion = {};
          if (condEstado.value) condicion.estado_id = condEstado.value;
          if (condPrio.value) condicion.prioridad = condPrio.value;
          if (condSolicitud.checked) condicion.solicitud = true;
          const fila = { nombre: nombre.value.trim(), activa: regla ? regla.activa : true, disparador: disparador.value, condicion, accion: accion.value, parametros };
          try {
            if (regla) await api(`/automatizaciones/${regla.id}`, { method: "PATCH", body: fila });
            else await api(`/areas/${a.id}/automatizaciones`, { method: "POST", body: fila });
            cerrar();
            alGuardar();
          } catch (err) { error(err, "No se guardó"); }
        },
      }, "Guardar")),
  ]);
}
