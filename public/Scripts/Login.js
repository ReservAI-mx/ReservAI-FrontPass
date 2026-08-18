import LoginInfo from "../models/logininfo.js";
import SessionStorageManager from "./AppStorage.js";
import { shakeElement } from "./buttonLoading.js";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const emailError = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');
  const toggleBtn = document.getElementById("togglePasswordBtn");

  if (!form) {
    console.error("No se encontró el formulario con id='loginForm'");
    return;
  }

  const campos = [
    { input: emailInput, error: emailError },
    { input: passwordInput, error: passwordError },
  ];

  /**
   * Marca el campo sin borrar lo que el usuario escribió: antes se vaciaba
   * el input y el error iba en el placeholder, así que fallar la contraseña
   * te obligaba a reescribir también el correo.
   */
  function setError(input, errorEl, message) {
    input.classList.add('error-input');
    const grupo = input.closest('.input-group');
    if (grupo) grupo.classList.add('has-error');
    if (errorEl) errorEl.textContent = message;
  }

  function clearErrors() {
    campos.forEach(({ input, error }) => {
      input.classList.remove('error-input');
      const grupo = input.closest('.input-group');
      if (grupo) grupo.classList.remove('has-error');
      if (error) error.textContent = '';
    });
  }

  campos.forEach(({ input, error }) => {
    input.addEventListener('input', () => {
      input.classList.remove('error-input');
      const grupo = input.closest('.input-group');
      if (grupo) grupo.classList.remove('has-error');
      if (error) error.textContent = '';
    });
  });

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const visible = passwordInput.type === "text";
      passwordInput.type = visible ? "password" : "text";
      toggleBtn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      const icono = toggleBtn.querySelector('i');
      if (icono) icono.className = visible ? 'fas fa-eye' : 'fas fa-eye-slash';
      passwordInput.focus();
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    let valido = true;
    if (!email) {
      setError(emailInput, emailError, "El correo es necesario");
      valido = false;
    } else if (!EMAIL_RE.test(email)) {
      setError(emailInput, emailError, "Ese correo no tiene un formato válido");
      valido = false;
    }
    if (!password) {
      setError(passwordInput, passwordError, "La contraseña es necesaria");
      valido = false;
    }
    if (!valido) {
      shakeElement(form);
      (emailInput.classList.contains('error-input') ? emailInput : passwordInput).focus();
      return;
    }

    let loginInfo;
    try {
      loginInfo = new LoginInfo(email, password);
    } catch {
      setError(emailInput, emailError, "Correo o contraseña inválidos");
      shakeElement(form);
      return;
    }

    try {
      const data = await loginInfo.login();
      SessionStorageManager.saveSession({
        token_type: data.token_type,
        account_type: data.account_type,
        account_name: email,
        verified: data.verified,
        twofaenabled: data.twofaenabled,
      });

      if (data.verified === false) {
        window.location.href = "/verify_email";
      } else if (data.verified === true && data.twofaenabled === false) {
        window.location.href = "/QR";
      } else {
        window.location.href = "/twofa";
      }
    } catch {
      // El backend no distingue cuál de los dos falló, a propósito.
      setError(passwordInput, passwordError, "Correo o contraseña inválidos");
      emailInput.classList.add('error-input');
      const grupoEmail = emailInput.closest('.input-group');
      if (grupoEmail) grupoEmail.classList.add('has-error');
      shakeElement(form);
      passwordInput.focus();
      passwordInput.select();
    }
  });
});
