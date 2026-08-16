import SessionStorageManager from "./AppStorage.js";
import { apiJson } from "./api.js";
import { setButtonLoading, shakeElement } from "./buttonLoading.js";

function downloadRecovery(documentObj, filename) {
  const blob = new Blob([JSON.stringify(documentObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'totp-recovery.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function goHome() {
  let type = SessionStorageManager.getSession().account_type;
  if (!type) {
    const { ok } = await apiJson('/a?page=1');
    type = ok ? 'admin' : 'client';
    SessionStorageManager.saveSession({ account_type: type });
  }
  window.location.href = type === 'admin' ? '/inicioAdmin' : '/inicio';
}

function showRecoveryGate(data) {
  const overlay = document.createElement('div');
  overlay.id = 'recoveryGate';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
  overlay.innerHTML = `
    <div style="background:#111;color:#fff;max-width:420px;padding:1.5rem;border-radius:12px;">
      <h2 style="margin-top:0">Guarda tu documento de recuperación</h2>
      <p>Descárgalo y guárdalo en un lugar seguro. Sin este archivo no podrás desactivar 2FA si pierdes el autenticador.</p>
      <button type="button" id="downloadRecoveryBtn" class="btn-verify">Descargar</button>
      <button type="button" id="continueAfterRecovery" class="btn-verify" disabled style="opacity:.5;margin-top:.5rem">Continuar</button>
    </div>
  `;
  document.body.appendChild(overlay);
  let downloaded = false;
  document.getElementById('downloadRecoveryBtn').onclick = () => {
    downloadRecovery(data.recovery_document, data.recovery_filename);
    downloaded = true;
    const cont = document.getElementById('continueAfterRecovery');
    cont.disabled = false;
    cont.style.opacity = '1';
  };
  document.getElementById('continueAfterRecovery').onclick = () => {
    if (downloaded) goHome();
  };
}

document.addEventListener("DOMContentLoaded", () => {
    const inputs = document.querySelectorAll('.code-inputs input');
    const verifyBtn = document.querySelector('.btn-verify');
    const errorDiv = document.getElementById('twofa-error');
    const recoveryBtn = document.getElementById('lostAuthenticatorBtn');
    const recoveryPanel = document.getElementById('recoveryPanel');
    const recoveryFile = document.getElementById('recoveryFile');
    const recoverySubmit = document.getElementById('recoverySubmit');

    if (inputs.length > 0) inputs[0].focus();

    inputs.forEach(input => {
        input.addEventListener('input', () => {
            input.classList.remove('error-input');
            input.placeholder = "";
            if (errorDiv) errorDiv.textContent = "";
        });
    });

    inputs.forEach((input, idx) => {
        input.addEventListener('input', () => {
            if (input.value.length === 1 && idx < inputs.length - 1) {
                inputs[idx + 1].focus();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === "Backspace" && !input.value && idx > 0) {
                inputs[idx - 1].focus();
            }
            if (e.key === "Enter" && verifyBtn) {
                verifyBtn.click();
            }
        });
    });

    function showError(message) {
        inputs.forEach(input => {
            input.classList.add("error-input");
            input.value = "";
        });
        if (errorDiv) errorDiv.textContent = message;
        if (inputs[0]) inputs[0].focus();
    }

    if (verifyBtn) {
      verifyBtn.addEventListener('click', async () => {
        if (errorDiv) errorDiv.textContent = "";
        const code = Array.from(inputs).map(i => i.value).join('');
        if (code.length !== 6 || !/^\d{6}$/.test(code)) {
            showError("Código incorrecto, inténtalo de nuevo.");
            shakeElement(document.querySelector('.code-inputs'));
            return;
        }

        setButtonLoading(verifyBtn, true, "Verificando...");
        try {
            const { ok, data } = await apiJson("/twofa", {
                method: "POST",
                body: { code },
            });

            if (!ok) {
                showError(data.error || data.message || "Código incorrecto");
                shakeElement(document.querySelector('.code-inputs'));
                return;
            }

            SessionStorageManager.saveSession({
                token_type: data.token_type || 'access',
                twofaenabled: true,
            });

            if (data.recovery_download_required && data.recovery_document) {
                showRecoveryGate(data);
                return;
            }
            goHome();
        } catch (err) {
            showError(err.message || "Error al verificar");
        } finally {
            if (document.body.contains(verifyBtn)) {
              setButtonLoading(verifyBtn, false);
            }
        }
      });
    }

    if (recoveryBtn && recoveryPanel) {
      recoveryBtn.addEventListener('click', () => {
        recoveryPanel.hidden = !recoveryPanel.hidden;
      });
    }

    if (recoverySubmit && recoveryFile) {
      recoverySubmit.addEventListener('click', async () => {
        const file = recoveryFile.files && recoveryFile.files[0];
        if (!file) {
          showError("Selecciona el archivo de recuperación.");
          return;
        }
        const form = new FormData();
        form.append('backup_file', file);
        setButtonLoading(recoverySubmit, true, "Subiendo...");
        try {
          const { apiFetch } = await import('./api.js');
          const res = await apiFetch('/twofa/disable', { method: 'POST', body: form });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            showError(data.error || data.message || "No se pudo desactivar 2FA");
            return;
          }
          SessionStorageManager.saveSession({ twofaenabled: false, token_type: 'two_factor_authentication' });
          window.location.href = '/QR';
        } catch (err) {
          showError(err.message || "Error al subir el documento");
        } finally {
          if (document.body.contains(recoverySubmit)) {
            setButtonLoading(recoverySubmit, false);
          }
        }
      });
    }
});
