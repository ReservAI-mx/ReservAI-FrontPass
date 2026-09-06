/**
 * Reglas de contraseña: espejo de PasswordManager.ValidateStrongPassword
 * del backend (PassManagerBackend/api/utils/PasswordManager.js).
 *
 * Si allá cambian, aquí también. Que el formulario dé por buena una
 * contraseña que el API rechaza es peor que no validar nada: el usuario ve
 * todas las reglas en verde y aun así le sale "Invalid password".
 */

/**
 * Conjunto exacto que acepta el backend. Ojo con lo que NO incluye:
 * # " ' < > , \ ni espacio. Un /[^A-Za-z0-9]/ daría por válidos esos
 * caracteres y el API los rechazaría.
 */
const SIMBOLOS = /[@$!%*?&;:_.\-=+/|(){}[\]^~`]/;

/** Para mostrarle al usuario qué símbolos puede usar. */
export const SIMBOLOS_PERMITIDOS = '@ $ ! % * ? & ; : _ . - = + / | ( ) { } [ ] ^ ~ `';

export const REGLAS = [
  { id: 'largo',   etiqueta: '12 caracteres', prueba: (v) => v.length >= 12 },
  { id: 'mayus',   etiqueta: 'Una mayúscula', prueba: (v) => /[A-Z]/.test(v) },
  { id: 'minus',   etiqueta: 'Una minúscula', prueba: (v) => /[a-z]/.test(v) },
  { id: 'numero',  etiqueta: 'Un número',     prueba: (v) => /\d/.test(v) },
  { id: 'simbolo', etiqueta: 'Un símbolo',    prueba: (v) => SIMBOLOS.test(v) },
];

/** El backend hace trim() antes de validar; aquí igual, para no discrepar. */
export function normalizar(valor) {
  return String(valor == null ? '' : valor).trim();
}

/**
 * @returns {{estado: Array, cumplidas: number, total: number, valida: boolean}}
 */
export function evaluar(valor) {
  const v = normalizar(valor);
  const estado = REGLAS.map((r) => ({ id: r.id, etiqueta: r.etiqueta, cumple: r.prueba(v) }));
  const cumplidas = estado.filter((r) => r.cumple).length;
  return { estado, cumplidas, total: REGLAS.length, valida: cumplidas === REGLAS.length };
}

/**
 * Pinta la lista de reglas y la barra de progreso a partir de un valor.
 * Devuelve el resultado de evaluar(), para no calcularlo dos veces.
 *
 * @param {string} valor
 * @param {{listaEl: HTMLElement, progresoEl: HTMLElement, textoEl: HTMLElement}} els
 */
export function pintarProgreso(valor, { listaEl, progresoEl, textoEl }) {
  const { estado, cumplidas, total, valida } = evaluar(valor);

  if (listaEl) {
    estado.forEach((r) => {
      const li = listaEl.querySelector(`[data-regla="${r.id}"]`);
      if (li) li.classList.toggle('cumplida', r.cumple);
    });
  }

  if (progresoEl) {
    const relleno = progresoEl.querySelector('.password-progress__relleno');
    if (relleno) relleno.style.setProperty('--progreso', `${(cumplidas / total) * 100}%`);
    progresoEl.dataset.nivel = String(cumplidas);
    const barra = progresoEl.querySelector('.password-progress__barra');
    if (barra) barra.setAttribute('aria-valuenow', String(cumplidas));
  }

  if (textoEl) {
    if (normalizar(valor) === '') {
      textoEl.textContent = 'Escribe una contraseña';
    } else if (valida) {
      textoEl.textContent = 'Cumple todos los requisitos';
    } else {
      const faltan = total - cumplidas;
      textoEl.textContent = faltan === 1
        ? 'Falta 1 requisito'
        : `Faltan ${faltan} requisitos`;
    }
  }

  return { estado, cumplidas, total, valida };
}

/** Los <li> se generan aquí para que lista y lógica no puedan discrepar. */
export function renderReglas(listaEl) {
  if (!listaEl) return;
  listaEl.innerHTML = REGLAS
    .map((r) => `<li data-regla="${r.id}">${r.etiqueta}</li>`)
    .join('');
}
