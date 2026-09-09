function kbLogin(raw) {
  try {
    const u = new URL(raw);
    if (u.pathname !== '/login') return null;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return `${u.origin}/login`;
    if (u.protocol === 'https:' && host.startsWith('knowledge.') && host.endsWith('.reservai.com.mx')) {
      return `${u.origin}/login`;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

const next = kbLogin(new URLSearchParams(window.location.search).get('next') || '');
const dest = next || '/login';
const link = document.getElementById('backLink');
if (link) link.href = dest;
setTimeout(() => {
  window.location.replace(dest);
}, 3000);
