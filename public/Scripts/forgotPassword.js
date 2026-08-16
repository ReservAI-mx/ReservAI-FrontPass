import { apiJson } from './api.js';
import { setButtonLoading, shakeElement } from './buttonLoading.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgotForm');
  const emailInput = document.getElementById('email');
  const messageEl = document.getElementById('formMessage');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.textContent = '';
    const email = emailInput.value.trim();
    if (!email) {
      messageEl.textContent = 'El correo es necesario';
      shakeElement(emailInput);
      return;
    }
    setButtonLoading(submitBtn, true, 'Enviando...');
    try {
      const { ok, data } = await apiJson('/password/reset', {
        method: 'POST',
        body: { email },
      });
      if (!ok) {
        messageEl.textContent = data.error || 'Correo inválido';
        shakeElement(emailInput);
        return;
      }
      messageEl.textContent = 'Si el correo existe, enviamos instrucciones.';
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
});
