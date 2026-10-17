import { h, s } from '../dom.js';
import { fmtDays, fmtNum, fmtPct, fmtSigned, isNum, pad2 } from '../format.js';
import { nowServing, update } from '../ui/nowServing.js';
import { numberTicket } from '../ui/ticket.js';
import { sourceLinks, firstSrc, shortName } from '../ui/source.js';
import { ARROW } from '../ui/pictograms.js';
import { dateline } from '../ui/dateline.js';

const near100 = (x) => Math.round(x / 100) * 100;
// In the facts strip a source is cited by its short name ("MedPAC", "KFF"), still linked.
const shortSrc = (src) => {
  const x = firstSrc(src);
  return x ? sourceLinks({ ...x, label: shortName(x) }) : null;
};

// The display unit: NOW SERVING (traditional Medicare) beside YOUR NUMBER (MA), mean days before inpatient rehab.
function display(t41, irf, animate) {
  const now = pad2(irf.ffsLos);
  const led = nowServing({ label: 'Now serving', value: now, series: 'ffs',
    sublabel: 'Traditional Medicare\u00a0· avg. days in hospital before inpatient rehab', // the "·" never starts a line
    ariaLabel: (v) => `Now serving ${v}: traditional Medicare patients averaged ${irf.ffsLos.toFixed(1)} days in the hospital before inpatient rehab.` });
  if (animate) update(led, now, { from: 0, ms: 450 }); // counts up once on load; static under reduced motion
  return h('figure', { class: 'hero__display' },
    h('div', { class: 'hero__panels' }, led,
      numberTicket({ label: 'Your number', value: pad2(irf.maLos), series: 'ma', sublabel: 'Medicare Advantage',
        ariaLabel: `Your number ${pad2(irf.maLos)}: Medicare Advantage patients averaged ${irf.maLos.toFixed(1)} days.` })),
    h('figcaption', { class: 'hero__cap' },
      `Average stays, FY${t41.fy}: ${irf.ffsLos.toFixed(1)} days in traditional Medicare, ${irf.maLos.toFixed(1)} in Medicare Advantage. `
      + `Adjusted for hospital and diagnosis group, the gap is ${irf.adj.toFixed(1)} days. Source: `,
      sourceLinks(t41.src), '.'));
}

const fact = (figure, ...label) => h('li', { class: 'fact' }, h('p', { class: 'fact__fig' }, figure), h('p', { class: 'fact__label' }, label));

// animate: false shows the LED at its number (main.js, over the pre-rendered hero the reader already sees).
export function renderHero(D, { animate = true } = {}) {
  const t41 = D.content?.medpac?.t41;
  const irf = t41?.rows?.find((r) => r.dest === 'irf');
  const hasIrf = irf && isNum(irf.ffsLos) && isNum(irf.maLos) && isNum(irf.adj);
  const kff = D.content?.kff2026;
  const ctx = D.national?.context;
  const range = ctx && [ctx.placement?.beds, ctx.adjusted?.beds].every(isNum)
    ? [Math.min(ctx.placement.beds, ctx.adjusted.beds), Math.max(ctx.placement.beds, ctx.adjusted.beds)] : null;

  const facts = [
    hasIrf && fact(fmtSigned(irf.adj, fmtDays),
      `Adjusted gap in hospital days before inpatient rehab, Medicare Advantage vs traditional Medicare, FY${t41.fy}. `,
      shortSrc(t41.src)),
    kff && isNum(kff.share) && fact(fmtPct(kff.share), 'of Medicare beneficiaries were in Medicare Advantage plans in 2026. ', shortSrc(kff.src)),
    range && fact([h('span', { class: 'nw' }, `≈${fmtNum(near100(range[0]))}–${fmtNum(near100(range[1]))}`), ' beds'],
      'held on an average day across U.S. hospitals by the longer stays of Medicare Advantage patients. A ', h('a', { href: '#methods' }, 'rough estimate'), '.'),
  ].filter(Boolean);

  return h('section', { class: 'hero', 'aria-labelledby': 'top' },
    h('div', { class: 'wrap' },
      h('div', { class: hasIrf ? 'hero__grid' : 'hero__grid hero__grid--text' },
        h('div', { class: 'hero__text' },
          h('h1', { id: 'top' }, 'Ready to leave the hospital. ', h('em', null, 'Still waiting for the next bed.')),
          h('p', { class: 'dek' }, 'When a hospital patient on a Medicare Advantage plan needs rehab or a skilled nursing facility next, '
            + 'the move can wait on the plan\'s approval. Those extra days add up to beds.'),
          h('p', { class: 'hero__cta' },
            h('a', { class: 'go', href: '#calculator' }, 'Try the calculator',
              s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, s('path', { d: ARROW }))),
            h('a', { class: 'go go--plain', href: '#methods' }, 'Methods and sources'))),
        hasIrf ? display(t41, irf, animate) : null),
      facts.length ? h('ul', { class: 'facts', 'aria-label': 'Key figures' }, facts) : null,
      dateline(D, 'hero__date')));
}
