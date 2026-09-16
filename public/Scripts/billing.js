import SessionStorageManager from "./AppStorage.js";
import { apiFetch, goLogout, requireUiSession } from "./api.js";
import { setupAccountMenu } from "./accountMenu.js";

// El backend exige estas cabeceras en /billing/links y /billing/portal.
// apiFetch solo pone Content-Type cuando hay body, y estas son peticiones GET.
const BILLING_HEADERS = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
};

const session = requireUiSession();

// Mapeo de iconos para diferentes planes
const planIcons = {
    'basico': '/static/Images/LogoReservAi.png',
    'basic': '/static/Images/LogoReservAi.png',
    'pro': '/static/Images/LogoReservAi.png',
    'default': '/static/Images/LogoReservAi.png'
};

// --------- MODAL DE ERROR GLOBAL ---------
function showError(message) {
    let errorModal = document.getElementById('globalErrorModal');
    if (!errorModal) {
        errorModal = document.createElement('div');
        errorModal.id = 'globalErrorModal';
        errorModal.className = 'global-error-modal';
        document.body.appendChild(errorModal);
    }
    errorModal.textContent = message;
    errorModal.style.display = 'block';
    setTimeout(() => {
        errorModal.style.display = 'none';
    }, 4000);
}


function getPlanIcon(name) {
    const planName = (name || '').toLowerCase();
    for (const [key, icon] of Object.entries(planIcons)) {
        if (planName.includes(key)) return icon;
    }
    return planIcons.default;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getStatusBadge(status, cancelAtPeriodEnd = false) {
    const statusLower = (status || '').toLowerCase();
    
    // Si está marcado para cancelar al final del período pero está activo
    if (cancelAtPeriodEnd && (statusLower === 'active' || statusLower === 'activo')) {
        return { class: 'status-pending', text: 'Cancelado/Activo' };
    }
    
    if (statusLower === 'active' || statusLower === 'activo') {
        return { class: 'status-active', text: 'Activo' };
    } else if (statusLower === 'ready_for_subscription') {
        return { class: 'status-pending', text: 'Lista para activar' };
    } else if (statusLower === 'pending_provision') {
        return { class: 'status-pending', text: 'En provision' };
    } else if (statusLower === 'unpaid') {
        return { class: 'status-inactive', text: 'Impago' };
    } else if (statusLower === 'inactive' || statusLower === 'inactivo') {
        return { class: 'status-inactive', text: 'Inactivo' };
    } else if (statusLower === 'pending' || statusLower === 'pendiente') {
        return { class: 'status-pending', text: 'Pendiente' };
    }
    return { class: 'status-inactive', text: statusLower };
}

// --------- MODALES DE SUSCRIPCIÓN ---------
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
}
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function setHasCustomer(ok) {
    const fab = document.getElementById('addSubscriptionBtn');
    const manage = document.getElementById('manageBillingBtn');
    if (fab) fab.style.display = ok ? '' : 'none';
    if (manage) manage.style.display = ok ? '' : 'none';
}

// Obtener links de pago desde el endpoint /links
function subdomainErrorMessage(code) {
    if (code === 'SUBDOMAIN_INVALID') {
        return 'Subdominio inválido: usa 3–32 caracteres (letras minúsculas, números o guiones; no puede empezar/terminar con guión ni llevar --).';
    }
    if (code === 'SUBDOMAIN_RESERVED') {
        return 'Ese subdominio está reservado. Elige otro.';
    }
    if (code === 'SUBDOMAIN_TAKEN') {
        return 'Ese subdominio ya está en uso. Elige otro.';
    }
    return null;
}

function updateFiscalPriceNotice(data) {
    const el = document.getElementById('fiscalPriceNotice');
    if (!el) return;
    const fiscal = data?.fiscal || {};
    const variant = data?.price_variant || 'full';
    if (fiscal.persona_moral && variant === 'full') {
        el.hidden = false;
        el.textContent =
            'Tu perfil es persona moral, pero aún no está activo y validado ante SAT. Este cobro usa la tarifa completa. Completa y activa tu información fiscal para la tarifa moral.';
        return;
    }
    el.hidden = true;
    el.textContent = '';
}

async function fetchPaymentLinks(subdomain) {
    try {
        const qs = new URLSearchParams({ subdomain });
        const response = await apiFetch(`/billing/links?${qs}`, { headers: BILLING_HEADERS });
        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            data = {};
        }
        if (response.status === 200 && data.paymentLinks) {
            updateFiscalPriceNotice(data);
            return data.paymentLinks;
        }
        const subdomainMsg = subdomainErrorMessage(data.error);
        let msg = '';
        if (subdomainMsg) {
            msg = subdomainMsg;
        } else if (data.error === 'NO_ACTIVE_PRODUCTS') {
            msg = 'No hay planes disponibles por ahora. Intenta más tarde.';
        } else if (response.status === 400) {
            msg = data.error || 'Solicitud inválida';
        } else if (response.status === 409) {
            msg = subdomainErrorMessage('SUBDOMAIN_TAKEN') || 'Conflicto al crear la sucursal';
        } else if (response.status === 503) {
            msg = 'No hay planes disponibles por ahora. Intenta más tarde.';
        } else if (response.status === 403 && (text.includes('not a client') || text.includes('Account is not a client'))) {
            msg = 'La cuenta no es de tipo cliente';
        } else if (response.status === 403) {
            msg = 'Path traversal detectado (Forbidden)';
        } else if (response.status === 404) {
            msg = 'No existe un customer asociado';
        } else if (response.status === 418 && text.includes('Token is required')) {
            msg = 'No se envió el token';
        } else if (response.status === 418) {
            msg = 'El token es inválido';
        } else if (response.status === 500) {
            msg = 'Error creando sesiones o links de pago';
        } else {
            msg = `Error ${response.status}: ${text}`;
        }
        showError(msg);
        return null;
    } catch (err) {
        showError('No se pudieron obtener los links de pago: ' + (err.message || err));
        return null;
    }
}


// Crear sesión del portal de facturación y redirigir al usuario
export async function openStripeBillingPortal() {
    try {
        const response = await apiFetch('/billing/portal', { headers: BILLING_HEADERS });
        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            data = {};
        }
        if (response.status === 200 && data.session && data.session.url) {
            window.open(data.session.url, '_blank');
            return;
        }
        // Manejo de errores según la tabla proporcionada
        let msg = '';
        if (response.status === 400) {
            msg = 'La cuenta no existe en la base de datos';
        } else if (response.status === 403 && (text.includes('not a client') || text.includes('Account is not a client'))) {
            msg = 'La cuenta no es de tipo cliente';
        } else if (response.status === 403) {
            msg = 'Path traversal detectado (Forbidden)';
        } else if (response.status === 404) {
            msg = 'No existe un customer asociado';
        } else if (response.status === 418 && text.includes('Token is required')) {
            msg = 'No se envió el token';
        } else if (response.status === 418) {
            msg = 'El token es inválido';
        } else if (response.status === 500) {
            msg = 'Error creando la sesión del portal en Stripe';
        } else {
            msg = `Error ${response.status}: ${text}`;
        }
        console.error('[openStripeBillingPortal] Error:', msg);
        showError('No se pudo abrir el portal de facturación: ' + msg);
    } catch (err) {
        console.error('[openStripeBillingPortal] Error en catch:', err);
        showError('No se pudo abrir el portal de facturación: ' + (err.message || err));
    }
}

// Crear customer en Stripe
export async function createStripeCustomer() {
    // Usar el modal de carga de Stripe si existe
    const stripeLoadingModal = document.getElementById('stripeLoadingModal');
    const stripeLoadingText = document.getElementById('stripeLoadingText');
    const stripeModalIcon = document.getElementById('stripeModalSpinner');
    if (stripeLoadingModal) stripeLoadingModal.style.display = 'flex';
    if (stripeModalIcon) {
        stripeModalIcon.style.display = 'block';
    }
    if (stripeLoadingText) {
        stripeLoadingText.textContent = 'Creando customer en Stripe...';
        stripeLoadingText.classList.remove('success', 'error');
    }
    try {
        // Sin Content-Type el backend responde 415: es un POST sin body, así
        // que apiFetch no lo añade solo.
        const response = await apiFetch('/billing/customer', {
            method: 'POST',
            headers: BILLING_HEADERS,
        });

        if (!response.ok) {
            const errorText = await response.text();
            let msg = '';
            if (response.status === 400 && errorText.includes('already exists')) {
                msg = 'El customer ya existe para esta cuenta';
            } else if (response.status === 400) {
                msg = 'La cuenta no existe en la base de datos';
            } else if (response.status === 403 && (errorText.includes('not a client') || errorText.includes('Account is not a client'))) {
                msg = 'La cuenta no es de tipo cliente';
            } else if (response.status === 403 && errorText.includes('CSRF')) {
                msg = 'Origen no permitido (CORS/CSRF). Revisa CORS_ORIGIN.';
            } else if (response.status === 403) {
                msg = 'Acceso denegado (403)';
            } else if (response.status === 418) {
                msg = 'No se envió el token';
            } else if (response.status === 500) {
                msg = 'Error creando el customer en Stripe';
            } else {
                msg = `Error ${response.status}: ${errorText}`;
            }
            if (stripeLoadingText) {
                stripeLoadingText.textContent = 'Error: ' + msg;
                stripeLoadingText.classList.remove('success');
                stripeLoadingText.classList.add('error');
            }
            if (stripeModalIcon) {
                stripeModalIcon.style.display = 'none';
            }
            throw new Error(msg);
        }
        const data = await response.json();
        if (stripeLoadingText) {
            stripeLoadingText.textContent = '¡Customer creado correctamente!';
            stripeLoadingText.classList.remove('error');
            stripeLoadingText.classList.add('success');
        }
        if (stripeModalIcon) {
            stripeModalIcon.style.display = 'none';
        }
        return data;
    } catch (err) {
        console.error('[createStripeCustomer] Error en catch:', err);
        // El mensaje de error ya se muestra en el modal
        throw err;
    }
}
async function activateSetup(technicalInfoId) {
    try {
        const response = await apiFetch('/billing/activate', {
            method: 'POST',
            headers: BILLING_HEADERS,
            body: JSON.stringify({ technical_info_id: technicalInfoId }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 200 && data.url) {
            window.open(data.url, '_blank');
            return;
        }
        if (response.status === 409) {
            showError('Esta sucursal aún no se puede activar.');
            return;
        }
        showError(data.error || 'No se pudo crear el checkout mensual.');
    } catch (err) {
        showError('No se pudo activar: ' + (err.message || err));
    }
}

async function fetchSetups(page = 1) {
    const loadingEl = document.getElementById('billingLoading');
    const errorEl = document.getElementById('billingError');
    const cardsContainer = document.getElementById('billingCardsContainer');
    if (cardsContainer) cardsContainer.innerHTML = '';
    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';
    setHasCustomer(false);
    
    try {
        const qs = new URLSearchParams({ page: String(page) });
        const response = await apiFetch(`/billing/setup?${qs}`, { headers: BILLING_HEADERS });

        if (!response.ok) {
            const errorText = await response.text();
            
            if (response.status === 400) {
                throw new Error('Account does not exist');
            } else if (response.status === 403) {
                throw new Error('Account is not a client');
            } else if (response.status === 404) {
                throw new Error('404');
            } else if (response.status === 500) {
                throw new Error('Internal server error');
            }
            throw new Error(`Error ${response.status}: No se pudieron cargar los planes`);
        }

        const data = await response.json();
        setHasCustomer(true);

        let setups = data.data || data.provisions || [];

        if (!cardsContainer) return;
        if (setups.length === 0) {
            cardsContainer.innerHTML = '<div class="empty-message"><p>Aún no tienes sucursales. Da de alta la primera.</p></div>';
        } else {
            cardsContainer.innerHTML = setups.map(setup => {
                const badge = getStatusBadge(setup.status);
                let statusClass = 'card-status';
                if (badge.class === 'status-inactive') statusClass += ' inactive';
                if (badge.class === 'status-pending') statusClass += ' pending';
                const subdomain = escapeHtml(setup.subdomain || '');
                const planName = escapeHtml(setup.planned_plan || 'Plan');
                const badgeText = escapeHtml((badge.text || '').toUpperCase());
                const created = escapeHtml(formatDate(setup.created_at));
                const id = escapeHtml(setup.id);
                let action = '';
                if (setup.status === 'ready_for_subscription') {
                    action = `<button type="button" class="js-activate" data-id="${id}">Activar mensual</button>`;
                } else if (setup.status === 'unpaid') {
                    action = `<button type="button" class="js-portal">Actualizar pago</button>`;
                }
                return `
                <div class="subscription-card">
                  <div class="card-header">
                    <span class="card-icon"><img src="${getPlanIcon(planName)}" alt="${planName}" style="width: 32px; height: 32px; object-fit: contain;"></span>
                    <div>
                      <div class="card-title">${subdomain}.reservai.com.mx</div>
                      <div class="card-price">${planName}</div>
                    </div>
                  </div>
                  <div class="${statusClass}">${badgeText}</div>
                  <div class="card-dates">
                    <div>
                      <div class="card-date-label"><i class="fa-regular fa-calendar"></i> ALTA</div>
                      <div class="card-date-value">${created}</div>
                    </div>
                  </div>
                  <div class="card-actions">${action}</div>
                </div>
                `;
            }).join('');
            cardsContainer.querySelectorAll('.js-activate').forEach((btn) => {
                btn.addEventListener('click', () => activateSetup(btn.dataset.id));
            });
            cardsContainer.querySelectorAll('.js-portal').forEach((btn) => {
                btn.addEventListener('click', () => openStripeBillingPortal());
            });
        }
        // Mostrar el contenedor de tarjetas cuando termina de cargar
        // (No es necesario mostrar/ocultar billingTable, ya no existe)

        // Agregar animación a la tabla
        const billingContent = document.querySelector('.billing-content');
        if (billingContent) {
            billingContent.style.animation = 'slideInContent 0.5s ease-out';
        }

    } catch (err) {
        console.error("Error al cargar planes:", err);
        const billingContent = document.querySelector('.billing-content');
        const manageBillingBtn = document.getElementById('manageBillingBtn');
        if (errorEl) {
            errorEl.style.display = 'block';
            if (billingContent) billingContent.style.display = 'none';
            if (manageBillingBtn) manageBillingBtn.style.display = 'none';
            // Si es error 404, mostrar mensaje personalizado de Stripe
            if (err.message.includes('404') || err.status === 404) {
                errorEl.innerHTML = `
                    <div style="
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 2.5rem 2rem;
                        gap: 1rem;
                        min-height: 250px;
                    ">
                        <div style="font-size: 3rem; opacity: 0.9;">💳</div>
                        <div style="text-align: center;">
                            <h2 style="
                                font-size: 1.3rem;
                                margin: 0 0 0.5rem 0;
                                color: var(--text-light);
                                font-weight: 600;
                            ">Configura tu método de pago</h2>
                            <p style="
                                color: #A0A0A0;
                                margin: 0;
                                font-size: 0.95rem;
                                line-height: 1.5;
                            ">Completa la configuración de Stripe para comenzar a usar tus planes.</p>
                        </div>
                        <a href="#" id="stripeConfigLink" style="
                            display: inline-flex;
                            align-items: center;
                            gap: 0.5rem;
                            background: var(--primary);
                            color: #fff;
                            padding: 0.75rem 1.75rem;
                            border-radius: 8px;
                            text-decoration: none;
                            cursor: pointer;
                            font-weight: 500;
                            font-size: 0.95rem;
                            transition: all 0.3s ease;
                            border: none;
                            margin-top: 0.5rem;
                        ">Configurar ahora →</a>
                    </div>
                    <div id="stripeLoadingModal">
                        <div class="stripe-modal-content">
                            <div id="stripeModalSpinner" class="spinner" style="display: block;"></div>
                            <div id="stripeLoadingText">Creando customer en Stripe...</div>
                        </div>
                    </div>
                `;
                // Event listener para el link de Stripe
                const stripeConfigLink = document.getElementById('stripeConfigLink');
                const stripeLoadingModal = document.getElementById('stripeLoadingModal');
                const stripeLoadingText = document.getElementById('stripeLoadingText');
                const stripeModalIcon = document.getElementById('stripeModalSpinner');
                if (stripeConfigLink) {
                    stripeConfigLink.addEventListener('click', async (e) => {
                        e.preventDefault();
                        if (stripeLoadingModal) stripeLoadingModal.style.display = 'flex';
                        if (stripeModalIcon) stripeModalIcon.style.display = 'block';
                        if (stripeLoadingText) {
                            stripeLoadingText.textContent = 'Creando customer en Stripe...';
                            stripeLoadingText.classList.remove('success', 'error');
                        }
                        try {
                            await createStripeCustomer();
                            if (stripeLoadingText) {
                                stripeLoadingText.textContent = '¡Customer creado correctamente!';
                                stripeLoadingText.classList.remove('error');
                                stripeLoadingText.classList.add('success');
                            }
                            if (stripeModalIcon) stripeModalIcon.style.display = 'none';
                            setTimeout(() => {
                                if (stripeLoadingModal) stripeLoadingModal.style.display = 'none';
                                window.location.reload();
                            }, 1200);
                        } catch (err) {
                            if (stripeLoadingText) {
                                stripeLoadingText.textContent = 'Error: ' + (err.message || 'No se pudo crear el customer');
                                stripeLoadingText.classList.remove('success');
                                stripeLoadingText.classList.add('error');
                            }
                            if (stripeModalIcon) stripeModalIcon.style.display = 'none';
                            setTimeout(() => {
                                if (stripeLoadingModal) stripeLoadingModal.style.display = 'none';
                            }, 2200);
                        }
                    });
                }
            } else {
                errorEl.textContent = '❌ ' + err.message;
            }
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

function formatPlanMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `$${Math.round(n)} MXN / mes`;
}

function renderPlanOptions(paymentLinks) {
    const list = document.getElementById('planOptionsList');
    if (!list) return;
    const links = Array.isArray(paymentLinks) ? paymentLinks : [];
    if (!links.length) {
        list.innerHTML = '<p style="color:#fff;opacity:0.8;">No hay planes activos.</p>';
        return;
    }
    list.innerHTML = links.map((link) => `
      <div class="plan-option" tabindex="0" data-product-id="${escapeHtml(link.id)}" role="button">
        <div class="plan-title">${escapeHtml(link.name || link.plan || 'Plan')}</div>
        <div class="plan-price">${escapeHtml(formatPlanMoney(link.monthly_amount))}</div>
        <div class="plan-desc">${escapeHtml(link.description || '')}</div>
      </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
        // FAB y modales de suscripción
        const fabBtn = document.getElementById('addSubscriptionBtn');
        const warningModal = document.getElementById('warningModal');
        const warningContinueBtn = document.getElementById('warningContinueBtn');
        const warningCancelBtn = document.getElementById('warningCancelBtn');
        const planModal = document.getElementById('planModal');
        const planOptionsList = document.getElementById('planOptionsList');
        let paymentLinksCache = null;

        if (fabBtn) {
            fabBtn.addEventListener('click', () => {
                showModal('warningModal');
            });
        }
        if (warningCancelBtn) {
            warningCancelBtn.addEventListener('click', () => {
                hideModal('warningModal');
            });
        }
        if (warningContinueBtn) {
            warningContinueBtn.addEventListener('click', async () => {
                const subdomainInput = document.getElementById('subdomainInput');
                const subdomain = (subdomainInput && subdomainInput.value || '').trim().toLowerCase();
                if (!subdomain) {
                    showError('Escribe un subdominio para la sucursal.');
                    return;
                }
                if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(subdomain) || subdomain.includes('--')) {
                    showError(subdomainErrorMessage('SUBDOMAIN_INVALID'));
                    return;
                }
                hideModal('warningModal');
                paymentLinksCache = await fetchPaymentLinks(subdomain);
                if (paymentLinksCache) {
                    renderPlanOptions(paymentLinksCache);
                    showModal('planModal');
                }
            });
        }
        // Cerrar modal de planes al hacer click fuera del contenido
        if (planModal) {
            planModal.addEventListener('click', (e) => {
                if (e.target === planModal) hideModal('planModal');
            });
        }
        if (planOptionsList) {
            planOptionsList.addEventListener('click', (e) => {
                const option = e.target.closest('.plan-option');
                if (!option || option.getAttribute('aria-disabled') === 'true') return;
                const productId = option.getAttribute('data-product-id');
                const links = Array.isArray(paymentLinksCache) ? paymentLinksCache : [];
                const link = links.find((item) => String(item.id) === String(productId));
                if (link?.url) {
                    window.open(link.url, '_blank');
                    hideModal('planModal');
                } else {
                    showError('No se encontró el link de pago para ese plan.');
                }
            });
            planOptionsList.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const option = e.target.closest('.plan-option');
                if (!option) return;
                e.preventDefault();
                option.click();
            });
        }
    setupAccountMenu(session || {});

    // Logout
    const logoutBtn = document.getElementById("logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", function(e) {
            e.preventDefault();
            goLogout();
        });
    }

    // Gestionar Pagos: abrir portal de Stripe
    const manageBillingBtn = document.getElementById("manageBillingBtn");
    if (manageBillingBtn) {
        manageBillingBtn.addEventListener("click", async () => {
            await openStripeBillingPortal();
        });
    }
    // Cargar datos iniciales
    fetchSetups(1);
});
