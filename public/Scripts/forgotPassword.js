import { apiJson } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgotForm');
  const emailInput = document.getElementById('email');
  const messageEl = document.getElementById('formMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageEl.textContent = '';
    const email = emailInput.value.trim();
    if (!email) {
      messageEl.textContent = 'El correo es necesario';
      return;
    }
    const { ok, data } = await apiJson('/password/reset', {
      method: 'POST',
      body: { email },
    });
    if (!ok) {
      messageEl.textContent = data.error || 'Correo inválido';
      return;
    }
    messageEl.textContent = 'Si el correo existe, enviamos instrucciones.';
  });
});
