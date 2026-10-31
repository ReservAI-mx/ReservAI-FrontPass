// Tickets como app del teléfono: service worker (abre aunque no haya señal),
// "Agregar a la pantalla de inicio" y aviso de versión nueva.
import { h } from "./ui.js";

let aviso = null; // evento beforeinstallprompt (Android/Chrome)

export function esInstalada() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

const esIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const puedeInstalar = () => !!aviso || esIos();

/**
 * Android/Chrome: abre el diálogo del sistema. iPhone no tiene diálogo:
 * devuelve "ios" para enseñar los pasos de Safari.
 */
export async function instalar() {
  if (aviso) {
    aviso.prompt();
    const { outcome } = await aviso.userChoice;
    aviso = null;
    return outcome === "accepted" ? "aceptada" : "cancelada";
  }
  return "ios";
}

export function montarPwa() {
  document.body.classList.toggle("instalada", esInstalada());
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    aviso = e;
  });
  window.addEventListener("appinstalled", () => { aviso = null; });
  seguirTeclado();
  registrar();
}

/**
 * En iPhone el teclado tapa lo que está pegado abajo (la caja de comentar, las
 * hojas). Se mide cuánto tapa y queda en --teclado para que el CSS lo suba.
 */
function seguirTeclado() {
  const vv = window.visualViewport;
  if (!vv) return;
  const medir = () => {
    const tapado = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty("--teclado", (tapado > 80 ? tapado : 0) + "px");
  };
  vv.addEventListener("resize", medir);
  vv.addEventListener("scroll", medir);
}

async function registrar() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/tickets/sw.js", { scope: "/tickets/" });
  } catch (e) {
    console.warn("Service worker de Tickets:", e.message);
    return;
  }
  // El service worker avisa cuando instaló una versión nueva: la pantalla
  // abierta sigue con la vieja hasta recargar.
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.nueva) avisarVersion();
  });
}

function avisarVersion() {
  if (document.getElementById("avisoVersion")) return;
  document.body.appendChild(h("div.aviso-version#avisoVersion", { role: "status" },
    h("span", "Hay una versión nueva de Tickets."),
    h("button.btn.primario.chico", { onclick: () => location.reload() }, "Actualizar")));
}
