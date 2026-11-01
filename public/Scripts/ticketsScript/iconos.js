// Íconos de línea (SVG) con el mismo trazo que el menú de cuenta del pass.
// En lugar de emojis: en iPhone ▶ 🔗 🗑 🔔 salen como emoji de colores y no
// combinan con la app.
const NS = "http://www.w3.org/2000/svg";

// Cada ícono: lista de trazos en una caja de 24×24.
const TRAZOS = {
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  buscar: ["M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z", "m16 16 4.5 4.5"],
  campana: ["M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0"],
  mas: ["M12 5v14", "M5 12h14"],
  casa: ["M4 11.5 12 5l8 6.5", "M6 10v9.5h12V10", "M10 19.5v-5h4v5"],
  check: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "m8 12.5 2.8 2.7L16.5 9.5"],
  cuadros: ["M4.5 4.5h6v6h-6z", "M13.5 4.5h6v6h-6z", "M4.5 13.5h6v6h-6z", "M13.5 13.5h6v6h-6z"],
  puntos: ["M5.5 12h.01", "M12 12h.01", "M18.5 12h.01"],
  atras: ["m14.5 5-7 7 7 7"],
  adelante: ["m9.5 5 7 7-7 7"],
  abajo: ["m6 9.5 6 6 6-6"],
  cerrar: ["M6 6l12 12", "M18 6 6 18"],
  enlace: ["M10 14a4.5 4.5 0 0 0 6.4 0l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2", "M14 10a4.5 4.5 0 0 0-6.4 0l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"],
  basura: ["M4.5 7h15", "M9.5 7V4.5h5V7", "M6.5 7l.9 12.5h9.2L17.5 7", "M10.25 10.5v6", "M13.75 10.5v6"],
  play: ["M8 5.5v13l10.5-6.5z"],
  stop: ["M6.5 6.5h11v11h-11z"],
  reloj: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7.5V12l3 2"],
  calendario: ["M4.5 6.5h15v13h-15z", "M4.5 10.5h15", "M8.5 4v4", "M15.5 4v4"],
  bandera: ["M6 21V4.5", "M6 5h10.5l-2 3.75 2 3.75H6"],
  persona: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4.5 20.5c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5"],
  etiqueta: ["M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z", "M8 8h.01"],
  estado: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"],
  comentario: ["M4.5 5.5h15v10h-8l-4.5 4v-4H4.5z"],
  clip: ["M15.5 7 8.6 13.9a2 2 0 0 0 2.8 2.8l7-7a4 4 0 0 0-5.6-5.7l-7 7a6 6 0 0 0 8.5 8.5L19 14.8"],
  chispa: ["M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9z", "M18.5 3.5v3", "M17 5h3"],
  grafica: ["M4.5 19.5h15", "M7 16.5v-5", "M11 16.5V8", "M15 16.5v-3", "M19 16.5V6"],
  flechas: ["M4.5 8.5h13", "m14 5 3.5 3.5-3.5 3.5", "M19.5 15.5h-13", "m10 12-3.5 3.5L10 19"],
  engrane: ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.1-1.2L14 3.5h-4l-.5 2.1a7 7 0 0 0-2.1 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.1 1.2l.5 2.1h4l.5-2.1a7 7 0 0 0 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"],
  salir: ["M14.5 4.75H6.75A2 2 0 0 0 4.75 6.75v10.5a2 2 0 0 0 2 2h7.75", "M17.5 15.25 20.75 12 17.5 8.75", "M20.25 12H10"],
  enviar: ["M4.5 12 20 4.5 16 20l-4-6.5z", "m12 13.5 8-9"],
  lista: ["M9 6.5h11", "M9 12h11", "M9 17.5h11", "M4.5 6.5h.01", "M4.5 12h.01", "M4.5 17.5h.01"],
  tablero: ["M4.5 4.5h4.5v15H4.5z", "M12 4.5h4.5v10H12z", "M19.5 4.5v7"],
  instalar: ["M12 4v11", "m7.5 10.5 4.5 4.5 4.5-4.5", "M5 19.5h14"],
  telefono: ["M7.5 3h9v18h-9z", "M11 18h2"],
  bitacora: ["M6 3.75h9.5L19 7.25v13H6z", "M9 11h7", "M9 14.5h7", "M9 18h4"],
  documentacion: ["M3.5 4h7v5h-7z", "M13.5 15h7v5h-7z", "M7 9v4.5h10V15"],
  candado: ["M4.25 10.25h15.5v9.5H4.25z", "M8 10.25V7.5a4 4 0 0 1 8 0v2.75"],
  correo: ["M2.75 5.25h18.5v13.5H2.75z", "m3.5 7 8.5 6 8.5-6"],
  ticket: ["M4.5 7.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v2a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-2a2.5 2.5 0 0 0 0-5z", "M14 5.5v13"],
  filtro: ["M4 6.5h16", "M7 12h10", "M10 17.5h4"],
  actualizar: ["M19.5 12a7.5 7.5 0 1 1-2.2-5.3", "M19.5 4.5v4h-4"],
};

// Rellenos (el resto es trazo).
const RELLENO = new Set(["play", "stop"]);

export function icono(nombre, { tam = 20, titulo = null } = {}) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", tam);
  svg.setAttribute("height", tam);
  svg.setAttribute("fill", RELLENO.has(nombre) ? "currentColor" : "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", nombre === "puntos" ? "3" : "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "ico-svg");
  if (titulo) {
    const t = document.createElementNS(NS, "title");
    t.textContent = titulo;
    svg.appendChild(t);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  for (const d of TRAZOS[nombre] || []) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
  }
  return svg;
}
