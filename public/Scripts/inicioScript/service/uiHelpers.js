import { showToast } from '../../toast.js';

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


export function showError(input, message) {
    input.value = "";
    input.placeholder = message;
    input.classList.add("error-input");

    function clearError(){
        input.classList.remove("error-input");
        input.placeholder = "";
        input.removeEventListener('focus', clearError);
        input.removeEventListener('input', clearError);
    }

    if(!input.dataset.defaultPlaceholder){
        input.dataset.defaultPlaceholder = input.placeholder;
    }
    input.addEventListener('focus', clearError);
    input.addEventListener('input', clearError);
  }


export function showMessage(msg, type) {
    showToast(msg, type);
}
