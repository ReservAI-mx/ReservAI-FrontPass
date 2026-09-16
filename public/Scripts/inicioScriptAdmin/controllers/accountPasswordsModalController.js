import { fetchAccountById } from '../services/adminUserService.js';
import { showMessage } from '../service/uiHelpersAdmin.js';
import { renderAdminPasswordList } from '../service/renderlistadmin.js';
import { setupAdminModals, openAdminPasswordModal } from './modalControllerAdmin.js';
import { deleteAccount } from '../services/adminUserService.js';
import { showDeleteConfirmModal } from '../service/uiHelpersAdmin.js';
import { apiFetch, API_BASE } from '../../api.js';

const BILLING_HEADERS = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
};

let currentPaymentsAccountId = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatPayDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatPayAmount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    return `MXN ${n.toFixed(2)}`;
}

function formatAdminDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatSatDetail(detailRaw) {
    if (!detailRaw) return '';
    let detail = detailRaw;
    if (typeof detailRaw === 'string') {
        try {
            detail = JSON.parse(detailRaw);
        } catch {
            return String(detailRaw);
        }
    }
    if (detail.sandbox_relaxed && detail.note) {
        return detail.note;
    }
    if (detail.error) {
        return `No se pudo validar con Facturama: ${detail.error}`;
    }
    const data = detail.facturama_response || detail;
    const fails = [];
    if (data.ExistRfc === false) fails.push('RFC no localizado/activo');
    if (data.MatchName === false) fails.push('razón social no coincide');
    if (data.MatchZipCode === false) fails.push('código postal no coincide');
    if (data.MatchFiscalRegime === false) fails.push('régimen fiscal no coincide');
    if (fails.length === 0) return 'Validación SAT correcta.';
    return `SAT rechazó: ${fails.join('; ')}.`;
}

function satStatusBadge(status) {
    const s = String(status || 'pending').toLowerCase();
    const label = { valid: 'Válido', invalid: 'Inválido', pending: 'Pendiente', error: 'Error' }[s] || s;
    return `<span class="fiscal-admin-badge fiscal-admin-badge--${s}">${escapeHtml(label)}</span>`;
}

let accountContextMenuDocHandler = null;

function closeAccountContextMenu() {
    const menu = document.getElementById('accountContextMenu');
    const btn = document.getElementById('accountMenuBtn');
    if (menu) menu.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleAccountContextMenu() {
    const menu = document.getElementById('accountContextMenu');
    const btn = document.getElementById('accountMenuBtn');
    if (!menu || !btn) return;
    const open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
}

function blockedLabel(reason) {
    if (reason === 'already_invoiced') return 'Ya facturado';
    if (reason === 'month_expired') return 'Fuera de plazo (solo mes de compra)';
    if (reason === 'fiscal_not_ready') return 'Fiscal no lista';
    return '';
}

async function openAccountPaymentsModal(accountId) {
    const modal = document.getElementById('accountPaymentsModal');
    const emptyEl = document.getElementById('accountPaymentsEmpty');
    const errorEl = document.getElementById('accountPaymentsError');
    const table = document.getElementById('accountPaymentsTable');
    const bodyEl = document.getElementById('accountPaymentsBody');
    const closeBtn = document.getElementById('closeAccountPaymentsBtn');
    if (!modal || !bodyEl) return;

    currentPaymentsAccountId = accountId;
    if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
    }
    if (emptyEl) emptyEl.hidden = true;
    if (table) table.hidden = true;
        bodyEl.innerHTML = '<tr><td colspan="4">Cargando…</td></tr>';
    if (table) table.hidden = false;
    modal.classList.add('show');

    const close = () => modal.classList.remove('show');
    if (closeBtn) closeBtn.onclick = close;

    try {
        const res = await apiFetch(
            `/billing/accounts/${encodeURIComponent(accountId)}/payments?limit=50&offset=0`,
            { headers: BILLING_HEADERS }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || 'No se pudo cargar el historial');
        }
        const payments = data.data || [];
        bodyEl.innerHTML = '';
        if (payments.length === 0) {
            if (table) table.hidden = true;
            if (emptyEl) emptyEl.hidden = false;
            return;
        }
        if (emptyEl) emptyEl.hidden = true;
        if (table) table.hidden = false;

        for (const p of payments) {
            const tr = document.createElement('tr');
            const actions = document.createElement('div');
            actions.className = 'admin-pay-actions';

            const mkBtn = (label, onClick, extraClass = '') => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                b.className = `admin-pay-btn${extraClass ? ` ${extraClass}` : ''}`;
                b.onclick = onClick;
                return b;
            };

            if (p.ticket_available) {
                actions.appendChild(
                    mkBtn('Ticket', () => {
                        window.location.href = `${API_BASE}/billing/accounts/${encodeURIComponent(accountId)}/tickets/${encodeURIComponent(p.id)}/pdf`;
                    })
                );
            }
            if (p.invoice_id) {
                actions.appendChild(
                    mkBtn('PDF CFDI', () => {
                        window.location.href = `${API_BASE}/billing/accounts/${encodeURIComponent(accountId)}/invoices/${encodeURIComponent(p.invoice_id)}/pdf`;
                    })
                );
                actions.appendChild(
                    mkBtn('XML', () => {
                        window.location.href = `${API_BASE}/billing/accounts/${encodeURIComponent(accountId)}/invoices/${encodeURIComponent(p.invoice_id)}/xml`;
                    })
                );
            } else if (p.can_invoice) {
                const invBtn = mkBtn('Solicitar factura', async () => {
                    invBtn.disabled = true;
                    try {
                        const r = await apiFetch(
                            `/billing/accounts/${encodeURIComponent(accountId)}/invoices/from-payment/${encodeURIComponent(p.id)}`,
                            { method: 'POST', headers: BILLING_HEADERS }
                        );
                        const body = await r.json().catch(() => ({}));
                        if (!r.ok) {
                            throw new Error(body.error || 'No se pudo facturar');
                        }
                        showMessage(body.message || 'Factura generada');
                        await openAccountPaymentsModal(accountId);
                    } catch (err) {
                        showMessage(err.message || 'Error al facturar');
                        invBtn.disabled = false;
                    }
                });
                invBtn.classList.add('admin-pay-btn--invoice');
                actions.appendChild(invBtn);
            } else if (p.invoice_blocked_reason) {
                const hint = document.createElement('span');
                hint.className = 'admin-pay-hint';
                hint.textContent = blockedLabel(p.invoice_blocked_reason);
                actions.appendChild(hint);
            }

            tr.innerHTML = `
              <td>${escapeHtml(formatPayDate(p.created_at))}</td>
              <td>${escapeHtml(formatPayAmount(p.amount))}</td>
              <td>${escapeHtml(p.status || '—')}</td>
            `;
            const td = document.createElement('td');
            td.appendChild(actions);
            tr.appendChild(td);
            bodyEl.appendChild(tr);
        }
    } catch (err) {
        bodyEl.innerHTML = '';
        if (table) table.hidden = true;
        if (errorEl) {
            errorEl.hidden = false;
            errorEl.textContent = err.message || 'Error al cargar';
        }
        showMessage(err.message || 'Error al cargar historial');
    }
}

async function openFiscalSituationModal(accountId) {
    const modal = document.getElementById('fiscalSituationModal');
    const emptyEl = document.getElementById('fiscalSituationEmpty');
    const bodyEl = document.getElementById('fiscalSituationBody');
    const satNoteEl = document.getElementById('fiscalSatNote');
    const closeBtn = document.getElementById('closeFiscalSituationBtn');
    const paymentsBtn = document.getElementById('openAccountPaymentsBtn');
    if (!modal || !bodyEl || !emptyEl) return;

    emptyEl.hidden = true;
    bodyEl.hidden = true;
    bodyEl.innerHTML = '';
    if (satNoteEl) {
        satNoteEl.hidden = true;
        satNoteEl.textContent = '';
    }
    bodyEl.innerHTML = '<div class="fiscal-admin-row"><dt>Cargando…</dt><dd></dd></div>';
    bodyEl.hidden = false;
    modal.classList.add('show');

    const close = () => modal.classList.remove('show');
    if (closeBtn) closeBtn.onclick = close;
    if (paymentsBtn) {
        paymentsBtn.onclick = async () => {
            modal.classList.remove('show');
            await openAccountPaymentsModal(accountId);
        };
    }

    try {
        const res = await apiFetch(`/billing/fiscal/${encodeURIComponent(accountId)}`, {
            headers: BILLING_HEADERS,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || 'No se pudo cargar la situación fiscal');
        }
        const fiscal = data.data;
        if (!fiscal) {
            bodyEl.hidden = true;
            bodyEl.innerHTML = '';
            emptyEl.hidden = false;
            return;
        }
        emptyEl.hidden = true;
        bodyEl.hidden = false;

        const satDetailMsg = formatSatDetail(fiscal.sat_validation_detail);
        const rows = [
            ['RFC', fiscal.rfc],
            ['Razón social', fiscal.razon_social],
            ['Código postal', fiscal.codigo_postal],
            ['Régimen fiscal', fiscal.regimen_fiscal],
            ['Uso CFDI', fiscal.uso_cfdi],
            ['Persona moral', fiscal.persona_moral ? 'Sí' : 'No'],
            ['Activa', fiscal.active ? 'Sí' : 'No'],
            ['Aceptación disclaimer', fiscal.authorization_accepted ? 'Sí' : 'No'],
            ['Aceptada el', formatAdminDate(fiscal.authorization_accepted_at)],
            ['Versión términos', fiscal.authorization_terms_version || '—'],
            ['Estado SAT', satStatusBadge(fiscal.sat_validation_status || 'pending')],
            ['SAT validado el', formatAdminDate(fiscal.sat_validated_at)],
        ];
        bodyEl.innerHTML = rows.map(([k, v]) => `
          <div class="fiscal-admin-row">
            <dt>${escapeHtml(k)}</dt>
            <dd>${typeof v === 'string' && v.includes('fiscal-admin-badge') ? v : escapeHtml(v)}</dd>
          </div>
        `).join('');

        if (satNoteEl && satDetailMsg) {
            satNoteEl.hidden = false;
            satNoteEl.textContent = satDetailMsg;
        }
    } catch (err) {
        bodyEl.innerHTML = '';
        bodyEl.hidden = true;
        emptyEl.hidden = false;
        emptyEl.textContent = err.message || 'Error al cargar';
        showMessage(err.message || 'Error al cargar situación fiscal');
    }
}

export async function openAccountPasswordsModal(account) {
    const modal = document.getElementById('accountPasswordsModal');
    const emailTitle = document.getElementById('accountEmailTitle');
    const passwordList = document.getElementById('password-list');
    const backBtn = document.getElementById('backToAccountsBtn');
    const menuBtn = document.getElementById('accountMenuBtn');
    const deleteBtn = document.getElementById('deleteAccountBtn');
    const fiscalBtn = document.getElementById('fiscalSituationBtn');
    const paymentsMenuBtn = document.getElementById('accountPaymentsMenuBtn');
    const addBtn = document.getElementById('addPasswordBtn');
    const createModal = document.getElementById('createModal');
    const viewModal = document.getElementById('viewModal');
    const createName = document.getElementById('createName');
    const createPassword = document.getElementById('createPassword');
    const createDescription = document.getElementById('createDescription');
    const confirmPassword = document.getElementById('confirmPassword');
    const savePasswordBtn = document.getElementById('savePasswordBtn');
    const passwordSearchEl = document.getElementById('search2');
    const prevBtn = document.getElementById('prev');
    const nextBtn = document.getElementById('next');
    const pageInfo = document.getElementById('pageinfo');
    const loadingEl = document.getElementById('passwords-loading');

    emailTitle.textContent = account.email || account.name || account.id;

    let currentPage = 1;
    let nextPage = null;
    let totalPasswords = 0;

    async function loadPasswordsPage(page = 1, search = '') {
        if (loadingEl) loadingEl.style.display = 'block';
        passwordList.innerHTML = '';

        try {
            const response = await fetchAccountById(account.id, page, search);
            const passwords = response.data?.passwords || [];
            currentPage = response.current_page || page;
            nextPage = response.next_page || null;
            totalPasswords = response.total || passwords.length;

            renderAdminPasswordList(passwords, passwordList);

            // Evento para ver contraseña
            passwordList.querySelectorAll('.password-item').forEach(item => {
                const passwordId = item.dataset.id;
                item.onclick = () => openAdminPasswordModal(account.id, passwordId);
            });

            if (pageInfo) pageInfo.textContent = `Página ${currentPage}`;
            if (prevBtn) prevBtn.disabled = currentPage <= 1;
            if (nextBtn) nextBtn.disabled = !nextPage || nextPage <= currentPage;
        } catch (err) {
            passwordList.innerHTML = '<div >Error al cargar contraseñas</div>';
            if (pageInfo) pageInfo.textContent = '';
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
            const searchbar2 = document.getElementById('search2');
            const pagination1 = document.querySelector('.pagination');

            if (pagination1 && passwordList.children.length > 0 && !passwordList.innerHTML.includes('Error')) {
                pagination1.style.display = 'flex';
            } else if (pagination1) {
                pagination1.style.display = 'none';
            }

            if (searchbar2 && passwordList.children.length > 0 && !passwordList.innerHTML.includes('Error')) {
                searchbar2.style.display = 'block';
            } else if (searchbar2) {
                searchbar2.style.display = 'none';
            }
        }
    }

    // --- Listener único para passwordUpdated ---
    function passwordUpdatedHandler(e) {
        const { accountId } = e.detail || {};
        if (accountId === account.id) {
            loadPasswordsPage(currentPage, passwordSearchEl ? passwordSearchEl.value : '');
        }
    }
    document.addEventListener('passwordUpdated', passwordUpdatedHandler);

    let passwordSearchTimeout = null;

    // Listeners de paginación y búsqueda
    prevBtn?.addEventListener('click', () => {
        if (currentPage > 1) {
            loadPasswordsPage(currentPage - 1, passwordSearchEl.value);
        }
    });

    nextBtn?.addEventListener('click', () => {
        if (nextPage && nextPage > currentPage) {
            loadPasswordsPage(nextPage, passwordSearchEl.value);
        }
    });

    passwordSearchEl?.addEventListener('input', () => {
        if (passwordSearchTimeout) clearTimeout(passwordSearchTimeout);
        passwordSearchTimeout = setTimeout(() => {
            loadPasswordsPage(1, passwordSearchEl.value);
        }, 2000);
    });

    passwordSearchEl?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            if (passwordSearchTimeout) clearTimeout(passwordSearchTimeout);
            loadPasswordsPage(1, passwordSearchEl.value);
        }
    });

    // Inicializa la lista
    loadPasswordsPage();

    // Mostrar modal
    modal.classList.add('show');

    // Botón regresar
    backBtn.onclick = () => {
        modal.classList.remove('show');
        closeAccountContextMenu();
        if (accountContextMenuDocHandler) {
            document.removeEventListener('click', accountContextMenuDocHandler);
            accountContextMenuDocHandler = null;
        }
        const searchbar2 = document.getElementById('search2');
        if (searchbar2){
            searchbar2.style.display = 'none';
            searchbar2.value = '';
        }
        const pagination1 = document.querySelector('.pagination');
        if (pagination1) pagination1.style.display = 'none';
        // Remueve el listener al cerrar el modal
        document.removeEventListener('passwordUpdated', passwordUpdatedHandler);
    };

    // Menú tres puntos
    if (accountContextMenuDocHandler) {
        document.removeEventListener('click', accountContextMenuDocHandler);
    }
    accountContextMenuDocHandler = (e) => {
        const menu = document.getElementById('accountContextMenu');
        if (menu && !menu.contains(e.target)) closeAccountContextMenu();
    };

    menuBtn.onclick = (e) => {
        e.stopPropagation();
        toggleAccountContextMenu();
    };
    document.addEventListener('click', accountContextMenuDocHandler);

    if (fiscalBtn) {
        fiscalBtn.onclick = async () => {
            closeAccountContextMenu();
            await openFiscalSituationModal(account.id);
        };
    }

    if (paymentsMenuBtn) {
        paymentsMenuBtn.onclick = async () => {
            closeAccountContextMenu();
            await openAccountPaymentsModal(account.id);
        };
    }

    // Eliminar cuenta
    deleteBtn.onclick = async () => {
        closeAccountContextMenu();
        showDeleteConfirmModal({
            title: "Eliminar cuenta",
            message: "¿Seguro que deseas eliminar esta cuenta? Esta acción no se puede deshacer.<br>Escribe <b>eliminar</b> para confirmar.",
            onConfirm: async () => {
                try {
                    await deleteAccount(account.id);
                    showMessage("Cuenta eliminada correctamente");
                    // Recarga la página inmediatamente
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
                } catch (err) {
                    showMessage("Error al eliminar la cuenta: " + err.message);
                }
            },
            onCancel: () => {
                // Acción al cancelar, si es necesario
            }
        });
    };

    // Cierre del modal de ver contraseña también actualiza la lista
    const closeBtns = viewModal.querySelectorAll('.close-btn');
    closeBtns.forEach(btn => {
        btn.onclick = () => {
            viewModal.classList.remove('show');
            document.dispatchEvent(new CustomEvent('passwordUpdated', { detail: { accountId: account.id } }));
        };
    });

    // --- Lógica para crear contraseña dentro del modal ---
    setupAdminModals({
        addBtn,
        createModal,
        viewModal,
        fields: {
            createName,
            createPassword,
            createDescription,
            confirmPassword,
            savePasswordBtn
        },
        listEl: passwordList,
        renderList: () => loadPasswordsPage(currentPage, passwordSearchEl.value),
        getSelectedAccountId: () => account.id
    });
}