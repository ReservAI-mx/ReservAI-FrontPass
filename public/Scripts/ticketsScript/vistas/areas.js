// Mis áreas (teléfono, cuando hay más de una): a cuál entrar.
import { h, vaciar } from "../ui.js";
import { misAreas, rol } from "../datos.js";
import { icono } from "../iconos.js";

const ROLES = { admin: "Admin del área", miembro: "Miembro", lector: "Sólo lectura" };

export async function render(cont) {
  const areas = misAreas();
  vaciar(cont,
    h("div.encabezado", h("h1", "Áreas")),
    !areas.length
      ? h("div.tarjeta.vacio", h("strong", "No estás en ninguna área"), "Pídele a un administrador que te agregue.")
      : h("div.tarjeta.menu-grupo", areas.map((a) => h("a.menu-fila", { href: `#/area/${a.clave}` },
        h("span.icono-area", { style: { background: a.color } }, a.nombre[0]),
        h("span.menu-texto", a.nombre, h("small", ROLES[rol(a.id)] || "")),
        icono("adelante", { tam: 18 })))));
}
