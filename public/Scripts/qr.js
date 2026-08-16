import { apiFetch, requireUiSession } from "./api.js";

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireUiSession()) return;

  const qrCodeDiv = document.querySelector(".qr-code");
  const qrMessage = document.querySelector(".qr-message");
  const nextBtn = document.getElementById('nextBtn');

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      window.location.href = "/twofa";
    });
  }

  try {
    const response = await apiFetch("/twofa", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error("No se pudo obtener el QR. Intenta más tarde.");
    }

    const data = await response.json();

    if (data.qrCode) {
      const img = document.createElement("img");
      img.src = data.qrCode;
      img.alt = "Código QR";
      img.width = 220;
      img.height = 220;
      qrCodeDiv.appendChild(img);
      qrMessage.textContent = "Escanea este código QR para usar el doble factor de autenticación.";
    } else {
      qrMessage.textContent = "No se recibió el QR. Contacta soporte.";
    }
  } catch (err) {
    qrMessage.textContent = "Error: " + err.message;
  }
});
