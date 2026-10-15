import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtDays, fmtBeds, fmtPct, fmtMoney, fmtSigned, fmtDate } from '../src/js/format.js';
test('fmtMoney rounds before choosing the unit', () => {
  assert.equal(fmtMoney(999.7), '$1K');
  assert.equal(fmtMoney(-999.7), '−$1K');
  assert.equal(fmtMoney(999.4), '$999');
  assert.equal(fmtMoney(999999), '$1.0M');
  assert.equal(fmtMoney(994999.6), '$995K');
  assert.equal(fmtMoney(995000), '$995K');
  assert.equal(fmtMoney(999500), '$1.0M');
  assert.equal(fmtMoney(0.4), '$0');
});
test('formats', () => {
  assert.equal(fmtDays(2.345), '2.3 days');
  assert.equal(fmtDays(1), '1 day');
  assert.equal(fmtBeds(2.96), '3.0');
  assert.equal(fmtBeds(12.6), '13');
  assert.equal(fmtPct(0.527), '53%');
  assert.equal(fmtMoney(1234567), '$1.2M');
  assert.equal(fmtMoney(-863460), '−$863K');
  assert.equal(fmtMoney(740), '$740');
  assert.equal(fmtSigned(0.4, fmtDays), '+0.4 days');
  assert.equal(fmtSigned(-0.2, fmtDays), '−0.2 days');
  assert.equal(fmtSigned(0.03, fmtDays), '0.0 days');
  assert.equal(fmtSigned(-0.04, fmtDays), '0.0 days');
  assert.equal(fmtMoney(NaN), '—');
});
test('fmtDate shows only the precision the date has', () => {
  assert.equal(fmtDate('2024-01-01'), 'Jan 1, 2024');
  assert.equal(fmtDate('2025-09-30'), 'Sep 30, 2025');
  assert.equal(fmtDate('2026-06'), 'Jun 2026');
  assert.equal(fmtDate('2027'), '2027');
  assert.equal(fmtDate('2026-13-01'), '2026-13-01'); // not a date: shown as given
  assert.equal(fmtDate(null), '—');
});
