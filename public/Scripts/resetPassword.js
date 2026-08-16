import SessionStorageManager from './AppStorage.js';
import { apiJson } from './api.js';
import { setButtonLoading, shakeElement } from './buttonLoading.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('resetForm');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirmPassword');
  const codeInput = document.getElementById('code');
  const errorEl = document.getElementById('formError');
  const submitBtn = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    const password = passwordInput.value;
    const confirm_password = confirmInput.value;
    const code = codeInput.value.trim();

    if (password !== confirm_password) {
      errorEl.textContent = 'Las contraseñas no coinciden';
      shakeElement(confirmInput);
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      errorEl.textContent = 'El código 2FA debe tener 6 dígitos';
      shakeElement(codeInput);
      return;
    }

    setButtonLoading(submitBtn, true, 'Guardando...');
    try {
      const { ok, data } = await apiJson('/password/reset/confirm', {
        method: 'POST',
        body: { password, confirm_password, code },
      });
      if (!ok) {
        errorEl.textContent = data.error || data.message || 'No se pudo restablecer';
        shakeElement(form);
        return;
      }
      SessionStorageManager.saveSession({
        token_type: data.token_type || 'two_factor_authentication',
      });
      window.location.href = '/twofa';
    } finally {
      if (document.body.contains(submitBtn)) {
        setButtonLoading(submitBtn, false);
      }
    }
  });
});
