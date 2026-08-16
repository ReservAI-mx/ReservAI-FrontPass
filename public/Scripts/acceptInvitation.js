import SessionStorageManager from './AppStorage.js';
import { apiJson } from './api.js';

function roleFromQuery() {
  const role = new URLSearchParams(window.location.search).get('role');
  return role === 'admin' ? 'admin' : role === 'client' ? 'client' : null;
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('acceptForm');
  const nameInput = document.getElementById('name');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirmPassword');
  const errorEl = document.getElementById('formError');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';

    const name = nameInput.value.trim();
    const password = passwordInput.value;
    const confirm_password = confirmInput.value;

    if (name.length < 2) {
      errorEl.textContent = 'El nombre es necesario';
      return;
    }
    if (password !== confirm_password) {
      errorEl.textContent = 'Las contraseñas no coinciden';
      return;
    }

    const preferred = roleFromQuery();
    const attempts = preferred ? [preferred] : ['client', 'admin'];
    let lastError = 'No se pudo crear la cuenta';

    for (const role of attempts) {
      const { ok, status, data } = await apiJson(`/invitations/${role}`, {
        method: 'POST',
        body: { name, password, confirm_password },
      });
      if (ok) {
        SessionStorageManager.saveSession({
          account_type: data.data?.role || role,
          account_name: data.data?.email || name,
          verified: false,
          twofaenabled: false,
          token_type: 'email_sender',
        });
        window.location.href = '/verify_email';
        return;
      }
      if (status === 403 && data.error === 'Invitation role mismatch') {
        lastError = data.error;
        continue;
      }
      lastError = data.error || data.message || lastError;
      break;
    }
    errorEl.textContent = lastError;
  });
});
