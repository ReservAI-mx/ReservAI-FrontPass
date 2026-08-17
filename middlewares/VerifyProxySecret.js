const crypto = require('crypto');

const DEFAULT_HEADER = 'x-proxy-secret';
const SKIP_PATHS = new Set(['/health']);

function headerName() {
  return (process.env.PROXY_SECRET_HEADER_NAME || DEFAULT_HEADER).toLowerCase();
}

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function isProductionEnv() {
  const stage = process.env.STAGE || process.env.NODE_ENV || '';
  return (
    stage === 'production' ||
    process.env.NODE_ENV === 'production' ||
    process.env.IS_PRODUCTION === 'true'
  );
}

function shouldSkipPath(req) {
  const raw = (req.originalUrl || req.url || '').split('?')[0];
  if (SKIP_PATHS.has(raw)) return true;
  if (req.path && SKIP_PATHS.has(req.path)) return true;
  return false;
}

/**
 * Exige X-Proxy-Secret inyectado por reservAI_gateway
 * (nginx: proxy_set_header X-Proxy-Secret … hacia el frontend).
 * Acceso directo al front sin pasar por el gateway → 403.
 * /health queda abierto para checks de Fly/Docker.
 */
function VerifyProxySecret(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    req.proxyVerified = true;
    return next();
  }

  if (shouldSkipPath(req)) {
    return next();
  }

  const expected = process.env.PROXY_SECRET_HEADER;
  if (!expected) {
    if (isProductionEnv()) {
      console.error('❌ PROXY_SECRET_HEADER no configurado en production');
      return res.status(503).json({ error: 'Service misconfigured' });
    }
    return next();
  }

  const provided = req.get(headerName());
  if (!provided || !timingSafeEqualString(provided, expected)) {
    console.warn(
      `[SECURITY] Proxy secret inválido o ausente: ${req.method} ${req.originalUrl}`
    );
    return res.status(403).json({ error: 'Forbidden' });
  }

  req.proxyVerified = true;
  return next();
}

module.exports = VerifyProxySecret;
module.exports.headerName = headerName;
module.exports.timingSafeEqualString = timingSafeEqualString;
