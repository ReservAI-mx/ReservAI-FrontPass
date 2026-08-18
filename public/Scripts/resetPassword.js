import SessionStorageManager from './AppStorage.js';
import { apiJson } from './api.js';
import { setButtonLoading, shakeElement } from './buttonLoading.js';

// Mismas reglas que anuncia la lista de la vista.
const REGLAS = {
  largo:   (v) => v.length >= 12,
  mayus:   (v) => /[A-Z]/.test(v),
  minus:   (v) => /[a-z]/.test(v),
  numero:  (v) => /[0-9]/.test(v),
  simbolo: (v) => /[^A-Za-z0-9]/.test(v),
};

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('resetForm');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirmPassword');
  const codeInput = document.getElementById('code');
  const submitBtn = form.querySelector('button[type="submit"]');

  const errores = {
    password: document.getElementById('passwordError'),
    confirm: document.getElementById('confirmError'),
    code: document.getElementById('codeError'),
    form: document.getElementById('formError'),
  };

  const campos = [
    { input: passwordInput, error: errores.password },
    { input: confirmInput, error: errores.confirm },
    { input: codeInput, error: errores.code },
  ];

  function setError(input, errorEl, message) {
    const grupo = input.closest('.input-group');
    if (grupo) grupo.classList.add('has-error');
    if (errorEl) errorEl.textContent = message;
  }

  function clearErrors() {
    campos.forEach(({ input, error }) => {
      const grupo = input.closest('.input-group');
      if (grupo) grupo.classList.remove('has-error');
      if (error) error.textContent = '';
    });
    errores.form.textContent = '';
  }

  // --- Reglas que se van marcando conforme escribes ---
  const items = document.querySelectorAll('#passwordRules li');
  function refreshRules() {
    const v = passwordInput.value;
    items.forEach((li) => {
      const regla = REGLAS[li.dataset.regla];
      li.classList.toggle('cumplida', Boolean(regla && regla(v)));
    });
  }
  passwordInput.addEventListener('input', refreshRules);
  refreshRules();

  campos.forEach(({ input, error }) => {
    input.addEventListener('input', () => {
      const grupo = input.closest('.input-group');
      if (grupo) grupo.classList.remove('has-error');
      if (error) error.textContent = '';
      errores.form.textContent = '';
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();

    const password = passwordInput.value;
    const confirm_password = confirmInput.value;
    const code = codeInput.value.trim();

    let valido = true;
    const faltantes = Object.entries(REGLAS)
      .filter(([, prueba]) => !prueba(password))
      .length;

    if (!password) {
      setError(passwordInput, errores.password, 'La contraseña es necesaria');
      valido = false;
    } else if (faltantes > 0) {
      setError(passwordInput, errores.password, 'Falta cumplir los requisitos marcados abajo');
      valido = false;
    }
    if (password && confirm_password !== password) {
      setError(confirmInput, errores.confirm, 'Las contraseñas no coinciden');
      valido = false;
    }
    if (!/^[0-9]{6}$/.test(code)) {
      setError(codeInput, errores.code, 'El código 2FA debe tener 6 dígitos');
      valido = false;
    }
    if (!valido) {
      shakeElement(form);
      const primero = form.querySelector('.input-group.has-error input');
      if (primero) primero.focus();
      return;
    }

    setButtonLoading(submitBtn, true, 'Guardando...');
    try {
      const { ok, data } = await apiJson('/password/reset/confirm', {
        method: 'POST',
        body: { password, confirm_password, code },
      });
      if (!ok) {
        errores.form.textContent = data.error || data.message || 'No se pudo restablecer la contraseña';
        shakeElement(form);
        return;
      }
      SessionStorageManager.saveSession({
        token_type: data.token_type || 'two_factor_authentication',
      });
      window.location.href = '/twofa';
    } catch (err) {
      errores.form.textContent = err.message || 'Error de red al guardar la contraseña';
      shakeElement(form);
    } finally {
      if (document.body.contains(submitBtn)) {
        setButtonLoading(submitBtn, false);
      }
    }
  });
});
