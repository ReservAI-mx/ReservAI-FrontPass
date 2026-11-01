// Avisos en pantalla completa (pestaña "Avisos" del teléfono).
import { h, vaciar } from "../ui.js";
import { lista, alCambiarSinLeer, marcarTodos, hayPorLeer, cargar } from "../avisos.js";

export async function render(cont) {
  const zona = h("div");
  const acciones = h("div.acciones");
  const pintar = () => {
    vaciar(acciones, hayPorLeer() && h("button.btn.chico", { onclick: marcarTodos }, "Marcar todo como leído"));
    vaciar(zona, lista());
  };
  vaciar(cont, h("div.encabezado", h("h1", "Avisos"), acciones), h("div.tarjeta.caja-avisos", zona));
  cargar();
  return alCambiarSinLeer(pintar);
}
