import { apiJson, requireAdminSession } from './api.js';
import { setButtonLoading, shakeElement } from './buttonLoading.js';

if (!requireAdminSession()) {
  /* redirect already triggered */
}

function showMessage(message, type = 'info', duration = 3000) {
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
  const emailInput = document.getElementById('email');
  const accountType = document.getElementById('accountType');
  const accountLabel = document.getElementById('accountLabel');
  const registerBtn = document.getElementById('registerBtn');

  function showError(input, message) {
    input.value = '';
    input.placeholder = message;
    input.classList.add('error-input');
  }

  emailInput.addEventListener('focus', () => {
    emailInput.classList.remove('error-input');
    emailInput.placeholder = 'Correo electrónico';
  });

  accountType.addEventListener('change', () => {
    accountLabel.textContent = accountType.checked ? 'Admin' : 'Cliente';
  });

  registerBtn.addEventListener('click', async () => {
    emailInput.classList.remove('error-input');
    const email = emailInput.value.trim();
    const role = accountType.checked ? 'admin' : 'client';

    if (!email) {
      showError(emailInput, 'El correo es necesario');
      shakeElement(emailInput);
      return;
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      showError(emailInput, 'Correo electrónico inválido');
      shakeElement(emailInput);
      return;
    }

    setButtonLoading(registerBtn, true, 'Enviando...');
    try {
      const { ok, data } = await apiJson('/invitations', {
        method: 'POST',
        body: { email, role },
      });
      if (!ok) {
        showError(emailInput, data.error || data.message || 'No se pudo enviar la invitación');
        shakeElement(emailInput);
        return;
      }
      showMessage('Invitación enviada', 'success', 4000);
      emailInput.value = '';
    } catch (err) {
      showError(emailInput, err.message || 'Error al enviar la invitación');
      shakeElement(emailInput);
    } finally {
      setButtonLoading(registerBtn, false);
    }
  });
});
