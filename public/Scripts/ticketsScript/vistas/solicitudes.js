// Pedir tickets a otra área y seguir lo que pedí / lo que me pidieron.
import { h, vaciar, error, toast, esqueletos, PRIORIDADES, debounce, fechaConTexto } from "../ui.js";
import { datos, areaPorClave, puedeEditar, misAreas, escuchar, tickets as api, subirAdjunto, puedoEscribir } from "../datos.js";
import { verTicket, cambiarParam } from "../rutas.js";
import { tabla } from "./mis.js";
import { clasificarSolicitud, buscarParecidos } from "../ia.js";

export async function render(cont, _partes, params) {
  const pedidas = h("div", esqueletos(4));
  const recibidas = h("div");
  const editoAlguna = misAreas().some((a) => puedeEditar(a.id));

  vaciar(cont,
    h("div.encabezado", h("h1", "Solicitudes"),
      puedoEscribir() && h("div.acciones", h("button.btn.primario", { onclick: () => formulario() }, "+ Pedir un ticket"))),
    h("p.muted", "Aquí le pides trabajo a otra área (por ejemplo, Ventas a Desarrollo) y ves cómo va."),
    h("div.grupo-simple", h("div.grupo-cab", h("h3", "Lo que pedí")), pedidas),
    editoAlguna && h("div.grupo-simple", h("div.grupo-cab", h("h3", "Lo que le pidieron a mis áreas (abiertas)")), recibidas));

  const cargar = async () => {
    try {
      const mias = await api.listar({ solicitados: true, orden: "creado", limite: 200 });
      vaciar(pedidas, mias.length ? tabla(mias) : h("div.vacio", "Todavía no has pedido nada."));
      if (editoAlguna) {
        const llegaron = await api.listar({ recibidas: true, abiertos: true, orden: "creado", limite: 200 });
        vaciar(recibidas, llegaron.length ? tabla(llegaron) : h("div.vacio", "No hay solicitudes abiertas."));
      }
    } catch (e) {
      error(e, "No se cargaron las solicitudes");
    }
  };

  // Formulario en la propia vista (también se llega con ?pedir=clave-del-area).
  const formulario = (claveArea) => {
    const destinoInicial = claveArea ? areaPorClave(claveArea) : null;
    const destino = h("select",
      h("option", { value: "" }, "¿A qué área?"),
      datos.areas.filter((a) => !a.archivada).map((a) => h("option", { value: a.id, selected: destinoInicial?.id === a.id }, a.nombre)));
    const titulo = h("input", { type: "text", placeholder: "Resumen corto de lo que necesitas" });
    const desc = h("textarea", { rows: 6, placeholder: "Explica el detalle: qué pasa, a qué cliente afecta, pasos para verlo, enlaces…" });
    const prio = h("select", PRIORIDADES.map((p) => h("option", { value: p.id, selected: p.id === "normal" }, p.nombre)));
    const vence = h("input", { type: "date" });
    const archivos = h("input", { type: "file", multiple: true });
    const parecidos = h("div");
    titulo.addEventListener("blur", () => buscarParecidos(destino.value || null, titulo.value, parecidos));
    // Si viene de "Crear con IA" en un área donde no edito, llega ya llena.
    try {
      const deIA = JSON.parse(sessionStorage.getItem("tk-solicitud-ia") || "null");
      sessionStorage.removeItem("tk-solicitud-ia");
      if (deIA) {
        titulo.value = deIA.titulo || "";
        const pasos = deIA.checklist?.length ? "Pasos sugeridos:\n" + deIA.checklist.map((c) => "- " + c).join("\n") : "";
        desc.value = [deIA.descripcion, pasos].filter(Boolean).join("\n\n");
        prio.value = deIA.prioridad || "normal";
        if (deIA.vence) vence.value = deIA.vence;
      }
    } catch (_) { /* sin almacenamiento */ }
    const boton = h("button.btn.primario", "Enviar solicitud");
    const caja = h("div.tarjeta", { style: { padding: "18px", marginBottom: "20px", display: "grid", gap: "12px", maxWidth: "720px" } },
      h("h2", "Pedir un ticket"),
      h("div.rejilla-2",
        h("label.campo", h("span", "Área"), destino),
        h("label.campo", h("span", "Prioridad sugerida"), prio)),
      h("label.campo", h("span", "Título"), titulo),
      parecidos,
      h("label.campo", h("span", "Descripción"), desc),
      h("div.rejilla-2",
        h("label.campo", h("span", "¿Para cuándo lo necesitas? (opcional)"), fechaConTexto(vence)),
        h("label.campo", h("span", "Archivos (opcional)"), archivos)),
      h("div.fila", boton, h("button.btn", { onclick: () => { caja.remove(); cambiarParam("pedir", null); } }, "Cancelar")));
    boton.addEventListener("click", async () => {
      if (!destino.value) return toast("Elige el área.");
      if (!titulo.value.trim()) return toast("Ponle un título.");
      boton.disabled = true;
      try {
        const t = await api.crear({
          area_id: destino.value, titulo: titulo.value.trim(), descripcion: desc.value,
          prioridad: prio.value, vence: vence.value || null,
        });
        for (const f of archivos.files) {
          try {
            await subirAdjunto(t.id, f);
          } catch (e) {
            error(e, "No se subió " + f.name);
          }
        }
        toast(`Solicitud T-${t.numero} enviada`);
        clasificarSolicitud(t.id);
        caja.remove();
        await cargar();
        verTicket(t.numero);
      } catch (e) {
        error(e, "No se envió");
      } finally {
        boton.disabled = false;
      }
    });
    cont.querySelector(".tarjeta")?.remove();
    cont.insertBefore(caja, cont.children[2]);
    titulo.focus();
  };

  if (params.get("pedir")) formulario(params.get("pedir"));
  await cargar();
  return escuchar("solicitudes", ["tk_tickets"], debounce(cargar, 600));
}
