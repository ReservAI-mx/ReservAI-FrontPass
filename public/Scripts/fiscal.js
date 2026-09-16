import { apiFetch, goLogout, requireUiSession } from './api.js';
import { setupAccountMenu } from './accountMenu.js';

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
  if (!els.error) return;
  els.error.hidden = false;
  els.error.textContent = msg;
}

function clearError() {
  if (!els.error) return;
  els.error.hidden = true;
  els.error.textContent = '';
}

function showMessage(msg) {
  if (!els.message) return;
  els.message.hidden = false;
  els.message.textContent = msg;
  setTimeout(() => {
    els.message.hidden = true;
  }, 3500);
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

function fillForm(data) {
  current = data;
  if (!data) {
    els.meta.hidden = true;
    els.toggleBtn.hidden = true;
    els.deleteBtn.hidden = true;
    els.form.reset();
    if (els.uso) els.uso.value = 'G01';
    if (els.moral) els.moral.checked = false;
    populateRegimenSelect(false, '');
    syncSaveEnabled();
    return;
  }

  els.rfc.value = data.rfc || '';
  els.razon.value = data.razon_social || '';
  els.cp.value = data.codigo_postal || '';
  els.uso.value = data.uso_cfdi || 'G01';
  els.moral.checked = !!data.persona_moral;
  populateRegimenSelect(!!data.persona_moral, data.regimen_fiscal || '');
  els.disclaimer.checked = false;

  els.meta.hidden = false;
  els.activeBadge.textContent = data.active ? 'Activa' : 'Inactiva';
  els.satBadge.textContent = `SAT: ${data.sat_validation_status || 'pending'}`;

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

els.moral?.addEventListener('change', () => {
  populateRegimenSelect(!!els.moral.checked, '');
});

els.form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  if (!els.disclaimer.checked) {
    showError('Debes aceptar el aviso de autorización para guardar.');
    return;
  }

  if (!els.regimen.value) {
    showError('Selecciona un régimen fiscal.');
    return;
  }

  els.saveBtn.disabled = true;
  try {
    const res = await apiFetch('/billing/fiscal', {
      method: 'PUT',
      headers: BILLING_HEADERS,
      body: JSON.stringify({
        confirmed: true,
        rfc: els.rfc.value.trim(),
        razon_social: els.razon.value.trim(),
        codigo_postal: els.cp.value.trim(),
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
      throw new Error(body.error || 'No se pudo guardar');
    }
    fillForm(body.data);
    showMessage('Información fiscal guardada.');
  } catch (err) {
    showError(err.message || 'Error al guardar');
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
