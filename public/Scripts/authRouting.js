'use strict';

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

const api = { normalizeAccountType, destinationForAccountType, resolveAccountType };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.PassAuthRouting = api;
}
