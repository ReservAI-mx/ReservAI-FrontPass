const express = require('express');
const path = require('path');
const router = express.Router();

router.use((req, res, next) => {
    // Si la ruta viene con /api, la removemos para procesamiento interno
    if (req.path.startsWith('/view')) {
        req.url = req.url.replace('/view', '');
        req.originalUrl = req.originalUrl.replace('/view', '');
    }
    next();
});


// Definir rutas
router.get('/', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/login.html")));
router.get('/login', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/login.html")));
router.get('/inicio', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/Inicio.html")));
router.get('/register', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/register.html")));
router.get('/QR', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/QR.html")));
router.get('/verify_email', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/verify_email.html")));
router.get('/twofa', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/twofa.html")));
router.get('/inicioAdmin', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/inicioAdmin.html")));
router.get('/invitations', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/invitations.html")));
router.get('/admin/tenants', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/tenants.html")));
router.get('/404', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/404.html")));
router.get('/unauthorized', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/unauthorized.html")));
/**
 * Los textos legales viven solo en la landing, para no mantener dos copias
 * que se desincronizan. Estas rutas se conservan como redireccion porque
 * puede haber enlaces viejos apuntando aqui (correos, marcadores, capturas).
 *
 * 302 y no 301: el navegador cachea el permanente de forma agresiva y, si
 * algun dia se quisiera volver a servir el texto desde la app, costaria
 * revertirlo en los navegadores que ya lo guardaron.
 */
const LEGAL_URLS = {
    terms: 'https://reservai.com.mx/terms',
    privacy: 'https://reservai.com.mx/privacy',
};

router.get('/terms', (req, res) => res.redirect(302, LEGAL_URLS.terms));
router.get('/privacy', (req, res) => res.redirect(302, LEGAL_URLS.privacy));
router.get('/billing', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/billing.html")));
router.get('/accept-invitation', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/accept-invitation.html")));
router.get('/forgot-password', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/forgot-password.html")));
router.get('/reset-password', (req, res) => res.sendFile(path.resolve(__dirname + "/../views/reset-password.html")));
module.exports = router;