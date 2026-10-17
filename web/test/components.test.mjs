// Design-system components, hero and pathway, rendered into a linkedom DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const dom = parseHTML('<!doctype html><html><head></head><body><main id="main"></main></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.document, Node: dom.Node, HTMLElement: dom.HTMLElement });

const { h } = await import('../src/js/dom.js');
const { PUBLISHED } = await import('../src/js/site.js');
const { loadData } = await import('../src/js/data.js');
const { ticket, numberTicket } = await import('../src/js/ui/ticket.js');
const { nowServing, update, defaultAria } = await import('../src/js/ui/nowServing.js');
const { trackTopbar } = await import('../src/js/ui/topbar.js');
const { sign, DEST_LABEL } = await import('../src/js/ui/sign.js');
const { PICTO } = await import('../src/js/ui/pictograms.js');
const { figure, resetFigures } = await import('../src/js/ui/figure.js');
const { callout } = await import('../src/js/ui/callout.js');
const { tooltip } = await import('../src/js/ui/tooltip.js');
const { tableAlt } = await import('../src/js/ui/tableAlt.js');
const sourceModule = await import('../src/js/ui/source.js');
const { safeHref, assumptionList } = sourceModule;
const { renderHero } = await import('../src/js/views/hero.js');
const { renderPathway } = await import('../src/js/views/pathway.js');
const { renderHome } = await import('../src/js/views/home.js');

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ap.min.json', import.meta.url), 'utf8'));
const withContent = (content) => loadData({ ...structuredClone(fixture), content });
const D = withContent(fixture.content);
// One timeline item, the CMS-0057-F deadline, so the pathway's deadline line and its Since/From switch are checked alone.
const DEADLINE = { date: '2026-01-01', title: 'CMS-0057-F decision deadlines take effect',
  body: 'MA plans must decide standard requests within 7 days and urgent ones within 72 hours.',
  src: [{ label: 'CMS-0057-F, Federal Register, February 8, 2024', type: 'gov', verified: true,
    url: 'https://www.federalregister.gov/documents/2024/02/08/2024-00895/medicare-and-medicaid-programs-patient-protection-and-affordable-care-act-advancing-interoperability-and-improving-prior-authorization' }] };
const ONE_ITEM = withContent({ ...fixture.content, timeline: [DEADLINE] });
const SRC = { label: 'MedPAC, June 2026, Table 4-1', url: 'https://www.medpac.gov/x.pdf', type: 'gov', verified: true };
const text = (el) => el.textContent.replace(/\s+/g, ' ');

test('loadData exposes the contract keys at the top level', () => {
  assert.equal(D.content.kff2026.share, 0.55);
  assert.equal(D.national.context.placement.beds, 4367);
  assert.equal(D.hospitalsById.get('220071').st, 'MA');
  assert.equal(D.meta.latestFy, 2024);
  assert.deepEqual(D.meta.rules.alos, [2, 15]);
});

test('ticket: "No. 01" stub and an h2 anchor', () => {
  const el = ticket(1, 'The last step before leaving', 'wait');
  assert.match(text(el), /No\. 01/);
  const h2 = el.querySelector('h2');
  assert.equal(h2.id, 'wait');
  assert.equal(h2.textContent, 'The last step before leaving');
  assert.match(text(ticket(12, 'x', 'y')), /No\. 12/);
});

test('numberTicket: role=img with the value in its label', () => {
  const el = numberTicket({ label: 'YOUR NUMBER', value: '10', sublabel: 'Medicare Advantage' });
  assert.equal(el.getAttribute('role'), 'img');
  assert.match(el.getAttribute('aria-label'), /10/);
  assert.match(text(el), /Medicare Advantage/);
});

test('sign: decorative pictogram svg plus a visible label', () => {
  const el = sign('snf');
  const svg = el.querySelector('svg');
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.getAttribute('viewBox'), '0 0 24 24');
  assert.match(text(el), /Skilled nursing/);
  assert.deepEqual(Object.values(DEST_LABEL), ['Home', 'Home health', 'Skilled nursing', 'Inpatient rehab', 'Long-term care hospital']);
  for (const d of Object.keys(DEST_LABEL)) {
    assert.match(PICTO[d], /^M[\d.\s,MLHVAZaz-]+$/, `${d} pictogram is path data`);
    assert.ok(!/NaN|undefined/.test(PICTO[d]), `${d} pictogram has no NaN`);
  }
  assert.ok(sign('irf', { arrow: 'right' }).querySelectorAll('svg').length === 2, 'optional arrow');
  assert.throws(() => sign('nope'));
});

test('nowServing: role=img, aria-label carries the value, update() sets it', () => {
  const el = nowServing({ label: 'NOW SERVING', value: '07' });
  assert.equal(el.getAttribute('role'), 'img');
  assert.match(el.getAttribute('aria-label'), /07/);
  // The number stays numeric in data-value; the Doto glyphs show O for 0 (Doto's zero is slashed).
  assert.equal(el.querySelector('.led__digits').getAttribute('data-value'), '07');
  assert.equal(el.querySelector('.led__digits').textContent, 'O7');
  update(el, '2.7'); // no rAF/matchMedia in this DOM: sets immediately
  assert.equal(el.querySelector('.led__digits').getAttribute('data-value'), '2.7');
  assert.equal(el.querySelector('.led__digits').textContent, '2.7');
  update(el, '10.0');
  assert.equal(el.querySelector('.led__digits').textContent, '1O.O');
  assert.match(el.getAttribute('aria-label'), /10\.0/, 'the spoken value keeps its zeros');
  update(el, '2.7');
  assert.match(el.getAttribute('aria-label'), /2\.7/);
  const custom = nowServing({ label: 'BEDS HELD', value: '3.0', ariaLabel: (v) => `About ${v} beds held` });
  update(custom, '4.5');
  assert.equal(custom.getAttribute('aria-label'), 'About 4.5 beds held');
});

test('figure: numbers 1, 2 within one render and resets on re-render', () => {
  const mk = () => figure({ title: 'T', takeaway: 'Take', source: SRC, chart: h('div'), table: h('div') });
  resetFigures();
  const a = mk();
  const b = mk();
  assert.equal(a.querySelector('.fig__no').textContent, 'Fig. 1');
  assert.equal(b.querySelector('.fig__no').textContent, 'Fig. 2');
  assert.equal(a.querySelector('.fig__src a').getAttribute('href'), SRC.url);
  resetFigures();
  assert.equal(mk().querySelector('.fig__no').textContent, 'Fig. 1');
});

test('figure: several sources, unsafe URLs render as plain text', () => {
  resetFigures();
  const f = figure({ title: 'T', source: [SRC, { ...SRC, label: 'Bad', url: 'javascript:alert(1)' }], chart: h('div') });
  assert.equal(f.querySelectorAll('.fig__src a').length, 1);
  assert.match(text(f.querySelector('.fig__src')), /MedPAC.*; Bad/);
  assert.equal(safeHref('http://x.org'), null);
  assert.equal(safeHref('https://x.org/a'), 'https://x.org/a');
});

test('callout: title and items (strings or elements)', () => {
  const el = callout({ title: 'What this gap does and doesn\'t show', items: ['One', h('span', null, 'Two')] });
  assert.equal(el.querySelector('h3').textContent, 'What this gap does and doesn\'t show');
  assert.equal(el.querySelectorAll('li').length, 2);
  assert.equal(el.querySelector('li span').textContent, 'Two');
});

test('tooltip: singleton with role=tooltip, show/hide, text only', () => {
  tooltip.show(10, 10, ['<b>x</b>', h('div', null, 'row')]);
  const t = document.querySelector('[role="tooltip"]');
  assert.ok(t);
  assert.equal(t.hasAttribute('hidden'), false);
  assert.equal(t.querySelector('b'), null);
  assert.match(t.textContent, /<b>x<\/b>row/);
  tooltip.show(20, 20, ['again']);
  assert.equal(document.querySelectorAll('[role="tooltip"]').length, 1);
  tooltip.hide();
  assert.equal(t.hasAttribute('hidden'), true);
});

test('tableAlt: a <details> table that escapes markup', () => {
  const el = tableAlt({ caption: 'Rows', columns: [{ key: 'name', label: 'Name' }, { key: 'v', label: 'Days', fmt: (x) => x.toFixed(1) }],
    rows: [{ name: '<b>bold</b>', v: 2.345 }, { name: 'Plain', v: 1 }] });
  assert.equal(el.tagName, 'DETAILS');
  assert.equal(el.querySelector('summary').textContent, 'Show as table');
  assert.equal(el.querySelector('tbody b'), null);
  assert.match(el.querySelector('tbody').textContent, /<b>bold<\/b>/);
  assert.equal(el.querySelector('caption').textContent, 'Rows');
  assert.equal(el.querySelectorAll('tbody tr').length, 2);
  assert.match(el.querySelector('tbody').textContent, /2\.3/);
});

test('tableAlt: a missing value renders "—" without calling the formatter', () => {
  const el = tableAlt({ columns: [{ key: 'name', label: 'Name' }, { key: 'v', label: 'Days', fmt: (x) => x.toFixed(1) }],
    rows: [{ name: 'Has value', v: 2 }, { name: 'Missing', v: null }, { name: 'Undefined' }] });
  const cells = [...el.querySelectorAll('tbody td')].map((td) => td.textContent);
  assert.deepEqual(cells, ['2.0', '—', '—']);
});

test('hero: numbers come from the data', () => {
  const el = renderHero(D);
  const t = text(el);
  assert.equal(el.querySelector('h1').textContent, 'Ready to leave the hospital. Still waiting for the next bed.');
  assert.doesNotMatch(t, /Awaiting Placement/i, 'no masthead repeating the wordmark');
  // The month comes from PUBLISHED in site.js (bumped each release), so this test survives the yearly refresh.
  const published = new Date(`${PUBLISHED}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  assert.match(t, new RegExp(`Published ${published} · Data: FY2024 cost reports, MedPAC June 2026`));
  assert.equal(el.querySelector('.hero__date time').getAttribute('datetime'), PUBLISHED);
  assert.deepEqual([...el.querySelectorAll('.hero__date .nw')].map((s) => s.textContent),
    [`Published ${published}`, 'FY2024 cost reports', 'MedPAC June 2026'], 'each dateline phrase stays on one line');
  assert.equal(el.querySelector('.led__digits').getAttribute('data-value'), '07');
  assert.equal(el.querySelector('.led__digits').textContent, 'O7');
  assert.match(el.querySelector('.led').getAttribute('aria-label'), /Now serving 07: .*7\.0/);
  assert.match(text(el.querySelector('.tkt')), /10/);
  assert.match(t, /Average stays, FY2024: 7\.0 days in traditional Medicare, 9\.9 in Medicare Advantage\. Adjusted for hospital and diagnosis group, the gap is 2\.3 days\./);
  assert.match(t, /\+2\.3 days/);
  assert.match(t, /55%/);
  assert.match(t, /≈4,400–7,500 beds/);
  assert.ok(el.querySelector('a[href="#methods"]'));
  assert.ok(el.querySelector('a[href="#calculator"]'));
  assert.doesNotMatch(t, /NaN|undefined|\[object/);
});

test('hero: values track the data, not literals', () => {
  const c = structuredClone(fixture.content);
  const irf = c.medpac.t41.rows.find((r) => r.dest === 'irf');
  Object.assign(irf, { ffsLos: 8.2, maLos: 11.6, adj: 2.6 });
  c.kff2026.share = 0.57;
  const raw = structuredClone(fixture);
  raw.national.context.placement.beds = 3960;
  raw.national.context.adjusted.beds = 6040;
  const t = text(renderHero(loadData({ ...raw, content: c })));
  assert.match(t, /8\.2 days in traditional Medicare, 11\.6 in Medicare Advantage/);
  assert.match(t, /\+2\.6 days/);
  assert.match(t, /57%/);
  assert.match(t, /≈4,000–6,000 beds/);
});

test('hero: renders cleanly without content', () => {
  const el = renderHero(withContent(null));
  const t = text(el);
  assert.ok(el.querySelector('h1'));
  assert.equal(el.querySelector('.led'), null);
  assert.doesNotMatch(t, /NaN|undefined|null|\[object/);
  assert.match(t, /≈4,400–7,500 beds/); // national context is not content
});

test('pathway: definition, five steps, authorization marked, five signs', () => {
  const el = renderPathway(D);
  assert.equal(el.querySelector('h2').id, 'wait');
  assert.match(text(el), /No\. 01/);
  const steps = [...el.querySelectorAll('.path__step')];
  assert.deepEqual(steps.map((s) => s.querySelector('.path__title').textContent),
    ['Medically ready', 'Referral sent', 'Facility accepts', 'Plan authorization', 'Transport home or to facility']);
  const auth = steps[3];
  assert.ok(auth.classList.contains('path__step--ma'));
  assert.match(text(auth), /MA plans can require it\. Traditional Medicare does not for these stays\./);
  assert.equal(el.querySelectorAll('.sign').length, 5);
  const words = [...el.querySelectorAll('.sec__body > p')].map((p) => p.textContent).join(' ').split(/\s+/).filter(Boolean);
  assert.ok(words.length > 40 && words.length <= 250, `copy is ${words.length} words`);
  // Coverage shapes two steps: MA network and prior authorization; traditional Medicare's three-midnight rule.
  const t = text(el);
  assert.match(t, /Coverage shapes two steps\./);
  assert.match(t, /peer-to-peer review with the plan's physician/);
  assert.match(t, /only after three inpatient midnights, and observation days do not count/);
  assert.match(t, /custodial placement that neither program pays for\./);
});

test('pathway: the deadline line comes from the timeline, or is omitted', () => {
  const rule = (el) => el.querySelector('.path__rule');
  const withItem = rule(renderPathway(ONE_ITEM, new Date('2026-10-15')));
  assert.ok(withItem);
  assert.match(text(withItem), /Since Jan 2026/i);
  assert.match(text(withItem), /7 days.*72 hours/);
  assert.ok(withItem.querySelector('a[href^="https://www.federalregister.gov/"]'));
  const c = structuredClone(fixture.content);
  c.timeline = [{ ...DEADLINE, title: 'Insurer pledge', body: 'Something else.' },
    { ...DEADLINE, date: '2027-01-01', title: 'CMS-0057-F API requirements', body: 'Plans must offer prior authorization APIs.' }];
  assert.equal(rule(renderPathway(withContent(c))), null);
  const p = renderPathway(withContent(null));
  assert.equal(rule(p), null);
  assert.equal(p.querySelectorAll('.path__step').length, 5);
  assert.doesNotMatch(text(p), /NaN|undefined|null/);
});

test('pathway: Since/From follows the reader\'s date, not the cost-report date', () => {
  const when = (now) => text(renderPathway(ONE_ITEM, new Date(now)).querySelector('.path__when'));
  assert.equal(when('2026-10-15'), 'Since Jan 2026');
  assert.equal(when('2025-06-01'), 'From Jan 2026');
  assert.equal(when('2026-01-15'), 'Since Jan 2026');
});

test('hero: a source given as a list uses its first entry, like a single object', () => {
  const asObj = structuredClone(fixture.content);
  const asList = structuredClone(fixture.content);
  asList.kff2026.src = [asObj.kff2026.src, { label: 'Other', url: 'https://example.org/' }];
  asList.medpac.t41.src = [asObj.medpac.t41.src];
  const one = text(renderHero(withContent(asObj)));
  assert.equal(text(renderHero(withContent(asList))), one);
  assert.doesNotMatch(one, /NaN|undefined|null|\[object/);
});

test('renderHome: hero, then sections No. 01-05 in order', () => {
  const main = h('main');
  renderHome(main, D);
  assert.ok(main.querySelector('.hero h1'));
  const ids = [...main.querySelectorAll('.sec h2')].map((x) => x.id);
  assert.deepEqual(ids, ['wait', 'gap', 'share', 'calculator', 'sides']);
  const nos = [...main.querySelectorAll('.stub__n')].map((x) => x.textContent);
  assert.deepEqual(nos, ['01', '02', '03', '04', '05']);
  assert.equal(main.querySelectorAll('[id="wait"]').length, 1);
});

test('defaultAria: one spoken form for the LED panel and the paper ticket', () => {
  assert.equal(defaultAria({ label: 'YOUR NUMBER', sublabel: 'Medicare Advantage' })('10'), 'YOUR NUMBER 10. Medicare Advantage');
  assert.equal(defaultAria({ label: 'NOW SERVING' })('07'), 'NOW SERVING 07');
  assert.equal(numberTicket({ label: 'YOUR NUMBER', value: '10', sublabel: 'MA' }).getAttribute('aria-label'), 'YOUR NUMBER 10. MA');
  assert.equal(nowServing({ label: 'NOW SERVING', value: '07' }).getAttribute('aria-label'), 'NOW SERVING 07');
  assert.equal(nowServing({ label: 'X', value: '1', ariaLabel: 'custom' }).getAttribute('aria-label'), 'custom');
  const led = nowServing({ label: 'X', value: '1', ariaLabel: (v) => `v${v}` });
  update(led, '2');
  assert.equal(led.getAttribute('aria-label'), 'v2');
});

test('assumptionList: shared list, optional source prefix; typeLabel is no longer exported', () => {
  const items = [{ label: 'Rate', value: '$1', why: 'because', src: [{ label: 'Src', url: 'https://x.org/a', type: 'gov' }] }, { label: 'Bare' }];
  const withPrefix = assumptionList(items, { srcLabel: 'Source: ' });
  assert.equal(withPrefix.querySelectorAll('.assume__item').length, 2);
  assert.match(text(withPrefix.querySelector('.assume__src')), /^Source: Src \(opens in a new tab\) · government$/);
  assert.match(text(assumptionList(items).querySelector('.assume__src')), /^Src \(opens in a new tab\) · government$/);
  assert.equal(assumptionList([]), null);
  assert.equal(sourceModule.typeLabel, undefined);
});

test('keepIds and sourceLinks: hyphenated identifiers are set unbroken, the text is unchanged', () => {
  const { keepIds, sourceLinks } = sourceModule;
  const p = h('p', null, keepIds('Form CMS-2552-10 and CMS-0057-F, by MS-DRG; COVID-19. Part S-3, x-ray.'));
  assert.equal(p.textContent, 'Form CMS-2552-10 and CMS-0057-F, by MS-DRG; COVID-19. Part S-3, x-ray.');
  assert.deepEqual([...p.querySelectorAll('span.nw')].map((s) => s.textContent), ['CMS-2552-10', 'CMS-0057-F', 'MS-DRG', 'COVID-19']);
  assert.deepEqual(keepIds('plain text'), ['plain text']);
  assert.deepEqual(keepIds(null), []);
  const label = 'CMS, Cost Reports (HCRIS), hospital form CMS-2552-10';
  const linked = h('p', null, sourceLinks([{ label, url: 'https://www.cms.gov/x' }, { label: 'OEI-09-18-00260 report' }]));
  assert.equal(linked.querySelector('a').textContent, `${label} (opens in a new tab)`);
  assert.deepEqual([...linked.querySelectorAll('.nw')].map((s) => s.textContent), ['CMS-2552-10', 'OEI-09-18-00260']);
});

test('external links open in a new tab with a hidden cue; internal links are untouched', () => {
  const { sourceLinks } = sourceModule;
  const ext = h('p', null, sourceLinks({ label: 'CMS', url: 'https://www.cms.gov/x' })).querySelector('a');
  assert.equal(ext.getAttribute('target'), '_blank');
  assert.match(ext.getAttribute('rel'), /noopener/);
  assert.match(ext.getAttribute('rel'), /noreferrer/);
  assert.equal(ext.querySelector('.visually-hidden').textContent, ' (opens in a new tab)');
  const hash = h('a', { href: '#methods' }, 'Methods');
  assert.equal(hash.getAttribute('target'), null);
  assert.equal(hash.getAttribute('rel'), null);
  assert.equal(hash.querySelector('.visually-hidden'), null);
  assert.equal(h('a', { href: '#x' }, 'x').textContent, 'x');
});

test('trackTopbar writes the measured bar height to --topbar-h and follows resizes', () => {
  const root = document.createElement('html');
  let height = 52.4;
  const bar = { getBoundingClientRect: () => ({ height }) };
  let notify = null;
  const had = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class { constructor(cb) { notify = cb; } observe() {} disconnect() { notify = null; } };
  try {
    const stop = trackTopbar(bar, root);
    assert.equal(root.style.getPropertyValue('--topbar-h'), '53px', 'rounded up: never under the bar');
    height = 81;
    notify();
    assert.equal(root.style.getPropertyValue('--topbar-h'), '81px');
    stop();
    assert.equal(notify, null);
  } finally {
    globalThis.ResizeObserver = had;
  }
});
