// Pantalla para quien entra al pass pero todavía no tiene acceso a Tickets.
// El login es el del pass (correo, contraseña y código).
import { h, vaciar, marca } from "../ui.js";

export function pantallaSinAcceso(raiz, yo) {
  vaciar(raiz, h("div.login", h("div.tarjeta.caja",
    marca(),
    h("p", "Tu cuenta (", h("b", yo?.correo || ""), ") todavía no tiene acceso a Tickets."),
    h("p.muted", "Pídele a un administrador que te lo dé en Tickets → Administración → Acceso."))));
}
