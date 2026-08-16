function getClientIp(req) {
  const raw = req.socket?.remoteAddress || req.ip || '';
  return String(raw).replace(/^::ffff:/, '') || 'unknown';
}

module.exports = { getClientIp };
