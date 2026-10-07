'use strict';

const { shouldRedirectToBilling } = require('../public/Scripts/onboard');

const client = { role: 'client', dismissed: false };

test('admin no redirige', () => {
  expect(shouldRedirectToBilling({ role: 'admin', dismissed: false, status: 404, setups: [] })).toBe(false);
});

test('dismissed no redirige', () => {
  expect(shouldRedirectToBilling({ role: 'client', dismissed: true, status: 404, setups: [] })).toBe(false);
});

test('404 redirige', () => {
  expect(shouldRedirectToBilling({ ...client, status: 404, setups: [] })).toBe(true);
});

test('200 vacío redirige', () => {
  expect(shouldRedirectToBilling({ ...client, status: 200, setups: [] })).toBe(true);
});

test('200 con sucursal no redirige', () => {
  expect(shouldRedirectToBilling({ ...client, status: 200, setups: [{ id: 1 }] })).toBe(false);
});

test('500 no redirige', () => {
  expect(shouldRedirectToBilling({ ...client, status: 500, setups: [] })).toBe(false);
});
