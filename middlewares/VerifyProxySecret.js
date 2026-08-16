/**
 * En producción el gateway inyecta el secreto.
 * En local no se exige: el browser no lo envía y el proxy /api lo añade hacia el API.
 */
function VerifyProxySecret(req, res, next) {
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.IS_PRODUCTION === 'true';
  if (!isProduction) {
    return next();
  }

  const expected = process.env.PROXY_SECRET_HEADER;
  if (!expected) {
    return res.status(503).json({ error: 'Service misconfigured' });
  }

  const provided = req.get('x-proxy-secret');
  if (!provided || provided !== expected) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

module.exports = VerifyProxySecret;
