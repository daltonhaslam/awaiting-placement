export const DESTS = ['home', 'hha', 'snf', 'irf'];
export const PA_DESTS = ['snf', 'irf'];
const LENSES = ['placement', 'adjusted', 'unadjusted', 'hospital'];
const PAYS = ['case', 'diem'];

export const BASICS = ['beds', 'occ', 'dis', 'mcr', 'ma'];
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Share of freed bed-days refilled when the reader does not say: 0 at FILL_LO occupancy, 1 at FILL_HI.
export const FILL_LO = 0.70;
export const FILL_HI = 0.90;
export function autoFill(occ) {
  return clamp((occ - FILL_LO) / (FILL_HI - FILL_LO), 0, 1);
}

export function excessDays(lens, lenses, mix, hospitalGap) {
  if (lens === 'hospital') {
    const base = lenses.adjusted;
    const total = DESTS.reduce((s, d) => s + mix[d] * base[d], 0);
    const g = Number.isFinite(hospitalGap) ? Math.max(0, hospitalGap) : 0;
    const k = total > 0 ? g / total : 0;
    return Object.fromEntries(DESTS.map((d) => [d, base[d] * k]));
  }
  const t = lenses[lens] || lenses.placement;
  return Object.fromEntries(DESTS.map((d) => [d, t[d]]));
}

export function compute(inp, { lenses, mix }) {
  const { beds, occ, dis, mcr, ma, t0, t1, cvar, pay, rate, cm } = inp;
  const e = excessDays(inp.lens, lenses, mix, inp.hospitalGap);
  const occupied = occ * beds * 365;
  const alos = dis > 0 ? occupied / dis : 0;
  const nMA = dis * mcr * ma;
  const perMA = DESTS.reduce((s, d) => s + mix[d] * e[d], 0);
  let bedDays = nMA * perMA;
  const capped = bedDays > occupied;
  if (capped) bedDays = occupied;
  const speedup = Math.max(0, t0 - t1);
  const perSaved = PA_DESTS.reduce((s, d) => s + mix[d] * Math.min(speedup, e[d]), 0);
  const savedBedDays = Math.min(bedDays, nMA * perSaved);
  const fill = inp.fill == null ? autoFill(occ) : clamp(inp.fill, 0, 1);
  const addedAdmissions = alos > 0 ? (savedBedDays * fill) / alos : 0;
  const perDay = pay === 'diem' ? rate - cvar : -cvar; // hospital's net on one excess day
  return {
    nMA, alos, perMA, excess: e,
    bedDays, beds: bedDays / 365, bedShare: beds > 0 ? bedDays / 365 / beds : 0,
    alosAdded: dis > 0 ? bedDays / dis : 0,
    occWithout: beds > 0 ? Math.max(0, occ - bedDays / (beds * 365)) : 0,
    capped, speedup, savedBedDays, bedsFreed: savedBedDays / 365, fill, addedAdmissions,
    dollars: { excessNet: bedDays * perDay, fasterNet: addedAdmissions * cm - savedBedDays * perDay },
  };
}

export function curve(inp, params, steps = 21) {
  return Array.from({ length: steps }, (_, i) => {
    const ma = i / (steps - 1);
    const r = compute({ ...inp, ma }, params);
    return { ma, beds: r.beds, bedsFaster: (r.bedDays - r.savedBedDays) / 365 };
  });
}

export function defaultInputs(D, preset) {
  const d = D.model.defaults;
  return { beds: preset.beds, occ: preset.occ, dis: preset.dis, mcr: preset.mcr, ma: preset.ma,
    lens: d.lens, t0: d.t0, t1: d.t1, cvar: d.cvar, pay: d.pay, rate: d.rate, cm: d.cm, fill: null, hospitalGap: null };
}

const KEYS = { b: 'beds', o: 'occ', d: 'dis', m: 'mcr', a: 'ma', t0: 't0', t1: 't1', c: 'cvar', r: 'rate', cm: 'cm', f: 'fill' };

export function encodeState(inp, hospitalId = null) {
  const q = new URLSearchParams();
  for (const [k, name] of Object.entries(KEYS)) {
    const v = inp[name];
    if (v != null && Number.isFinite(v)) q.set(k, String(+v.toFixed(4)));
  }
  q.set('l', inp.lens); q.set('p', inp.pay);
  if (hospitalId) q.set('h', hospitalId);
  return q.toString();
}

export function decodeState(query, D, preset = D.presets.find((p) => p.id === 'regional') || D.presets[0]) {
  const q = new URLSearchParams(query || '');
  const inputs = defaultInputs(D, preset);
  const R = D.model.ranges;
  for (const [k, name] of Object.entries(KEYS)) {
    if (!q.has(k)) continue;
    const n = Number(q.get(k));
    if (q.get(k).trim() === '' || !Number.isFinite(n)) continue;
    inputs[name] = R[name] ? clamp(n, R[name][0], R[name][1]) : n;
  }
  const l = q.get('l'); if (LENSES.includes(l)) inputs.lens = l;
  const p = q.get('p'); if (PAYS.includes(p)) inputs.pay = p;
  const h = q.get('h');
  const hospitalId = h && /^[0-9]{6}$/.test(h) ? h : null;
  if (inputs.lens === 'hospital' && !hospitalId) inputs.lens = D.model.defaults.lens;
  return { inputs, hospitalId };
}

// Does this hospital have a usable value for a basic input? A flagged occupancy never is.
export const hasBasic = (x, k) => Number.isFinite(x[k]) && !(k === 'occ' && x.occFlag);

// The basic inputs a hospital sets in the calculator, plus its own gap: each its cost-report figure clamped to the
// input's range, or the preset's value where it has none (a flagged occupancy counts as none). Callers apply
// it over their own inputs; `base` defaults to the Regional preset, the calculator's starting point.
export function inputsFromHospital(D, x, base = D.presets.find((p) => p.id === 'regional') ?? D.presets[0]) {
  const R = D.model.ranges;
  const out = {};
  for (const k of BASICS) {
    const v = hasBasic(x, k) ? x[k] : base[k];
    out[k] = R[k] ? clamp(v, R[k][0], R[k][1]) : v;
  }
  out.hospitalGap = Number.isFinite(x.gap) ? x.gap : null;
  return out;
}
