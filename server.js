const http = require('http');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const VerifyProxySecret = require('./middlewares/VerifyProxySecret');
const { getClientIp } = require('./utils/ClientIp');
const app = express();

// Puerto configurable desde argumento o por defecto 3000
const PORT = process.argv[2] || 3000;

const isProduction_ = process.argv[3] || process.env.NODE_ENV || 'dev';
let isProduction = isProduction_ === 'production';

// Importar router principal (ajusta ruta si es diferente)
const router = require('./public/Scripts/router');

// ============================
// Configuración de Helmet
// ============================
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrcElem: ["'self'", "https://cdnjs.cloudflare.com"],
      scriptSrc: isProduction ? ["'self'"] : ["'self'", "'unsafe-eval'"],
      scriptSrcAttr: isProduction ? ["'none'"] : ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://passmanager.reservai.com.mx", "http://localhost:3000", "http://127.0.0.1:3000"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "same-origin" },
  hidePoweredBy: true,
  frameguard: { action: 'deny' },
};

// ============================
// RATE LIMITERS
// ============================
app.set('trust proxy', 1);

const rateLimitKey = (req) => getClientIp(req);
const rateLimitValidate = { xForwardedForHeader: false, keyGeneratorIpFallback: false };

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  validate: rateLimitValidate,
  message: { status: 429, error: 'Too many requests, please try again later.', retryAfter: '15 minutes' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  validate: rateLimitValidate,
  message: { status: 429, error: 'Demasiados intentos. Espera un momento antes de volver a intentar.', retryAfter: '15 minutos' },
});

const assetsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isProduction ? 30 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: rateLimitKey,
  validate: rateLimitValidate,
  message: { status: 429, error: 'Too many asset requests', retryAfter: '1 minute' },
});

// ============================
// MIDDLEWARES
// ============================
if (!isProduction) {
  const apiTarget = new URL(process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000');
  app.use('/api', (req, res) => {
    const headers = { ...req.headers, host: apiTarget.host };
    if (process.env.PROXY_SECRET_HEADER) {
      headers['x-proxy-secret'] = process.env.PROXY_SECRET_HEADER;
    }
    const proxyReq = http.request(
      {
        hostname: apiTarget.hostname,
        port: apiTarget.port || 80,
        path: req.originalUrl,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'API no disponible en ' + apiTarget.origin });
      }
    });
    req.pipe(proxyReq);
  });
}

app.use(express.json());
app.use(helmet(helmetOptions));
app.use(VerifyProxySecret);
app.use(globalLimiter);
app.disable('x-powered-by');

// ============================
// CONFIGURACIÓN DE ARCHIVOS ESTÁTICOS
// ============================

// Servir archivos estáticos desde /public (tanto en desarrollo como en producción)
app.use('/static', express.static(path.join(__dirname, 'public'), {
  maxAge: isProduction ? '1y' : '1d',
  setHeaders: isProduction ? (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive');
      res.setHeader('Referrer-Policy', 'no-referrer');
    }
  } : undefined
}));

// En desarrollo también servir desde raíz
if (!isProduction) {
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
}

// ============================
// RUTAS Y RATE LIMITS ESPECÍFICOS
// ============================
app.use(['/login', '/auth', '/twofa', '/verification', '/api/auth'], authLimiter);
app.use('/assets', assetsLimiter);
app.use('/', router);

// ============================
// HANDLER 404
// ============================
app.use((req, res) => {
  const logDetails = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    ip: getClientIp(req),
    userAgent: req.get('User-Agent') || 'Unknown'
  };

  if (isProduction) {
    console.log(`[404-PROD] ${JSON.stringify(logDetails)}`);
    const suspicious = ['/admin', '/wp-admin', '/phpmyadmin', '/.env', '/config', '/backup'];
    if (suspicious.some(p => req.path.includes(p))) {
      console.log(`[SECURITY-ALERT] Suspicious 404: ${getClientIp(req)} -> ${req.path}`);
    }
    res.status(404).send('Page not found');
  } else {
    console.log(`[404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: 'Ruta no encontrada', path: req.originalUrl });
  }
});

// ============================
// INICIO DEL SERVIDOR
// ============================
app.listen(PORT, () => {
  console.log(`Servidor frontend en http://localhost:${PORT}`);
  console.log(`Modo: ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  if (!isProduction) {
    const target = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000';
    console.log(`Proxy /api -> ${target}`);
    if (!process.env.PROXY_SECRET_HEADER) {
      console.warn('PROXY_SECRET_HEADER no está definido; el API local puede responder 403');
    }
  }
});