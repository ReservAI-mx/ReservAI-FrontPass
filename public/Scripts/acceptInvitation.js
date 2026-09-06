import SessionStorageManager from './AppStorage.js';
import { apiJson } from './api.js';
import { setButtonLoading, shakeElement } from './buttonLoading.js';
import {
  SIMBOLOS_PERMITIDOS,
  normalizar,
  pintarProgreso,
  renderReglas,
} from './passwordRules.js';

/**
 * El API responde en inglés y con texto pensado para depurar. Aquí se traduce
 * a algo accionable; "Invalid password" no le dice a nadie qué corregir.
 */
const ERRORES = {
  'Invalid password': 'La contraseña no cumple los requisitos de arriba.',
  'Passwords do not match': 'Las contraseñas no coinciden.',
  'Invalid name': 'El nombre no es válido. Usa al menos 2 caracteres.',
  'Account already exists': 'Ya existe una cuenta con este correo.',
  'Invitation role mismatch': 'Esta invitación es para otro tipo de cuenta.',
  'Internal server error': 'Error del servidor. Vuelve a intentar en un momento.',
};

function traducir(mensaje) {
  return ERRORES[mensaje] || mensaje || 'No se pudo crear la cuenta';
}

function roleFromQuery() {
  const role = new URLSearchParams(window.location.search).get('role');
  return role === 'admin' ? 'admin' : role === 'client' ? 'client' : null;
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('acceptForm');
  const nameInput = document.getElementById('name');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirmPassword');
  const submitBtn = document.getElementById('crearBtn');

  const nameError = document.getElementById('nameError');
  const passwordError = document.getElementById('passwordError');
  const matchHint = document.getElementById('matchHint');
  const formError = document.getElementById('formError');

  const listaEl = document.getElementById('passwordRules');
  const progresoEl = document.getElementById('passwordProgress');
  const textoEl = document.getElementById('passwordProgressTexto');

  const pistaSimbolos = document.querySelector('.password-hint');

  renderReglas(listaEl);
  document.getElementById('simbolosPermitidos').textContent = SIMBOLOS_PERMITIDOS;

  const els = { listaEl, progresoEl, textoEl };

  // --- Estado del formulario ---

  function coinciden() {
    return normalizar(passwordInput.value) === normalizar(confirmInput.value);
  }

  function pintarCoincidencia() {
    matchHint.classList.remove('is-ok', 'is-error');
    // Nada que decir mientras no haya empezado a confirmar.
    if (confirmInput.value === '') {
      matchHint.textContent = '';
      return;
    }
    if (coinciden()) {
      matchHint.textContent = 'Las contraseñas coinciden';
      matchHint.classList.add('is-ok');
    } else {
      matchHint.textContent = 'Las contraseñas no coinciden';
      matchHint.classList.add('is-error');
    }
  }

  /**
   * El botón se habilita solo cuando todo está listo. Con las reglas y la
   * barra a la vista, queda claro por qué sigue apagado.
   */
  function refrescar() {
    const { estado, valida } = pintarProgreso(passwordInput.value, els);

    // La lista de símbolos permitidos solo estorba una vez cumplida la regla;
    // aparece justo cuando es la que falta.
    const simbolo = estado.find((r) => r.id === 'simbolo');
    pistaSimbolos.hidden = Boolean(simbolo && simbolo.cumple);

    pintarCoincidencia();
    const nombreOk = nameInput.value.trim().length >= 2;
    submitBtn.disabled = !(nombreOk && valida && coinciden() && confirmInput.value !== '');
    return valida;
  }

  [nameInput, passwordInput, confirmInput].forEach((input) => {
    input.addEventListener('input', () => {
      const grupo = input.closest('.input-group');
      if (grupo) grupo.classList.remove('has-error');
      formError.textContent = '';
      if (input === nameInput) nameError.textContent = '';
      if (input === passwordInput) passwordError.textContent = '';
      refrescar();
    });
  });

  // --- Mostrar / ocultar contraseña ---

  document.querySelectorAll('.toggle-password').forEach((btn) => {
    const destino = document.getElementById(btn.dataset.toggle);
    if (!destino) return;
    btn.addEventListener('click', () => {
      const visible = destino.type === 'text';
      destino.type = visible ? 'password' : 'text';
      btn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      const icono = btn.querySelector('i');
      if (icono) icono.className = visible ? 'fas fa-eye' : 'fas fa-eye-slash';
      destino.focus();
    });
  });

  refrescar();

  // --- Envío ---

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.textContent = '';

    const name = nameInput.value.trim();
    const password = normalizar(passwordInput.value);
    const confirm_password = normalizar(confirmInput.value);

    if (name.length < 2) {
      nameError.textContent = 'El nombre es necesario';
      nameInput.closest('.input-group')?.classList.add('has-error');
      shakeElement(form);
      nameInput.focus();
      return;
    }
    if (!refrescar()) {
      passwordError.textContent = 'La contraseña todavía no cumple los requisitos';
      shakeElement(form);
      passwordInput.focus();
      return;
    }
    if (!coinciden()) {
      shakeElement(form);
      confirmInput.focus();
      return;
    }

    // El rol viene en la query; sin él se prueban los dos, como antes.
    const preferido = roleFromQuery();
    const intentos = preferido ? [preferido] : ['client', 'admin'];
    let ultimoError = 'No se pudo crear la cuenta';

    setButtonLoading(submitBtn, true, 'Creando cuenta...');
    try {
      for (const role of intentos) {
        const { ok, status, data } = await apiJson(`/invitations/${role}`, {
          method: 'POST',
          body: { name, password, confirm_password },
        });

        if (ok) {
          SessionStorageManager.saveSession({
            account_type: data.data?.role || role,
            account_name: data.data?.email || name,
            verified: false,
            twofaenabled: false,
            token_type: 'email_sender',
          });
          window.location.href = '/verify_email';
          return;
        }

        // Rol equivocado: se prueba el otro sin molestar al usuario.
        if (status === 403 && data.error === 'Invitation role mismatch') {
          ultimoError = data.error;
          continue;
        }
        ultimoError = data.error || data.message || ultimoError;
        break;
      }

      formError.textContent = traducir(ultimoError);
      shakeElement(form);
    } catch {
      formError.textContent = 'Error de red. Revisa tu conexión e intenta de nuevo.';
      shakeElement(form);
    } finally {
      if (document.body.contains(submitBtn)) {
        setButtonLoading(submitBtn, false);
        refrescar(); // setButtonLoading reactiva el botón sin saber del estado
      }
    }
  });
});
