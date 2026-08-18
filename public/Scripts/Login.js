import LoginInfo from "../models/logininfo.js";
import SessionStorageManager from "./AppStorage.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const toggleBtn = document.getElementById("togglePasswordBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", togglePassword);
  }

  if (!form) {
    console.error("No se encontró el formulario con id='loginForm'");
    return;
  }

  function resetPlaceholders() {
    emailInput.placeholder = "Correo electrónico";
    passwordInput.placeholder = "Contraseña";
    [emailInput, passwordInput].forEach(inp => {
      inp.classList.remove("error-input");
    });
  }

  function showError(input, message) {
    input.value = "";
    input.placeholder = message;
    input.classList.add("error-input");
  }

  [emailInput, passwordInput].forEach(input => {
    input.addEventListener('focus', () => {
      input.classList.remove('error-input');
      if (input === emailInput) input.placeholder = "Correo electrónico";
      if (input === passwordInput) input.placeholder = "Contraseña";
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetPlaceholders();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    let valid = true;
    if (!email) {
      showError(emailInput, "El correo es necesario");
      valid = false;
    }
    if (!password) {
      showError(passwordInput, "La contraseña es necesaria");
      valid = false;
    }
    if (!valid) return;

    let loginInfo;
    try {
      loginInfo = new LoginInfo(email, password);
    } catch (err) {
      if (err.message.includes("Correo")) {
        showError(emailInput, err.message);
      } else if (err.message.includes("Contraseña")) {
        showError(passwordInput, err.message);
      } else {
        showError(emailInput, "Correo o contraseña inválidos");
        showError(passwordInput, "Correo o contraseña inválidos");
      }
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
    } catch (err) {
      showError(emailInput, "Correo o contraseña inválidos");
      showError(passwordInput, "Correo o contraseña inválidos");
    }
  });

  function togglePassword() {
    const passwordField = document.getElementById("password");
    passwordField.type = passwordField.type === "password" ? "text" : "password";
  }
});
