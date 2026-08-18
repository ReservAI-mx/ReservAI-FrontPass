import SessionStorageManager from "./AppStorage.js";
import { apiFetch, apiJson } from "./api.js";
import { setButtonLoading, shakeElement } from "./buttonLoading.js";

const MAX_RECOVERY_SIZE = 1024 * 1024; // 1 MB: el documento son unos cuantos KB.
const PROGRESS_ANIM_MS = 1200; // Duración de la barra. Es puramente visual.

/**
 * Barra de progreso decorativa: avanza solo con el reloj, no refleja los bytes
 * subidos. El documento pesa unos pocos KB y la subida real termina al
 * instante, así que un progreso fiel sería un parpadeo. Devuelve una promesa
 * que resuelve cuando la barra llega al final.
 */
function runFakeProgress(durationMs, onFrame) {
  const started = performance.now();
  return new Promise((resolve) => {
    function frame(now) {
      const ratio = Math.min((now - started) / durationMs, 1);
      onFrame(ratio);
      if (ratio < 1) {
        requestAnimationFrame(frame);
        return;
      }
      resolve();
    }
    requestAnimationFrame(frame);
  });
}

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

const ICON_SHIELD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.75 4.75 5.5v5.25c0 4.45 3.1 8.15 7.25 9.25 4.15-1.1 7.25-4.8 7.25-9.25V5.5L12 2.75Z"/><path d="M12 8.5v5"/><path d="m9.75 11.25 2.25 2.25 2.25-2.25"/></svg>`;
const ICON_FILE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a1.75 1.75 0 0 0-1.75 1.75v14.5A1.75 1.75 0 0 0 7 21h10a1.75 1.75 0 0 0 1.75-1.75V7.75L14 3Z"/><path d="M13.75 3.25V8h4.75"/></svg>`;
const ICON_DOWNLOAD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 12.5 5 5 10-11"/></svg>`;

function showRecoveryGate(data) {
  const filename = data.recovery_filename || 'totp-recovery.json';

  const overlay = document.createElement('div');
  overlay.id = 'recoveryGate';
  overlay.className = 'recovery-gate';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'recoveryGateTitle');
  overlay.innerHTML = `
    <div class="recovery-gate__card">
      <div class="recovery-gate__icon">${ICON_SHIELD}</div>
      <h2 class="recovery-gate__title" id="recoveryGateTitle">Guarda tu documento de recuperación</h2>
      <p class="recovery-gate__text">
        Descárgalo y guárdalo en un lugar seguro. Sin este archivo no podrás
        desactivar 2FA si pierdes el autenticador.
      </p>
      <div class="recovery-gate__file">
        ${ICON_FILE}<span class="recovery-gate__file-name"></span>
      </div>
      <div class="recovery-gate__actions">
        <button type="button" id="downloadRecoveryBtn" class="recovery-gate__btn recovery-gate__btn--primary">
          <span class="recovery-gate__bar"></span>
          <span class="recovery-gate__btn-icon">${ICON_DOWNLOAD}</span>
          <span class="recovery-gate__btn-label">Descargar documento</span>
        </button>
        <button type="button" id="continueAfterRecovery" class="recovery-gate__btn recovery-gate__btn--ghost" disabled>
          Continuar
        </button>
      </div>
      <p class="recovery-gate__hint" id="recoveryGateHint">Descarga el documento para continuar</p>
    </div>
  `;
  overlay.querySelector('.recovery-gate__file-name').textContent = filename;
  document.body.appendChild(overlay);
  document.body.classList.add('recovery-gate-open');

  const downloadBtn = overlay.querySelector('#downloadRecoveryBtn');
  const continueBtn = overlay.querySelector('#continueAfterRecovery');
  const hint = overlay.querySelector('#recoveryGateHint');
  let downloaded = false;

  const gateBar = downloadBtn.querySelector('.recovery-gate__bar');
  const downloadLabel = downloadBtn.querySelector('.recovery-gate__btn-label');
  const downloadIcon = downloadBtn.querySelector('.recovery-gate__btn-icon');

  downloadBtn.addEventListener('click', async () => {
    // Ya descargó antes: repetir es instantáneo, sin animación.
    if (downloaded) {
      downloadRecovery(data.recovery_document, filename);
      return;
    }

    downloadBtn.classList.add('is-downloading');
    downloadIcon.innerHTML = '';
    await runFakeProgress(PROGRESS_ANIM_MS, (ratio) => {
      const pct = Math.round(ratio * 100);
      gateBar.style.width = pct + '%';
      downloadLabel.textContent = 'Preparando... ' + pct + '%';
    });

    downloadRecovery(data.recovery_document, filename);

    downloaded = true;
    downloadBtn.classList.remove('is-downloading');
    gateBar.style.width = '0%';
    // El botón de descarga pasa a secundario y "Continuar" toma el rol principal.
    downloadBtn.classList.replace('recovery-gate__btn--primary', 'recovery-gate__btn--ghost');
    downloadBtn.querySelector('.recovery-gate__btn-icon').innerHTML = ICON_CHECK;
    downloadBtn.querySelector('.recovery-gate__btn-label').textContent = 'Descargar de nuevo';
    continueBtn.classList.replace('recovery-gate__btn--ghost', 'recovery-gate__btn--primary');
    continueBtn.disabled = false;
    hint.textContent = 'Documento descargado. Guárdalo en un lugar seguro.';
    hint.classList.add('recovery-gate__hint--ok');
    continueBtn.focus();
  });

  continueBtn.addEventListener('click', () => {
    if (!downloaded) return;
    continueBtn.disabled = true;
    continueBtn.classList.add('is-loading');
    continueBtn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Entrando...</span>';
    goHome();
  });

  downloadBtn.focus();
}

document.addEventListener("DOMContentLoaded", () => {
    const inputs = document.querySelectorAll('.code-inputs input');
    const verifyBtn = document.querySelector('.btn-verify');
    const errorDiv = document.getElementById('twofa-error');
    const recoveryBtn = document.getElementById('lostAuthenticatorBtn');
    const recoveryPanel = document.getElementById('recoveryPanel');
    const recoveryFile = document.getElementById('recoveryFile');
    const recoverySubmit = document.getElementById('recoverySubmit');
    const dropzone = document.getElementById('recoveryDropzone');

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

    if (recoverySubmit && recoveryFile && dropzone) {
      const submitLabel = document.getElementById('recoverySubmitLabel');
      const submitIcon = document.getElementById('recoverySubmitIcon');
      const progressBar = document.getElementById('recoveryProgressBar');
      const fileNameEl = document.getElementById('recoveryFileName');
      const recoveryError = document.getElementById('recoveryError');

      function setUploadError(message) {
        if (recoveryError) recoveryError.textContent = message;
        shakeElement(dropzone);
      }

      function clearUploadError() {
        if (recoveryError) recoveryError.textContent = '';
      }

      function setProgress(ratio) {
        progressBar.style.width = `${Math.round(ratio * 100)}%`;
      }

      function resetUploadButton() {
        recoverySubmit.classList.remove('is-uploading', 'is-processing', 'is-done', 'is-error');
        submitIcon.innerHTML = '';
        submitLabel.textContent = 'Desactivar 2FA';
        progressBar.style.width = '0%';
      }

      function selectFile(file) {
        clearUploadError();
        resetUploadButton();

        if (!file) {
          dropzone.classList.remove('has-file');
          fileNameEl.textContent = '';
          recoverySubmit.disabled = true;
          return;
        }
        if (!/\.json$/i.test(file.name)) {
          dropzone.classList.remove('has-file');
          fileNameEl.textContent = '';
          recoverySubmit.disabled = true;
          setUploadError('El documento de recuperación debe ser un archivo .json');
          return;
        }
        if (file.size > MAX_RECOVERY_SIZE) {
          dropzone.classList.remove('has-file');
          fileNameEl.textContent = '';
          recoverySubmit.disabled = true;
          setUploadError('El archivo es demasiado grande para ser un documento de recuperación.');
          return;
        }

        dropzone.classList.add('has-file');
        fileNameEl.textContent = file.name;
        recoverySubmit.disabled = false;
      }

      recoveryFile.addEventListener('change', () => {
        selectFile(recoveryFile.files && recoveryFile.files[0]);
      });

      // --- Arrastrar y soltar ---
      ['dragenter', 'dragover'].forEach((evt) => {
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropzone.classList.add('is-dragover');
        });
      });

      ['dragleave', 'drop'].forEach((evt) => {
        dropzone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropzone.classList.remove('is-dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const dropped = e.dataTransfer?.files;
        if (!dropped || !dropped.length) return;
        recoveryFile.files = dropped;
        selectFile(dropped[0]);
      });

      recoverySubmit.addEventListener('click', async () => {
        const file = recoveryFile.files && recoveryFile.files[0];
        if (!file) {
          setUploadError('Selecciona el archivo de recuperación.');
          return;
        }

        clearUploadError();
        const form = new FormData();
        form.append('backup_file', file);

        recoverySubmit.disabled = true;
        recoverySubmit.classList.add('is-uploading');
        dropzone.classList.add('is-locked');
        submitIcon.innerHTML = '';
        submitLabel.textContent = 'Subiendo... 0%';
        setProgress(0);

        const animation = runFakeProgress(PROGRESS_ANIM_MS, (ratio) => {
          setProgress(ratio);
          if (ratio < 1) {
            submitLabel.textContent = `Subiendo... ${Math.round(ratio * 100)}%`;
          }
        });

        let pending = true;
        const request = apiFetch('/twofa/disable', { method: 'POST', body: form })
          .then(
            async (res) => {
              pending = false;
              const data = await res.json().catch(() => ({}));
              return { ok: res.ok, data };
            },
            (err) => { pending = false; throw err; }
          );

        // Si la barra termina antes que el servidor, pasa a "verificando"
        // en vez de quedarse llena y congelada.
        animation.then(() => {
          if (!pending) return;
          recoverySubmit.classList.add('is-processing');
          submitIcon.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>';
          submitLabel.textContent = 'Verificando documento...';
        });

        try {
          const { ok, data } = await request;
          // No mostrar el resultado antes de que la barra termine de correr.
          await animation;

          if (!ok) {
            recoverySubmit.classList.remove('is-uploading', 'is-processing');
            recoverySubmit.classList.add('is-error');
            submitIcon.innerHTML = '';
            submitLabel.textContent = 'No se pudo desactivar 2FA';
            setProgress(0);
            setUploadError(data.error || data.message || 'El documento no es válido.');
            dropzone.classList.remove('is-locked');
            recoverySubmit.disabled = false;
            setTimeout(resetUploadButton, 2500);
            return;
          }

          recoverySubmit.classList.remove('is-uploading', 'is-processing');
          recoverySubmit.classList.add('is-done');
          submitIcon.innerHTML = ICON_CHECK;
          submitLabel.textContent = '2FA desactivado';

          SessionStorageManager.saveSession({
            twofaenabled: false,
            token_type: 'two_factor_authentication',
          });
          setTimeout(() => { window.location.href = '/QR'; }, 900);
        } catch (err) {
          if (err.message === 'Session expired') return; // apiFetch ya redirigió.
          recoverySubmit.classList.remove('is-uploading', 'is-processing');
          recoverySubmit.classList.add('is-error');
          submitIcon.innerHTML = '';
          submitLabel.textContent = 'Error al subir';
          setProgress(0);
          setUploadError(err.message || 'Error al subir el documento.');
          dropzone.classList.remove('is-locked');
          recoverySubmit.disabled = false;
          setTimeout(resetUploadButton, 2500);
        }
      });
    }
});
