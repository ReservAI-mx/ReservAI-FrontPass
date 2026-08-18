import SessionStorageManager from "./AppStorage.js";
import { apiFetch } from "./api.js";

function roleFromQuery() {
  const role = new URLSearchParams(window.location.search).get('role');
  return role === 'admin' ? 'admin' : role === 'client' ? 'client' : null;
}

function consumeVerifyToken() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('verify');
  if (!token) return null;
  url.searchParams.delete('verify');
  window.history.replaceState({}, '', url);
  return token;
}

document.addEventListener("DOMContentLoaded", async () => {
  const qrCodeDiv = document.querySelector(".qr-code");
  const qrMessage = document.querySelector(".qr-message");
  const nextBtn = document.getElementById('nextBtn');

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      window.location.href = "/twofa";
    });
  }

  if (qrCodeDiv) {
    qrCodeDiv.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>';
  }

  try {
    const verifyToken = consumeVerifyToken();
    console.info('[QR] url=', window.location.href, 'verifyToken=', verifyToken ? 'sí' : 'no');
    if (verifyToken) {
      const verifyRes = await apiFetch(`/verification/${encodeURIComponent(verifyToken)}`, {
        method: "GET",
        redirectOn418: false,
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      console.info('[QR] verify status=', verifyRes.status);
      if (!verifyRes.ok) {
        throw new Error(`Verificación falló (${verifyRes.status}). Copia el enlace del correo; debe incluir ?verify= o /api/verification/.`);
      }
    }

    const response = await apiFetch("/twofa", {
      method: "GET",
      redirectOn418: false,
      headers: { "Content-Type": "application/json" },
    });
    console.info('[QR] twofa status=', response.status);

    if (!response.ok) {
      const hint = verifyToken
        ? 'El correo se verificó, pero no quedó la cookie 2FA.'
        : 'La URL no trae ?verify= (Gmail pudo cachear el redirect viejo). Clic derecho → Copiar enlace.';
      throw new Error(`No se pudo obtener el QR (${response.status}). ${hint}`);
    }

    const data = await response.json();
    const role = roleFromQuery();
    SessionStorageManager.saveSession({
      token_type: 'two_factor_authentication',
      verified: true,
      twofaenabled: false,
      ...(role ? { account_type: role } : {}),
    });

    if (data.qrCode) {
      const img = document.createElement("img");
      img.src = data.qrCode;
      img.alt = "Código QR";
      img.width = 220;
      img.height = 220;
      img.className = "qr-fade-in";
      qrCodeDiv.innerHTML = "";
      qrCodeDiv.appendChild(img);
      qrMessage.textContent = "Escanea este código QR para usar el doble factor de autenticación.";
    } else {
      qrCodeDiv.innerHTML = "";
      qrMessage.textContent = "No se recibió el QR. Contacta soporte.";
    }
  } catch (err) {
    if (qrCodeDiv) qrCodeDiv.innerHTML = "";
    qrMessage.textContent = "Error: " + err.message;
  }
});
