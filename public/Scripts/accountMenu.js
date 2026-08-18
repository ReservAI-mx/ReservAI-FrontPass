/**
 * Menú de cuenta de la barra superior, compartido por /inicio y /inicioAdmin.
 * Antes solo abría con :hover, así que no servía en móvil ni con teclado.
 */
export function setupAccountMenu(session) {
  const profile = document.querySelector('.profile');
  const btn = document.getElementById('profileBtn');
  const nombreEl = document.getElementById('accountName');
  const billingLink = document.getElementById('billingLink');

  if (nombreEl && session?.account_name) {
    nombreEl.textContent = session.account_name;
  }

  // Facturación es solo para cuentas cliente: un admin no tiene suscripción.
  if (billingLink) {
    billingLink.hidden = session?.account_type !== 'client';
  }

  if (!profile || !btn) return;

  const cerrar = () => {
    profile.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const abierto = profile.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(abierto));
  });

  document.addEventListener('click', (e) => {
    if (!profile.contains(e.target)) cerrar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar();
  });
}
