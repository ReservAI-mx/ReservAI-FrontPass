import { apiJson, goLogout, requireUiSession } from './api.js';
import { legalesPendientes } from './legal.js';
import { setButtonLoading, shakeElement } from './buttonLoading.js';

/**
 * /terminos-actualizados?siguiente=/inicio
 * Muestra los Términos / Aviso de Privacidad que faltan por aceptar (la
 * versión vigente la publica la landing) y, al aceptar, sigue a ?siguiente=.
 */
const L = globalThis.PassLegal;
const session = requireUiSession();
const siguiente = L.siguienteSeguro(new URLSearchParams(window.location.search).get('siguiente'));

const ERRORES = {
  'Outdated version': 'Se publicó una versión más nueva mientras leías. Revisa la lista otra vez.',
  'Legal versions unavailable': 'No pudimos consultar la versión vigente. Vuelve a intentar en un momento.',
  'Not required for this account': null,
};

function continuar() {
  window.location.replace(siguiente);
}

function pintar(pendientes, els) {
  const nuevo = pendientes.length === 1 ? 'una versión nueva' : 'versiones nuevas';
  els.intro.textContent =
    `Publicamos ${nuevo} de estos documentos. Para seguir usando ReservAI, léelos y acéptalos:`;
  els.lista.replaceChildren(...pendientes.map((p) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = p.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = p.titulo || p.documento;
    const meta = document.createElement('span');
    meta.className = 'legal-lista__meta';
    const fecha = L.fechaLarga(p.vigente_desde);
    meta.textContent = `Versión ${p.version}${fecha ? ` · vigente desde el ${fecha}` : ''}`;
    li.append(a, meta);
    return li;
  }));
  els.lista.hidden = false;
  els.form.hidden = false;
  els.acepto.checked = false;
  els.btn.disabled = true;
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!session) return; // requireUiSession ya mandó al login
  if (session.account_type !== 'client') {
    continuar();
    return;
  }

  const els = {
    intro: document.getElementById('legalIntro'),
    lista: document.getElementById('legalLista'),
    form: document.getElementById('legalForm'),
    acepto: document.getElementById('legalAcepto'),
    error: document.getElementById('legalError'),
    btn: document.getElementById('legalBtn'),
  };
  document.getElementById('legalSalir').addEventListener('click', (e) => {
    e.preventDefault();
    goLogout();
  });

  let pendientes = [];
  async function cargar() {
    pendientes = await legalesPendientes();
    if (!pendientes.length) {
      continuar();
      return;
    }
    pintar(pendientes, els);
  }

  els.acepto.addEventListener('change', () => {
    els.error.textContent = '';
    els.btn.disabled = !els.acepto.checked;
  });

  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!els.acepto.checked) {
      shakeElement(els.form);
      return;
    }
    setButtonLoading(els.btn, true, 'Guardando…');
    try {
      const { ok, data } = await apiJson('/legal/aceptar', {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: { documentos: pendientes.map((p) => ({ documento: p.documento, version: p.version })) },
      });
      if (ok) {
        continuar();
        return;
      }
      if (data.error in ERRORES && ERRORES[data.error] === null) {
        continuar();
        return;
      }
      els.error.textContent = ERRORES[data.error] || 'No se pudo guardar. Vuelve a intentar.';
      shakeElement(els.form);
      if (data.error === 'Outdated version') await cargar();
    } catch (error) {
      if (error && error.message === 'Session expired') return;
      els.error.textContent = 'Error de red. Revisa tu conexión e intenta de nuevo.';
      shakeElement(els.form);
    } finally {
      if (document.body.contains(els.btn)) {
        setButtonLoading(els.btn, false);
        els.btn.disabled = !els.acepto.checked;
      }
    }
  });

  try {
    await cargar();
  } catch (error) {
    if (error && error.message === 'Session expired') return;
    continuar();
  }
});
