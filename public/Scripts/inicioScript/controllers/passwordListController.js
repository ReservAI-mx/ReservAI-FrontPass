import { fetchPasswords } from '../services/passwordService.js';
import { renderList } from '../service/renderList.js';
import { showError } from '../service/uiHelpers.js';

export async function setupPasswordList(elements) {
    const { listEl, searchEl, prevBtn, nextBtn, pageInfo, totalEl } = elements;
    let currentPage = 1;
    let searchTimeout = null;


 

    async function loadPage(page = 1, search = '') {
        if (listEl) listEl.innerHTML = '<div style="text-align:center; margin:2em 0;">Cargando contraseñas...</div>';
        const pagination = document.querySelector('.pagination');
        if (pagination) pagination.style.display = 'none';
        try {
            const { data: passwords = [], total = 0, next_page, current_page } = await fetchPasswords(page, search);
            currentPage = current_page || page;

            renderList(passwords, listEl);

            if (totalEl) {
                totalEl.textContent = total === 1 ? '1 contraseña' : `${total} contraseñas`;
                totalEl.hidden = total === 0;
            }

            pageInfo.textContent = next_page ? `Página ${currentPage} `: `Página ${currentPage}`;
            prevBtn.disabled = currentPage <= 1;
            nextBtn.disabled = !next_page;

            if (pagination) {
                if (passwords.length > 0) {
                    pagination.style.display = 'flex';
                } else {
                    pagination.style.display = 'none';
                }
            }
        } catch (err) {
            showError(listEl, "Error al cargar contraseñas: " + err.message);
            const pagination = document.querySelector('.pagination');
            if (pagination) pagination.style.display = 'none';
        }
    }

    document.addEventListener('passwordUpdated', () => {
        loadPage(currentPage, searchEl.value);
    });

    prevBtn?.addEventListener('click', () => {
        if (currentPage > 1) {
            loadPage(currentPage - 1, searchEl.value);
        }
    });

    nextBtn?.addEventListener('click', () => {
        loadPage(currentPage + 1, searchEl.value);
    });

    // Búsqueda con debounce de 2 segundos o Enter
    searchEl?.addEventListener('input', () => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            loadPage(1, searchEl.value);
        }, 350);
    });

    searchEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (searchTimeout) clearTimeout(searchTimeout);
            loadPage(1, searchEl.value);
        }
    });

    await loadPage(1, ''); // Iniciar con la primera página
    return { reload: loadPage };
}