// "Regresar" solo aparece si hay a dónde regresar dentro de la app.
const backBtn = document.getElementById('backBtn');
let mismaApp = false;
try {
  mismaApp = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
} catch (_) {
  mismaApp = false;
}
if (backBtn && mismaApp && window.history.length > 1) {
  backBtn.hidden = false;
  backBtn.addEventListener('click', () => window.history.back());
}
