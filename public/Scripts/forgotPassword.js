import { apiJson } from './api.js';
import { setButtonLoading, shakeElement } from './buttonLoading.js';

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgotForm');
  const emailInput = document.getElementById('email');
  const emailError = document.getElementById('emailError');
  const messageEl = document.getElementById('formMessage');
  const submitBtn = form.querySelector('button[type="submit"]');
  const grupo = emailInput.closest('.input-group');

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

  function setMessage(texto, tipo) {
    messageEl.textContent = texto;
    messageEl.classList.remove('is-ok', 'is-error');
    if (tipo) messageEl.classList.add(tipo);
  }

  emailInput.addEventListener('input', () => {
    clearError();
    setMessage('', null);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    setMessage('', null);

    const email = emailInput.value.trim();
    if (!email) {
      setError('El correo es necesario');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError('Ese correo no tiene un formato válido');
      return;
    }

    setButtonLoading(submitBtn, true, 'Enviando...');
    try {
      const { ok, data } = await apiJson('/password/reset', {
        method: 'POST',
        body: { email },
      });
      if (!ok) {
        setError(data.error || data.message || 'No se pudo enviar el correo');
        return;
      }
      // Respuesta neutra a propósito: no revela si la cuenta existe.
      setMessage('Si el correo existe, te enviamos las instrucciones. Revisa tu bandeja.', 'is-ok');
      emailInput.blur();
    } catch (err) {
      setMessage(err.message || 'Error de red al enviar el correo', 'is-error');
    } finally {
      if (document.body.contains(submitBtn)) {
        setButtonLoading(submitBtn, false);
      }
    }
  });
});
