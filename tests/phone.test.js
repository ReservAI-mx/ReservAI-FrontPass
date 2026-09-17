'use strict';

const { normalizePipelineTestPhone } = require('../public/Scripts/pipelineTestPhone');

const CANON = '+5213321540248';

test.each([
  ['+5213321540248', CANON],
  ['+52 1 33 2154 0248', CANON],
  ['+521 332-154-0248', CANON],
  ['5213321540248', CANON],
  ['+523321540248', CANON],
  ['3321540248', CANON],
  ['525512345678', '+5215512345678'],
])('%j → canónico', (input, expected) => {
  expect(normalizePipelineTestPhone(input)).toBe(expected);
});

test.each([
  [''],
  ['   '],
  ['+15551234567'],
  ['+34551234567'],
])('%j → rechazo', (input) => {
  expect(normalizePipelineTestPhone(input)).toBeNull();
});
