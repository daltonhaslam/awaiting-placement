// The waiting room calculator (No. 04), its bed board and MA-share curve, rendered into a linkedom DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const dom = parseHTML('<!doctype html><html><head></head><body><main id="main"></main></body></html>');
// linkedom has no layout: a synchronous frame and an inert ResizeObserver let charts draw at their fallback width.
Object.assign(globalThis, {
  window: dom.window, document: dom.document, Node: dom.Node, HTMLElement: dom.HTMLElement,
  requestAnimationFrame: (f) => { f(0); return 1; }, cancelAnimationFrame: () => {},
  ResizeObserver: class { observe() {} disconnect() {} },
});

const { loadData } = await import('../src/js/data.js');
const { compute, decodeState, FILL_LO } = await import('../src/js/model.js');
const { ledgerRows } = await import('../src/js/views/calcCopy.js');
const { fmtBeds } = await import('../src/js/format.js');
const { renderCalculator, restoreCalculator, disposeCalculator } = await import('../src/js/views/calculator.js');
const { bedBoard, layout } = await import('../src/js/charts/bedBoard.js');
const { maCurve } = await import('../src/js/charts/maCurve.js');

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ap.min.json', import.meta.url), 'utf8'));
const D = loadData(structuredClone(fixture));
const P = { lenses: D.model.lenses, mix: D.model.mix };
const text = (el) => el.textContent.replace(/\s+/g, ' ');
const fire = (el, type, props = {}) => {
  const e = new dom.window.Event(type, { bubbles: true });
  Object.assign(e, props);
  el.dispatchEvent(e);
  return e;
};
const readout = (el) => el.querySelector('.calc__led .led__digits').getAttribute('data-value');
const field = (el, name) => el.querySelector(`input[name="${name}"]:not([type="radio"])`);
const link = (el) => el.querySelector('.calc__link').value;
const pick = (el, query) => {
  const box = el.querySelector('.omni input');
  box.value = query;
  fire(box, 'input');
  fire(box, 'keydown', { key: 'Enter' });
};
const set = (input, value, ev = 'input') => {
  input.value = String(value);
  fire(input, ev);
};
const clean = (el) => assert.doesNotMatch(text(el), /NaN|undefined|Infinity|\[object/);

test('anchored section with presets Community, Regional, Academic; Regional pressed', () => {
  const el = renderCalculator(D, { query: '' });
  assert.equal(el.querySelector('h2').id, 'calculator');
  assert.match(text(el), /No\. 04/);
  const btns = [...el.querySelectorAll('.calc__presets button')];
  assert.deepEqual(btns.map((b) => b.textContent), ['Community', 'Regional', 'Academic']);
  assert.deepEqual(btns.map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false']);
  assert.match(text(el.querySelector('.calc__note')), /Median of 300-449 bed hospitals \(fixture\)/);
  const { inputs } = decodeState('', D);
  assert.equal(readout(el), fmtBeds(compute(inputs, P).beds));
  clean(el);
});

test('moving the MA share to 0.8 updates the Now Serving readout', () => {
  const el = renderCalculator(D, { query: '' });
  const range = el.querySelector('input[type="range"][name="ma"]');
  const before = readout(el);
  set(range, 0.8);
  const { inputs } = decodeState('', D);
  const want = fmtBeds(compute({ ...inputs, ma: 0.8 }, P).beds);
  assert.equal(readout(el), want);
  assert.notEqual(readout(el), before);
  assert.equal(field(el, 'maPct').value, '80', 'the number field follows the slider');
  assert.match(link(el), /a=0\.8/);
  assert.match(el.querySelector('.calc__led').getAttribute('aria-label'), new RegExp(`${want.replace('.', '\\.')} beds`));
});

test('the national context tick sits on the MA-share track, labeled', () => {
  const el = renderCalculator(D, { query: '' });
  const tick = el.querySelector('.calc__tick');
  assert.ok(tick);
  assert.match(text(tick), /Hospitals studied here, FY2024/);
  assert.match(text(tick), /54%/); // fixture FY2024 maShare
});

test('choosing a hospital loads its inputs, enables its lens and puts h= in the share link', () => {
  const el = renderCalculator(D, { query: '' });
  const own = el.querySelector('input[name="lens"][value="hospital"]');
  assert.ok(own.hasAttribute('disabled'), 'own-gap lens starts disabled');
  pick(el, 'fixture university');
  const x = D.hospitalsById.get('330101');
  assert.equal(field(el, 'beds').value, String(x.beds));
  assert.equal(field(el, 'dis').value, String(x.dis));
  assert.equal(field(el, 'occ').value, String(+(x.occ * 100).toFixed(1)));
  assert.equal(field(el, 'mcr').value, String(+(x.mcr * 100).toFixed(1)));
  assert.equal(el.querySelector('input[type="range"][name="ma"]').value, String(x.ma));
  assert.ok(!own.hasAttribute('disabled'), 'own-gap lens enabled');
  assert.match(link(el), /h=330101/);
  assert.match(text(el.querySelector('.calc__note')), /Fixture University Hospital/);
  const pressed = [...el.querySelectorAll('.calc__presets button')].map((b) => b.getAttribute('aria-pressed'));
  assert.deepEqual(pressed, ['false', 'false', 'false']);
  // Its own gap feeds the hospital lens.
  own.checked = true;
  fire(own, 'change');
  const inp = { ...decodeState('', D).inputs, beds: x.beds, occ: x.occ, dis: x.dis, mcr: x.mcr, ma: x.ma, lens: 'hospital', hospitalGap: x.gap };
  assert.equal(readout(el), fmtBeds(compute(inp, P).beds));
  assert.match(link(el), /l=hospital/);
  // A preset drops the hospital and falls back from its lens.
  fire(el.querySelectorAll('.calc__presets button')[0], 'click');
  assert.doesNotMatch(link(el), /h=/);
  assert.match(link(el), /l=placement/);
  assert.ok(own.hasAttribute('disabled'));
});

test('a hospital with gap <= 0 under its own lens shows no extra days and 0.0', () => {
  const raw = structuredClone(fixture);
  raw.hospitals[0].gap = -0.2;
  const el = renderCalculator(loadData(raw), { query: `h=${raw.hospitals[0].id}&l=hospital` });
  assert.match(text(el), /This hospital's FY\d{4} cost report shows no longer MA stays \(.*\), so nothing is counted under this lens\. The other lenses use MedPAC's national averages, which may not fit this hospital\./);
  assert.equal(readout(el), '0.0');
  clean(el);
});

test('h= in the hash restores the hospital and fills basics the hash leaves out', () => {
  const el = renderCalculator(D, { query: 'h=220071&l=hospital&b=400' });
  const x = D.hospitalsById.get('220071');
  assert.equal(field(el, 'beds').value, '400', 'the hash wins where it speaks');
  assert.equal(field(el, 'dis').value, String(x.dis), 'the hospital fills the rest');
  assert.ok(el.querySelector('input[name="lens"][value="hospital"]').checked);
  assert.match(link(el), /h=220071/);
});

test('an unknown hospital id is dropped and the lens falls back', () => {
  const el = renderCalculator(D, { query: 'h=999999&l=hospital' });
  assert.doesNotMatch(link(el), /h=/);
  assert.match(link(el), /l=placement/);
  assert.ok(el.querySelector('input[name="lens"][value="placement"]').checked);
  assert.ok(el.querySelector('input[name="lens"][value="hospital"]').hasAttribute('disabled'));
  clean(el);
});

test('a "check this hospital\'s data" hospital: own-gap lens off, national lens, and a sentence saying why', () => {
  const x = D.hospitalsById.get('080321'); // fixture: flagged, gap +5.2
  assert.equal(x.checkData, true);
  const SENT = new RegExp(`Its FY${D.meta.latestFy} cost-report gap is \\+5\\.2 days, far outside the usual range, so this estimate uses MedPAC's national averages instead\\.`);
  // An old link asking for the hospital lens falls back to the default lens.
  const el = renderCalculator(D, { query: 'h=080321&l=hospital' });
  const own = el.querySelector('input[name="lens"][value="hospital"]');
  assert.ok(own.hasAttribute('disabled'));
  assert.ok(el.querySelector(`input[name="lens"][value="${D.model.defaults.lens}"]`).checked);
  assert.match(link(el), /h=080321/);
  assert.match(link(el), new RegExp(`l=${D.model.defaults.lens}`));
  assert.match(text(el.querySelector('.calc__lens-note')), SENT);
  clean(el);
  // Picking it from the search after another hospital's own lens also falls back.
  const el2 = renderCalculator(D, { query: 'h=220071&l=hospital' });
  pick(el2, 'fixture swingbed');
  assert.match(link(el2), /h=080321/);
  assert.match(link(el2), new RegExp(`l=${D.model.defaults.lens}`));
  assert.ok(el2.querySelector('input[name="lens"][value="hospital"]').hasAttribute('disabled'));
  assert.match(text(el2.querySelector('.calc__lens-note')), SENT);
  clean(el2);
});

test('a hostile share link loads clamped, with no NaN and nothing injected', () => {
  const el = renderCalculator(D, { query: 'b=abc&a=5&l=<script>&h=../x&o=-3&d=1e999&t1=NaN' });
  clean(el);
  assert.equal(el.querySelector('script'), null);
  assert.equal(el.querySelector('input[type="range"][name="ma"]').value, '1');
  assert.ok(el.querySelector('input[name="lens"][value="placement"]').checked);
  assert.equal(field(el, 'occ').value, String(+(D.model.ranges.occ[0] * 100).toFixed(1)));
  assert.doesNotMatch(link(el), /h=|script/);
  assert.ok(Number.isFinite(Number(readout(el))));
});

test('typed values: garbage keeps the last valid value; out-of-range clamps on commit', () => {
  const el = renderCalculator(D, { query: '' });
  const beds = field(el, 'beds');
  const start = readout(el);
  set(beds, '');
  assert.equal(readout(el), start, 'empty field: last valid value still used');
  set(beds, 'abc');
  assert.equal(readout(el), start);
  clean(el);
  set(beds, '99999');
  set(beds, '99999', 'change');
  assert.equal(beds.value, String(D.model.ranges.beds[1]), 'clamped to the range on commit');
  set(beds, '', 'change');
  assert.equal(beds.value, String(D.model.ranges.beds[1]), 'empty commit restores the last valid value');
  const pct = field(el, 'occ');
  set(pct, '250');
  assert.match(text(pct.closest('.fld')), /Using 100%, the largest value allowed/);
  set(pct, '250', 'change');
  assert.equal(pct.value, '100');
  clean(el);
});

test('editing a basic un-presses the preset; a preset click restores it', () => {
  const el = renderCalculator(D, { query: '' });
  set(field(el, 'beds'), '351');
  const pressed = () => [...el.querySelectorAll('.calc__presets button')].map((b) => b.getAttribute('aria-pressed'));
  assert.deepEqual(pressed(), ['false', 'false', 'false']);
  fire(el.querySelectorAll('.calc__presets button')[2], 'click');
  assert.deepEqual(pressed(), ['false', 'false', 'true']);
  assert.equal(field(el, 'beds').value, String(D.presetsById.get('academic').beds));
  assert.match(text(el.querySelector('.calc__note')), /teaching hospitals, 600\+ beds/);
});

test('per diem with rate below variable cost: a signed negative dollar line and a reason', () => {
  const el = renderCalculator(D, { query: 'p=diem&r=500&c=800' });
  const row = el.querySelector('[data-row="excessNet"]');
  assert.match(row.querySelector('dd').textContent, /^−\$/);
  assert.match(text(row), /below the variable cost/i);
  assert.ok(el.querySelector('input[name="pay"][value="diem"]').checked);
  assert.ok(!field(el, 'rate').closest('.fld').hasAttribute('hidden'), 'rate shown for per diem');
});

test('per case: the extra days are a cost; the rate field is hidden', () => {
  const el = renderCalculator(D, { query: '' });
  const row = el.querySelector('[data-row="excessNet"]');
  assert.match(row.querySelector('dd').textContent, /^−\$/);
  assert.match(text(row), /per-case/i);
  assert.ok(field(el, 'rate').closest('.fld').hasAttribute('hidden'));
  const faster = el.querySelector('[data-row="fasterNet"]');
  assert.match(faster.querySelector('dd').textContent, /^\+\$/);
});

test('per diem above cost: the extra days bring in revenue, faster decisions trade it', () => {
  const el = renderCalculator(D, { query: 'p=diem&r=2500&c=800' });
  assert.match(el.querySelector('[data-row="excessNet"] dd').textContent, /^\+\$/);
  assert.match(text(el.querySelector('[data-row="excessNet"]')), /pays for each day/);
});

test('capped inputs say so in plain text', () => {
  const el = renderCalculator(D, { query: 'b=10&o=0.3&d=150000&m=1&a=1&l=unadjusted' });
  assert.match(text(el), /Capped at the hospital's occupied beds; check inputs\./);
  clean(el);
});

test('inputs that imply an impossible average stay show a warning, and the inputs stay as typed', () => {
  // One calculator is live at a time (a new render disposes the last), so each case finishes before the next renders.
  const warn = (el) => el.querySelector('.calc__warn');
  // 10 beds at 90% for 5,000 discharges: 0.66 days a stay.
  const short = renderCalculator(D, { query: 'b=10&o=0.9&d=5000&m=0.6&a=0.8' });
  assert.ok(!warn(short).hidden, 'shown');
  assert.equal(warn(short).getAttribute('role'), 'status');
  assert.match(text(warn(short)), /These inputs imply an average stay of 0\.7 days for all patients/);
  assert.equal(short.querySelector('input[name="beds"]').value, '10', 'not changed');
  set(field(short, 'beds'), '300'); // typing back to sensible values hides it
  assert.ok(warn(short).hidden);
  clean(short);
  // 2,500 beds at 95% for 150 discharges: years a stay, written as a whole number.
  const long = renderCalculator(D, { query: 'b=2500&o=0.95&d=150' });
  assert.match(text(warn(long)), /average stay of [\d,]+ days/);
  clean(long);
  const ok = renderCalculator(D); // a preset is plausible
  assert.ok(warn(ok).hidden);
  clean(ok);
  // A hospital whose own cost-report figures imply it: the warning names the report, not the reader's typing.
  const real = loadData(JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8')));
  const odd = real.hospitals.find((x) => !x.occFlag && (x.occ * x.beds * 365) / x.dis < 1.5);
  const own = renderCalculator(real, { query: `h=${odd.id}` });
  assert.match(text(warn(own)), /figures in this hospital's cost report imply an average stay of/);
  clean(own);
  // A flagged occupancy is replaced by a typical one, so the report did not supply all three: the plain wording.
  const raw = structuredClone(fixture);
  const flagged = raw.hospitals.find((x) => x.occFlag);
  flagged.dis = raw.model.ranges.dis[1];
  const typical = renderCalculator(loadData(raw), { query: `h=${flagged.id}` });
  assert.match(text(warn(typical)), /^These inputs imply/);
  clean(typical);
});

test('fill: auto by default with its computed value; the override checkbox sets it', () => {
  const el = renderCalculator(D, { query: 'o=0.8' });
  assert.match(text(el.querySelector('.calc__fill')), /Auto: 50%/);
  const box = el.querySelector('input[name="fillOn"]');
  box.checked = true;
  fire(box, 'change');
  assert.match(link(el), /f=0\.5(&|$)/, 'the override starts at the auto value (50% at 80% occupancy), not at 100%');
  const slider = el.querySelector('input[name="fill"]');
  assert.equal(slider.value, '0.5');
  assert.match(text(el.querySelector('.calc__fill-out')), /50%/);
  set(slider, 0.25);
  assert.match(link(el), /f=0\.25/);
  box.checked = false;
  fire(box, 'change');
  assert.doesNotMatch(link(el), /f=/);
});

test('faster decisions: freed bed-days follow t0 -> t1; no speed-up when t1 >= t0', () => {
  const el = renderCalculator(D, { query: '' });
  const freed = () => el.querySelector('[data-row="savedBedDays"] dd').textContent;
  assert.notEqual(freed(), '0');
  set(field(el, 't1'), '3');
  assert.equal(freed(), '0');
  assert.match(text(el), /No speed-up/);
  clean(el);
});

test('a11y: labeled controls, a polite live region, the bed board is an image with a summary', () => {
  const el = renderCalculator(D, { query: '' });
  const live = el.querySelector('[aria-live="polite"]');
  assert.ok(live);
  for (const input of el.querySelectorAll('input')) {
    const labeled = input.closest('label') || (input.id && el.querySelector(`label[for="${input.id}"]`)) || input.getAttribute('aria-label');
    assert.ok(labeled, `input ${input.name || input.type} is labeled`);
  }
  const board = el.querySelector('.bb svg');
  assert.equal(board.getAttribute('role'), 'img');
  assert.match(board.getAttribute('aria-label'), /\d beds on an average day/);
  assert.match(text(el.querySelector('.bb__legend')), /Occupied.*Held by longer MA stays.*Freed by faster decisions.*Empty/);
});

test('the MA-share curve: two lines, a marker at the current share, an 11-row table', () => {
  const el = renderCalculator(D, { query: '' });
  const fig = el.querySelector('.fig');
  assert.match(text(fig.querySelector('.fig__head')), /Fig\. \d+/);
  const svg = fig.querySelector('.curve svg');
  assert.equal(svg.getAttribute('role'), 'img');
  assert.equal(svg.querySelectorAll('.curve__line').length, 2);
  assert.ok(svg.querySelector('.curve__line--faster'));
  assert.ok(svg.querySelector('.curve__marker'));
  const rows = fig.querySelectorAll('.table-alt tbody tr');
  assert.equal(rows.length, 11);
  assert.match(text(rows[0]), /^0%/);
  assert.match(text(rows[10]), /^100%/);
  assert.match(text(fig), /Today/);
  assert.match(text(fig), /With faster decisions/);
  clean(fig);
});

test('maCurve redraws in place and its y-axis starts at zero', () => {
  const el = document.createElement('div');
  const pts = Array.from({ length: 21 }, (_, i) => ({ ma: i / 20, beds: i * 0.3, bedsFaster: i * 0.1 }));
  maCurve(el, { points: pts, current: { beds: 3, bedsFaster: 1 }, ma: 0.5 });
  maCurve(el, { points: pts, current: { beds: 3.3, bedsFaster: 1.1 }, ma: 0.55 });
  assert.equal(el.querySelectorAll('svg').length, 1);
  assert.ok([...el.querySelectorAll('.curve__ytick text')].some((t) => t.textContent === '0'));
  const flat = pts.map((p) => ({ ...p, beds: 0, bedsFaster: 0 }));
  maCurve(el, { points: flat, current: { beds: 0, bedsFaster: 0 }, ma: 0 });
  assert.doesNotMatch(el.innerHTML, /NaN|Infinity/);
});

test('bedBoard: 2,500 beds in under 200 ms, at most one cell per bed, states by count', () => {
  const el = document.createElement('div');
  const t0 = performance.now();
  const svg = bedBoard(el, { beds: 2500, occupied: 1800.4, held: 40.2, freed: 25.4 });
  const ms = performance.now() - t0;
  const cells = svg.querySelectorAll('rect');
  assert.ok(cells.length > 0 && cells.length <= 2500, `${cells.length} cells`);
  // Typical is about 3 ms. The budget guards against an order-of-magnitude regression on any machine (CI runners are
  // slower and shared), not tuning.
  assert.ok(ms < 200, `bedBoard took ${ms.toFixed(1)} ms (budget 200)`);
  const n = (c) => svg.querySelectorAll(`.${c}`).length;
  assert.equal(n('bb-held') + n('bb-freed'), 40);
  assert.equal(n('bb-freed'), 25);
  assert.equal(n('bb-occ') + n('bb-held') + n('bb-freed'), 1800);
  assert.equal(n('bb-empty'), 700);
  assert.equal(svg.getAttribute('role'), 'img');
});

test('bedBoard: updates toggle classes on the same nodes; bed count changes add or drop cells', () => {
  const el = document.createElement('div');
  const svg = bedBoard(el, { beds: 300, occupied: 200, held: 3, freed: 1 });
  const first = svg.querySelector('rect');
  const t0 = performance.now();
  assert.equal(bedBoard(el, { beds: 300, occupied: 150, held: 10, freed: 0 }), svg);
  assert.ok(performance.now() - t0 < 50);
  assert.equal(svg.querySelector('rect'), first, 'same nodes');
  assert.equal(svg.querySelectorAll('.bb-held').length, 10);
  bedBoard(el, { beds: 12, occupied: 6, held: 2, freed: 1 });
  assert.equal(svg.querySelectorAll('rect').length, 12);
  assert.equal(svg.querySelector('rect'), first);
  bedBoard(el, { beds: 12.6, occupied: 6, held: 2, freed: 1 });
  assert.equal(svg.querySelectorAll('rect').length, 12, 'never more cells than beds');
  bedBoard(el, { beds: 40, occupied: 50, held: 99, freed: NaN });
  assert.equal(svg.querySelectorAll('rect').length, 40);
  assert.equal(svg.querySelectorAll('.bb-empty').length, 0, 'occupied is capped at beds');
  assert.equal(svg.querySelectorAll('.bb-held').length, 40, 'held is capped at occupied');
  assert.doesNotMatch(svg.getAttribute('aria-label'), /NaN/);
});

// N-1: a dark edge on freed beds covered the amber on small cells, so they merged with the occupied block. A freed bed is
// now a smaller amber square inside its own cell, at every cell size; when it stops being freed it fills its cell again.
test('bedBoard: freed beds are smaller squares inside their own cells at every cell size, and return to full size', () => {
  const box = (r) => ['x', 'y', 'width', 'height'].map((k) => Number(r.getAttribute(k)));
  for (const beds of [300, 2500, 5000]) { // at the 560 px fallback width: 19, 6 and 4 px cells
    const el = document.createElement('div');
    const svg = bedBoard(el, { beds, occupied: beds * 0.7, held: 20, freed: 10 });
    const { p, cols, size } = layout(560, beds);
    const rects = [...svg.querySelectorAll('rect')];
    const freed = rects.map((r, i) => [r, i]).filter(([r]) => r.getAttribute('class') === 'bb-freed');
    assert.equal(freed.length, 10);
    assert.deepEqual(box(svg.querySelector('.bb-held')).slice(2), [size, size], `held beds fill their cell (${beds})`);
    for (const [r, i] of freed) {
      const [x, y, w, h] = box(r);
      const cx = (i % cols) * p, cy = Math.floor(i / cols) * p;
      assert.ok(w === h && w >= 2 && w < size, `freed square is smaller than a ${size} px cell (${w})`);
      assert.ok(x > cx && y > cy && x + w <= cx + size && y + h <= cy + size, `freed square stays inside its cell (${beds})`);
    }
    bedBoard(el, { beds, occupied: beds * 0.7, held: 20, freed: 0 });
    for (const [r] of freed) assert.deepEqual(box(r).slice(2), [size, size], 'no longer freed: the full cell again');
  }
});

test('the curve is not redrawn when only the MA share, dollars or refill move; its marker follows', () => {
  const el = renderCalculator(D, { query: '' });
  const svg = el.querySelector('svg.curve__svg');
  const lines = [...svg.querySelectorAll('path.curve__line')];
  const table = el.querySelector('.curve__table table');
  const x0 = svg.querySelector('.curve__marker').getAttribute('x1');
  set(el.querySelector('input[type="range"][name="ma"]'), 0.9);
  set(field(el, 'cvar'), 1200);
  assert.equal(el.querySelector('svg.curve__svg'), svg);
  assert.deepEqual([...svg.querySelectorAll('path.curve__line')], lines);
  assert.equal(el.querySelector('.curve__table table'), table, 'table twin kept');
  assert.notEqual(svg.querySelector('.curve__marker').getAttribute('x1'), x0);
  assert.match(svg.querySelector('.curve__marker-label').textContent, /90%/);
  set(field(el, 't1'), 2); // an input the curve depends on
  assert.notEqual(el.querySelector('svg.curve__svg'), svg);
  assert.notEqual(el.querySelector('.curve__table table'), table);
  clean(el);
});

test('the destination table is built once and its cells follow the lens', () => {
  const el = renderCalculator(D, { query: '' });
  const body = el.querySelector('.calc__mix tbody');
  const rows = [...body.querySelectorAll('tr')];
  assert.equal(rows.length, 4);
  const before = rows.map((r) => r.querySelectorAll('td')[1].textContent);
  const lensInput = el.querySelector('input[name="lens"][value="unadjusted"]');
  lensInput.checked = true;
  fire(lensInput, 'change');
  assert.deepEqual([...body.querySelectorAll('tr')], rows, 'same row nodes');
  assert.notDeepEqual(rows.map((r) => r.querySelectorAll('td')[1].textContent), before);
  assert.equal(rows[0].querySelectorAll('td')[2].textContent, '—');
});

test('LTCH share in the drawer note comes from the MedPAC stays data', () => {
  const el = renderCalculator(D, { query: '' });
  const s = D.content.medpac.sept.staysPer1000.ma;
  const pct = `${((s.ltch / s.ach) * 100).toFixed(1)}%`;
  assert.match(text(el.querySelector('.calc__mix-note')), new RegExp(`about ${pct.replace('.', '\\.')} of MA discharges`));
  const lean = structuredClone(fixture);
  delete lean.content.medpac.sept.staysPer1000;
  const bare = renderCalculator(loadData(lean), { query: '' });
  assert.doesNotMatch(text(bare.querySelector('.calc__mix-note')), /about .* of MA discharges/);
  assert.match(text(bare.querySelector('.calc__mix-note')), /Long-term care hospitals are left out\./);
});

test('dispose: no pending timers and no restore hook left behind', () => {
  const pending = new Set();
  const { setTimeout: st, clearTimeout: ct } = globalThis;
  globalThis.setTimeout = (f, ms, ...a) => { const id = st(() => { pending.delete(id); f(...a); }, ms); pending.add(id); return id; };
  globalThis.clearTimeout = (id) => { pending.delete(id); ct(id); };
  try {
    const el = renderCalculator(D, { query: '' });
    set(field(el, 'beds'), 450); // arms the hash write and the live announcement
    const armed = pending.size;
    assert.ok(armed >= 2, `expected the two debounce timers, saw ${armed}`);
    disposeCalculator();
    assert.equal(pending.size, 0, 'dispose clears the debounces');
    const shown = readout(el);
    restoreCalculator('b=900&a=0.9');
    assert.equal(readout(el), shown, 'the restore hook is gone');
    set(field(el, 'beds'), 700); // a stray event after unmount arms nothing that paints
    assert.equal(pending.size, 0);
    disposeCalculator(); // idempotent
  } finally {
    globalThis.setTimeout = st;
    globalThis.clearTimeout = ct;
  }
});

test('picking a hospital with a flagged occupancy leaves occupancy at the typical (Regional) value, like a link does', () => {
  const el = renderCalculator(D, { query: '' });
  set(field(el, 'occ'), 50);
  pick(el, 'overfull');
  assert.equal(field(el, 'beds').value, '300');
  assert.equal(field(el, 'occ').value, '65', 'not the flagged 109%');
  const viaLink = renderCalculator(D, { query: 'h=060456' });
  assert.equal(field(viaLink, 'occ').value, '65');
});

test('added-admissions note: an automatic zero cites the occupancy rule, at or below the threshold (70% included)', () => {
  for (const occ of [0.5, FILL_LO]) {
    const { inputs } = decodeState('', D);
    Object.assign(inputs, { occ, fill: null });
    const note = ledgerRows(compute(inputs, P), inputs).addedAdmissions[1];
    assert.match(note, /^None assumed: at or below 70% occupancy/, `occ ${occ}`);
  }
});

test('added-admissions note: a reader-set 0% refill says so, not the occupancy rule', () => {
  const { inputs } = decodeState('', D);
  Object.assign(inputs, { occ: 0.95, fill: 0 }); // busy hospital, but the reader turned refilling off
  const note = ledgerRows(compute(inputs, P), inputs).addedAdmissions[1];
  assert.match(note, /you set refilled beds to 0%/);
  assert.doesNotMatch(note, /occupancy/);
});

test('sliders carry aria-valuetext; beds hint and legend counts add up', () => {
  const el = renderCalculator(D, { query: '' });
  assert.match(el.querySelector('input[name="ma"]').getAttribute('aria-valuetext'), /^\d+% of Medicare patients in MA$/);
  assert.match(el.querySelector('input[name="fill"]').getAttribute('aria-valuetext'), /^\d+% of freed bed-days refilled$/);
  assert.match(text(el), /Cost reports count available beds, which can exceed staffed beds\. Enter your staffed count if you know it\./);
  const n = (k) => Number(/^(\d[\d,]*)/.exec(el.querySelector(`.bb__key--${k}`).parentElement.querySelector('.bb__n').textContent)[1].replace(/,/g, ''));
  const total = Number(/^([\d,]+) beds?/.exec(el.querySelector('.calc__board-n').textContent)[1].replace(/,/g, ''));
  assert.equal(n('occ') + n('held') + n('empty'), total, 'occupied + held + empty cells equal the beds');
  // The exact figure (the LED's) follows the whole-cell count only when the two differ: never "33 (33)".
  const heldText = el.querySelector('.bb__key--held').parentElement.querySelector('.bb__n').textContent;
  const exact = readout(el);
  assert.equal(heldText, exact === String(n('held')) ? exact : `${n('held')} (${exact})`);
  for (const q of ['b=2863&o=0.85&d=140000&m=0.4&a=0.6', 'b=300&a=0.5']) {
    const big = renderCalculator(D, { query: q });
    const t = big.querySelector('.bb__key--held').parentElement.querySelector('.bb__n').textContent;
    assert.doesNotMatch(t, /^([\d,]+) \(\1\)$/, `no repeated count (${t})`);
  }
});

test('ledger note reproduces the shown product, and says so when capped', () => {
  const P = D.model;
  const base = { beds: 200, occ: 0.7, dis: 10000, mcr: 0.4, ma: 0.5, lens: 'unadjusted', t0: 3, t1: 1, rate: 1200, cvar: 800, cm: 1000, fill: null, hospitalGap: null };
  const r = compute(base, P);
  const note = ledgerRows(r, base).bedDays[1];
  assert.ok(note.includes(r.perMA.toFixed(3)));
  const capped = compute({ ...base, beds: 20, occ: 0.3, dis: 200000 }, P);
  assert.ok(capped.capped);
  assert.match(ledgerRows(capped, { ...base, beds: 20, occ: 0.3, dis: 200000 }).bedDays[1], /Capped at the hospital's occupied bed-days/);
});
