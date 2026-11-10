'use strict';

// IIFE: onboard.js también declara `const api` en la misma página.
// Un segundo script clásico con el mismo nombre no llega a ejecutarse.
(function () {
  const ACCOUNT_DESTINATIONS = Object.freeze({
    admin: '/inicioAdmin',
    seller: '/invitations',
    client: '/inicio',
  });

  function normalizeAccountType(value) {
    const type = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(ACCOUNT_DESTINATIONS, type) ? type : null;
  }

  function destinationForAccountType(value) {
    const type = normalizeAccountType(value);
    return type ? ACCOUNT_DESTINATIONS[type] : null;
  }

  function resolveAccountType(authoritative, stored) {
    return normalizeAccountType(authoritative ?? stored);
  }

  const routing = { normalizeAccountType, destinationForAccountType, resolveAccountType };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = routing;
  } else {
    globalThis.PassAuthRouting = routing;
  }
})();
