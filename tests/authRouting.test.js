'use strict';

const {
  normalizeAccountType,
  destinationForAccountType,
  resolveAccountType,
} = require('../public/Scripts/authRouting');

test.each([
  ['admin', '/inicioAdmin'],
  ['seller', '/invitations'],
  ['client', '/inicio'],
  [' SELLER ', '/invitations'],
])('%j se dirige a %j', (type, destination) => {
  expect(destinationForAccountType(type)).toBe(destination);
});

test.each([undefined, null, '', 'vendor', 'cliente'])('%j no se convierte en client', (type) => {
  expect(normalizeAccountType(type)).toBeNull();
  expect(destinationForAccountType(type)).toBeNull();
});

test('el rol autoritativo seller reemplaza un client guardado', () => {
  expect(resolveAccountType('seller', 'client')).toBe('seller');
});

test('una respuesta legacy conserva un seller guardado', () => {
  expect(resolveAccountType(undefined, 'seller')).toBe('seller');
});

test('un rol autoritativo desconocido no reutiliza uno viejo', () => {
  expect(resolveAccountType('desconocido', 'client')).toBeNull();
});
