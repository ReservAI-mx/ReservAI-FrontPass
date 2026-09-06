/**
 * Resolución de IP detrás de nginx de confianza.
 * Solo usa X-Real-IP / X-Forwarded-For si VerifyProxySecret marcó la request.
 */

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

function stripIpv6Mapped(ip) {
  if (typeof ip !== 'string') return '';
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function isValidIp(ip) {
  const value = stripIpv6Mapped(ip);
  if (!value || value.includes('/')) return false;
  if (IPV4_RE.test(value)) return true;
  if (value.includes(':') && IPV6_RE.test(value) && value.length <= 45) return true;
  return false;
}

function getClientIp(req) {
  if (req.proxyVerified) {
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string') {
      const candidate = stripIpv6Mapped(realIp.split(',')[0]);
      if (isValidIp(candidate)) {
        return candidate;
      }
    }
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      const hops = xff.split(',').map((h) => stripIpv6Mapped(h.trim()));
      const nearest = hops[hops.length - 1];
      if (isValidIp(nearest)) {
        return nearest;
      }
    }
  }

  return stripIpv6Mapped(req.socket?.remoteAddress || req.ip || '') || 'unknown';
}

/**
 * Primeros 4 grupos (64 bits) de una IPv6, expandiendo la forma comprimida.
 * Devuelve null si la dirección no se puede interpretar con seguridad.
 */
function ipv6Prefix64(ip) {
  const sinZona = String(ip).split('%')[0].toLowerCase();
  const mitades = sinZona.split('::');
  if (mitades.length > 2) return null;

  const cabeza = mitades[0] ? mitades[0].split(':') : [];
  const cola = mitades.length === 2 && mitades[1] ? mitades[1].split(':') : [];

  let grupos;
  if (mitades.length === 2) {
    const faltantes = 8 - cabeza.length - cola.length;
    if (faltantes < 0) return null;
    grupos = [...cabeza, ...Array(faltantes).fill('0'), ...cola];
  } else {
    grupos = cabeza;
  }

  if (grupos.length !== 8) return null;
  if (grupos.some((g) => g === '' || g.length > 4 || !/^[0-9a-f]+$/.test(g))) return null;

  return grupos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/**
 * Clave para los limitadores de peticiones.
 *
 * Una IPv4 identifica a un cliente, pero a uno de IPv6 se le asigna un /64
 * completo: usar la dirección exacta le daría 2^64 cupos independientes y
 * cualquier límite quedaría de adorno. Por eso aquí se agrupa por prefijo /64.
 *
 * Para los logs se sigue usando getClientIp, que conserva la dirección
 * completa: agrupar sirve para contar, no para identificar.
 */
function getRateLimitKey(req) {
  const ip = getClientIp(req);
  if (!ip.includes(':')) return ip; // IPv4 o 'unknown'
  return ipv6Prefix64(ip) || ip;
}

module.exports = { getClientIp, getRateLimitKey, ipv6Prefix64 };
