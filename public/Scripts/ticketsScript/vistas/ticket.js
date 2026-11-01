// Panel lateral con el detalle de un ticket (se abre con ?t=numero).
import {
  h, vaciar, toast, error, confirmar, avatar, chipEstado, chipEtiqueta, fechaHora, haceCuanto,
  duracion, PRIORIDADES, nombrePrioridad, textoConMenciones, debounce, hoyIso, esqueletos,
  claseVence, fechaLarga,
} from "../ui.js";
import { icono } from "../iconos.js";
import {
  api, datos, persona, area, estado, estadosDe, etiquetasDe, etiqueta, miembrosDe, personasActivas,
  puedeEditar, administra, escuchar, tickets as tk, subirAdjunto, puedoEscribir,
} from "../datos.js";
import { cambiarParam, verTicket } from "../rutas.js";
import { iniciarCronometro, detenerCronometro } from "../cronometro.js";
import { seccionIA } from "../ia.js";

let actual = null; // { numero, nodo, dejarDeEscuchar }

export function cerrarPanel() {
  if (!actual) return;
  actual.dejarDeEscuchar && actual.dejarDeEscuchar();
  actual.nodo.remove();
  document.body.classList.remove("con-panel");
  document.removeEventListener("keydown", actual.esc);
  actual = null;
}

// En el teléfono el panel tapa la pantalla: se sale con "atrás" a la
// izquierda, como en cualquier app. En la compu, la ✕ a la derecha.
function botonCerrar(salir) {
  return h("button.btn.fantasma.icono.cerrar-panel", { onclick: salir, "aria-label": "Cerrar", title: "Cerrar (Esc)" },
    h("span.solo-movil", icono("atras", { tam: 24 })), h("span.solo-escritorio", icono("cerrar", { tam: 20 })));
}

export async function abrirTicket(numero) {
  if (actual && actual.numero === numero) return;
  cerrarPanel();
  const cuerpo = h("div.panel-cuerpo", h("div.panel-principal", esqueletos(6)));
  const cab = h("div.panel-cab");
  // La caja para comentar va fija abajo y no se repinta con los cambios en
  // vivo: lo que estés escribiendo no se pierde.
  const pie = h("div.panel-pie");
  const salir = () => cambiarParam("t", null);
  const esc = (e) => {
    if (e.key === "Escape" && !document.querySelector(".modal")) salir();
  };
  const nodo = h("div", h("div.velo", { onclick: salir }), h("aside.panel", { role: "dialog", "aria-label": "Ticket T-" + numero }, cab, cuerpo, pie));
  document.body.appendChild(nodo);
  document.body.classList.add("con-panel");
  document.addEventListener("keydown", esc);
  actual = { numero, nodo, esc };
  const yo = actual;

  const estadoPanel = { ticket: null };
  const recargar = async () => {
    try {
      const t = await cargar(numero);
      if (actual !== yo) return;
      if (!t) {
        vaciar(cuerpo, h("div.vacio", "No existe el ticket T-" + numero + " o no tienes permiso para verlo."));
        vaciar(cab, botonCerrar(salir), h("span.num", "T-" + numero));
        return;
      }
      if (!estadoPanel.comentar && puedoEscribir()) {
        estadoPanel.comentar = cajaComentario(t, recargar);
        vaciar(pie, estadoPanel.comentar);
      }
      // El aviso de cambios es de todo Tickets: si este ticket quedó igual,
      // no se repinta (se perdería, p. ej., el resumen de la IA en pantalla).
      const firma = JSON.stringify(t);
      if (firma === estadoPanel.firma) return;
      estadoPanel.firma = firma;
      estadoPanel.ticket = t;
      pintar(t, cab, cuerpo, recargar, salir, estadoPanel);
    } catch (e) {
      error(e, "No se pudo cargar el ticket");
    }
  };
  await recargar();
  const enVivo = debounce(recargar, 400);
  // Algo cambió en Tickets (de cualquiera): se vuelve a leer este ticket.
  yo.dejarDeEscuchar = escuchar("ticket-" + numero, [], enVivo);
}

async function cargar(numero) {
  let d;
  try {
    d = await tk.detalle(numero);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
  return {
    ...d.ticket,
    subtareas: d.subtareas,
    checklist: d.checklist,
    comentarios: d.comentarios,
    adjuntos: d.adjuntos,
    actividad: d.actividad,
    tiempo: d.tiempo,
    padre: d.padre,
  };
}

function pintar(t, cab, cuerpo, recargar, salir, estadoPanel) {
  const editable = puedeEditar(t.area_id);
  const a = area(t.area_id);
  const guardar = async (cambios) => {
    try {
      await tk.cambiar(t.id, cambios);
      await recargar();
    } catch (e) {
      error(e, "No se guardó");
      await recargar();
    }
  };

  // ----- Cabecera -----
  const enlace = location.origin + "/tickets/#/mis?t=" + t.numero;
  vaciar(cab,
    botonCerrar(salir),
    h("span.num", "T-" + t.numero),
    a && h("span.chip", h("span.bola", { style: { background: a.color } }), a.nombre),
    h("div.panel-acciones",
      h("button.btn.fantasma.icono", {
        title: "Copiar enlace", "aria-label": "Compartir enlace",
        onclick: async () => {
          // En el teléfono, la hoja de compartir del sistema (WhatsApp, etc.).
          if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
            try {
              await navigator.share({ title: `T-${t.numero} · ${t.titulo}`, url: enlace });
              return;
            } catch (e) {
              if (e.name === "AbortError") return;
            }
          }
          navigator.clipboard?.writeText(enlace);
          toast("Enlace copiado");
        },
      }, icono("enlace")),
      administra(t.area_id) && h("button.btn.fantasma.icono.peligro", {
        title: "Borrar ticket", "aria-label": "Borrar ticket",
        onclick: async () => {
          if (!(await confirmar(`¿Borrar T-${t.numero} y todo lo que tiene (comentarios, tiempo, adjuntos)?`, { si: "Borrar", peligro: true }))) return;
          try {
            await tk.borrar(t.id);
            toast("Ticket borrado");
            salir();
          } catch (e) {
            error(e, "No se pudo borrar");
          }
        },
      }, icono("basura"))));

  // Si el usuario está escribiendo en una sección, no la repintamos.
  const secciones = cuerpo.__secciones || {};
  const seccion = (clave, construir) => {
    const previa = secciones[clave];
    const activo = document.activeElement;
    const enCampo = previa && previa.contains(activo) &&
      /^(INPUT|TEXTAREA)$/.test(activo.tagName) && activo.type !== "checkbox";
    // Con texto a medias no se toca; vacío (p. ej. recién se agregó un paso)
    // sí se repinta y el cursor vuelve al mismo campo para seguir agregando.
    if (enCampo && activo.value) return previa;
    const nueva = (secciones[clave] = construir());
    if (enCampo && activo.placeholder) {
      const mismo = [...nueva.querySelectorAll("input, textarea")].find((x) => x.placeholder === activo.placeholder);
      if (mismo) setTimeout(() => mismo.focus(), 0);
    }
    return nueva;
  };

  // Arriba el título a todo lo ancho. En la compu, dos columnas: contenido a
  // la izquierda, propiedades y tiempo a la derecha. En el teléfono, una
  // sola: título, propiedades, tiempo y luego el contenido.
  const encabezado = h("div.panel-titulo",
    t.padre && h("div.muted", "Subtarea de ", h("a", { href: "#", onclick: (e) => { e.preventDefault(); verTicket(t.padre.numero); } }, `T-${t.padre.numero} · ${t.padre.titulo}`)),
    seccion("titulo", () => tituloEditable(t, editable, guardar)),
    (t.solicitado_por || t.origen === "documentacion") && h("div.multi",
      t.solicitado_por && h("span.chip", { title: "Pedido desde otra área" }, icono("flechas", { tam: 14 }), "Solicitud de " + (persona(t.solicitado_por)?.nombre || "—")),
      t.origen === "documentacion" && h("span.chip", { title: "Se sincroniza con el bloque del diagrama" },
        icono("documentacion", { tam: 14 }), (t.origen_datos?.proyecto || t.origen_proyecto) + " › " + (t.origen_datos?.nombre || "bloque"))));
  const principal = h("div.panel-principal",
    seccion("descripcion", () => descripcion(t, editable, guardar)),
    seccion("ia", () => seccionIA(t, editable, recargar)),
    seccion("checklist", () => checklist(t, editable, recargar)),
    !t.padre_id && seccion("subtareas", () => subtareas(t, editable, recargar)),
    seccion("adjuntos", () => adjuntos(t, recargar)),
    seccion("comentarios", () => comentarios(t, recargar)),
    seccion("actividad", () => actividad(t)));
  const lado = h("aside.panel-lado",
    seccion("props", () => propiedades(t, editable, guardar, recargar)),
    seccion("tiempo", () => tiempo(t, editable, recargar)));
  vaciar(cuerpo, encabezado, principal, lado);
  cuerpo.__secciones = secciones;
}

// Título de varias líneas: en el teléfono no cabe en una sola y se cortaba.
function tituloEditable(t, editable, guardar) {
  const campo = h("textarea.titulo-editable", {
    rows: 1, value: t.titulo, readonly: !editable, "aria-label": "Título", enterkeyhint: "done",
    onkeydown: (e) => {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
    },
    oninput: () => ajustar(),
    onchange: (e) => {
      const v = e.target.value.replace(/\s+/g, " ").trim();
      if (v && v !== t.titulo) guardar({ titulo: v });
      else e.target.value = t.titulo;
      ajustar();
    },
  });
  const ajustar = () => {
    campo.style.height = "auto";
    campo.style.height = campo.scrollHeight + "px";
  };
  requestAnimationFrame(ajustar);
  return h("div", campo);
}

// Fecha con "Sin fecha" cuando está vacía (Safari deja la caja en blanco) y
// una ✕ para quitarla.
function campoFecha(t, campo, guardar) {
  const valor = t[campo] || "";
  const input = h("input", {
    type: "date", value: valor, "aria-label": campo === "vence" ? "Vence" : "Inicio",
    // En la compu el calendario sólo abre con su iconito: se abre al tocar
    // cualquier parte del campo.
    onclick: (e) => { try { e.target.showPicker(); } catch { /* sin showPicker */ } },
    onchange: (e) => guardar({ [campo]: e.target.value || null }),
  });
  return h("span.fecha-campo", { class: [valor ? "" : "vacia", campo === "vence" ? claseVence(valor, t.cerrado) : ""].join(" ") },
    input,
    h("span.fecha-texto", { "aria-hidden": "true" }, valor ? fechaLarga(valor) : "Sin fecha"),
    valor && h("button.quitar-fecha", {
      "aria-label": "Quitar fecha", type: "button",
      onclick: (e) => { e.preventDefault(); guardar({ [campo]: null }); },
    }, icono("cerrar", { tam: 14 })));
}

function propiedades(t, editable, guardar, recargar) {
  const estados = estadosDe(t.area_id);
  const est = estado(t.estado_id);
  const selEstado = editable
    ? h("span.valor-select", { style: { "--c": est?.color || "var(--muted)" } },
      h("span.bola-estado"),
      h("select", { "aria-label": "Estado", onchange: (e) => guardar({ estado_id: e.target.value }) },
        estados.map((e) => h("option", { value: e.id, selected: e.id === t.estado_id }, e.nombre))))
    : chipEstado(est);
  const selPrio = editable
    ? h("span.valor-select.prio-sel", { class: t.prioridad },
      icono("bandera", { tam: 16 }),
      h("select", { "aria-label": "Prioridad", onchange: (e) => guardar({ prioridad: e.target.value }) },
        PRIORIDADES.map((p) => h("option", { value: p.id, selected: p.id === t.prioridad }, p.nombre))))
    : h("span.prio", { class: t.prioridad }, nombrePrioridad(t.prioridad));
  const fecha = (campo) => editable ? campoFecha(t, campo, guardar) : h("span.valor", t[campo] ? fechaLarga(t[campo]) : "—");

  // Responsables
  const candidatos = miembrosDe(t.area_id).filter((p) => !t.asignados.includes(p.id));
  const responsables = h("div.multi",
    t.asignados.map((id) => h("span.persona-chip", avatar(persona(id), false), persona(id)?.nombre || "—",
      editable && h("span.quitar", {
        title: "Quitar",
        onclick: async () => {
          try {
            await tk.desasignar(t.id, id);
            recargar();
          } catch (e) { error(e); }
        },
      }, "×"))),
    !t.asignados.length && !editable && h("span.dim", "Sin asignar"),
    editable && candidatos.length > 0 && h("span.agregar-select",
      icono("mas", { tam: 14 }), t.asignados.length ? "" : "Asignar",
      h("select", {
        "aria-label": "Asignar a",
        onchange: async (e) => {
          if (!e.target.value) return;
          try {
            await tk.asignar(t.id, e.target.value);
            recargar();
          } catch (err) { error(err); }
        },
      }, h("option", { value: "" }, "Asignar a…"), candidatos.map((p) => h("option", { value: p.id }, p.nombre)))));

  // Etiquetas
  const disponibles = etiquetasDe(t.area_id).filter((e) => !t.etiquetas.includes(e.id));
  const etiquetas = h("div.multi",
    t.etiquetas.map((id) => etiqueta(id)).filter(Boolean).map((e) => chipEtiqueta(e, editable && (async () => {
      try {
        await tk.desetiquetar(t.id, e.id);
        recargar();
      } catch (err) { error(err); }
    }))),
    !t.etiquetas.length && !editable && h("span.dim", "—"),
    editable && h("span.agregar-select",
      icono("mas", { tam: 14 }), t.etiquetas.length ? "" : "Etiqueta",
      h("select", {
        "aria-label": "Agregar etiqueta",
        onchange: async (e) => {
          let id = e.target.value;
          if (!id) return;
          try {
            if (id === "__nueva") {
              const nombre = prompt("Nombre de la etiqueta nueva:");
              if (!nombre || !nombre.trim()) return recargar();
              const nueva = await api(`/areas/${t.area_id}/etiquetas`, { method: "POST", body: { nombre: nombre.trim() } });
              datos.etiquetas.push(nueva);
              id = nueva.id;
            }
            await tk.etiquetar(t.id, id);
            recargar();
          } catch (err) { error(err); recargar(); }
        },
      }, h("option", { value: "" }, "Agregar etiqueta…"),
        disponibles.map((e) => h("option", { value: e.id }, e.nombre)),
        h("option", { value: "__nueva" }, "Nueva etiqueta…"))));

  // Mover de área (solo a áreas donde puedo editar)
  const otras = datos.areas.filter((x) => !x.archivada && x.id !== t.area_id && puedeEditar(x.id));
  const mover = editable && !t.padre_id && otras.length > 0 && h("span.valor-select",
    h("select", {
      "aria-label": "Mover a otra área",
      onchange: async (e) => {
        const destino = area(e.target.value);
        if (!destino) return;
        if (await confirmar(`¿Mover T-${t.numero} a ${destino.nombre}? Pasará al primer estado de esa área.`, { si: "Mover" })) {
          guardar({ area_id: destino.id });
        } else e.target.value = "";
      },
    }, h("option", { value: "" }, "Elegir área…"), otras.map((x) => h("option", { value: x.id }, x.nombre))));

  // Una fila por propiedad: ícono y nombre a la izquierda, valor a la derecha
  // (toda la fila abre el selector del teléfono).
  const prop = (ico, k, valor) => h("div.prop", h("div.k", icono(ico, { tam: 16 }), h("span", k)), h("div.v", valor));
  return h("div.props",
    prop("estado", "Estado", selEstado),
    prop("bandera", "Prioridad", selPrio),
    prop("persona", "Responsables", responsables),
    prop("calendario", "Inicio", fecha("inicio")),
    prop("calendario", "Vence", fecha("vence")),
    prop("etiqueta", "Etiquetas", etiquetas),
    mover && prop("flechas", "Mover a", mover),
    prop("reloj", "Creado", h("span.valor", (persona(t.creado_por)?.nombre || "—") + " · " + fechaHora(t.creado))),
    t.cerrado && prop("check", "Terminado", h("span.valor", fechaHora(t.cerrado))));
}

function descripcion(t, editable, guardar) {
  const cont = h("div.seccion", h("div.seccion-cab", h("h3", "Descripción")));
  const vista = h("div.descripcion-vista", { class: t.descripcion ? "" : "vacia" });
  vista.appendChild(t.descripcion ? textoConMenciones(t.descripcion, datos.personas) : document.createTextNode(editable ? "Agrega una descripción…" : "Sin descripción."));
  if (editable) {
    vista.addEventListener("click", (e) => {
      if (e.target.tagName === "A") return;
      const campo = h("textarea", { rows: 8, value: t.descripcion });
      const botones = h("div.fila",
        h("button.btn.primario.chico", { onclick: () => { campo.blur(); guardar({ descripcion: campo.value }); } }, "Guardar"),
        h("button.btn.chico", { onclick: () => vaciar(cont, cont.firstChild, vista) }, "Cancelar"));
      vaciar(cont, cont.firstChild, campo, botones);
      campo.focus();
    });
  }
  cont.appendChild(vista);
  return cont;
}

function checklist(t, editable, recargar) {
  const total = t.checklist.length;
  const hechos = t.checklist.filter((c) => c.hecho).length;
  if (!total && !editable) return h("div");
  const nuevo = h("input", {
    type: "text", placeholder: "Agregar elemento y Enter",
    onkeydown: async (e) => {
      if (e.key !== "Enter" || !e.target.value.trim()) return;
      try {
        await tk.checklist(t.id, [e.target.value.trim()]);
        e.target.value = "";
        recargar();
      } catch (err) { error(err); }
    },
  });
  return h("div.seccion",
    h("div.seccion-cab", h("h3", "Checklist"), total > 0 && h("span.dim", `${hechos}/${total}`)),
    total > 0 && h("div.barra-progreso", h("div", { style: { width: `${(hechos / total) * 100}%` } })),
    t.checklist.map((c) => h("div.check-item", { class: c.hecho ? "hecho" : "" },
      h("input", {
        type: "checkbox", checked: c.hecho, disabled: !editable,
        onchange: async (e) => {
          try {
            await tk.cambiarPaso(c.id, { hecho: e.target.checked });
            recargar();
          } catch (err) { error(err); }
        },
      }),
      h("span", c.texto),
      editable && h("button.btn.fantasma.chico", {
        onclick: async () => {
          try {
            await tk.borrarPaso(c.id);
            recargar();
          } catch (err) { error(err); }
        },
      }, "×"))),
    editable && nuevo);
}

function subtareas(t, editable, recargar) {
  const nuevo = h("input", {
    type: "text", placeholder: "Nueva subtarea y Enter",
    onkeydown: async (e) => {
      if (e.key !== "Enter" || !e.target.value.trim()) return;
      try {
        await tk.crear({ area_id: t.area_id, padre_id: t.id, titulo: e.target.value.trim() });
        e.target.value = "";
        recargar();
      } catch (err) { error(err); }
    },
  });
  if (!t.subtareas.length && !editable) return h("div");
  return h("div.seccion",
    h("div.seccion-cab", h("h3", "Subtareas"), t.subtareas.length > 0 && h("span.dim",
      `${t.subtareas.filter((s) => s.cerrado).length}/${t.subtareas.length}`)),
    t.subtareas.map((s) => h("div.check-item", { class: s.cerrado ? "hecho" : "", style: { cursor: "pointer" }, onclick: () => verTicket(s.numero) },
      chipEstado(estado(s.estado_id)), h("span", s.titulo), h("span.num", "T-" + s.numero),
      h("span.avatares", { style: { marginLeft: "auto" } }, s.asignados.map((id) => avatar(persona(id)))))),
    editable && nuevo);
}

function adjuntos(t, recargar) {
  const archivo = h("input", { type: "file", multiple: true, class: "oculto" });
  archivo.addEventListener("change", async () => {
    for (const f of archivo.files) {
      try {
        await subirAdjunto(t.id, f);
      } catch (e) {
        error(e, "No se subió " + f.name);
      }
    }
    archivo.value = "";
    recargar();
  });
  // Imágenes y PDF se ven en otra pestaña; lo demás se descarga (lo decide el servicio).
  const abrir = (adj) => {
    window.open(tk.urlAdjunto(adj.id), "_blank", "noopener");
  };
  const borrar = async (adj) => {
    if (!(await confirmar(`¿Borrar ${adj.nombre}?`, { si: "Borrar", peligro: true }))) return;
    try {
      await tk.borrarAdjunto(adj.id);
      recargar();
    } catch (e) { error(e, "No se pudo borrar"); }
  };
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  return h("div.seccion",
    h("div.seccion-cab", h("h3", "Archivos"),
      puedoEscribir() && h("div.acciones", h("button.btn.chico", { onclick: () => archivo.click() }, "Subir archivo"))),
    archivo,
    !t.adjuntos.length && h("div.dim", "Sin archivos."),
    t.adjuntos.map((adj) => h("div.check-item",
      h("a", { href: "#", onclick: (e) => { e.preventDefault(); abrir(adj); } }, adj.nombre),
      h("span.dim", kb(adj.tamano) + " · " + (persona(adj.subido_por)?.nombre || "—")),
      puedoEscribir() && (adj.subido_por === datos.yo.id || puedeEditar(t.area_id)) &&
        h("button.btn.fantasma.chico", { onclick: () => borrar(adj) }, "×"))));
}

function tiempo(t, editable, recargar) {
  if (!t.tiempo.length && !editable) return h("div");
  const total = t.tiempo.reduce((s, x) => s + x.minutos, 0);
  const mio = t.tiempo.find((x) => x.persona_id === datos.yo.id && !x.fin);
  const manual = () => {
    const fecha = h("input", { type: "date", value: hoyIso() });
    const horas = h("input", { type: "number", min: 0, step: 1, value: 0 });
    const mins = h("input", { type: "number", min: 0, max: 59, step: 5, value: 30 });
    const nota = h("input", { type: "text", placeholder: "Qué hiciste (opcional)" });
    const form = h("div.rejilla-2",
      h("label.campo", h("span", "Fecha"), fecha),
      h("label.campo", h("span", "Nota"), nota),
      h("label.campo", h("span", "Horas"), horas),
      h("label.campo", h("span", "Minutos"), mins));
    const guardarManual = async () => {
      const minutos = Number(horas.value || 0) * 60 + Number(mins.value || 0);
      if (minutos <= 0) return toast("Pon cuánto tiempo fue.");
      const inicio = new Date(fecha.value + "T09:00:00");
      const fin = new Date(inicio.getTime() + minutos * 60000);
      try {
        await api("/tiempo", { method: "POST", body: { ticket_id: t.id, inicio: inicio.toISOString(), fin: fin.toISOString(), nota: nota.value.trim() } });
        caja.replaceWith(botonesTiempo);
        recargar();
        window.dispatchEvent(new Event("tk:tiempo"));
      } catch (e) { error(e); }
    };
    const caja = h("div.tarjeta", { style: { padding: "12px" } }, form,
      h("div.fila", { style: { marginTop: "10px" } },
        h("button.btn.primario.chico", { onclick: guardarManual }, "Guardar"),
        h("button.btn.chico", { onclick: () => caja.replaceWith(botonesTiempo) }, "Cancelar")));
    botonesTiempo.replaceWith(caja);
  };
  const botonesTiempo = h("div.acciones",
    mio
      ? h("button.btn.chico.detener", { onclick: async () => { await detenerCronometro(); recargar(); } }, icono("stop", { tam: 14 }), "Detener")
      : h("button.btn.chico", { onclick: async () => { await iniciarCronometro(t.id); recargar(); } }, icono("play", { tam: 14 }), "Iniciar"),
    h("button.btn.chico", { onclick: manual }, icono("mas", { tam: 14 }), "Manual"));
  const porPersona = {};
  for (const x of t.tiempo) porPersona[x.persona_id] = (porPersona[x.persona_id] || 0) + x.minutos;
  return h("div.seccion",
    h("div.seccion-cab", h("h3", "Tiempo"), h("span.dim", duracion(total)), editable && botonesTiempo),
    Object.keys(porPersona).length > 0 && h("div.multi",
      Object.entries(porPersona).map(([id, m]) => h("span.chip", avatar(persona(id), false), `${persona(id)?.nombre || "—"} · ${duracion(m)}`))),
    t.tiempo.slice(0, 8).map((x) => h("div.check-item",
      avatar(persona(x.persona_id)),
      h("span", x.fin ? duracion(x.minutos) : h("b", { style: { color: "var(--green)" } }, "corriendo")),
      h("span.dim", fechaHora(x.inicio) + (x.nota ? " · " + x.nota : "")),
      x.persona_id === datos.yo.id && h("button.btn.fantasma.chico", {
        onclick: async () => {
          if (!(await confirmar("¿Borrar este registro de tiempo?", { si: "Borrar", peligro: true }))) return;
          try {
            await api(`/tiempo/${x.id}`, { method: "DELETE" });
            recargar();
            window.dispatchEvent(new Event("tk:tiempo"));
          } catch (e) { error(e); }
        },
      }, "×"))),
    t.tiempo.length > 8 && h("div.dim", `y ${t.tiempo.length - 8} registros más (ver en Tiempo).`));
}

// Caja fija abajo del panel para comentar (con @menciones). Se arma una vez
// por ticket abierto.
function cajaComentario(t, recargar) {
  const caja = h("textarea", { rows: 1, placeholder: "Comentar… usa @ para mencionar", "aria-label": "Comentario", enterkeyhint: "send" });
  const contenedor = h("div.comentar-caja", caja);
  activarMenciones(caja, contenedor, { arriba: true });
  const boton = h("button.btn.primario.icono.enviar", { "aria-label": "Enviar comentario", title: "Enviar (Ctrl+Enter)", disabled: true }, icono("enviar", { tam: 18 }));
  const ajustar = () => {
    caja.style.height = "auto";
    caja.style.height = Math.min(caja.scrollHeight + 2, 140) + "px";
    caja.classList.toggle("larga", caja.scrollHeight + 2 > 140);
    boton.disabled = !caja.value.trim();
  };
  const enviar = async () => {
    const texto = caja.value.trim();
    if (!texto) return;
    const menciones = personasActivas().filter((p) => texto.includes("@" + p.nombre)).map((p) => p.id);
    boton.disabled = true;
    try {
      await tk.comentar(t.id, texto, menciones);
      caja.value = "";
      ajustar();
      await recargar();
      // Que se vea el comentario recién puesto.
      const lista = document.querySelector(".panel .lista-comentarios");
      lista && lista.lastElementChild && lista.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (e) {
      error(e, "No se envió");
      ajustar();
    }
  };
  caja.addEventListener("input", ajustar);
  caja.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar();
  });
  boton.addEventListener("click", enviar);
  return h("div.comentar", contenedor, boton);
}

// Varios comentarios seguidos de la misma persona (menos de 10 min entre uno
// y otro) se juntan como en un chat: el nombre y la foto sólo en el primero.
const SEGUIDO_MS = 10 * 60 * 1000;
const esSeguido = (c, previo) => !!previo && previo.autor_id === c.autor_id &&
  new Date(c.creado) - new Date(previo.creado) < SEGUIDO_MS;

function comentarios(t, recargar) {
  return h("div.seccion",
    h("div.seccion-cab", h("h3", "Comentarios"), h("span.dim", t.comentarios.length || "")),
    !t.comentarios.length && h("div.dim", puedoEscribir() ? "Sin comentarios. Escribe el primero abajo." : "Sin comentarios."),
    h("div.lista-comentarios",
    t.comentarios.map((c, i) => h("div.comentario", { class: esSeguido(c, t.comentarios[i - 1]) ? "seguido" : "" },
      avatar(persona(c.autor_id)),
      h("div.burbuja",
        h("div.meta", h("b", persona(c.autor_id)?.nombre || "—"), h("span.cuando", " · ", haceCuanto(c.creado)),
          c.autor_id === datos.yo.id && h("a", {
            href: "#", style: { marginLeft: "8px", color: "var(--dim)" },
            onclick: async (e) => {
              e.preventDefault();
              if (!(await confirmar("¿Borrar tu comentario?", { si: "Borrar", peligro: true }))) return;
              try {
                await tk.borrarComentario(c.id);
                recargar();
              } catch (err) { error(err); }
            },
          }, "borrar")),
        h("div.texto", textoConMenciones(c.texto, datos.personas)))))));
}

// Autocompletar de "@Nombre" en un textarea. arriba: la lista sale encima
// (la caja de comentar está pegada abajo de la pantalla).
export function activarMenciones(caja, contenedor, { arriba = false } = {}) {
  let lista = null, opciones = [], indice = 0, inicio = -1;
  const cerrar = () => { lista && lista.remove(); lista = null; inicio = -1; };
  const elegir = (p) => {
    const antes = caja.value.slice(0, inicio);
    const despues = caja.value.slice(caja.selectionStart);
    caja.value = antes + "@" + p.nombre + " " + despues;
    const pos = (antes + "@" + p.nombre + " ").length;
    caja.setSelectionRange(pos, pos);
    cerrar();
    caja.focus();
  };
  const pintarLista = () => {
    lista && lista.remove();
    if (!opciones.length) return cerrar();
    lista = h("div.autocompletar", { style: arriba ? { left: "0", bottom: "calc(100% + 6px)" } : { left: "0", top: "100%" } },
      opciones.map((p, i) => h("div", {
        class: i === indice ? "activo" : "",
        onmousedown: (e) => { e.preventDefault(); elegir(p); },
      }, avatar(p, false), p.nombre)));
    contenedor.appendChild(lista);
  };
  caja.addEventListener("input", () => {
    const pos = caja.selectionStart;
    const antes = caja.value.slice(0, pos);
    const m = antes.match(/(^|\s)@([^\s@]{0,30})$/);
    if (!m) return cerrar();
    inicio = pos - m[2].length - 1;
    const texto = m[2].toLowerCase();
    opciones = personasActivas().filter((p) => p.nombre.toLowerCase().includes(texto)).slice(0, 8);
    indice = 0;
    pintarLista();
  });
  caja.addEventListener("keydown", (e) => {
    if (!lista) return;
    if (e.key === "ArrowDown") { indice = (indice + 1) % opciones.length; pintarLista(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { indice = (indice - 1 + opciones.length) % opciones.length; pintarLista(); e.preventDefault(); }
    else if (e.key === "Enter" || e.key === "Tab") { elegir(opciones[indice]); e.preventDefault(); }
    else if (e.key === "Escape") { cerrar(); e.stopPropagation(); }
  });
  caja.addEventListener("blur", () => setTimeout(cerrar, 150));
}

const ACCIONES = {
  creo: (d) => d.solicitud ? "pidió este ticket" : "creó el ticket",
  estado: (d) => ["cambió el estado de ", h("b", d.de || "—"), " a ", h("b", d.a || "—")],
  prioridad: (d) => ["cambió la prioridad a ", h("b", nombrePrioridad(d.a))],
  vence: (d) => d.a ? ["puso vencimiento ", h("b", d.a)] : "quitó el vencimiento",
  inicio: (d) => d.a ? ["puso inicio ", h("b", d.a)] : "quitó la fecha de inicio",
  titulo: () => "cambió el título",
  descripcion: () => "editó la descripción",
  area: (d) => ["movió el ticket de ", h("b", d.de), " a ", h("b", d.a)],
  asigno: (d) => ["asignó a ", h("b", d.persona)],
  desasigno: (d) => ["quitó a ", h("b", d.persona)],
  comento: () => "comentó",
  adjunto: (d) => ["subió ", h("b", d.nombre)],
  automatizacion: (d) => ["corrió la regla ", h("b", d.nombre)],
  ia: (d) => [d.tipo === "clasificar" ? "clasificó la solicitud" : "trabajó en el ticket", d.texto ? [": ", h("span", d.texto)] : ""],
};

function actividad(t) {
  let todo = false;
  const lista = h("div.actividad");
  const pintarLista = () => {
    const filas = todo ? t.actividad : t.actividad.slice(0, 8);
    vaciar(lista, filas.map((x) => h("div",
      h("b", x.persona_id ? persona(x.persona_id)?.nombre || "—" : x.accion === "ia" ? "✦ IA" : "Automatización"), " ",
      (ACCIONES[x.accion] || (() => x.accion))(x.detalle || {}), " · ", h("span.dim", haceCuanto(x.creado)))),
    !todo && t.actividad.length > 8 && h("a", { href: "#", onclick: (e) => { e.preventDefault(); todo = true; pintarLista(); } }, "Ver todo el historial"));
  };
  pintarLista();
  return h("div.seccion", h("div.seccion-cab", h("h3", "Historial")), lista);
}
