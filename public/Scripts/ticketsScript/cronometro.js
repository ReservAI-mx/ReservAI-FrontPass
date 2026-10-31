// Cronómetro en la barra superior: muestra el registro de tiempo que está corriendo.
import { h, vaciar, error, reloj, toast } from "./ui.js";
import { api } from "./datos.js";
import { verTicket } from "./rutas.js";

let nodo = null, corriendo = null, intervalo = null;

export function montarCronometro(contenedor) {
  nodo = contenedor;
  window.addEventListener("tk:tiempo", refrescar);
  refrescar();
}

async function refrescar() {
  try {
    corriendo = (await api("/tiempo/corriendo", { silencioso: true })).corriendo;
  } catch (e) {
    corriendo = null;
  }
  pintar();
}

function pintar() {
  clearInterval(intervalo);
  if (!nodo) return;
  if (!corriendo) return vaciar(nodo);
  const tiempo = h("span.mono");
  const tic = () => { tiempo.textContent = reloj((Date.now() - new Date(corriendo.inicio).getTime()) / 1000); };
  tic();
  intervalo = setInterval(tic, 1000);
  const t = { numero: corriendo.numero, titulo: corriendo.titulo };
  vaciar(nodo, h("span.cronometro",
    h("a", { href: "#", style: { color: "inherit" }, title: t ? t.titulo : "", onclick: (e) => { e.preventDefault(); t && verTicket(t.numero); } },
      "T-" + (t ? t.numero : "?")),
    tiempo,
    h("button.btn.chico", { onclick: () => detenerCronometro() }, "■")));
}

export async function iniciarCronometro(ticketId) {
  try {
    // El servicio detiene el que estuviera corriendo y arranca el nuevo.
    await api("/tiempo/iniciar", { method: "POST", body: { ticket_id: ticketId } });
    toast("Cronómetro iniciado");
  } catch (e) {
    error(e, "No se pudo iniciar");
  }
  await refrescar();
}

export async function detenerCronometro({ silencioso = false } = {}) {
  try {
    const r = await api("/tiempo/detener", { method: "POST" });
    if (r.detenido && !silencioso) toast("Tiempo guardado");
  } catch (e) {
    error(e, "No se pudo detener");
  }
  await refrescar();
}
