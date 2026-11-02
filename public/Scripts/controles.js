// Listas desplegables y calendario propios para las pantallas del pass.
//
// Los <select> y los <input type="date"> se quedan en la página: cada pantalla
// los sigue leyendo y escuchando igual (value, "change"). Sólo cambia lo que se
// abre al tocarlos: en la compu, una lista o un calendario pegado al campo; en
// el teléfono, una hoja que sube desde abajo.
//
// Para dejar alguno con el del sistema: data-nativo en el campo o en un
// contenedor. Los estilos están en estilos/StylesControles.css.

const TELEFONO = window.matchMedia("(max-width: 768px)");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
const NS = "http://www.w3.org/2000/svg";

// Lo que está abierto: { campo, ancla, caja, velo, hoja, teclas }.
let abierto = null;
// Para que el clic que cerró un campo no lo vuelva a abrir (las pantallas
// llaman showPicker() en su propio onclick).
let cerrado = { campo: null, en: 0 };

function gestionado(el) {
  if (!el || el.disabled || el.closest("[data-nativo]")) return false;
  if (el instanceof HTMLSelectElement) return !el.multiple && el.size <= 1;
  return el instanceof HTMLInputElement && el.type === "date" && !el.readOnly;
}

// El campo que se toca: el propio select/fecha o el de su <label>.
function campoDe(objetivo) {
  if (!(objetivo instanceof Element)) return null;
  const el = objetivo.closest("select, input[type=date]") || objetivo.closest("label")?.control;
  return gestionado(el) ? el : null;
}

function nuevo(etiqueta, clase, texto) {
  const el = document.createElement(etiqueta);
  if (clase) el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function palomita() {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ctl-palomita");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", "M20 6 9 17l-5-5");
  svg.appendChild(p);
  return svg;
}

// Nombre del campo para el título de la hoja del teléfono.
function nombreDe(campo) {
  const etiqueta = campo.labels?.[0];
  const texto = etiqueta?.querySelector("span")?.textContent || etiqueta?.textContent || campo.getAttribute("aria-label") || campo.title || "";
  return texto.replace(/\s+/g, " ").trim();
}

function avisar(campo) {
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  campo.dispatchEvent(new Event("change", { bubbles: true }));
}

function sinAcentos(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ---------- Abrir, colocar y cerrar ----------

function colocar() {
  if (!abierto || abierto.hoja) return;
  const { caja, ancla } = abierto;
  const r = ancla.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return cerrar();
  caja.style.minWidth = Math.min(Math.max(r.width, 200), innerWidth - 16) + "px";
  caja.style.maxHeight = "";
  const abajo = innerHeight - r.bottom - 12;
  const arriba = r.top - 12;
  const alto = caja.offsetHeight;
  const haciaArriba = alto > abajo && arriba > abajo;
  caja.style.maxHeight = Math.max(160, Math.min(haciaArriba ? arriba : abajo, 380)) + "px";
  const ancho = caja.offsetWidth;
  caja.style.left = Math.max(8, Math.min(r.left, innerWidth - ancho - 8)) + "px";
  caja.style.top = (haciaArriba ? r.top - 6 - caja.offsetHeight : r.bottom + 6) + "px";
  caja.classList.toggle("arriba", haciaArriba);
}

function abrir(campo, construir) {
  if (abierto?.campo === campo) return;
  cerrar();
  const hoja = TELEFONO.matches;
  const caja = nuevo("div", "ctl-caja " + (hoja ? "ctl-hoja" : "ctl-pop"));
  const estado = { campo, ancla: campo.closest(".valor-select, .fecha-campo") || campo, caja, velo: null, hoja, teclas: () => false };
  if (hoja) {
    estado.velo = nuevo("div", "ctl-velo");
    estado.velo.addEventListener("click", () => cerrar());
    const cab = nuevo("div", "ctl-hoja-cab");
    cab.append(nuevo("span", "ctl-asa"));
    const nombre = nombreDe(campo);
    if (nombre) cab.append(nuevo("div", "ctl-hoja-titulo", nombre));
    caja.append(cab);
  }
  abierto = estado;
  construir(estado);
  if (estado.velo) document.body.append(estado.velo);
  document.body.append(caja);
  document.documentElement.classList.toggle("ctl-con-hoja", hoja);
  campo.setAttribute("aria-expanded", "true");
  colocar();
  estado.alAbrir?.();
}

function cerrar({ enfocar = false } = {}) {
  if (!abierto) return;
  const { campo, caja, velo } = abierto;
  abierto = null;
  cerrado = { campo, en: Date.now() };
  caja.remove();
  velo?.remove();
  document.documentElement.classList.remove("ctl-con-hoja");
  campo.setAttribute("aria-expanded", "false");
  if (enfocar && !TELEFONO.matches) campo.focus({ preventScroll: true });
}

function abrirCampo(campo) {
  if (!gestionado(campo)) return;
  abrir(campo, campo instanceof HTMLSelectElement ? lista : calendario);
}

// ---------- Lista desplegable ----------

function lista(estado) {
  const { campo: sel, caja } = estado;
  const cont = nuevo("div", "ctl-lista");
  cont.setAttribute("role", "listbox");
  const items = [];
  const grupos = [];
  let grupo = null;
  for (const op of sel.options) {
    if (op.hidden) continue;
    if (op.parentElement !== grupo && op.parentElement.tagName === "OPTGROUP") {
      grupo = op.parentElement;
      grupos.push({ el: nuevo("div", "ctl-grupo", grupo.label), items: [] });
      cont.append(grupos.at(-1).el);
    }
    const el = nuevo("div", "ctl-op");
    el.setAttribute("role", "option");
    if (op.dataset.color) {
      const bola = nuevo("span", "ctl-bola");
      bola.style.setProperty("--c", op.dataset.color);
      el.append(bola);
    }
    el.append(nuevo("span", "ctl-texto", op.text), palomita());
    if (op.disabled || op.parentElement.disabled) {
      el.classList.add("desactivada");
      el.setAttribute("aria-disabled", "true");
    }
    if (op.selected) {
      el.classList.add("elegida");
      el.setAttribute("aria-selected", "true");
    }
    const i = items.length;
    el.addEventListener("click", () => elegir(i));
    el.addEventListener("mousemove", () => activar(i, false));
    items.push({ op, el, texto: sinAcentos(op.text) });
    if (op.parentElement.tagName === "OPTGROUP") grupos.at(-1).items.push(el);
    cont.append(el);
  }
  if (!items.length) cont.append(nuevo("div", "ctl-vacio", "Sin opciones"));

  let activo = -1;
  // Mueve sólo la lista (scrollIntoView también movería la página de atrás).
  function asomar(el, centrar = false) {
    const y = el.offsetTop - cont.offsetTop;
    if (centrar) cont.scrollTop = y - (cont.clientHeight - el.offsetHeight) / 2;
    else if (y < cont.scrollTop) cont.scrollTop = y;
    else if (y + el.offsetHeight > cont.scrollTop + cont.clientHeight) cont.scrollTop = y + el.offsetHeight - cont.clientHeight;
  }
  const usable = (i) => items[i] && !items[i].el.hidden && !items[i].el.classList.contains("desactivada");
  function activar(i, desplazar = true) {
    items[activo]?.el.classList.remove("activa");
    activo = i;
    if (!items[i]) return;
    items[i].el.classList.add("activa");
    if (desplazar) asomar(items[i].el);
  }
  function mover(paso) {
    for (let i = activo + paso; i >= 0 && i < items.length; i += paso) {
      if (usable(i)) return activar(i);
    }
  }
  function extremo(paso) {
    activo = paso > 0 ? -1 : items.length;
    mover(paso);
  }
  function elegir(i) {
    if (!usable(i)) return;
    const cambia = sel.selectedIndex !== items[i].op.index;
    sel.selectedIndex = items[i].op.index;
    cerrar({ enfocar: true });
    if (cambia) avisar(sel);
  }

  // Con muchas opciones, una caja para buscar arriba.
  let buscar = null;
  if (items.length > 8) {
    buscar = nuevo("input", "ctl-buscar");
    buscar.type = "search";
    buscar.placeholder = "Buscar…";
    buscar.setAttribute("aria-label", "Buscar");
    buscar.addEventListener("input", () => {
      const q = sinAcentos(buscar.value.trim());
      for (const it of items) it.el.hidden = Boolean(q) && !it.texto.includes(q);
      for (const g of grupos) g.el.hidden = g.items.every((el) => el.hidden);
      activo = -1;
      mover(1);
    });
    caja.append(buscar);
  }
  caja.append(cont);

  // Para saltar con letras cuando no hay buscador.
  let tecleado = "";
  let tecleadoEn = 0;

  estado.alAbrir = () => {
    const actual = items.findIndex((it) => it.op.selected);
    if (usable(actual)) activar(actual);
    else mover(1);
    if (items[activo]) asomar(items[activo].el, true);
    if (buscar && !estado.hoja) buscar.focus({ preventScroll: true });
  };
  estado.teclas = (e) => {
    switch (e.key) {
      case "ArrowDown": mover(1); return true;
      case "ArrowUp": mover(-1); return true;
      case "Home": if (buscar) return false; extremo(1); return true;
      case "End": if (buscar) return false; extremo(-1); return true;
      case "PageDown": for (let n = 0; n < 6; n++) mover(1); return true;
      case "PageUp": for (let n = 0; n < 6; n++) mover(-1); return true;
      case "Enter": elegir(activo); return true;
      case "Tab": cerrar(); return false;
      case "Escape": cerrar({ enfocar: true }); return true;
      case " ":
        if (buscar) return false;
        elegir(activo);
        return true;
    }
    if (!buscar && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      tecleado = (Date.now() - tecleadoEn > 700 ? "" : tecleado) + sinAcentos(e.key);
      tecleadoEn = Date.now();
      const i = items.findIndex((it, n) => usable(n) && it.texto.startsWith(tecleado));
      if (i >= 0) activar(i);
      return true;
    }
    return false;
  };
}

// ---------- Calendario ----------

const aFecha = (iso) => new Date(iso + "T00:00:00Z");
const aIso = (d) => d.toISOString().slice(0, 10);
const sumarDias = (iso, n) => { const d = aFecha(iso); d.setUTCDate(d.getUTCDate() + n); return aIso(d); };
function sumarMeses(iso, n) {
  const d = aFecha(iso);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, fin));
  return aIso(d);
}
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calendario(estado) {
  const { campo: input, caja } = estado;
  const hoy = hoyLocal();
  const valido = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const min = valido(input.min) ? input.min : "";
  const max = valido(input.max) ? input.max : "";
  const permitido = (iso) => (!min || iso >= min) && (!max || iso <= max);
  let foco = valido(input.value) ? input.value : permitido(hoy) ? hoy : min || max;

  const anterior = nuevo("button", "ctl-cal-flecha", "‹");
  const siguiente = nuevo("button", "ctl-cal-flecha", "›");
  anterior.type = siguiente.type = "button";
  anterior.setAttribute("aria-label", "Mes anterior");
  siguiente.setAttribute("aria-label", "Mes siguiente");
  const titulo = nuevo("div", "ctl-cal-titulo");
  const cab = nuevo("div", "ctl-cal-cab");
  cab.append(anterior, titulo, siguiente);
  const semana = nuevo("div", "ctl-cal-semana");
  for (const d of DIAS) semana.append(nuevo("span", "", d));
  const rejilla = nuevo("div", "ctl-cal-dias");
  rejilla.setAttribute("role", "grid");
  const pie = nuevo("div", "ctl-cal-pie");
  const borrar = nuevo("button", "ctl-cal-boton", "Borrar");
  const botonHoy = nuevo("button", "ctl-cal-boton fuerte", "Hoy");
  borrar.type = botonHoy.type = "button";
  borrar.hidden = input.required || !input.value;
  botonHoy.disabled = !permitido(hoy);
  pie.append(borrar, botonHoy);
  const cal = nuevo("div", "ctl-cal");
  cal.append(cab, semana, rejilla, pie);
  caja.append(cal);

  function pintar() {
    const [a, m] = foco.split("-").map(Number);
    titulo.textContent = `${MESES[m - 1]} ${a}`;
    const primero = `${foco.slice(0, 7)}-01`;
    const desde = sumarDias(primero, -((aFecha(primero).getUTCDay() + 6) % 7));
    rejilla.textContent = "";
    for (let n = 0; n < 42; n++) {
      const iso = sumarDias(desde, n);
      const b = nuevo("button", "ctl-dia", String(Number(iso.slice(8))));
      b.type = "button";
      b.tabIndex = -1;
      b.dataset.iso = iso;
      if (iso.slice(0, 7) !== foco.slice(0, 7)) b.classList.add("fuera");
      if (iso === hoy) b.classList.add("hoy");
      if (iso === input.value) b.classList.add("elegido");
      if (iso === foco) b.classList.add("foco");
      if (!permitido(iso)) b.disabled = true;
      b.addEventListener("click", () => elegir(iso));
      rejilla.append(b);
    }
  }
  function irA(iso) {
    foco = iso;
    pintar();
  }
  function elegir(iso) {
    if (!permitido(iso)) return;
    const cambia = input.value !== iso;
    input.value = iso;
    cerrar({ enfocar: true });
    if (cambia) avisar(input);
  }
  // Los botones no se quedan con el foco: el teclado sigue en el campo.
  for (const b of [anterior, siguiente, borrar, botonHoy]) b.addEventListener("mousedown", (e) => e.preventDefault());
  rejilla.addEventListener("mousedown", (e) => e.preventDefault());
  anterior.addEventListener("click", () => irA(sumarMeses(foco, -1)));
  siguiente.addEventListener("click", () => irA(sumarMeses(foco, 1)));
  botonHoy.addEventListener("click", () => elegir(hoy));
  borrar.addEventListener("click", () => {
    cerrar({ enfocar: true });
    if (input.value) {
      input.value = "";
      avisar(input);
    }
  });
  pintar();

  estado.teclas = (e) => {
    const pasos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (pasos[e.key]) { irA(sumarDias(foco, pasos[e.key])); return true; }
    if (e.key === "PageUp") { irA(sumarMeses(foco, -1)); return true; }
    if (e.key === "PageDown") { irA(sumarMeses(foco, 1)); return true; }
    if (e.key === "Enter" || e.key === " ") { elegir(foco); return true; }
    if (e.key === "Escape") { cerrar({ enfocar: true }); return true; }
    if (e.key === "Tab") { cerrar(); return false; }
    return false;
  };
}

// ---------- Eventos ----------

// Teléfono: un toque (sin arrastrar) abre lo nuestro en lugar de la rueda.
let toque = null;
document.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  toque = t ? { x: t.clientX, y: t.clientY, campo: campoDe(e.target) } : null;
  if (abierto && !abierto.hoja && !abierto.caja.contains(e.target) && !abierto.ancla.contains(e.target)) cerrar();
}, { capture: true, passive: true });

document.addEventListener("touchend", (e) => {
  const t = e.changedTouches[0];
  const antes = toque;
  toque = null;
  if (!antes?.campo || !t) return;
  if (Math.abs(t.clientX - antes.x) > 10 || Math.abs(t.clientY - antes.y) > 10) return;
  e.preventDefault();
  abrirCampo(antes.campo);
}, { capture: true, passive: false });

document.addEventListener("mousedown", (e) => {
  const campo = campoDe(e.target);
  if (abierto && !abierto.caja.contains(e.target)) {
    const mismo = abierto.campo === campo;
    cerrar();
    if (mismo) { e.preventDefault(); return; }
  }
  if (!campo || e.button !== 0) return;
  e.preventDefault();
  campo.focus({ preventScroll: true });
  abrirCampo(campo);
}, true);

window.addEventListener("keydown", (e) => {
  if (abierto) {
    if (abierto.teclas(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    return;
  }
  const campo = campoDe(e.target);
  if (!campo || e.ctrlKey || e.metaKey) return;
  const conAlt = e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp");
  const deLista = campo instanceof HTMLSelectElement && !e.altKey && [" ", "Enter", "ArrowDown", "ArrowUp"].includes(e.key);
  if (!(e.key === "F4" || conAlt || deLista)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  abrirCampo(campo);
}, true);

window.addEventListener("scroll", (e) => {
  if (abierto && !abierto.hoja && !abierto.caja.contains(e.target)) colocar();
}, true);
window.addEventListener("resize", () => {
  if (abierto && abierto.hoja !== TELEFONO.matches) cerrar();
  else colocar();
});

// Las pantallas que abren el calendario con showPicker() (como Tickets)
// también reciben el nuestro.
for (const Clase of [HTMLSelectElement, HTMLInputElement]) {
  const original = Clase.prototype.showPicker;
  Clase.prototype.showPicker = function showPicker() {
    if (gestionado(this)) {
      if (cerrado.campo === this && Date.now() - cerrado.en < 350) return undefined;
      return abrirCampo(this);
    }
    if (!original) throw new DOMException("showPicker no disponible", "NotSupportedError");
    return original.call(this);
  };
}
