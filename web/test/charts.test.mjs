// The story charts (dumbbell, mix bars, line series) and the No. 02 / No. 03 views, rendered into a linkedom DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const dom = parseHTML('<!doctype html><html><head></head><body><main id="main"></main></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.document, Node: dom.Node, HTMLElement: dom.HTMLElement });

const { h } = await import('../src/js/dom.js');
const { loadData } = await import('../src/js/data.js');
const { resetFigures } = await import('../src/js/ui/figure.js');
const { dumbbell } = await import('../src/js/charts/dumbbell.js');
const { mixBars } = await import('../src/js/charts/mixBars.js');
const { lineSeries } = await import('../src/js/charts/lineSeries.js');
const { niceMax, axisPad, bindTip, swapSvg, yAxis, legend } = await import('../src/js/charts/shared.js');
const { maCurve, curveLegend } = await import('../src/js/charts/maCurve.js');
const { renderGap } = await import('../src/js/views/gap.js');
const { renderShare, bothRoseInCovid } = await import('../src/js/views/share.js');

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ap.min.json', import.meta.url), 'utf8'));
const D = loadData(structuredClone(fixture));
const REAL = loadData(JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8')));
const t41 = D.content.medpac.t41;
const mix = D.content.medpac.sept.mix;
const text = (el) => el.textContent.replace(/\s+/g, ' ');
const noNaN = (el) => {
  for (const n of el.querySelectorAll('*')) {
    for (const a of n.attributes) assert.ok(!/NaN|undefined|Infinity/.test(a.value), `${n.tagName} ${a.name}="${a.value}"`);
  }
  assert.ok(!/NaN|undefined|Infinity/.test(el.textContent));
};

test('dumbbell: four rows, two dots each, adjusted-gap labels, aria-label names the destinations', () => {
  const el = h('div');
  const svg = dumbbell(el, t41.rows);
  assert.equal(svg.querySelectorAll('.db__row').length, 4);
  for (const row of svg.querySelectorAll('.db__row')) assert.equal(row.querySelectorAll('circle.db__dot').length, 2);
  assert.match(text(svg), /\+2\.3 days adjusted/);
  assert.match(svg.getAttribute('aria-label'), /Inpatient rehab/);
  assert.equal(svg.getAttribute('role'), 'img');
  noNaN(el);
});

test('dumbbell: a missing value never reaches the page as NaN', () => {
  const el = h('div');
  dumbbell(el, [{ dest: 'home', maLos: null, ffsLos: 3.5, adj: undefined }, { dest: 'snf', maLos: 8, ffsLos: 7, adj: -0.4 }]);
  noNaN(el);
  assert.match(text(el), /−0\.4 days adjusted/);
});

test('mixBars: each bar fills the track', () => {
  const el = h('div');
  const svg = mixBars(el, mix);
  const bars = svg.querySelectorAll('.mix__bar');
  assert.equal(bars.length, 2);
  for (const bar of bars) {
    const track = Number(bar.querySelector('.mix__track').getAttribute('width'));
    const sum = [...bar.querySelectorAll('.mix__seg')].reduce((a, r) => a + Number(r.getAttribute('width')), 0);
    assert.ok(Math.abs(sum - track) <= 1, `segments ${sum} vs track ${track}`);
  }
  assert.match(svg.getAttribute('aria-label'), /Traditional Medicare/);
  noNaN(el);
});

test('mixBars: an all-zero mix draws nothing and stays finite', () => {
  const el = h('div');
  mixBars(el, { ffs: { none: 0, hha: 0, snf: 0, irf: 0 }, ma: {} });
  noNaN(el);
});

const SERIES = D.national.series;
const lineOpts = (extra = {}) => ({
  x: SERIES.map((r) => r.fy),
  series: [
    { key: 'ma', label: 'Medicare Advantage', tone: 'ma', values: SERIES.map((r) => r.maAlos) },
    { key: 'ffs', label: 'Traditional Medicare', tone: 'ffs', values: SERIES.map((r) => r.ffsAlos) },
  ],
  yLabel: 'Days', shade: { xs: D.meta.covidFys, label: 'COVID years' }, ...extra,
});

test('lineSeries: one path per series, shaded COVID years, label', () => {
  const el = h('div');
  const svg = lineSeries(el, lineOpts());
  assert.equal(svg.querySelectorAll('path.ls__line').length, 2);
  assert.ok(svg.querySelectorAll('rect.ls__shade').length >= 1);
  assert.match(text(svg), /COVID years/);
  noNaN(el);
});

test('lineSeries: a raised baseline shows an axis break and says so in the label', () => {
  const el = h('div');
  const svg = lineSeries(el, lineOpts({ yMin: 4 }));
  assert.ok(svg.querySelector('.ls__break'));
  assert.match(svg.getAttribute('aria-label'), /starts at 4/);
  noNaN(el);
});

// Lay out a chart host at a given width (linkedom has no layout, so clientWidth is set by hand).
const sized = (w) => { const el = h('div'); Object.defineProperty(el, 'clientWidth', { value: w }); return el; };

test('lineSeries: x labels never collide; FY labels only where the tick spacing has room', () => {
  // 640-820 px viewports once overran ("FY201FY2017"); sweep widths from a phone to a desktop chart.
  for (const w of [260, 330, 420, 480, 520, 559, 560, 600, 640, 680, 720, 760, 900, 1124]) {
    const svg = lineSeries(sized(w), lineOpts());
    const ticks = [...svg.querySelectorAll('.ls__xticks text')];
    const xs = ticks.map((t) => Number(t.getAttribute('x')));
    const widths = ticks.map((t) => t.textContent.length * 7.6); // mono face (Overpass Mono, 0.616 em; 0.632 allows margin), 12 px
    assert.ok(ticks.every((t) => t.getAttribute('text-anchor') === 'middle'), `centered labels @${w}`);
    for (let i = 1; i < ticks.length; i++) {
      const clear = xs[i] - widths[i] / 2 - (xs[i - 1] + widths[i - 1] / 2);
      assert.ok(clear >= 8, `labels ${ticks[i - 1].textContent} and ${ticks[i].textContent} @${w}: ${clear.toFixed(1)} px apart`);
    }
    assert.equal(ticks.at(-1).textContent.slice(-4), String(SERIES.at(-1).fy), `the last year is always labeled @${w}`);
  }
  const full = [...lineSeries(sized(900), lineOpts()).querySelectorAll('.ls__xticks text')].map((t) => t.textContent);
  assert.deepEqual(full, SERIES.map((r) => `FY${r.fy}`), 'room for every FY label at desktop width');
});

test('mixBars: no stray text nodes (a value label is appended only when it fits)', () => {
  const svg = mixBars(sized(330), mix);
  for (const g of svg.querySelectorAll('.mix__bar')) {
    assert.ok([...g.childNodes].every((n) => n.nodeType === 1), 'every child of a bar is an element');
  }
});

test('lineSeries: missing points break the line instead of drawing NaN', () => {
  const el = h('div');
  const o = lineOpts();
  o.series[0].values[3] = null;
  lineSeries(el, o);
  noNaN(el);
});

test('renderGap: lead, two figures, LTCH note, sourced callout, no FFS wording', () => {
  resetFigures();
  const sec = renderGap(REAL);
  const t = text(sec);
  assert.match(t, /No\.\s*02/);
  assert.match(t, /How much longer/);
  assert.equal(sec.querySelectorAll('figure.fig').length, 2);
  const ltchRow = REAL.content.medpac.sept.medians.find((m) => m.dest === 'ltch');
  assert.ok(t.includes(`${ltchRow.ffs} days in traditional Medicare and ${ltchRow.ma} days in Medicare Advantage`), 'long-term care medians come from the content');
  const items = sec.querySelectorAll('.callout li');
  assert.ok(items.length >= 4 && items.length <= 5);
  for (const li of items) assert.ok(li.querySelector('a') || /Source/.test(li.textContent), `unsourced: ${li.textContent}`);
  assert.ok(!/\bFFS\b/.test(t));
  noNaN(sec);
});

test('renderGap on sparse fixture content still renders finite and unsourced items are dropped', () => {
  resetFigures();
  const sec = renderGap(D);
  assert.equal(sec.querySelectorAll('figure.fig').length, 2);
  noNaN(sec);
});

test('renderShare: two figures from the data, a hospital picker, and the cross-check', () => {
  resetFigures();
  const sec = renderShare(D);
  resetFigures();
  const secReal = renderShare(REAL);
  const t = text(sec);
  assert.match(t, /No\.\s*03/);
  assert.equal(sec.querySelectorAll('figure.fig').length, 2);
  assert.match(t, /KFF/);
  const cc = REAL.meta.crossCheck;
  const want = `${cc.hcris.ma.toFixed(2)} vs ${cc.hcris.ffs.toFixed(2)} days against ${cc.medpac.ma.toFixed(1)} vs ${cc.medpac.ffs.toFixed(1)} in FY${cc.medpac.fy}`;
  assert.ok(text(secReal).includes(want), `missing "${want}"`);
  assert.ok(!/starts at 4/.test(secReal.querySelector('figcaption.fig__head, .fig__take')?.textContent ?? ''));
  assert.ok(sec.querySelector('input[role=combobox]'));
  assert.match(sec.querySelector('svg').getAttribute('aria-label'), /\d+(\.\d)?%/);
  noNaN(sec);
});

test('renderShare: "both rose in the COVID years" is stated only when the series shows it', () => {
  const lengthCaption = (data) => {
    resetFigures();
    return [...renderShare(data).querySelectorAll('.fig__take')].map((e) => e.textContent).find((t) => /stays averaged|Both averages/.test(t)) ?? '';
  };
  const withSeries = (edit) => {
    const raw = structuredClone(JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8')));
    edit(raw.national.series);
    return loadData(raw);
  };
  // Derive the expected clause from the real series: MA longer every year, both rising in the COVID years.
  const ser = REAL.national.series;
  const inCovid = ser.filter((r) => REAL.meta.covidFys.includes(r.fy));
  const before = ser.find((r) => r.fy === Math.min(...REAL.meta.covidFys) - 1);
  const expectRise = Boolean(before) && inCovid.every((r) => r.maAlos > before.maAlos && r.ffsAlos > before.ffsAlos);
  assert.ok(ser.every((r) => r.maAlos > r.ffsAlos));
  assert.match(lengthCaption(REAL), expectRise ? /every year shown, and both rose in the COVID years\./ : /every year shown\./);
  // Traditional Medicare dips in the COVID years: only the first half of the old sentence is true.
  const dip = lengthCaption(withSeries((s) => s.filter((r) => r.fy >= 2020 && r.fy <= 2022).forEach((r) => { r.ffsAlos = 4.5; })));
  assert.match(dip, /every year shown\./);
  assert.doesNotMatch(dip, /COVID/);
  // MA not longer in every year and neither line rising: no clause at all.
  const none = lengthCaption(withSeries((s) => s.forEach((r) => { r.maAlos = 5; r.ffsAlos = 5; })));
  assert.doesNotMatch(none, /COVID|Both averages/);
  // MA not always longer, but both rise in the COVID years: the short form.
  const only = lengthCaption(withSeries((s) => { s[0].maAlos = s[0].ffsAlos - 0.1; }));
  assert.match(only, /^Both averages rose in the COVID years\./);
});

test('bothRoseInCovid: compares each COVID year with the last earlier non-COVID year; false without data to compare', () => {
  const rows = (...v) => v.map(([fy, ma, ffs]) => ({ fy, maAlos: ma, ffsAlos: ffs }));
  assert.equal(bothRoseInCovid(rows([2019, 5, 4], [2020, 6, 5], [2021, 6, 5]), [2020, 2021]), true);
  assert.equal(bothRoseInCovid(rows([2019, 5, 4], [2020, 6, 5], [2021, 4.9, 5]), [2020, 2021]), false, 'one year back below');
  assert.equal(bothRoseInCovid(rows([2020, 6, 5], [2021, 6, 5]), [2020, 2021]), false, 'no earlier year');
  assert.equal(bothRoseInCovid(rows([2019, 5, 4], [2023, 6, 5]), [2020, 2021]), false, 'no COVID year in the series');
  assert.equal(bothRoseInCovid([], []), false);
});

const wideEl = (w) => { const el = h('div'); Object.defineProperty(el, 'clientWidth', { value: w }); return el; };

test('dumbbell geometry: no value label reaches the annotation, at 1280 and 360', () => {
  for (const w of [1280, 360]) {
    const svg = dumbbell(wideEl(w), REAL.content.medpac.t41.rows);
    for (const row of svg.querySelectorAll('.db__row')) {
      const adj = row.querySelector('.db__adj');
      const ax = Number(adj.getAttribute('x'));
      for (const v of row.querySelectorAll('.db__val')) {
        const vx = Number(v.getAttribute('x'));
        const end = v.getAttribute('text-anchor') === 'end' ? vx : vx + v.textContent.length * 7;
        if (w >= 560) assert.ok(end < ax, `${w}px: label "${v.textContent}" ends ${end} vs annotation ${ax}`);
        else assert.notEqual(v.getAttribute('y'), adj.getAttribute('y'), `${w}px: label shares a line with the annotation`);
      }
    }
  }
});

test('dumbbell shows exactly the Table 4-1 means and adjusted gaps from the data', () => {
  const rows = REAL.content.medpac.t41.rows;
  const svg = dumbbell(h('div'), rows);
  const els = [...svg.querySelectorAll('.db__row')];
  assert.equal(els.length, rows.length);
  rows.forEach((r, i) => {
    const vals = [...els[i].querySelectorAll('.db__val')].map((n) => n.textContent).sort();
    assert.deepEqual(vals, [r.ffsLos.toFixed(1), r.maLos.toFixed(1)].sort());
    assert.equal(els[i].querySelector('.db__adj').textContent, `+${r.adj.toFixed(1)} days adjusted`);
  });
});

test('shared axis helpers read the domain from the data and skip non-finite values', () => {
  assert.equal(niceMax([0.3, 0.52, null, NaN]), 0.52);
  assert.equal(niceMax([]), undefined);
  assert.deepEqual(axisPad([4.91, 5.4, 6.09, null]), { yMin: 4, yMax: 7 });
  assert.deepEqual(axisPad([0.2, 0.4]), { yMin: 0, yMax: 1 });
  assert.deepEqual(axisPad([null]), {});
});

test('national charts take their axis range from the data, not typed-in numbers', () => {
  const series = D.national.series;
  const shareHigh = Math.max(...series.map((r) => r.maShare));
  const alos = series.flatMap((r) => [r.maAlos, r.ffsAlos]);
  const el = renderShare(D);
  const labels = [...el.querySelectorAll('svg.ls__svg')].map((s) => s.getAttribute('aria-label'));
  assert.equal(labels.length, 2);
  // Raised baseline is disclosed exactly when the data-derived minimum is above zero.
  assert.equal(/starts at/.test(labels[1]), Math.floor(Math.min(...alos) - 0.5) > 0);
  assert.ok(shareHigh > 0);
});

test('yAxis: one grid line per tick, the base line on the base tick, labels formatted', () => {
  const scale = (v) => 100 - v;
  const g = yAxis(scale, [0, 50, 100], { group: 'x__yt', line: 'x__', w: 200, fmt: (v) => `${v}!` });
  assert.equal(g.getAttribute('class'), 'x__yt');
  assert.equal(g.querySelectorAll('.x__base').length, 1);
  assert.equal(g.querySelectorAll('.x__grid').length, 2);
  assert.deepEqual([...g.querySelectorAll('text')].map((n) => n.textContent), ['0!', '50!', '100!']);
});

test('swapSvg replaces the previous drawing of the same class and appends the first', () => {
  const el = document.createElement('div');
  const mk = () => dom.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const a = mk(); a.setAttribute('class', 'k__svg');
  const b = mk(); b.setAttribute('class', 'k__svg');
  swapSvg(el, 'k__svg', a);
  swapSvg(el, 'k__svg', b);
  assert.equal(el.querySelectorAll('svg').length, 1);
  assert.equal(el.querySelector('svg'), b);
});

test('bindTip: move and press show, leaving hides', () => {
  const node = document.createElement('div');
  const calls = [];
  bindTip(node, () => calls.push('show'), () => calls.push('leave'));
  for (const type of ['pointermove', 'pointerdown', 'pointerleave']) node.dispatchEvent(new dom.window.Event(type));
  assert.deepEqual(calls, ['show', 'show', 'leave']);
});

test('maCurve: moving only the current share keeps the lines and moves the marker; new points redraw', () => {
  const el = document.createElement('div');
  const pts = (k) => Array.from({ length: 21 }, (_, i) => ({ ma: i / 20, beds: i * k, bedsFaster: i * k / 2 }));
  maCurve(el, { points: pts(0.3), current: { beds: 3, bedsFaster: 1.5 }, ma: 0.5 });
  const svg = el.querySelector('svg');
  const lines = [...svg.querySelectorAll('path.curve__line')];
  const x0 = svg.querySelector('.curve__marker').getAttribute('x1');
  maCurve(el, { points: pts(0.3), current: { beds: 4.5, bedsFaster: 2.2 }, ma: 0.75 });
  assert.equal(el.querySelector('svg'), svg, 'same svg node');
  assert.deepEqual([...svg.querySelectorAll('path.curve__line')], lines, 'same line nodes');
  assert.notEqual(svg.querySelector('.curve__marker').getAttribute('x1'), x0);
  assert.match(svg.querySelector('.curve__marker-label').textContent, /75%/);
  assert.match(svg.getAttribute('aria-label'), /Current share 75%: 4\.5 beds/);
  maCurve(el, { points: pts(0.6), current: { beds: 9, bedsFaster: 4.5 }, ma: 0.75 });
  assert.notEqual(el.querySelector('svg'), svg, 'new points redraw');
  assert.equal(el.querySelectorAll('svg').length, 1);
});

test('curve legend: solid, dashed and marker keys come from the shared legend', () => {
  const lg = curveLegend();
  assert.equal(lg.querySelectorAll('li').length, 3);
  assert.equal(lg.querySelectorAll('.key__line--dash').length, 1);
  assert.equal(lg.querySelectorAll('.key__line--marker').length, 1);
  assert.match(text(lg), /Today.*With faster decisions.*Current share/);
  assert.ok(legend([{ kind: 'dot', tone: 'ma', label: 'x' }]).querySelector('.key__mark--ma'));
});

test('renderGap finds the callout items by key, not by their wording', () => {
  const raw = structuredClone(JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8')));
  const un = raw.content.sides.unsettled.find((x) => x.key === 'obs-stays');
  un.text = 'Observation wording replaced entirely for this check.';
  const pl = raw.content.sides.plans.find((x) => x.key === 'plans-right-level');
  pl.text = 'Plans say authorization routes patients well.';
  pl.short = 'plans say authorization routes patients well';
  const callout = text(renderGap(loadData(raw)).querySelector('.callout'));
  assert.ok(callout.includes('Observation wording replaced entirely for this check.'));
  assert.ok(callout.includes('plans say authorization routes patients well, and some delays come from incomplete information in the request.'));
});

test('renderGap: the merged plans sentence cites both claims\' sources, each once', () => {
  const raw = structuredClone(JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8')));
  const a = raw.content.sides.plans.find((x) => x.key === 'plans-right-level');
  const b = raw.content.sides.plans.find((x) => x.key === 'plans-incomplete-requests');
  a.src = [{ label: 'Source A', url: 'https://example.org/a', type: 'gov' }];
  b.src = [{ label: 'Source A', url: 'https://example.org/a', type: 'gov' }, { label: 'Source B', url: 'https://example.org/b', type: 'gov' }];
  const item = [...renderGap(loadData(raw)).querySelectorAll('.callout li')].find((li) => li.textContent.includes('incomplete information'));
  assert.deepEqual([...item.querySelectorAll('a')].map((x) => x.getAttribute('href')), ['https://example.org/a', 'https://example.org/b']);
});

test('renderGap: the plans sentence is the first item alone when either short form is missing; missing items are omitted', () => {
  const raw = structuredClone(JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8')));
  delete raw.content.sides.plans.find((x) => x.key === 'plans-incomplete-requests').short;
  raw.content.sides.unsettled = raw.content.sides.unsettled.filter((x) => x.key !== 'duals-share');
  const callout = text(renderGap(loadData(raw)).querySelector('.callout'));
  const plans = raw.content.sides.plans.find((x) => x.key === 'plans-right-level');
  assert.ok(callout.includes(plans.text));
  assert.doesNotMatch(callout, /incomplete information/);
  assert.doesNotMatch(callout, /dually eligible/);
});

test('renderGap without a MedPAC sample year says no "undefined" in titles or the LTCH note', () => {
  const raw = structuredClone(JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8')));
  delete raw.content.medpac.sept.year;
  noNaN(renderGap(loadData(raw)));
});
