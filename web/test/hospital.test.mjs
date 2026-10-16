// The hospital profile, rendered into a linkedom DOM from the contract fixture and the real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const dom = parseHTML('<!doctype html><html><head></head><body><main id="main"></main></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.document, Node: dom.Node, HTMLElement: dom.HTMLElement });

const { loadData } = await import('../src/js/data.js');
const { resetFigures } = await import('../src/js/ui/figure.js');
const { renderHospital, hospitalTitle } = await import('../src/js/views/hospital.js');
const { fmtDays, fmtSigned, fmtPct, fmtNum, displayedGap, fmt1 } = await import('../src/js/format.js');
const { decodeState } = await import('../src/js/model.js');

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ap.min.json', import.meta.url), 'utf8'));
const D = loadData(structuredClone(fixture));
const REAL = loadData(JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8')));
const text = (el) => el.textContent.replace(/\s+/g, ' ');
const render = (data, id) => { resetFigures(); return renderHospital(data, id); };
const noNaN = (el) => {
  for (const n of el.querySelectorAll('*')) for (const a of n.attributes) assert.ok(!/NaN|undefined|Infinity/.test(a.value), `${n.tagName} ${a.name}="${a.value}"`);
  assert.ok(!/NaN|undefined|Infinity|\[object/.test(el.textContent));
};
const line = (x) => `MA ${fmtDays(x.maAlos)} · traditional ${fmtDays(x.ffsAlos)} · gap ${fmtSigned(displayedGap(x.maAlos, x.ffsAlos), fmtDays)}`;

test('hospitalTitle: the name alone, or with city and state when other hospitals share it', () => {
  const x = D.hospitalsById.get('220071');
  assert.equal(hospitalTitle(D, x), x.name);
  const twin = { ...x, id: '999998', city: 'Elsewhere', st: 'ZZ' };
  const both = loadData({ ...structuredClone(fixture), hospitals: [...structuredClone(fixture.hospitals), twin] });
  assert.equal(hospitalTitle(both, x), `${x.name} (${x.city}, ${x.st})`);
  assert.equal(hospitalTitle(both, twin), `${x.name} (Elsewhere, ZZ)`);
  const shared = REAL.hospitals.filter((y) => REAL.hospitals.filter((z) => z.name === y.name).length > 1);
  assert.ok(shared.length > 30, 'the real data has shared names');
  for (const y of shared.slice(0, 5)) assert.equal(hospitalTitle(REAL, y), `${y.name} (${y.city}, ${y.st})`);
});

test('profile shows name, place, beds, MA share, days line and the percentile sentence', () => {
  const x = D.hospitalsById.get('220071');
  const el = render(D, '220071');
  const t = text(el);
  assert.equal(el.querySelector('h1').textContent, x.name);
  assert.ok(t.includes(`${x.city}, ${x.st}`));
  assert.ok(t.includes('CCN 220071'));
  assert.ok(t.includes(`${fmtNum(x.beds)} beds`));
  assert.ok(t.includes(`MA share of Medicare discharges ${fmtPct(x.ma)}`));
  assert.ok(t.includes(line(x)), t);
  const withGap = D.hospitals.filter((o) => Number.isFinite(o.gap));
  const pct = Math.round((100 * withGap.filter((o) => o.gap < x.gap).length) / withGap.length);
  assert.match(t, new RegExp(`This gap is larger than at ${pct}% of hospitals\\.`));
  assert.ok(t.includes("Medicare Advantage (MA) and traditional Medicare stays. From this hospital's FY2024 cost report (self-reported, not adjusted for case mix)."));
  assert.ok(!/\bFFS\b/.test(t));
  noNaN(el);
});

test('real data: Massachusetts General reads from the data, not from hard-coded values', () => {
  const x = REAL.hospitalsById.get('220071');
  const el = render(REAL, '220071');
  const t = text(el);
  assert.ok(t.includes(`MA share of Medicare discharges ${fmtPct(x.ma)}`));
  assert.ok(t.includes(line(x)));
  noNaN(el);
});

test('gap at or below zero says MA stays were not longer here and still renders', () => {
  const x = D.hospitalsById.get('050123');
  assert.ok(x.gap <= 0);
  const el = render(D, '050123');
  const t = text(el);
  assert.ok(t.includes('MA stays were not longer here'));
  assert.ok(t.includes(line(x)));
  assert.ok(!/This gap is (larger|smaller)/.test(t));
  assert.equal(el.querySelectorAll('svg').length > 0, true);
  noNaN(el);
});

test('"check this hospital\'s data": the card note, no rank sentence, and the calculator opens on the national lens', () => {
  const x = D.hospitalsById.get('080321'); // fixture: flagged, gap +5.2
  assert.equal(x.checkData, true);
  const el = render(D, '080321');
  const t = text(el);
  const note = [...el.querySelectorAll('.card .card__note')].map(text);
  assert.ok(note.includes("Check this hospital's data. The gap in its cost report is far outside the usual range, which often means "
    + 'days from another unit, such as swing beds, were reported on the acute line.'), note.join(' | '));
  assert.ok(t.includes(line(x)), 'the figures are still shown');
  assert.equal(el.querySelector('.card__rank'), null);
  assert.ok(!/This gap is (larger|smaller)/.test(t));
  assert.ok(el.querySelector('svg'), 'still on the strip');
  const q = new URLSearchParams(el.querySelector('a.btn').getAttribute('href').split('?')[1]);
  assert.equal(q.get('l'), D.model.defaults.lens, 'default lens, not the hospital lens');
  assert.equal(q.get('h'), '080321');
  assert.match(text(el.querySelector('.profile__cta')), /far outside the usual range, so the calculator opens with MedPAC's national averages instead\./);
  assert.doesNotMatch(text(el.querySelector('.profile__cta')), /reports no MA excess/);
  noNaN(el);
  // An unflagged hospital has neither.
  const ok = text(render(D, '220071'));
  assert.ok(!ok.includes("Check this hospital's data"));
  // Real data: every flagged hospital renders the note and no rank sentence; the count matches meta.
  const flagged = REAL.hospitals.filter((y) => y.checkData);
  assert.equal(flagged.length, REAL.meta.flagged);
  for (const y of flagged) {
    const ry = render(REAL, y.id);
    assert.ok(text(ry).includes("Check this hospital's data."), y.id);
    assert.ok(!/This gap is (larger|smaller)/.test(text(ry)), y.id);
  }
});

test('flagged occupancy replaces the value with a plain note', () => {
  const x = D.hospitalsById.get('060456');
  assert.equal(x.occFlag, true);
  const t = text(render(D, '060456'));
  assert.ok(t.includes('Occupancy looks off in this cost report'));
  assert.ok(!t.includes(fmtPct(x.occ)), 'the flagged value is not shown');
  assert.ok(!/Occupancy 1\d\d%/.test(t));
});

test('a missing middle trend year breaks the line instead of dropping to zero', () => {
  const x = D.hospitalsById.get('070789');
  assert.equal(x.trend[4], null);
  const el = render(D, '070789');
  const paths = [...el.querySelectorAll('path.ls__line--ma')];
  assert.equal(paths.length, 2, 'share chart and stay chart');
  for (const p of paths) assert.equal((p.getAttribute('d').match(/M/g) || []).length, 2);
  for (const p of el.querySelectorAll('path.ls__line--ffs')) assert.equal((p.getAttribute('d').match(/M/g) || []).length, 2);
  noNaN(el);
});

test('gap strip marks this hospital and names the median and the middle 80%', () => {
  const x = D.hospitalsById.get('220071');
  const el = render(D, '220071');
  const strip = el.querySelector('svg.gs__svg');
  assert.ok(strip);
  assert.equal(strip.querySelectorAll('rect.gs__bar').length, D.gapHist.bins.length);
  assert.equal(strip.querySelectorAll('.gs__you').length, 1);
  assert.ok(text(strip).includes('This hospital'));
  // The flag carries the card's rounded gap (MA stay minus traditional stay as displayed), not the raw gap.
  const shown = displayedGap(x.maAlos, x.ffsAlos) ?? x.gap;
  assert.ok(text(strip).includes(`This hospital ${fmtSigned(shown, fmtDays)}`));
  assert.ok(strip.getAttribute('aria-label').includes(`This hospital is at ${fmtSigned(shown, fmtDays)}`));
  assert.match(strip.getAttribute('aria-label'), /median/i);
  const t = text(el);
  assert.ok(t.includes(`Median ${fmtSigned(D.gapHist.median, fmtDays)}`));
  assert.ok(t.includes(fmtSigned(D.gapHist.p10, fmtDays)) && t.includes(fmtSigned(D.gapHist.p90, fmtDays)));
  assert.ok(x);
});

test('unknown id renders not-found with a search box and a way back', () => {
  const el = render(D, '999999');
  assert.equal(el.querySelector('h1').textContent, 'Hospital not found');
  assert.ok(el.querySelector('input[role="combobox"]'));
  assert.ok(el.querySelector('a[href="#"]'));
  noNaN(el);
});

test('Open in calculator carries the hospital and the hospital lens, and decodes back', () => {
  const x = D.hospitalsById.get('330101');
  const el = render(D, '330101');
  const a = el.querySelector('a.btn');
  assert.equal(a.textContent, 'Open in calculator');
  const href = a.getAttribute('href');
  assert.ok(href.startsWith('#calculator?'));
  assert.ok(href.includes('h=330101') && href.includes('l=hospital'));
  const back = decodeState(href.slice('#calculator?'.length), D);
  assert.equal(back.hospitalId, '330101');
  assert.equal(back.inputs.beds, x.beds);
  assert.equal(back.inputs.lens, 'hospital');
});

test('Open in calculator for a flagged occupancy carries the typical (Regional) occupancy, and the calculator says so', async () => {
  const href = render(D, '060456').querySelector('a.btn').getAttribute('href');
  const q = new URLSearchParams(href.split('?')[1]);
  const regional = D.presets.find((p) => p.id === 'regional');
  assert.equal(Number(q.get('o')), regional.occ, 'the flagged figure is replaced, never sent');
  assert.notEqual(Number(q.get('o')), D.hospitalsById.get('060456').occ);
  assert.ok(q.get('h') === '060456' && q.get('l') === 'hospital');
  const { renderCalculator } = await import('../src/js/views/calculator.js');
  const calc = renderCalculator(D, { query: href.split('?')[1] });
  const note = text(calc.querySelector('.calc__note'));
  assert.match(note, /Occupancy is set to a typical value because the figure in its cost report looks off/);
  assert.ok(!/with your edits/.test(note));
  const occ = calc.querySelector('input[name="occ"], input[name="occPct"]');
  if (occ) assert.notEqual(Number(occ.value), 100);
  // a clean hospital keeps its own occupancy and the plain note
  const clean = renderCalculator(D, { query: 'h=330101&l=hospital' });
  assert.ok(!/typical value/.test(text(clean.querySelector('.calc__note'))));
});

test('flagged occupancy sits in the stat itself, once, and there is no bed-size badge', () => {
  const el = render(D, '060456');
  assert.equal(text(el).split('Occupancy looks off in this cost report').length - 1, 1);
  const badges = [...render(D, '010001').querySelectorAll('.badges li')];
  assert.equal(badges.length, 0);
  assert.deepEqual([...el.querySelectorAll('.badges li')].map((l) => l.textContent), ['Teaching hospital']);
});

const hospitalWithGaps = (gaps) => {
  const raw = structuredClone(fixture);
  const base = raw.hospitals[0];
  raw.hospitals = gaps.map((g, i) => ({ ...structuredClone(base), id: String(100000 + i), name: `H${i}`, gap: g }));
  return loadData(raw);
};

test('percentile: ties do not count as smaller, nulls are ignored', () => {
  const T = hospitalWithGaps([0.5, 0.5, 1, null, 2]);
  // two hospitals share 0.5: neither is larger than the other; 0 of 4 are smaller
  assert.match(text(render(T, '100000')), /This gap is smaller than at almost all hospitals\./);
  assert.match(text(render(T, '100001')), /This gap is smaller than at almost all hospitals\./);
  assert.match(text(render(T, '100002')), /This gap is larger than at 50% of hospitals\./);
});

test('percentile: both clamped extremes read naturally', () => {
  const gaps = Array.from({ length: 300 }, (_, i) => 0.1 + i * 0.01);
  const T = hospitalWithGaps(gaps);
  assert.match(text(render(T, '100299')), /This gap is larger than at more than 99% of hospitals\./);
  assert.match(text(render(T, '100000')), /This gap is smaller than at almost all hospitals\./);
});

test('back link goes to the share section; cannot-show list has three short points', () => {
  const el = render(D, '220071');
  assert.ok(el.querySelector('a[href="#share"]'));
  const items = el.querySelectorAll('.callout__list li');
  assert.equal(items.length, 3);
  assert.match(text(el), /What this can't show/);
});

test('every real hospital renders without NaN (sampled across the extremes)', () => {
  const H = REAL.hospitals;
  const pick = [H.reduce((a, b) => (b.beds > a.beds ? b : a)), H.find((x) => x.gap <= 0), H.find((x) => x.occFlag), H.find((x) => x.trend.some((t) => t === null)), H.find((x) => x.ma > 0.9)].filter(Boolean);
  for (const x of pick) noNaN(render(REAL, x.id));
});

// ---- gap strip clipping ----
const { clipHist, gapStrip } = await import('../src/js/charts/gapStrip.js');
const { h } = await import('../src/js/dom.js');
const wideHist = () => {
  const bins = [];
  for (let x0 = -4; x0 < 6; x0 += 0.25) {
    const mid = x0 + 0.125;
    bins.push({ x0, x1: x0 + 0.25, n: Math.abs(mid - 0.4) < 1.4 ? 100 : 0 });
  }
  bins[0].n = 3; bins[1].n = 2; bins.at(-1).n = 4; bins.at(-2).n = 1;
  return { binWidth: 0.25, bins, median: 0.4, p10: -0.5, p90: 1.3 };
};
const barRects = (svg) => [...svg.querySelectorAll('rect.gs__bar')];

test('clipHist folds the tails into end bins and keeps the total', () => {
  const hist = wideHist();
  const total = hist.bins.reduce((a, b) => a + b.n, 0);
  const { rows, lo, hi } = clipHist(hist);
  assert.equal(rows.reduce((a, b) => a + b.n, 0), total);
  assert.equal(rows[0].over, 'low');
  assert.equal(rows.at(-1).over, 'high');
  assert.ok(lo > -4 && hi < 6 && Number.isInteger(lo) && Number.isInteger(hi));
  assert.equal(rows[0].n, hist.bins.filter((b) => b.x1 <= lo + 1e-9).reduce((a, b) => a + b.n, 0));
  assert.match(rows[0].label, /or lower, combined/);
  assert.match(rows.at(-1).label, /or higher, combined/);
});

test('strip: overflow bars exist and their counts sum to the national total', () => {
  const hist = wideHist();
  const svg = gapStrip(h('div'), { hist, value: 0.4 });
  const bars = barRects(svg);
  assert.equal(svg.querySelectorAll('rect.gs__bar--over').length, 2);
  assert.equal(bars.reduce((a, r) => a + Number(r.getAttribute('data-n')), 0), hist.bins.reduce((a, b) => a + b.n, 0));
  assert.match(text(svg), /≤ /);
  assert.match(text(svg), /≥ /);
  assert.equal(svg.querySelector('.gs__axis-title').textContent, 'Hospitals per 0.25-day bin', 'the bin width is stated');
});

test('strip: marker x follows the scale for an in-range hospital', () => {
  const hist = wideHist();
  const svg = gapStrip(h('div'), { hist, value: 0.4 });
  const inner = barRects(svg).filter((r) => !r.getAttribute('class').includes('over'));
  const { rows } = clipHist(hist);
  const first = rows.find((r) => !r.over);
  const perDay = (Number(inner[1].getAttribute('x')) - Number(inner[0].getAttribute('x'))) / 0.25;
  const expected = Number(inner[0].getAttribute('x')) + (0.4 - first.x0) * perDay;
  const mark = Number(svg.querySelector('.gs__you line').getAttribute('x1'));
  assert.ok(Math.abs(mark - expected) < 0.6, `${mark} vs ${expected}`);
  const own = barRects(svg).filter((r) => r.getAttribute('class').includes('gs__bar--own'));
  assert.equal(own.length, 1);
  assert.ok(!own[0].getAttribute('class').includes('over'));
});

test('strip: an outlier hospital sits in its end bar and the label keeps the real gap', () => {
  for (const [value, cls] of [[5.2, 'high'], [-3.6, 'low']]) {
    const svg = gapStrip(h('div'), { hist: wideHist(), value });
    const over = barRects(svg).filter((r) => r.getAttribute('class').includes('gs__bar--own'));
    assert.equal(over.length, 1);
    assert.ok(over[0].getAttribute('class').includes('over'));
    const bars = barRects(svg);
    assert.equal(bars.indexOf(over[0]), cls === 'low' ? 0 : bars.length - 1);
    const mark = Number(svg.querySelector('.gs__you line').getAttribute('x1'));
    const x0 = Number(over[0].getAttribute('x'));
    assert.ok(mark >= x0 && mark <= x0 + Number(over[0].getAttribute('width')) + 4);
    assert.ok(text(svg.querySelector('.gs__you')).includes(value > 0 ? '+5.2 days' : '−3.6 days'));
  }
});

test('table twin names the combined end rows', () => {
  const T = loadData({ ...structuredClone(fixture), gapHist: wideHist() });
  const el = render(T, '220071');
  const t = text(el);
  assert.match(t, /or lower, combined/);
  assert.match(t, /or higher, combined/);
  assert.match(t, /combine the outlying hospitals/);
});

test('Open in calculator: the hospital lens only for a hospital with longer MA stays; otherwise the default lens and a note', () => {
  const href = (id) => render(D, id).querySelector('a.btn').getAttribute('href');
  const ctaNote = (id) => text(render(D, id).querySelector('.profile__cta'));
  const NOTE = /This hospital's cost report shows no longer MA stays\. The calculator opens with MedPAC's national averages instead, which may not fit this hospital\./;
  const zero = D.hospitalsById.get('050123'); // fixture: gap below zero
  assert.ok(zero.gap <= 0);
  const q = new URLSearchParams(href('050123').split('?')[1]);
  assert.equal(q.get('l'), D.model.defaults.lens, 'default lens, not the hospital lens');
  assert.equal(q.get('h'), '050123', 'the hospital still loads its own basics');
  assert.match(ctaNote('050123'), NOTE);
  assert.ok(D.hospitalsById.get('330101').gap > 0);
  assert.equal(new URLSearchParams(href('330101').split('?')[1]).get('l'), 'hospital');
  assert.doesNotMatch(ctaNote('330101'), NOTE);
});

// ---- the displayed line adds up (rounding) ----
const withLos = (over) => {
  const raw = structuredClone(fixture);
  raw.hospitals = raw.hospitals.slice(0, 3).map((h, i) => ({ ...structuredClone(h), id: String(100000 + i), ...over[i] }));
  return loadData(raw);
};
const parseLine = (t) => {
  const m = /MA ([\d.]+) days? · traditional ([\d.]+) days? · gap ([+−]?[\d.]+) days?/.exec(t);
  assert.ok(m, t);
  return { ma: Number(m[1]), ffs: Number(m[2]), gap: Number(m[3].replace('−', '-').replace('+', '')) };
};

test('MA 5.24 / traditional 4.16: the displayed gap is the difference of the displayed values', () => {
  const T = withLos([{ maAlos: 5.24, ffsAlos: 4.16, gap: 1.08 }, { gap: 0.5 }, { gap: 0.6 }]);
  const t = text(render(T, '100000'));
  assert.ok(t.includes('MA 5.2 days · traditional 4.2 days · gap +1 day'), t);
});

test('a gap that displays as zero is unsigned and never "larger than"', () => {
  const T = withLos([{ maAlos: 5.04, ffsAlos: 5.01, gap: 0.03 }, { gap: 0.5 }, { gap: -0.2 }]);
  const t = text(render(T, '100000'));
  assert.ok(t.includes('MA 5.0 days · traditional 5.0 days · gap 0.0 days'), t);
  assert.ok(!/larger than|smaller than/.test(t));
  assert.ok(t.includes('MA stays were not longer here'));
});

test('real data: every hospital\'s displayed MA - traditional equals its displayed gap', () => {
  let n = 0;
  for (const x of REAL.hospitals) {
    if (!Number.isFinite(x.maAlos) || !Number.isFinite(x.ffsAlos)) continue;
    const g = displayedGap(x.maAlos, x.ffsAlos);
    const diff = Math.round((Number(fmt1(x.maAlos)) - Number(fmt1(x.ffsAlos))) * 10) / 10;
    assert.equal(g, diff, x.id);
    const s = fmtSigned(g, fmtDays);
    assert.ok(!/[+−]0\.0/.test(s), `${x.id}: ${s}`);
    n += 1;
  }
  assert.ok(n > 1000, `${n} hospitals checked`);
});
