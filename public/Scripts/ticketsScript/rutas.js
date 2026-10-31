// Rutas con hash: "#/area/desarrollo/tablero?t=12".

export function leerRuta() {
  const [ruta, consulta = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { partes: ruta.split("/").filter(Boolean), params: new URLSearchParams(consulta) };
}

export function ir(ruta) {
  location.hash = ruta;
}

// Abre un ticket encima de la vista actual (?t=numero).
export function verTicket(numero) {
  cambiarParam("t", numero);
}

// Avisa a la estructura (menú lateral) que cambiaron áreas, personas, etc.
export function avisarCatalogos() {
  window.dispatchEvent(new Event("tk:catalogos"));
}

// Cambia un parámetro de la ruta actual (el botón "atrás" lo deshace).
export function cambiarParam(nombre, valor) {
  const { partes, params } = leerRuta();
  if (valor === null || valor === undefined || valor === "") params.delete(nombre);
  else params.set(nombre, valor);
  const consulta = params.toString();
  location.hash = "#/" + partes.join("/") + (consulta ? "?" + consulta : "");
}
