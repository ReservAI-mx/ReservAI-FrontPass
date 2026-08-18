import { apiFetch } from "./api.js";
import { setButtonLoading } from "./buttonLoading.js";

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

document.addEventListener("DOMContentLoaded", () => {
  const verifyBtn = document.querySelector(".verifybtn");
  const resendBtn = document.querySelector(".resendbtn");

  if (verifyBtn) {
    verifyBtn.addEventListener("click", () => {
      window.location.href = "/login";
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      setButtonLoading(resendBtn, true, "Reenviando...");
      try {
        const response = await apiFetch("/verification", {
          method: "GET",
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        let data;
        try { data = await response.json(); } catch { data = {}; }

        if (response.ok) {
          showMessage(data.message || "Correo de verificación reenviado.", 'success');
        } else {
          showMessage(data.message || "No se pudo reenviar el correo.", 'error');
        }
      } catch (err) {
        showMessage("Error al reenviar el correo: " + err.message, 'error');
      } finally {
        setButtonLoading(resendBtn, false);
      }
    });
  }
});
