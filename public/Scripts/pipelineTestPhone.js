'use strict';

const CANONICAL = /^\+521[1-9]\d{9}$/;
const NATIONAL_10 = /^[1-9]\d{9}$/;
const MX_12_NO_1 = /^52[1-9]\d{9}$/;
const MX_13_WITH_1 = /^521[1-9]\d{9}$/;

function normalizePipelineTestPhone(value) {
  if (value == null) return null;
  let s = String(value).trim();
  if (!s) return null;

  s = s.replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);

  const digits = s.replace(/\D/g, '');
  if (!digits) return null;

  let out = digits;
  if (NATIONAL_10.test(out)) out = '521' + out;
  else if (MX_12_NO_1.test(out)) out = '521' + out.slice(2);
  else if (!MX_13_WITH_1.test(out)) return null;

  const canonical = '+' + out;
  return CANONICAL.test(canonical) ? canonical : null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizePipelineTestPhone };
} else if (typeof globalThis !== 'undefined') {
  globalThis.normalizePipelineTestPhone = normalizePipelineTestPhone;
}
