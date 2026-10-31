// Funciones de IA del lado del navegador (POST /api/tickets/ia del servicio).
import { h, vaciar, error, toast, modal, puntos } from "./ui.js";
import { api, consulta, area, puedeEditar, tickets } from "./datos.js";
import { verTicket, ir } from "./rutas.js";

export function llamarIA(accion, cuerpo = {}) {
  return api("/ia", { method: "POST", body: { accion, ...cuerpo } });
}

// "Crear con IA": texto libre → propuesta → formulario de nuevo ticket ya lleno.
export function crearConIA(areaActual, alCrear) {
  const caja = h("textarea", { rows: 6, placeholder: "Ej. El cliente Barbería Centro dice que desde ayer no le llegan las confirmaciones por WhatsApp. Hay que revisarlo antes del viernes." });
  const estado = h("div");
  modal("✦ Crear ticket con IA", (cerrar) => {
    const boton = h("button.btn.ia", "✦ Armar ticket");
    boton.addEventListener("click", async () => {
      if (caja.value.trim().length < 5) return toast("Escribe un poco más.");
      boton.disabled = true;
      vaciar(estado, h("div.cargando-ia", puntos(), " Pensando"));
      try {
        const p = await llamarIA("crear", { texto: caja.value, area_id: areaActual?.id });
        const destino = area(p.area_id) || areaActual;
        cerrar();
        if (!destino) return toast("La IA no encontró a qué área va.");
        if (!puedeEditar(destino.id)) {
          toast(`Va para ${destino.nombre}: te llevo a pedirlo como solicitud.`);
          sessionStorage.setItem("tk-solicitud-ia", JSON.stringify({ ...p, texto: caja.value }));
          return ir("#/solicitudes?pedir=" + destino.clave);
        }
        const { nuevoTicket } = await import("./vistas/area.js");
        nuevoTicket(destino, alCrear, {
          titulo: p.titulo, descripcion: p.descripcion, prioridad: p.prioridad,
          responsable: p.responsable_id, vence: p.vence, checklist: p.checklist, etiquetas: p.etiquetas,
        });
      } catch (e) {
        vaciar(estado);
        error(e, "IA");
      } finally {
        boton.disabled = false;
      }
    });
    return [
      h("div.cuerpo",
        h("p.muted", "Cuéntale qué pasa o qué hay que hacer, como se lo dirías a alguien del equipo. La IA propone área, título, prioridad, responsable, fecha y pasos; tú revisas antes de crear."),
        caja, estado),
      h("div.pie", h("button.btn", { onclick: () => cerrar() }, "Cancelar"), boton),
    ];
  }, { ancho: true });
}

// Avisa si ya hay tickets parecidos (sin IA: similitud de texto en la base).
export async function buscarParecidos(areaId, texto, contenedor) {
  if (!texto || texto.trim().length < 4) return vaciar(contenedor);
  try {
    const filas = (await api("/parecidos" + consulta({ area: areaId, texto: texto.trim() }), { silencioso: true })).parecidos;
    vaciar(contenedor, filas.length > 0 && h("div.caja-ia", { style: { borderColor: "rgba(251,191,36,.4)", background: "rgba(251,191,36,.07)" } },
      h("div.cab-ia", { style: { color: "var(--amber)" } }, "¿Ya existe? Hay tickets parecidos:"),
      filas.map((t) => h("a", {
        href: "#", onclick: (e) => { e.preventDefault(); verTicket(t.numero); },
      }, `T-${t.numero} · ${t.titulo}${t.cerrado ? " (terminado)" : ""}`))));
  } catch (e) {
    vaciar(contenedor);
  }
}

// Bloque de IA dentro del panel del ticket: resumir y desglosar.
export function seccionIA(t, editable, recargar) {
  const salida = h("div");
  const resumir = async (boton) => {
    boton.disabled = true;
    vaciar(salida, h("div.cargando-ia", puntos(), " Leyendo el ticket"));
    try {
      const { resumen } = await llamarIA("resumir", { ticket_id: t.id });
      vaciar(salida, h("div.caja-ia", h("div.cab-ia", "✦ Resumen"), h("div.texto", resumen)));
    } catch (e) {
      vaciar(salida);
      error(e, "IA");
    } finally {
      boton.disabled = false;
    }
  };
  const desglosar = async (boton) => {
    boton.disabled = true;
    vaciar(salida, h("div.cargando-ia", puntos(), " Desglosando"));
    try {
      const p = await llamarIA("desglosar", { ticket_id: t.id });
      const marcas = [
        ...p.checklist.map((texto) => ({ tipo: "checklist", texto, chk: h("input", { type: "checkbox", checked: true }) })),
        ...p.subtareas.map((s) => ({ tipo: "subtarea", texto: s.titulo, descripcion: s.descripcion, chk: h("input", { type: "checkbox", checked: true }) })),
      ];
      if (!marcas.length) return vaciar(salida, h("div.caja-ia", "La IA no encontró pasos que agregar."));
      const aplicar = h("button.btn.ia.chico", "Agregar lo marcado");
      aplicar.addEventListener("click", async () => {
        aplicar.disabled = true;
        try {
          const elegidos = marcas.filter((m) => m.chk.checked);
          const textos = elegidos.filter((m) => m.tipo === "checklist").map((m) => m.texto);
          if (textos.length) await tickets.checklist(t.id, textos);
          for (const s of elegidos.filter((m) => m.tipo === "subtarea")) {
            await tickets.crear({ area_id: t.area_id, padre_id: t.id, titulo: s.texto, descripcion: s.descripcion || "" });
          }
          vaciar(salida);
          toast("Agregado");
          recargar();
        } catch (e) {
          error(e, "No se agregó");
          aplicar.disabled = false;
        }
      });
      vaciar(salida, h("div.caja-ia",
        h("div.cab-ia", "✦ Propuesta"),
        marcas.map((m) => h("label.check-item", m.chk, h("span", (m.tipo === "subtarea" ? "Subtarea: " : "") + m.texto))),
        h("div.fila", aplicar, h("button.btn.chico", { onclick: () => vaciar(salida) }, "Descartar"))));
    } catch (e) {
      vaciar(salida);
      error(e, "IA");
    } finally {
      boton.disabled = false;
    }
  };
  const bResumir = h("button.btn.ia.chico", "✦ Resumir");
  bResumir.addEventListener("click", () => resumir(bResumir));
  const bDesglosar = editable && h("button.btn.ia.chico", "✦ Desglosar en pasos");
  bDesglosar && bDesglosar.addEventListener("click", () => desglosar(bDesglosar));
  return h("div.seccion",
    h("div.seccion-cab", h("h3", "IA"), h("div.acciones", bResumir, bDesglosar)),
    salida);
}

// Después de pedir un ticket: la IA lo ordena (prioridad, etiquetas, responsable) sin bloquear.
export function clasificarSolicitud(ticketId) {
  llamarIA("clasificar", { ticket_id: ticketId }).catch((e) => console.warn("Clasificación IA:", e.message));
}
