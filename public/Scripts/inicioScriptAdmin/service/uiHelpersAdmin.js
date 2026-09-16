import { showToast } from '../../toast.js';

export function renderPasswordList(passwords, listEl) {
  listEl.innerHTML = "";
  if (!passwords.length) {
    listEl.innerHTML = "<li>No hay contraseñas para mostrar.</li>";
    return;
  }
  passwords.forEach((pass, idx) => {
    const item = document.createElement("li");
    item.className = "password-item";
    item.dataset.id = pass.id;
    item.dataset.idx = idx;
    const safeName = escapeHtml(pass.name || 'Sin nombre');
    const safePassword = escapeHtml(pass.password || '');
    item.innerHTML = `
      <span><b>${safeName}</b></span>
      <span>${safePassword}</span>
      <button class="view-btn">Ver / Editar</button>
    `;
    listEl.appendChild(item);
  });
}

export function showMessage(msg, type) {
  showToast(msg, type);
}

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function showDeleteConfirmModal({ title = "¿Estás seguro?", message = "", onConfirm, onCancel }) {
    const modal = document.getElementById('confirmDeleteModal');
    const titleEl = document.getElementById('confirmDeleteTitle');
    const msgEl = document.getElementById('confirmDeleteMsg');
    const inputEl = document.getElementById('confirmDeleteInput');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');

    if (!modal || !inputEl || !confirmBtn || !cancelBtn) {
        console.warn('Elementos del modal de confirmación no encontrados');
        return;
    }

    titleEl && (titleEl.textContent = title);
    msgEl && (msgEl.innerHTML = message || "Esta acción no se puede deshacer.<br>Escribe <b>eliminar</b> para confirmar.");
    inputEl.value = "";
    confirmBtn.disabled = true;

    // Mostrar modal
    modal.style.display = "block";
    modal.setAttribute('aria-hidden', 'false');

    // Asegurar que el input puede recibir focus
    if (typeof inputEl.tabIndex !== 'number' || inputEl.tabIndex < 0) {
      inputEl.tabIndex = 0;
    }

    // Util: intentar focus con reintentos hasta que el elemento sea visible
    const focusWithRetry = (el, attempts = 6, delay = 50) => {
      let tries = 0;
      const tryFocus = () => {
        tries++;
        const isVisible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const canFocus = !el.disabled && isVisible && document.body.contains(el);
        if (canFocus) {
          try {
            el.focus({ preventScroll: false });
            if (typeof el.select === 'function') el.select();
            console.log('[uiHelpersAdmin] focus aplicado al input del modal');
            return true;
          } catch (e) {
            console.warn('[uiHelpersAdmin] fallo al focus intentar de todos modos', e);
          }
        }
        if (tries < attempts) {
          setTimeout(tryFocus, delay);
          return false;
        } else {
          console.warn('[uiHelpersAdmin] no se pudo aplicar focus al input del modal después de reintentos');
          return false;
        }
      };
      return tryFocus();
    };

    // Handlers
    const handleInput = () => {
        confirmBtn.disabled = inputEl.value.trim().toLowerCase() !== "eliminar";
    };

    const handleKeydown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            closeModal();
            if (typeof onCancel === "function") onCancel();
        } else if ((e.key === "Enter" || e.key === "NumpadEnter")) {
            if (inputEl.value.trim().toLowerCase() === "eliminar" && !confirmBtn.disabled) {
                e.preventDefault();
                confirmBtn.click();
            }
        }
    };

    function closeModal() {
        modal.style.display = "none";
        modal.setAttribute('aria-hidden', 'true');
        inputEl.removeEventListener('input', handleInput);
        modal.removeEventListener('keydown', handleKeydown);
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        if (modal.getAttribute('tabindex') === '-1') modal.removeAttribute('tabindex');
    }

    confirmBtn.onclick = () => {
        closeModal();
        if (typeof onConfirm === "function") onConfirm();
    };

    cancelBtn.onclick = () => {
        closeModal();
        if (typeof onCancel === "function") onCancel();
    };

    inputEl.addEventListener('input', handleInput);
    modal.addEventListener('keydown', handleKeydown);

    // focus y select del input cuando el modal esté visible (usar reintentos)
    // Si necesita, ajustar attempts/delay.
    setTimeout(() => focusWithRetry(inputEl, 8, 60), 0);
}