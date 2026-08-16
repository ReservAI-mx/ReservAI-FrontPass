import { apiJson } from './api.js';

export function setupChangePassword() {
  const link = document.getElementById('changePasswordLink');
  const modal = document.getElementById('changePasswordModal');
  const form = document.getElementById('changePasswordForm');
  const errorEl = document.getElementById('changePasswordError');
  if (!link || !modal || !form) return;

  const close = () => modal.classList.remove('show');

  link.addEventListener('click', (e) => {
    e.preventDefault();
    form.reset();
    if (errorEl) errorEl.textContent = '';
    modal.classList.add('show');
  });

  modal.querySelectorAll('[data-close="changePasswordModal"]').forEach((btn) => {
    btn.addEventListener('click', close);
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (errorEl) errorEl.textContent = '';
    const current_password = document.getElementById('currentPassword').value;
    const password = document.getElementById('newPassword').value;
    const confirm_password = document.getElementById('confirmNewPassword').value;
    if (password !== confirm_password) {
      if (errorEl) errorEl.textContent = 'Las contraseñas no coinciden';
      return;
    }
    const { ok, data } = await apiJson('/password', {
      method: 'PATCH',
      body: { current_password, password, confirm_password },
    });
    if (!ok) {
      if (errorEl) errorEl.textContent = data.error || 'No se pudo cambiar la contraseña';
      return;
    }
    close();
  });
}
