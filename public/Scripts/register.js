import { apiJson, requireAdminSession } from './api.js';
import { setButtonLoading, shakeElement } from './buttonLoading.js';

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const session = requireAdminSession();

function showMessage(message, type = 'info', duration = 3500) {
  const container = document.getElementById('messageContainer');
  if (!container) return;
  const messageEl = document.createElement('div');
  messageEl.className = `message message-${type}`;
  messageEl.textContent = message;
  messageEl.style.animation = 'slideIn 0.3s ease-in-out';
  container.appendChild(messageEl);
  setTimeout(() => {
    messageEl.style.animation = 'slideOut 0.3s ease-in-out';
    setTimeout(() => messageEl.remove(), 300);
  }, duration);
}

document.addEventListener('DOMContentLoaded', () => {
  if (!session) return; // requireAdminSession ya redirigió

  const form = document.getElementById('inviteForm');
  const emailInput = document.getElementById('email');
  const emailError = document.getElementById('emailError');
  const registerBtn = document.getElementById('registerBtn');
  const grupo = emailInput.closest('.input-group');

  /**
   * Marca el campo sin vaciarlo: antes el error se metía en el placeholder
   * y borraba el correo que el admin acababa de escribir.
   */
  function setError(message) {
    grupo.classList.add('has-error');
    emailError.textContent = message;
    shakeElement(form);
    emailInput.focus();
  }

  function clearError() {
    grupo.classList.remove('has-error');
    emailError.textContent = '';
  }

  emailInput.addEventListener('input', clearError);

  // --- Switch de tipo de cuenta ---
  const accountType = document.getElementById('accountType');
  const labelClient = document.getElementById('labelClient');
  const labelAdmin = document.getElementById('labelAdmin');

  function rolSeleccionado() {
    return accountType.checked ? 'admin' : 'client';
  }

  function pintarRol() {
    const rol = rolSeleccionado();
    labelClient.classList.toggle('is-active', rol === 'client');
    labelAdmin.classList.toggle('is-active', rol === 'admin');
  }

  accountType.addEventListener('change', pintarRol);
  // Los rótulos también cambian el switch, para no obligar a atinarle.
  labelClient.addEventListener('click', () => { accountType.checked = false; pintarRol(); });
  labelAdmin.addEventListener('click', () => { accountType.checked = true; pintarRol(); });
  pintarRol();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const email = emailInput.value.trim();
    if (!email) {
      setError('El correo es necesario');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError('Ese correo no tiene un formato válido');
      return;
    }

    const role = rolSeleccionado();

    setButtonLoading(registerBtn, true, 'Enviando...');
    try {
      const { ok, data } = await apiJson('/invitations', {
        method: 'POST',
        body: { email, role },
      });
      if (!ok) {
        setError(data.error || data.message || 'No se pudo enviar la invitación');
        return;
      }
      const comoQue = role === 'admin' ? 'administrador' : 'cliente';
      showMessage(`Invitación enviada a ${email} como ${comoQue}`, 'success', 4500);
      emailInput.value = '';
      clearError();
      emailInput.focus();
    } catch (err) {
      setError(err.message || 'Error de red al enviar la invitación');
    } finally {
      if (document.body.contains(registerBtn)) {
        setButtonLoading(registerBtn, false);
      }
    }
  });
});
