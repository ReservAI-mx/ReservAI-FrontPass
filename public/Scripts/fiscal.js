import { apiFetch, goLogout, requireUiSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';
import { showToast } from './toast.js';

const BILLING_HEADERS = {
  'Content-Type': 'application/json',
  'X-Requested-With': 'XMLHttpRequest',
};

/** Regímenes más usados en CFDI 4.0 (c_RegimenFiscal) por tipo de persona. */
const REGIMENES_FISICA = [
  { value: '612', label: '612 — Actividades empresariales y profesionales' },
  { value: '626', label: '626 — Régimen Simplificado de Confianza (RESICO)' },
  { value: '621', label: '621 — Incorporación Fiscal' },
  { value: '606', label: '606 — Arrendamiento' },
  { value: '625', label: '625 — Ingresos por plataformas tecnológicas' },
  { value: '605', label: '605 — Sueldos y salarios / asimilados' },
  { value: '608', label: '608 — Demás ingresos' },
];

const REGIMENES_MORAL = [
  { value: '601', label: '601 — General de Ley Personas Morales' },
  { value: '626', label: '626 — Régimen Simplificado de Confianza (RESICO)' },
  { value: '603', label: '603 — Personas Morales con fines no lucrativos' },
  { value: '622', label: '622 — Actividades agrícolas, ganaderas, silvícolas y pesqueras' },
  { value: '620', label: '620 — Sociedades cooperativas de producción' },
  { value: '623', label: '623 — Opcional para grupos de sociedades' },
  { value: '624', label: '624 — Coordinados' },
];

const PLACEHOLDER_REGIMEN = 'Selecciona régimen fiscal';
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
const CP_RE = /^\d{5}$/;

function sanitizeRazon(value) {
  return String(value ?? '').trim().toUpperCase();
}

function sanitizeCp(value) {
  return String(value ?? '').trim();
}

const session = requireUiSession();
setupAccountMenu(session);

const logout = document.getElementById('logout');
if (logout) {
  logout.addEventListener('click', (e) => {
    e.preventDefault();
    goLogout();
  });
}

const els = {
  loading: document.getElementById('fiscalLoading'),
  error: document.getElementById('fiscalError'),
  message: document.getElementById('fiscalMessage'),
  form: document.getElementById('fiscalForm'),
  meta: document.getElementById('fiscalMeta'),
  activeBadge: document.getElementById('fiscalActiveBadge'),
  satBadge: document.getElementById('fiscalSatBadge'),
  satDetail: document.getElementById('fiscalSatDetail'),
  rfc: document.getElementById('rfc'),
  razon: document.getElementById('razon_social'),
  cp: document.getElementById('codigo_postal'),
  regimen: document.getElementById('regimen_fiscal'),
  uso: document.getElementById('uso_cfdi'),
  moral: document.getElementById('persona_moral'),
  disclaimer: document.getElementById('disclaimer'),
  disclaimerLabel: document.getElementById('disclaimerLabel'),
  saveBtn: document.getElementById('saveFiscalBtn'),
  toggleBtn: document.getElementById('toggleActiveBtn'),
  deleteBtn: document.getElementById('deleteFiscalBtn'),
};

let current = null;

function showError(msg) {
  if (els.error) {
    els.error.hidden = false;
    els.error.textContent = msg;
  }
  showToast(msg, 'error');
}

function clearError() {
  if (!els.error) return;
  els.error.hidden = true;
  els.error.textContent = '';
}

function showMessage(msg, type = 'success') {
  if (els.message) {
    els.message.hidden = false;
    els.message.textContent = msg;
    els.message.className = type === 'error'
      ? 'fiscal-status fiscal-status--error'
      : type === 'warning'
        ? 'fiscal-status fiscal-status--error'
        : 'fiscal-status fiscal-status--ok';
    setTimeout(() => {
      els.message.hidden = true;
    }, 3500);
  }
  showToast(msg, type);
}

function syncSaveEnabled() {
  if (!els.saveBtn || !els.disclaimer) return;
  els.saveBtn.disabled = !els.disclaimer.checked;
}

function regimenOptionsFor(isMoral) {
  return isMoral ? REGIMENES_MORAL : REGIMENES_FISICA;
}

/** Rellena el select; selectedValue null/'' deja el placeholder. */
function populateRegimenSelect(isMoral, selectedValue = '') {
  if (!els.regimen) return;
  const options = regimenOptionsFor(isMoral);
  const selected = selectedValue != null ? String(selectedValue).trim() : '';
  const known = options.some((o) => o.value === selected);

  els.regimen.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = PLACEHOLDER_REGIMEN;
  els.regimen.appendChild(placeholder);

  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    els.regimen.appendChild(el);
  }

  if (selected && known) {
    els.regimen.value = selected;
  } else if (selected && !known) {
    // Valor guardado fuera de la lista común: mostrarlo para no perderlo.
    const extra = document.createElement('option');
    extra.value = selected;
    extra.textContent = `${selected} — (guardado)`;
    els.regimen.appendChild(extra);
    els.regimen.value = selected;
  } else {
    els.regimen.value = '';
  }
}

function formatSatMessages(satValidation) {
  if (!satValidation?.messages?.length) return '';
  return satValidation.messages.join(' ');
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
  if (detail.error) {
    return `No se pudo validar con Facturama: ${detail.error}`;
  }
  const fails = [];
  if (detail.ExistRfc === false) fails.push('RFC no localizado/activo');
  if (detail.MatchName === false) fails.push('razón social no coincide');
  if (detail.MatchZipCode === false) fails.push('código postal no coincide');
  if (detail.MatchFiscalRegime === false) fails.push('régimen fiscal no coincide');
  if (fails.length === 0) return '';
  return `SAT rechazó: ${fails.join('; ')}.`;
}

function fillForm(data) {
  current = data;
  if (!data) {
    els.meta.hidden = true;
    els.toggleBtn.hidden = true;
    els.deleteBtn.hidden = true;
    if (els.satDetail) {
      els.satDetail.hidden = true;
      els.satDetail.textContent = '';
    }
    els.form.reset();
    if (els.uso) els.uso.value = 'G01';
    if (els.moral) els.moral.checked = false;
    populateRegimenSelect(false, '');
    syncSaveEnabled();
    return;
  }

  els.rfc.value = data.rfc || '';
  els.razon.value = sanitizeRazon(data.razon_social || '');
  els.cp.value = sanitizeCp(data.codigo_postal || '');
  els.uso.value = data.uso_cfdi || 'G01';
  els.moral.checked = !!data.persona_moral;
  populateRegimenSelect(!!data.persona_moral, data.regimen_fiscal || '');
  els.disclaimer.checked = false;

  els.meta.hidden = false;
  els.activeBadge.textContent = data.active ? 'Activa' : 'Inactiva';
  const satStatus = data.sat_validation_status || 'pending';
  els.satBadge.textContent = `SAT: ${satStatus}`;

  if (els.satDetail) {
    let sandboxNote = '';
    if (data.sat_validation_detail) {
      try {
        const detail = JSON.parse(data.sat_validation_detail);
        if (detail.sandbox_relaxed && detail.note) sandboxNote = detail.note;
      } catch {
        // ignore
      }
    }
    const msg = sandboxNote || formatSatDetail(data.sat_validation_detail);
    if (sandboxNote) {
      els.satDetail.hidden = false;
      els.satDetail.className = 'fiscal-status fiscal-status--ok';
      els.satDetail.textContent = msg;
    } else if ((satStatus === 'invalid' || satStatus === 'error') && msg) {
      els.satDetail.hidden = false;
      els.satDetail.className = 'fiscal-status fiscal-status--error';
      els.satDetail.textContent = msg;
    } else {
      els.satDetail.hidden = true;
      els.satDetail.textContent = '';
    }
  }

  els.toggleBtn.hidden = false;
  els.toggleBtn.textContent = data.active ? 'Desactivar' : 'Activar';
  els.deleteBtn.hidden = false;
  syncSaveEnabled();
}

async function loadFiscal() {
  clearError();
  if (els.loading) els.loading.hidden = false;
  try {
    const res = await apiFetch('/billing/fiscal', { headers: BILLING_HEADERS });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || 'No se pudo cargar la información fiscal');
    }
    if (body.disclaimer?.disclaimer_text && els.disclaimerLabel) {
      els.disclaimerLabel.textContent = body.disclaimer.disclaimer_text;
    }
    fillForm(body.data || null);
  } catch (err) {
    showError(err.message || 'Error al cargar');
  } finally {
    if (els.loading) els.loading.hidden = true;
  }
}

els.disclaimer?.addEventListener('change', syncSaveEnabled);

els.razon?.addEventListener('input', () => {
  const { selectionStart, selectionEnd, value } = els.razon;
  const sanitized = sanitizeRazon(value);
  if (value !== sanitized) {
    els.razon.value = sanitized;
    els.razon.setSelectionRange(selectionStart, selectionEnd);
  }
});

els.cp?.addEventListener('blur', () => {
  els.cp.value = sanitizeCp(els.cp.value);
});

els.moral?.addEventListener('change', () => {
  populateRegimenSelect(!!els.moral.checked, '');
});

function validateFormFields() {
  const rfc = els.rfc.value.trim().toUpperCase();
  const razon = sanitizeRazon(els.razon.value);
  const cp = sanitizeCp(els.cp.value);

  els.razon.value = razon;
  els.cp.value = cp;

  if (!RFC_RE.test(rfc)) {
    return 'RFC inválido. Verifica el formato (12 o 13 caracteres).';
  }
  if (razon.length < 3) {
    return 'La razón social es requerida (mínimo 3 caracteres).';
  }
  if (!CP_RE.test(cp)) {
    return 'Código postal inválido. Debe ser de 5 dígitos.';
  }
  if (!els.regimen.value) {
    return 'Selecciona un régimen fiscal.';
  }
  return null;
}

els.form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  if (!els.disclaimer.checked) {
    showError('Debes aceptar el aviso de autorización para guardar.');
    return;
  }

  const fieldError = validateFormFields();
  if (fieldError) {
    showError(fieldError);
    return;
  }

  const saveLabel = els.saveBtn.textContent;
  els.saveBtn.disabled = true;
  els.saveBtn.textContent = 'Validando con SAT…';
  try {
    const res = await apiFetch('/billing/fiscal', {
      method: 'PUT',
      headers: BILLING_HEADERS,
      body: JSON.stringify({
        confirmed: true,
        rfc: els.rfc.value.trim().toUpperCase(),
        razon_social: sanitizeRazon(els.razon.value),
        codigo_postal: sanitizeCp(els.cp.value),
        regimen_fiscal: els.regimen.value.trim(),
        uso_cfdi: els.uso.value.trim() || 'G01',
        persona_moral: !!els.moral.checked,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.error === 'DISCLAIMER_REQUIRED') {
        throw new Error('Debes aceptar el aviso de autorización.');
      }
      if (body.error === 'SAT_VALIDATION_FAILED') {
        const satMsg = formatSatMessages(body.sat_validation);
        if (els.satDetail && satMsg) {
          els.satDetail.hidden = false;
          els.satDetail.textContent = satMsg;
        }
        throw new Error(
          satMsg || 'Los datos fiscales no coinciden con el SAT. Corrígelos e intenta de nuevo.'
        );
      }
      if (body.error === 'rfc inválido') {
        throw new Error('RFC inválido. Verifica el formato.');
      }
      throw new Error(body.error || 'No se pudo guardar');
    }
    fillForm(body.data);
    const sat = body.data?.sat_validation_status || body.sat_validation?.status || 'pending';
    if (sat === 'valid') {
      showMessage('Información fiscal guardada. Validación SAT correcta.');
    } else if (sat === 'pending' || sat === 'error') {
      const satMsg = formatSatMessages(body.sat_validation);
      if (els.satDetail && satMsg) {
        els.satDetail.hidden = false;
        els.satDetail.textContent = satMsg;
      }
      showMessage(
        'Guardada; validación SAT pendiente (Facturama no disponible).',
        'warning'
      );
    } else {
      showMessage('Información fiscal guardada.');
    }
  } catch (err) {
    showError(err.message || 'Error al guardar');
  } finally {
    els.saveBtn.textContent = saveLabel;
    syncSaveEnabled();
  }
});

els.toggleBtn?.addEventListener('click', async () => {
  if (!current) return;
  clearError();
  const next = !current.active;
  try {
    const res = await apiFetch('/billing/fiscal', {
      method: 'PATCH',
      headers: BILLING_HEADERS,
      body: JSON.stringify({ active: next }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.error === 'DISCLAIMER_REQUIRED') {
        throw new Error('Debes guardar con el aviso aceptado antes de activar.');
      }
      if (body.error === 'SAT_VALIDATION_REQUIRED') {
        throw new Error(
          'La validación SAT debe ser válida antes de activar la facturación. Guarda de nuevo con datos correctos.'
        );
      }
      throw new Error(body.error || 'No se pudo actualizar el estado');
    }
    fillForm(body.data);
    showMessage(next ? 'Información fiscal activada.' : 'Información fiscal desactivada.');
  } catch (err) {
    showError(err.message || 'Error');
  }
});

els.deleteBtn?.addEventListener('click', async () => {
  if (!current) return;
  if (!window.confirm('¿Eliminar tu información fiscal?')) return;
  clearError();
  try {
    const res = await apiFetch('/billing/fiscal', {
      method: 'DELETE',
      headers: BILLING_HEADERS,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || 'No se pudo eliminar');
    }
    fillForm(null);
    showMessage(body.message || 'Eliminada.');
  } catch (err) {
    showError(err.message || 'Error');
  }
});

populateRegimenSelect(false, '');
loadFiscal();
