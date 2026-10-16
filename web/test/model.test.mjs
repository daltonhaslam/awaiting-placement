import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/js/model.js';

const lenses = {
  placement: { home: 0, hha: 0.2, snf: 1.2, irf: 2.1 },
  adjusted: { home: 0.2, hha: 0.4, snf: 1.4, irf: 2.3 },
  unadjusted: { home: 0.3, hha: 0.5, snf: 1.6, irf: 2.9 },
};
const mix = { home: 0.65, hha: 0.17, snf: 0.15, irf: 0.03 };
const P = { lenses, mix };
const base = { beds: 350, occ: 0.70, dis: 18000, mcr: 0.45, ma: 0.5, lens: 'placement',
  t0: 2.5, t1: 1.0, cvar: 800, pay: 'case', rate: 2500, cm: 4500, fill: null, hospitalGap: null };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('autoFill ramps 70%→90%', () => {
  assert.equal(M.autoFill(0.59), 0);
  near(M.autoFill(0.80), 0.5);
  assert.equal(M.autoFill(0.95), 1);
});

test('excessDays: fixed lenses and the hospital lens', () => {
  assert.deepEqual(M.excessDays('placement', lenses, mix, null), lenses.placement);
  const sumAdj = 0.65 * 0.2 + 0.17 * 0.4 + 0.15 * 1.4 + 0.03 * 2.3;
  const h = M.excessDays('hospital', lenses, mix, sumAdj);
  for (const d of M.DESTS) near(h[d], lenses.adjusted[d]);
  const neg = M.excessDays('hospital', lenses, mix, -0.3);
  for (const d of M.DESTS) assert.equal(neg[d], 0);
  const nan = M.excessDays('hospital', lenses, mix, NaN);
  for (const d of M.DESTS) assert.equal(nan[d], 0);
  assert.deepEqual(M.excessDays('bogus', lenses, mix, null), lenses.placement);
});

test('compute: regional worked example (per-case)', () => {
  const r = M.compute(base, P);
  near(r.nMA, 4050);
  near(r.perMA, 0.277); // 0.17 × 0.2 + 0.15 × 1.2 + 0.03 × 2.1
  near(r.bedDays, 1121.85);
  near(r.beds, 1121.85 / 365);
  near(r.speedup, 1.5);
  near(r.savedBedDays, 4050 * (0.15 * 1.2 + 0.03 * 1.5));
  assert.equal(r.fill, 0);
  assert.equal(r.addedAdmissions, 0);
  near(r.dollars.excessNet, -1121.85 * 800);
  near(r.dollars.fasterNet, r.savedBedDays * 800);
  assert.equal(r.capped, false);
});

test('compute: MA share 0 and 1 are linear', () => {
  assert.equal(M.compute({ ...base, ma: 0 }, P).bedDays, 0);
  near(M.compute({ ...base, ma: 1 }, P).bedDays, 2 * M.compute(base, P).bedDays);
});

test('faster auth: t1 > t0 means no speed-up; savings never exceed the excess', () => {
  const r = M.compute({ ...base, t0: 1, t1: 3 }, P);
  assert.equal(r.speedup, 0);
  assert.equal(r.savedBedDays, 0);
  const big = M.compute({ ...base, t0: 7, t1: 0 }, P);
  assert.ok(big.savedBedDays <= big.bedDays + 1e-9);
});

test('per-diem flips the sign of the excess and can make faster auth cost money', () => {
  const r = M.compute({ ...base, pay: 'diem', rate: 2500 }, P);
  assert.ok(r.dollars.excessNet > 0);
  assert.ok(r.dollars.fasterNet < 0);
  const low = M.compute({ ...base, pay: 'diem', rate: 500 }, P);
  assert.ok(low.dollars.excessNet < 0);
});

test('added admissions use fill and ALOS', () => {
  const r = M.compute({ ...base, occ: 0.9 }, P);
  assert.equal(r.fill, 1);
  near(r.addedAdmissions, r.savedBedDays / r.alos);
  near(r.dollars.fasterNet, r.addedAdmissions * 4500 + r.savedBedDays * 800);
  const o = M.compute({ ...base, occ: 0.9, fill: 0.25 }, P);
  near(o.addedAdmissions, 0.25 * o.savedBedDays / o.alos);
});

test('extreme inputs stay finite and cap at occupied bed-days', () => {
  const r = M.compute({ ...base, beds: 10, occ: 0.3, dis: 150000, mcr: 1, ma: 1, lens: 'unadjusted' }, P);
  assert.equal(r.capped, true);
  near(r.bedDays, 0.3 * 10 * 365);
  for (const v of [r.beds, r.alos, r.occWithout, r.dollars.excessNet, r.dollars.fasterNet]) assert.ok(Number.isFinite(v));
  assert.ok(r.occWithout >= 0);
});

test('curve spans 0..1 with a faster line at or below the current line', () => {
  const c = M.curve(base, P, 11);
  assert.equal(c.length, 11);
  assert.equal(c[0].ma, 0); assert.equal(c[10].ma, 1);
  assert.equal(c[0].beds, 0);
  for (const p of c) assert.ok(p.bedsFaster <= p.beds + 1e-9);
});

const D = { model: { lenses, mix, defaults: { t0: 2.5, t1: 1.0, cvar: 800, pay: 'case', rate: 2500, cm: 4500, lens: 'placement' },
  ranges: { beds: [10, 2500], occ: [0.3, 1], dis: [100, 150000], mcr: [0, 1], ma: [0, 1], t0: [0, 7], t1: [0, 7], cvar: [300, 2000], rate: [500, 6000], cm: [0, 15000], fill: [0, 1] } },
  presets: [{ id: 'regional', beds: 350, occ: 0.7, dis: 18000, mcr: 0.45, ma: 0.5 }] };

test('state round-trips', () => {
  const inputs = M.defaultInputs(D, D.presets[0]);
  const q = M.encodeState({ ...inputs, ma: 0.62, lens: 'adjusted', fill: 0.4 }, '220071');
  const back = M.decodeState(q, D);
  assert.equal(back.hospitalId, '220071');
  near(back.inputs.ma, 0.62);
  assert.equal(back.inputs.lens, 'adjusted');
  near(back.inputs.fill, 0.4);
});

test('hospital ids must be six digits; a lettered id falls back from the hospital lens', () => {
  const r = M.decodeState('l=hospital&h=ABC123', D);
  assert.equal(r.hospitalId, null);
  assert.equal(r.inputs.lens, 'placement');
  assert.equal(M.decodeState('l=hospital&h=220071', D).hospitalId, '220071');
});

test('hostile or garbled state is clamped or ignored', () => {
  const { inputs, hospitalId } = M.decodeState('b=abc&a=5&l=<script>&h=../x&p=evil&o=-3&zz=1', D);
  assert.equal(inputs.beds, 350);        // non-numeric -> preset default
  assert.equal(inputs.ma, 1);            // clamped
  assert.equal(inputs.lens, 'placement');
  assert.equal(inputs.pay, 'case');
  assert.equal(inputs.occ, 0.3);         // clamped to range
  assert.equal(hospitalId, null);
});

const DM = {
  model: { ranges: { beds: [10, 2500], occ: [0.3, 1], dis: [100, 150000], mcr: [0, 1], ma: [0, 1] } },
  presets: [{ id: 'community', beds: 100, occ: 0.5, dis: 5000, mcr: 0.4, ma: 0.3 },
    { id: 'regional', beds: 350, occ: 0.65, dis: 14000, mcr: 0.42, ma: 0.55 }],
};
const hosp = { beds: 300, occ: 0.8, dis: 12000, mcr: 0.38, ma: 0.3, gap: 0.7, occFlag: false };

test('FILL_LO and FILL_HI drive autoFill', () => {
  assert.equal(M.FILL_LO, 0.70);
  assert.equal(M.FILL_HI, 0.90);
  assert.equal(M.autoFill(M.FILL_LO), 0);
  assert.equal(M.autoFill(M.FILL_HI), 1);
});

test('inputsFromHospital: its own figures, gap included', () => {
  assert.deepEqual(M.inputsFromHospital(DM, hosp), { beds: 300, occ: 0.8, dis: 12000, mcr: 0.38, ma: 0.3, hospitalGap: 0.7 });
});

test('inputsFromHospital: a flagged occupancy and missing figures fall back to the preset, out-of-range values clamp', () => {
  const r = M.inputsFromHospital(DM, { ...hosp, occ: 1.09, occFlag: true, mcr: null, beds: 9000, dis: 3, gap: null });
  assert.equal(r.occ, 0.65, 'regional occupancy, not the flagged figure');
  assert.equal(r.mcr, 0.42);
  assert.equal(r.beds, 2500);
  assert.equal(r.dis, 100);
  assert.equal(r.hospitalGap, null);
  assert.equal(M.inputsFromHospital(DM, { ...hosp, occ: NaN }, DM.presets[0]).occ, 0.5, 'an explicit base preset wins');
  assert.equal(M.hasBasic({ occ: 0.8, occFlag: true }, 'occ'), false);
  assert.equal(M.hasBasic({ occ: 0.8, occFlag: true }, 'beds'), false);
  assert.equal(M.hasBasic({ beds: 5 }, 'beds'), true);
});
