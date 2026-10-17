// No. 05 "Both sides of the counter", the methods page, the footer and a site-wide copy check, rendered into a linkedom DOM.
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

const { h } = await import('../src/js/dom.js');
const { loadData } = await import('../src/js/data.js');
const { SITE, DISCLAIMER } = await import('../src/js/site.js');
const { SRC_TYPE } = await import('../src/js/ui/source.js');
const { fmtDate } = await import('../src/js/format.js');
const { resetFigures } = await import('../src/js/ui/figure.js');
const { renderSides } = await import('../src/js/views/sides.js');
const { renderMethods } = await import('../src/js/views/methods.js');
const { renderFooter } = await import('../src/js/views/footer.js');
const { renderNotFound } = await import('../src/js/views/notFound.js');
const { renderHome } = await import('../src/js/views/home.js');
const { renderHospital } = await import('../src/js/views/hospital.js');

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ap.min.json', import.meta.url), 'utf8'));
const real = JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8'));
const D = loadData(structuredClone(fixture));
const REAL = loadData(structuredClone(real));
// The same contract with its content replaced (null: no cited content at all).
const withContent = (raw, content) => loadData({ ...structuredClone(raw), content });
const CUE = /\s\(opens in a new tab\)/g;
const CREDIT = /, using Claude Code/g;
const text = (el) => el.textContent.replace(/\s+/g, ' ');
const noNaN = (el) => {
  for (const n of el.querySelectorAll('*')) for (const a of n.attributes) assert.ok(!/NaN|undefined|Infinity/.test(a.value), `${n.tagName} ${a.name}="${a.value}"`);
  assert.doesNotMatch(el.textContent, /NaN|undefined|Infinity|\[object|\bnull\b/);
};
const NOW = new Date('2026-10-15');
const linkTo = (el, url) => [...el.querySelectorAll('a')].find((a) => a.getAttribute('href') === new URL(url).href);

// ---------- Methods ----------

test('methods: every source is an https link with rel="noopener" and its type label', () => {
  const el = renderMethods(REAL);
  assert.equal(el.querySelector('h1').textContent, 'Methods');
  const sources = REAL.content.sources;
  assert.ok(sources.length > 10);
  for (const src of sources) {
    const a = linkTo(el, src.url);
    assert.ok(a, `no link for ${src.label}`);
    assert.equal(a.textContent, `${src.label} (opens in a new tab)`);
    assert.equal(a.getAttribute('target'), '_blank');
    assert.match(a.getAttribute('rel'), /\bnoopener\b/);
    const row = a.closest('tr');
    assert.ok(row, `${src.label} is not in the sources table`);
    assert.ok(text(row).toLowerCase().includes(SRC_TYPE[src.type]), `${src.label}: type label "${SRC_TYPE[src.type]}" missing`);
  }
  for (const a of el.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    assert.ok(href.startsWith('#') || href.startsWith('https://'), `non-https link ${href}`);
  }
});

test('methods: a source with an unsafe URL renders as plain text', () => {
  const c = structuredClone(REAL.content);
  c.sources = [{ label: 'Script link', url: 'javascript:alert(1)', type: 'gov', verified: true },
    { label: 'Plain http link', url: 'http://example.org/x', type: 'think-tank', verified: true }];
  const el = renderMethods(withContent(real, c));
  const t = text(el);
  assert.ok(t.includes('Script link') && t.includes('Plain http link'));
  assert.ok(![...el.querySelectorAll('a')].some((a) => /Script link|Plain http link/.test(a.textContent)));
  assert.ok(t.toLowerCase().includes('think tank'));
});

test('methods: the exclusion thresholds and CCN ranges come from meta.rules, not from the page', () => {
  const raw = structuredClone(real);
  Object.assign(raw.meta.rules, { periodDays: 250, maDischarges: 41, ffsDischarges: 111, alos: [3, 12], acuteSuffix: [1, 899], cahSuffix: [1400, 1499], occPlausible: [0.1, 0.95] });
  const t = text(renderMethods(loadData(raw)));
  assert.match(t, /fewer than 250 days/);
  assert.match(t, /Fewer than 41 MA discharges/);
  assert.match(t, /Fewer than 111 traditional Medicare discharges/);
  assert.match(t, /outside 3 to 12 days/);
  assert.match(t, /CCN ends in 0001 to 0899/);
  assert.match(t, /\(1400 to 1499\)/);
  assert.match(t, /above 95% or below 10% is flagged/);
  assert.match(t, /Occupancy outside 10% to 95%/);
  assert.doesNotMatch(t, /300 days|2 to 15 days|0879|1300 to 1399/);
});

test('methods: without meta.rules no threshold is invented', () => {
  const raw = structuredClone(real);
  delete raw.meta.rules;
  const el = renderMethods(loadData(raw));
  const t = text(el);
  assert.doesNotMatch(t, /fewer than \d+ days|Fewer than \d+ (MA|traditional)|CCN ends in/i);
  assert.equal(el.querySelectorAll('tr[data-reason]').length, Object.keys(real.meta.exclusions).length);
  noNaN(el);
});

test('methods: the "check this hospital\'s data" rule comes from meta, its count from the hospital list', () => {
  const SENT = (n, many) => `${n} ${many ? 'hospitals' : 'hospital'} whose gap is larger than 3 days either way, or whose MA and traditional Medicare stays `
    + `differ more than twofold, ${many ? 'are' : 'is'} kept but marked "check this hospital's data" on ${many ? 'their' : 'its'} page; `
    + `the calculator uses national averages for ${many ? 'them' : 'it'}.`;
  // Real data: whatever this year's count, the sentence states the hospital list's (none flagged: no sentence).
  const n = REAL.hospitals.filter((x) => x.checkData).length;
  const el = renderMethods(REAL);
  if (n > 0) assert.ok(text(el).includes(SENT(n.toLocaleString('en-US'), n > 1)));
  const p = [...el.querySelectorAll('p')].map(text).find((x) => /hospitals? whose gap is larger than/.test(x));
  assert.equal(p ? Number(/^\s*([\d,]+) /.exec(p)[1].replace(/,/g, '')) : 0, n);
  // The fixture has exactly one flagged hospital: singular wording.
  assert.equal(D.hospitals.filter((x) => x.checkData).length, 1);
  assert.ok(text(renderMethods(D)).includes(SENT('1', false)));
  // Thresholds follow meta.rules; no rules, no sentence.
  const raw = structuredClone(real);
  Object.assign(raw.meta.rules, { checkGapDays: 2.5, checkAlosRatio: 3 });
  assert.match(text(renderMethods(loadData(raw))), /hospitals whose gap is larger than 2\.5 days either way, or whose MA and traditional Medicare stays differ more than 3-fold/);
  delete raw.meta.rules;
  assert.doesNotMatch(text(renderMethods(loadData(raw))), /check this hospital's data/);
});

test('methods: each "On this page" link points at its part\'s heading id, so it works without JavaScript', () => {
  const el = renderMethods(D);
  const hrefs = [...el.querySelectorAll('.methods__toc a')].map((a) => a.getAttribute('href'));
  const ids = [...el.querySelectorAll('section.mpart > h2')].map((x) => `#${x.id}`);
  assert.ok(ids.length > 0 && ids.every((x) => x !== '#'));
  assert.deepEqual(hrefs, ids);
});

test('the fixture and the real data publish the same rule keys', () => {
  assert.deepEqual(Object.keys(fixture.meta.rules).sort(), Object.keys(real.meta.rules).sort());
});

test('methods: every exclusion reason is listed with its count from the data', () => {
  const el = renderMethods(REAL);
  const ex = REAL.meta.exclusions;
  const rows = [...el.querySelectorAll('tr[data-reason]')];
  assert.deepEqual(rows.map((r) => r.getAttribute('data-reason')), Object.keys(ex));
  for (const r of rows) {
    const n = ex[r.getAttribute('data-reason')];
    assert.equal(r.querySelector('td.num').textContent, n.toLocaleString('en-US'));
    assert.ok(r.querySelector('th').textContent.length > 10, 'each rule is described');
  }
  const t = text(el);
  const excluded = Object.values(ex).reduce((a, b) => a + b, 0);
  for (const n of [REAL.meta.nAcute, REAL.meta.nClean, excluded]) assert.ok(t.includes(n.toLocaleString('en-US')), `missing ${n}`);
  assert.match(t, /Puerto Rico/);
  assert.match(t, /Maryland/);
  assert.match(t, /critical access/i);
  assert.match(t, /300 days/);
  assert.match(t, /30 MA discharges/);
  assert.match(t, /100 traditional Medicare discharges/);
  assert.match(t, /2 to 15 days/);
  // The counts follow the data, not literals.
  const raw = structuredClone(real);
  raw.meta.exclusions.alos = 4321;
  const t2 = text(renderMethods(loadData(raw)).querySelector('tr[data-reason="alos"]'));
  assert.ok(t2.includes('4,321'));
});

test('methods: formulas for W, E, S, A and the dollars are printed as text', () => {
  const t = text(renderMethods(REAL));
  for (const f of [
    'nMA = discharges × Medicare share × MA share',
    'W = nMA × Σ mix[d] × e[d]',
    'E = W / 365',
    's = max(0, t0 − t1)',
    'S = nMA × Σ mix[d] × min(s, e[d])',
    'A = S × fill / alos',
    '−W × cvar',
    'S × cvar + A × cm',
    'W × (rate − cvar)',
    'A × cm − S × (rate − cvar)',
  ]) assert.ok(t.includes(f), `missing formula "${f}"`);
});

// Overpass Mono draws "÷" (U+00F7) as a bar with one dot, so a division set in it reads as a minus ("E = W − 365").
// Division is written "/", and the formulas turn off ligatures (the face joins "fi" in "fill").
test('methods: formulas divide with "/", never "÷", and set without ligatures', () => {
  const el = renderMethods(REAL);
  const codes = [...el.querySelectorAll('code')].map((c) => c.textContent);
  assert.ok(codes.length > 15, 'formulas and variables are set as code');
  for (const c of codes) assert.ok(!c.includes('\u00f7'), `"÷" in a mono formula: ${c}`);
  assert.doesNotMatch(el.textContent, /\u00f7/);
  for (const f of ['E = W / 365', 'W / discharges', 'occupancy − W / (beds × 365)', 'A = S × fill / alos']) {
    assert.ok(codes.includes(f), `missing formula "${f}"`);
  }
  assert.ok(codes.some((c) => /^fill = min\(1, max\(0, \(occupancy − [\d.]+\) \/ [\d.]+\)\)$/.test(c)), 'refill formula divides with "/"');
  const css = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
  for (const sel of ['.formulas code', '.mpart p code']) {
    const rule = new RegExp(`(^|[,}\\s])${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`, 'm').exec(css);
    assert.ok(rule, `${sel}: rule`);
    // After the font shorthand, which resets the ligature setting.
    assert.match(rule[2], /font:[^;]*var\(--font-mono\);[^}]*font-variant-ligatures: none/, `${sel}: ligatures off`);
  }
});

test('methods: lens table, mix and every assumption with its source type come from the data', () => {
  const el = renderMethods(REAL);
  const t = text(el);
  const lt = el.querySelector('table[data-table="lenses"]');
  assert.ok(lt, 'lens table');
  const rows = [...lt.querySelectorAll('tbody tr')];
  assert.equal(rows.length, REAL.model.dests.length);
  for (const [i, d] of REAL.model.dests.entries()) {
    const cells = [...rows[i].querySelectorAll('td')].map((c) => c.textContent);
    for (const lens of ['unadjusted', 'adjusted', 'placement']) assert.ok(cells.includes(REAL.model.lenses[lens][d].toFixed(1)), `${d} ${lens}`);
  }
  for (const a of REAL.content.assumptions) {
    assert.ok(t.includes(a.label), `assumption ${a.label}`);
    for (const s of a.src) assert.ok(linkTo(el, s.url), `assumption source ${s.label}`);
  }
  // The rehab share is MedPAC's inpatient rehab alone, used as is; long-term care hospitals are separate and left out.
  assert.match(t, /MedPAC reports that 3% of MA hospital discharges go to inpatient rehab \(5% in traditional Medicare\), and the model uses that share\./);
  assert.match(t, /Long-term care hospitals are shown separately, at about 0\.5% of MA stays, and are left out\./);
  assert.match(t, /3 percent for inpatient rehabilitation \(5 percent in traditional Medicare\)/);
  assert.match(t, /trade group/i);
  assert.match(t, /industry/i);
  // "Extra days" is defined once, apart from DRG-expected and case-manager avoidable days.
  assert.match(t, /"Extra days" here means the difference between MA and traditional Medicare stays\./);
  assert.match(t, /avoidable days logged by case managers/);
  // What the calculator does not measure.
  assert.match(t, /truly avoidable/);
  assert.match(t, /skilled nursing facilities/);
  assert.match(t, /per diem/);
});

test('methods: definitions, cross-check, national estimate and correlation come from the data', () => {
  const t = text(renderMethods(REAL));
  assert.match(t, /Worksheet S-3, Part I/);
  assert.match(t, /line 2/);
  assert.match(t, /lines 8 to 12/);
  const cc = REAL.meta.crossCheck;
  assert.ok(t.includes(`${cc.hcris.ma.toFixed(2)} days`) && t.includes(cc.hcris.ffs.toFixed(2)));
  assert.ok(t.includes(cc.medpac.ma.toFixed(1)) && t.includes(cc.medpac.ffs.toFixed(1)));
  const ctx = REAL.national.context;
  assert.ok(t.includes(ctx.maStays2023.toLocaleString('en-US')));
  assert.ok(t.includes(ctx.placement.beds.toLocaleString('en-US')) && t.includes(ctx.adjusted.beds.toLocaleString('en-US')));
  // Pearson correlation of MA share and gap across the hospitals, computed here independently of the view.
  const xy = REAL.hospitals.filter((x) => Number.isFinite(x.ma) && Number.isFinite(x.gap));
  const mean = (k) => xy.reduce((a, x) => a + x[k], 0) / xy.length;
  const [mx, my] = [mean('ma'), mean('gap')];
  const sum = (f) => xy.reduce((a, x) => a + f(x), 0);
  const r = sum((x) => (x.ma - mx) * (x.gap - my)) / Math.sqrt(sum((x) => (x.ma - mx) ** 2) * sum((x) => (x.gap - my) ** 2));
  const shown = `${r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}`;
  assert.ok(t.includes(`correlation of ${shown})`), `correlation ${shown}`);
  assert.ok(t.includes(`report periods ending ${fmtDate(REAL.meta.builtOn)}`), 'latest cost-report period from meta.builtOn');
  assert.match(t, /\bFFS\b/); // the methods page may name the claims term once
});

test('methods: the correlation sentence counts the hospitals it actually used (those with both figures)', () => {
  const raw = structuredClone(real);
  raw.hospitals[0].ma = null;
  raw.hospitals[1].gap = null;
  const used = raw.hospitals.filter((x) => Number.isFinite(x.ma) && Number.isFinite(x.gap)).length;
  assert.equal(used, raw.hospitals.length - 2);
  const t = text(renderMethods(loadData(raw)));
  assert.ok(t.includes(`Across the ${used.toLocaleString('en-US')} hospitals with both figures, the gap does not rise`), `N is ${used}`);
  assert.ok(!t.includes(`Across the ${raw.hospitals.length.toLocaleString('en-US')} hospitals`));
});

test('methods: about has the byline, LinkedIn and the repo, and only the Claude Code credit', () => {
  const el = renderMethods(REAL);
  const about = el.querySelector('#methods-about')?.closest('section');
  assert.ok(about, 'about section');
  assert.ok(text(about).includes(SITE.byline));
  assert.ok(linkTo(about, SITE.linkedin));
  assert.ok(linkTo(about, SITE.repo));
  assert.ok(text(about).includes('The page loads everything it needs, fonts included, from this site. It has no analytics, no cookies, and sends nothing anywhere.'));
  assert.ok(text(about).replace(CUE, '').includes(`Built by ${SITE.byline}, using Claude Code.`));
  assert.doesNotMatch(text(el).replace(CREDIT, ''), /Claude|Anthropic|built with|AI[- ]generated|ChatGPT/i);
  // Byline, LinkedIn and repo only: no job title, named employer or location. "the author's employer" (unnamed) is allowed.
  assert.doesNotMatch(text(about).replace("author's employer", ''), /advisor|employ|based in|works at|hospital in/i);
});

test('methods: names and cities say they come from a pinned, committed copy of Hospital General Information', () => {
  const t = text(renderMethods(REAL));
  assert.ok(t.includes('Names and cities'));
  assert.ok(t.includes('read from a pinned copy committed with the code (pipeline/derived/hgi_names.csv)'), 'pinned names table');
});

test('methods: sparse or missing content renders cleanly', () => {
  noNaN(renderMethods(D));
  noNaN(renderMethods(withContent(fixture, null)));
});

// ---------- No. 05 ----------

const COLS = [['hospitals', 'What hospitals point to'], ['plans', 'What plans point to'], ['unsettled', 'What the evidence can\'t settle yet']];

test('sides: No. 05 with three columns, each item with its source and type', () => {
  const el = renderSides(REAL, NOW);
  assert.equal(el.querySelector('h2').id, 'sides');
  assert.equal(el.querySelector('h2').textContent, 'Both sides of the counter');
  assert.match(text(el), /No\. 05/);
  const cols = [...el.querySelectorAll('.sides__col')];
  assert.deepEqual(cols.map((c) => c.querySelector('h3').textContent), COLS.map((c) => c[1]));
  COLS.forEach(([key], i) => {
    const items = [...cols[i].querySelectorAll('li')];
    assert.equal(items.length, REAL.content.sides[key].length, key);
    items.forEach((li, j) => {
      const it = REAL.content.sides[key][j];
      assert.ok(text(li).includes(it.text), it.text);
      for (const s of it.src) assert.ok(linkTo(li, s.url), `${key}[${j}] source`);
      assert.ok(text(li).toLowerCase().includes(SRC_TYPE[it.src[0].type]), `${key}[${j}] type label`);
    });
  });
  assert.doesNotMatch(text(el), /\bFFS\b/);
  // The intro says how the columns are grouped and frames the plans' view in their own words.
  const intro = text(el.querySelector('.sec__body > p'));
  assert.match(intro, /Each column groups findings by the side that usually cites them/);
  assert.match(intro, /type of organization behind it/);
  assert.match(intro, /told MedPAC that it helps ensure beneficiaries get to the right level of care/);
  assert.doesNotMatch(intro, /steers/);
  noNaN(el);
});

test('sides: the policy timeline is an ordered board, dated in order, with a source per row', () => {
  const el = renderSides(REAL, NOW);
  const board = el.querySelector('ol.board');
  assert.ok(board);
  const rows = [...board.querySelectorAll(':scope > li')];
  assert.equal(rows.length, REAL.content.timeline.length);
  rows.forEach((li, i) => {
    const it = REAL.content.timeline[i];
    assert.equal(li.querySelector('time').getAttribute('datetime'), it.date);
    assert.ok(text(li).includes(it.title) && text(li).includes(it.body));
    assert.ok(linkTo(li, it.src[0].url));
  });
  const dates = rows.map((li) => li.querySelector('time').textContent);
  assert.equal(dates[0], 'Jan 1, 2024');
  assert.ok(dates.includes('Jun 2026'));
  // Rows after the reader's date are marked upcoming; earlier ones are not.
  const upcoming = rows.filter((li) => /Upcoming/.test(text(li))).map((li) => li.querySelector('time').getAttribute('datetime'));
  assert.deepEqual(upcoming, REAL.content.timeline.filter((x) => x.date > '2026-10-15').map((x) => x.date));
  assert.equal(rows.filter((li) => /Upcoming/.test(text(li))).length, 1);
});

test('sides: empty or missing content renders without empty columns or NaN', () => {
  // No sides items, one timeline row whose source is a single object (not a list).
  const sparse = { ...structuredClone(fixture.content), sides: { hospitals: [], plans: [], unsettled: [] },
    timeline: [{ date: '2026-01-01', title: 'A rule', body: 'Text.', src: { label: 'CMS', url: 'https://www.cms.gov/', type: 'gov', verified: true } }] };
  const el = renderSides(withContent(fixture, sparse), NOW);
  assert.equal(el.querySelectorAll('.sides__col').length, 0);
  assert.equal(el.querySelectorAll('ol.board > li').length, 1);
  noNaN(el);
  const none = renderSides(withContent(fixture, null), NOW);
  assert.equal(none.querySelector('h2').id, 'sides');
  noNaN(none);
});

test('renderHome mounts No. 05 as the real section', () => {
  const main = h('main');
  resetFigures();
  renderHome(main, REAL);
  const sec = main.querySelector('#sides').closest('section');
  assert.equal(sec.querySelectorAll('.sides__col').length, 3);
  assert.equal(main.querySelector('.placeholder'), null);
});

// ---------- Footer and not found ----------

test('footer: byline, data line, not affiliated, MIT, public domain, repo link; credit is exactly Claude Code', () => {
  const el = renderFooter(REAL);
  const t = text(el);
  assert.ok(t.includes(SITE.byline));
  assert.ok(t.includes(DISCLAIMER));
  assert.ok(t.includes('Code MIT-licensed. Federal source data is public domain.'));
  assert.match(t, /FY2024/);
  assert.ok(linkTo(el, SITE.repo));
  assert.ok(linkTo(el, SITE.linkedin));
  assert.ok(el.querySelector('a[href="#methods"]'));
  assert.ok(t.replace(CUE, '').includes(`Built by ${SITE.byline}, using Claude Code.`));
  assert.doesNotMatch(t.replace(CREDIT, ''), /Claude|Anthropic|built with/i);
  noNaN(renderFooter(withContent(fixture, null)));
});

test('not found: a plain message, a search box and ways back', () => {
  const el = renderNotFound(REAL);
  assert.equal(el.querySelector('h1').textContent, 'Page not found');
  assert.ok(el.querySelector('input[role="combobox"]'));
  assert.ok(el.querySelector('a[href="#"]') && el.querySelector('a[href="#methods"]'));
});

// ---------- Site-wide copy check ----------

// Stock words and phrases, plus the two contrast templates: "it's not X, it's Y" and "not X but Y" (with "just/only/merely").
const BANNED = new RegExp([
  String.raw`\b(delve|unlock|seamless|robust|leverag|navigat|landscape|crucial|pivotal|foster|empower|game-?chang|cutting-edge)\w*`,
  String.raw`whether you['’]re|\bin short\b|bottom line|dive deep|in today['’]s`,
  String.raw`\b(it|this|that)(['’]s| is) not\b[^.;:]{0,60}[,;—]\s*(it|this|that)(['’]s| is)\b`,
  String.raw`\b(it|this|that) isn['’]t\b[^.;:]{0,60}[,;—]\s*(it|this|that)(['’]s| is)\b`,
  String.raw`\bnot\s+(just|only|merely)\b[^.;:]{0,60}\bbut\b`,
  String.raw`\bnot\s+[\w'’-]+(\s+[\w'’-]+){0,3},?\s+but\s+(rather\s+)?[\w'’-]+`,
].join('|'), 'i');

test('copy: the banned-phrase check catches the contrast templates and passes plain negation', () => {
  for (const s of ["It's not a bed problem, it's a staffing problem.", 'This isn\'t about cost; it\'s about access.',
    'It is not a cost, it is an investment.', 'The issue is not cost but access.', 'It is not cost but rather access.',
    'Faster decisions are not just quicker, but safer.', 'Plans want not only speed but accuracy.', 'In short, beds matter.'])
    assert.match(s, BANNED, s);
  for (const s of ['That counts people, not hospital discharges.',
    'MedPAC\'s adjustment accounts for hospital, diagnosis group and destination, but not for every difference between patients.',
    'It is not adjusted for diagnosis or severity, and cost reports do not say where patients went after discharge.',
    'It is a model built on averages, not a measurement of any hospital.',
    'No speed-up: the faster time is not shorter than today\'s, so nothing is freed.',
    'Traditional Medicare generally does not require it for these stays.',
    'MA stays were not longer here. Traditional Medicare stays averaged the same or longer.'])
    assert.doesNotMatch(s, BANNED, s);
});

function views() {
  resetFigures();
  const home = h('main');
  renderHome(home, REAL);
  const sections = [home.querySelector('.hero'), ...home.querySelectorAll('.sec')];
  const id = REAL.hospitals[0].id;
  return {
    sections,
    hospital: renderHospital(REAL, id),
    hospitalMissing: renderHospital(REAL, '000000'),
    notFound: renderNotFound(REAL),
    methods: renderMethods(REAL),
    footer: renderFooter(REAL),
  };
}
const textNodes = (el) => {
  const out = [];
  const walk = (n) => { for (const c of n.childNodes) (c.nodeType === 3 ? out.push(c.textContent) : walk(c)); };
  walk(el);
  return out;
};

test('copy: no banned phrases, exclamation marks, question headings or em dashes in prose', () => {
  const v = views();
  const all = [...v.sections, v.hospital, v.hospitalMissing, v.notFound, v.methods, v.footer];
  for (const el of all) {
    const t = text(el);
    const where = el.querySelector('h1, h2')?.textContent ?? el.className;
    assert.doesNotMatch(t, BANNED, where);
    assert.ok(!t.includes('!'), `exclamation mark in ${where}`);
    for (const hd of el.querySelectorAll('h1, h2, h3, .fig__title, .callout__title')) assert.ok(!hd.textContent.trim().endsWith('?'), `question heading "${hd.textContent}"`);
    // An em dash may stand alone as a missing value; it never joins words.
    for (const s of textNodes(el)) if (s.trim() !== '—') assert.ok(!s.includes('—'), `em dash in "${s.slice(0, 80)}" (${where})`);
  }
});

test('copy: reader-facing views say "traditional Medicare", never "FFS"', () => {
  const v = views();
  for (const el of [...v.sections, v.hospital, v.notFound, v.footer]) {
    assert.doesNotMatch(text(el), /\bFFS\b|fee-for-service/i, el.querySelector('h1, h2')?.textContent);
  }
});

test('copy: each story section spells out "Medicare Advantage (MA)" before its first bare "MA"', () => {
  const v = views();
  for (const el of [...v.sections.slice(1), v.hospital, v.methods]) {
    const t = text(el);
    const first = t.search(/(?<![(\w])MA\b(?!\))/);
    if (first < 0) continue;
    const intro = t.indexOf('Medicare Advantage (MA)');
    assert.ok(intro >= 0 && intro < first, `${el.querySelector('h1, h2')?.textContent}: "MA" at ${first} before "Medicare Advantage (MA)" (${intro}): …${t.slice(Math.max(0, first - 60), first + 20)}…`);
  }
});
