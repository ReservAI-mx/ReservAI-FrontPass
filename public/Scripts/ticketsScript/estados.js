// Crear un estado nuevo en un área (como "On hold") desde donde se necesite:
// la configuración del área, la lista de estados de un ticket o las vistas del
// área. Sólo los administradores del área (el servicio lo vuelve a revisar).
import { h, error, modal, toast } from "./ui.js";
import { api, cargarCatalogos, estadosDe } from "./datos.js";
import { avisarCatalogos } from "./rutas.js";

export const TIPOS_ESTADO = [
  ["abierto", "Por empezar", "Todavía no se trabaja."],
  ["en_curso", "En curso", "Alguien lo está trabajando."],
  ["en_espera", "On hold", "Para después: sigue abierto pero no avisa ni cuenta como vencido."],
  ["cerrado", "Terminado", "Cuenta como hecho y se cierra el ticket."],
];

const COLORES = ["#868C99", "#1AACF5", "#3DD68C", "#E8A33D", "#F0655C", "#A78BFA", "#F28CC0", "#4FD1C5"];

// Valor especial para la opción "+ Nuevo estado…" de una lista de estados.
export const NUEVO = "__nuevo_estado";
export const opcionNuevo = () => h("option", { value: NUEVO }, "+ Nuevo estado…");

// Abre el formulario. Devuelve el estado creado o null si se canceló.
export function nuevoEstado(areaId, { tipo = "en_curso" } = {}) {
  return new Promise((resolver) => {
    let creado = null;
    let color = COLORES[1];
    const nombre = h("input", { type: "text", maxlength: 40, placeholder: "Por ejemplo: Esperando al cliente", autofocus: true });
    const tipos = h("div.tipos-estado", { role: "radiogroup", "aria-label": "Tipo" },
      TIPOS_ESTADO.map(([v, t, d]) => h("label.tipo-estado",
        h("input", { type: "radio", name: "tipo-estado", value: v, checked: v === tipo }),
        h("span", h("b", t), h("small", d)))));
    const muestras = h("div.muestras", { role: "radiogroup", "aria-label": "Color" });
    const pintarMuestras = () => {
      muestras.textContent = "";
      muestras.append(...COLORES.map((c) => h("button.muestra", {
        type: "button", title: c, "aria-label": "Color " + c, "aria-checked": String(c === color), role: "radio",
        class: c === color ? "elegida" : "", style: { "--c": c },
        onclick: () => { color = c; pintarMuestras(); },
      })), h("label.muestra.otra", { title: "Otro color", class: COLORES.includes(color) ? "" : "elegida", style: { "--c": color } },
        h("input", { type: "color", value: color, oninput: (e) => { color = e.target.value.toUpperCase(); pintarMuestras(); } }), "+"));
    };
    pintarMuestras();
    const boton = h("button.btn.primario", { type: "submit" }, "Crear estado");

    const guardar = async (cerrar) => {
      const texto = nombre.value.trim();
      if (!texto) { nombre.focus(); return toast("Ponle un nombre."); }
      const elegido = tipos.querySelector("input:checked").value;
      boton.disabled = true;
      try {
        const e = await api(`/areas/${areaId}/estados`, { method: "POST", body: { nombre: texto, color, tipo: elegido } });
        // Va antes de los terminados (salvo que sea uno de ellos), como On hold.
        if (elegido !== "cerrado") {
          const ids = estadosDe(areaId).map((x) => x.id);
          const primerCerrado = estadosDe(areaId).findIndex((x) => x.tipo === "cerrado");
          if (primerCerrado >= 0) {
            ids.splice(primerCerrado, 0, e.id);
            await api(`/areas/${areaId}/estados/orden`, { method: "PUT", body: { ids } });
          }
        }
        await cargarCatalogos();
        avisarCatalogos();
        creado = e;
        toast(`Estado "${e.nombre}" creado`);
        cerrar();
      } catch (err) {
        error(err, "No se creó el estado");
      } finally {
        boton.disabled = false;
      }
    };

    modal("Nuevo estado", (cerrar) => h("form.cuerpo.form-estado", {
      onsubmit: (ev) => { ev.preventDefault(); guardar(cerrar); },
    },
      h("label.campo", h("span", "Nombre"), nombre),
      h("div.campo", h("span", "Tipo"), tipos),
      h("div.campo", h("span", "Color"), muestras),
      h("div.pie", h("button.btn", { type: "button", onclick: () => cerrar() }, "Cancelar"), boton)),
    { alCerrar: () => resolver(creado) });
  });
}
