// Asistente IA: preguntas en lenguaje natural sobre los tickets (solo lo que puedo ver).
import { h, vaciar, error, avatar, puntos } from "../ui.js";
import { datos } from "../datos.js";
import { verTicket, ir } from "../rutas.js";
import { llamarIA } from "../ia.js";
import { icono } from "../iconos.js";

// La conversación se queda mientras la pestaña esté abierta.
const conversacion = [];

const SUGERENCIAS = [
  ["¿Qué tengo pendiente esta semana?", "Tus tickets con fecha en los próximos días"],
  ["¿Qué está vencido en Desarrollo?", "Lo atrasado de un área"],
  ["¿Qué terminó el equipo en los últimos 7 días?", "Logros recientes"],
  ["¿Quién tiene más carga ahorita?", "Tickets abiertos por persona"],
  ["¿Cuánto tiempo registré esta semana?", "Horas por ticket"],
  ["¿Qué solicitudes urgentes no tienen responsable?", "Pendientes de asignar"],
];

// Convierte "T-123" en ligas que abren el ticket.
function conEnlaces(texto) {
  const frag = document.createDocumentFragment();
  let ultimo = 0;
  for (const m of texto.matchAll(/T-(\d+)/g)) {
    frag.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
    frag.appendChild(h("a", { href: "#", onclick: (e) => { e.preventDefault(); verTicket(Number(m[1])); } }, m[0]));
    ultimo = m.index + m[0].length;
  }
  frag.appendChild(document.createTextNode(texto.slice(ultimo)));
  return frag;
}

export async function render(cont) {
  const mensajes = h("div.mensajes");
  const caja = h("textarea", { rows: 1, placeholder: "Pregunta lo que quieras sobre los tickets…", enterkeyhint: "send" });
  const boton = h("button.btn.primario", { title: "Enviar (Enter)", "aria-label": "Enviar" }, icono("enviar", { tam: 18 }), h("span.solo-escritorio", "Enviar"));
  const nombre = datos.yo.nombre.split(" ")[0];

  const fila = (rol, contenido) => h("div.fila-msg", { class: rol === "user" ? "yo" : "ia" },
    rol === "user" ? avatar(datos.yo) : h("span.bot.chico", "✦"),
    h("div.msg", contenido));

  const pintar = (pensando = false) => {
    vaciar(mensajes,
      !conversacion.length && h("div.bienvenida",
        h("span.bot", "✦"),
        h("h2", `Hola, ${nombre}. ¿Qué quieres saber?`),
        h("div.muted", "Reviso tickets, pendientes, vencidos, carga del equipo y tiempo registrado. Solo veo lo que tú puedes ver."),
        h("div.sugerencias", SUGERENCIAS.map(([s, d]) => h("button.sugerencia", { onclick: () => enviar(s) },
          h("div", s), h("div.dim", { style: { fontSize: ".78rem", marginTop: "2px" } }, d))))),
      conversacion.map((m) => fila(m.role, m.role === "user" ? m.content : conEnlaces(m.content))),
      pensando && fila("assistant", h("span.cargando-ia", puntos(), " Revisando los tickets")));
    // Con conversación, al último mensaje; la bienvenida se lee desde arriba.
    mensajes.scrollTop = conversacion.length ? mensajes.scrollHeight : 0;
  };

  const ajustarAltura = () => {
    caja.style.height = "44px";
    caja.style.height = Math.min(caja.scrollHeight + 2, 160) + "px";
  };

  // En el teléfono Enter es salto de línea (el teclado no tiene Shift a la
  // mano); se envía con el botón.
  const enviarConEnter = () => !window.matchMedia("(pointer: coarse)").matches;

  const enviar = async (texto) => {
    texto = (texto ?? caja.value).trim();
    if (!texto) return;
    caja.value = "";
    ajustarAltura();
    conversacion.push({ role: "user", content: texto });
    boton.disabled = true;
    pintar(true);
    try {
      const { respuesta } = await llamarIA("asistente", { mensajes: conversacion });
      conversacion.push({ role: "assistant", content: respuesta || "No encontré nada." });
    } catch (e) {
      conversacion.pop();
      caja.value = texto;
      error(e, "Asistente");
    } finally {
      boton.disabled = false;
      pintar();
      caja.focus();
    }
  };

  boton.addEventListener("click", () => enviar());
  caja.addEventListener("input", ajustarAltura);
  caja.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && enviarConEnter()) {
      e.preventDefault();
      enviar();
    }
  });

  vaciar(cont,
    h("div.encabezado",
      h("div", h("h1", "Asistente IA"), h("div.sub", "Pregúntale a tus tickets en lenguaje normal.")),
      h("div.acciones", h("button.btn", { onclick: () => { conversacion.length = 0; pintar(); caja.focus(); } }, "＋ Nueva conversación"))),
    h("div.asistente",
      h("div.tarjeta.chat",
        h("div.chat-cab",
          h("span.bot", "✦"),
          h("div", h("b", "Asistente de Tickets"), h("div.dim", { style: { fontSize: ".8rem" } }, "OpenAI · ve solo lo que tú ves"))),
        mensajes,
        h("div.entrada", caja, boton)),
      h("div.lado",
        h("div.tarjeta",
          h("h3", "Qué puedo hacer"),
          h("ul",
            h("li", "Buscar tickets por área, persona, prioridad o fecha"),
            h("li", "Decirte qué está vencido o sin responsable"),
            h("li", "Resumir un ticket: “¿en qué va el T-12?”"),
            h("li", "Contar la carga del equipo y el tiempo registrado"))),
        h("div.tarjeta",
          h("h3", "Otras funciones con IA"),
          h("ul",
            h("li", h("a", { href: "#", onclick: (e) => { e.preventDefault(); ir("#/dashboard"); } }, "Resumen del periodo"), " en el dashboard"),
            h("li", "✦ Crear con IA en cada área"),
            h("li", "✦ Resumir y desglosar dentro de cada ticket"))))));
  pintar();
  // En el teléfono no se abre el teclado solo: taparía las sugerencias.
  if (enviarConEnter()) caja.focus();
}
