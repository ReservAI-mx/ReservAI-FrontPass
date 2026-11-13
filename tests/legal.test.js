'use strict';

const { siguienteSeguro, rutaAceptar, pendientesValidos, fechaLarga, RUTA } = require('../public/Scripts/legalRouting');

test('siguiente sólo acepta rutas de este sitio', () => {
  expect(siguienteSeguro('/inicio')).toBe('/inicio');
  expect(siguienteSeguro('/billing?x=1')).toBe('/billing?x=1');
  expect(siguienteSeguro('/api/oauth/authorize?client_id=a')).toBe('/api/oauth/authorize?client_id=a');
  for (const malo of ['https://otro.com', '//otro.com', '/\\otro.com', 'javascript:alert(1)', '', null, undefined, '/a\nb']) {
    expect(siguienteSeguro(malo)).toBe('/inicio');
  }
});

test('no se manda a sí misma (evita el ciclo)', () => {
  expect(siguienteSeguro(RUTA)).toBe('/inicio');
  expect(siguienteSeguro(`${RUTA}?siguiente=/x`)).toBe('/inicio');
});

test('rutaAceptar codifica el destino', () => {
  expect(rutaAceptar('/billing?a=1&b=2')).toBe('/terminos-actualizados?siguiente=%2Fbilling%3Fa%3D1%26b%3D2');
  expect(rutaAceptar('https://malo.com')).toBe('/terminos-actualizados?siguiente=%2Finicio');
});

test('pendientesValidos descarta lo que no se puede pintar', () => {
  const ok = { documento: 'terminos', version: '1.5', url: 'https://reservai.com.mx/terms' };
  expect(pendientesValidos([ok, { ...ok, url: 'javascript:alert(1)' }, { documento: 'x' }, null])).toEqual([ok]);
  expect(pendientesValidos('nada')).toEqual([]);
});

test('fechaLarga en español', () => {
  expect(fechaLarga('2026-09-02')).toBe('2 de septiembre de 2026');
  expect(fechaLarga('mal')).toBe('');
});
