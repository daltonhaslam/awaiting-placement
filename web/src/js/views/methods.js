import { h } from '../dom.js';
import { SITE, DISCLAIMER } from '../site.js';
import { fmt1, fmt2, fmtDate, fmtNum, fmtPct, fmtSigned, isNum, plural } from '../format.js';
import { sourceLinks, assumptionList, keepIds, SRC_TYPE } from '../ui/source.js';
import { DEST_LABEL } from '../ui/sign.js';
import { ltchShare } from '../content.js';
import { dateline } from '../ui/dateline.js';
import { INPUTS, ccnRanges, definitions, formulas, occRange, ruleLabels } from './methodsCopy.js';

// The methods page: sources, how the cost-report figures are built, the calculator's formulas and assumptions,
// limitations, and who made the site. Counts and figures are read from the data; only the rules are written here.

const list = (x) => (Array.isArray(x) ? x : []);
const v = (name) => h('code', null, name); // a variable in running text

// The wrapper scrolls sideways on narrow screens, so it is focusable and named (Safari does not make scrollers focusable).
const table = (attrs, head, rows, foot) => h('div', { class: 'dtable__scroll', tabindex: '0', role: 'region', 'aria-label': `${attrs['data-table']} table` },
  h('table', { class: 'dtable', ...attrs },
    h('thead', null, h('tr', null, head.map(([label, num]) => h('th', { scope: 'col', class: num ? 'num' : null }, label)))),
    h('tbody', null, rows),
    foot ? h('tfoot', null, foot) : null));

// Pearson correlation of MA share and gap, with the number of hospitals that have both figures (the ones it used);
// r is null if it cannot be computed.
function correlation(hospitals) {
  const xy = list(hospitals).filter((x) => isNum(x.ma) && isNum(x.gap));
  if (xy.length < 3) return { r: null, n: xy.length };
  const mean = (k) => xy.reduce((a, x) => a + x[k], 0) / xy.length;
  const mx = mean('ma');
  const my = mean('gap');
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const x of xy) {
    sxy += (x.ma - mx) * (x.gap - my);
    sxx += (x.ma - mx) ** 2;
    syy += (x.gap - my) ** 2;
  }
  const r = sxy / Math.sqrt(sxx * syy);
  return { r: isNum(r) ? r : null, n: xy.length };
}

function part(id, title, ...children) {
  return h('section', { class: 'mpart', 'aria-labelledby': id },
    h('h2', { id, tabindex: '-1' }, title), children);
}

function sourcesPart(D) {
  const sources = list(D.content?.sources);
  return part('methods-sources', 'Sources',
    h('p', null, 'Hospital figures come from Medicare cost reports (HCRIS), with names and cities from CMS Hospital General Information. '
      + 'Gaps in hospital stay between Medicare Advantage (MA) and traditional Medicare, by discharge destination, come from MedPAC, '
      + 'the Medicare Payment Advisory Commission, which advises Congress on Medicare payment. '
      + 'Every other figure on the site cites its source where it appears.'),
    sources.length ? table({ 'data-table': 'sources' }, [['Source'], ['Type']],
      sources.map((x) => h('tr', null, h('th', { scope: 'row' }, sourceLinks(x)), h('td', { class: 'dtable__type' }, SRC_TYPE[x.type] ?? '—')))) : null);
}

// Included hospitals whose gap is far outside the usual range: kept, but marked on their page. Thresholds from the
// data's rules, the count from the hospital list.
function checkDataSentence(m, n) {
  const { checkGapDays: gap, checkAlosRatio: ratio } = m.rules ?? {};
  if (n < 1 || !isNum(gap) || !isNum(ratio)) return null;
  return h('p', null, `${fmtNum(n)} ${plural(n, 'hospital')} whose gap is larger than ${gap} days either way, `
    + `or whose MA and traditional Medicare stays differ more than ${ratio === 2 ? 'twofold' : `${ratio}-fold`}, `
    + `${plural(n, 'is', 'are')} kept but marked "check this hospital's data" on ${plural(n, 'its', 'their')} page; `
    + `the calculator uses national averages for ${plural(n, 'it', 'them')}.`);
}

function costReportPart(D) {
  const m = D.meta ?? {};
  const fy = m.latestFy;
  const ex = m.exclusions ?? {};
  const excluded = Object.values(ex).filter(isNum).reduce((a, b) => a + b, 0);
  const cc = m.crossCheck;
  const fys = list(m.trendFys);
  const covid = list(m.covidFys);
  const { r, n: nPaired } = correlation(D.hospitals);
  const flagged = list(D.hospitals).filter((x) => x.occFlag).length;
  const checkData = list(D.hospitals).filter((x) => x.checkData).length;
  const diff = cc?.hcris && cc?.medpac ? Math.max(Math.abs(cc.hcris.ma - cc.medpac.ma), Math.abs(cc.hcris.ffs - cc.medpac.ffs)) : null;
  const medpacSrc = D.content?.medpac?.t41?.src;
  const labels = ruleLabels(m.rules);
  const ccn = ccnRanges(m.rules);
  const occ = occRange(m.rules);

  return part('methods-cost', 'Hospital figures from cost reports',
    h('p', null, `Hospitals that bill Medicare file a cost report each year. This site reads the FY${fys[0] ?? fy} to FY${fy} reports `
      + 'for counts of days and discharges by payer.'),
    h('h3', null, 'Definitions'),
    h('dl', { class: 'defs' }, definitions(m.rules).map(([t, d]) => h('div', { class: 'defs__row' }, h('dt', null, t), h('dd', null, d)))),
    h('h3', null, 'Which hospitals are included'),
    h('p', null, `Short-term acute care hospitals only${ccn ? `: those whose CCN ends in ${ccn.acute}. Critical access hospitals use `
      + `a different range (${ccn.cah}) and are not included` : ''}. Each FY${fy} report is checked against the rules below in order `
      + 'and counted under the first rule it fails.'),
    table({ 'data-table': 'exclusions' }, [['Rule'], [`Excluded, FY${fy}`, true]],
      Object.keys(ex).map((k) => h('tr', { 'data-reason': k },
        h('th', { scope: 'row' }, labels[k] ?? k), h('td', { class: 'num' }, fmtNum(ex[k])))),
      [
        h('tr', null, h('th', { scope: 'row' }, `Short-term acute care reports, FY${fy}`), h('td', { class: 'num' }, fmtNum(m.nAcute))),
        h('tr', null, h('th', { scope: 'row' }, 'Excluded'), h('td', { class: 'num' }, fmtNum(excluded))),
        h('tr', null, h('th', { scope: 'row' }, 'Included'), h('td', { class: 'num' }, fmtNum(m.nClean))),
      ]),
    checkDataSentence(m, checkData),
    fys.length > 1 ? h('p', null, `The national trend in No. 03 applies the same rules to each year from FY${fys[0]} to FY${fys.at(-1)}.`
      + (covid.length ? ` The COVID years, FY${covid[0]} to FY${covid.at(-1)}, are shaded.` : '')) : null,
    cc?.hcris && cc?.medpac ? [
      h('h3', null, 'Cross-check'),
      h('p', null, `Weighted by discharges, the included FY${fy} reports give an average MA stay of ${fmt2(cc.hcris.ma)} days `
        + `and a traditional Medicare stay of ${fmt2(cc.hcris.ffs)} days. MedPAC's claims-based figures for FY${cc.medpac.fy} `
        + `are ${fmt1(cc.medpac.ma)} and ${fmt1(cc.medpac.ffs)} days. The largest difference is ${fmt2(diff)} days. `,
        medpacSrc ? h('span', { class: 'note-src' }, '(', sourceLinks(medpacSrc), ')') : null),
    ] : null,
    h('h3', null, 'What the cost-report figures can\'t show'),
    h('ul', { class: 'mlist' },
      h('li', null, 'The gap is raw. It is not adjusted for diagnosis or severity, and cost reports do not say where patients went after discharge.'),
      r != null ? h('li', null, `Across the ${fmtNum(nPaired)} hospitals with both figures, the gap does not rise with MA share (correlation of ${fmtSigned(r, fmt2)}). `
        + 'Where nearly all Medicare patients are in MA, the few left in traditional Medicare are a small, selected group, so their average is less stable.') : null,
      h('li', null, `Hospitals file these reports themselves, and a few figures are implausible. Occupancy outside ${occ ?? 'its plausible range'} is flagged and not shown${flagged ? ` (${fmtNum(flagged)} ${plural(flagged, 'hospital')} in FY${fy})` : ''}.`)));
}

function calculatorPart(D) {
  const model = D.model ?? {};
  const dests = list(model.dests);
  const L = model.lenses ?? {};
  const mix = model.mix ?? {};
  const t41 = D.content?.medpac?.t41;
  const sept = D.content?.medpac?.sept;
  const stays = sept?.staysPer1000?.ma;
  const ltch = ltchShare(D);
  const irfMa = mix.irf;
  const irfFfs = sept?.mix?.ffs?.irf;
  const home = L.adjusted?.home;
  const assumptions = list(D.content?.assumptions);
  const defaults = model.defaults ?? {};
  const ranges = model.ranges ?? {};
  const ctx = D.national?.context;

  const mixNote = isNum(irfMa)
    ? ` MedPAC reports that ${fmtPct(irfMa)} of MA hospital discharges go to inpatient rehab`
      + `${isNum(irfFfs) ? ` (${fmtPct(irfFfs)} in traditional Medicare)` : ''}, and the model uses that share. `
      + `Long-term care hospitals are shown separately${isNum(ltch) ? `, at about ${fmtPct(ltch, 1)} of MA stays,` : ''} and are left out.`
    : '';

  return part('methods-calculator', 'The calculator',
    h('p', null, 'The calculator estimates how many beds a hospital\'s MA patients hold on an average day because their stays run longer. '
      + 'It applies MedPAC\'s national gaps by discharge destination to one hospital\'s volumes. It is a model built on averages, not a measurement of any hospital. '
      + '"Extra days" here means the difference between MA and traditional Medicare stays. It is not the same as days over the '
      + 'DRG\'s expected length of stay or as avoidable days logged by case managers.'),
    h('h3', null, 'Extra days per MA stay'),
    table({ 'data-table': 'lenses' },
      [['Destination'], ['Share of MA patients', true], ['Unadjusted', true], ['Adjusted', true], ['Placement-related', true]],
      dests.map((d) => h('tr', null,
        h('th', { scope: 'row' }, DEST_LABEL[d] ?? d),
        h('td', { class: 'num' }, isNum(mix[d]) ? fmtPct(mix[d], mix[d] < 0.1 ? 1 : 0) : '—'),
        h('td', { class: 'num' }, fmt1(L.unadjusted?.[d])),
        h('td', { class: 'num' }, fmt1(L.adjusted?.[d])),
        h('td', { class: 'num' }, fmt1(L.placement?.[d]))))),
    h('ul', { class: 'mlist mlist--notes' },
      h('li', null, keepIds(`Unadjusted and adjusted gaps are MedPAC's, for FY${t41?.fy ?? D.meta?.latestFy}. The adjustment accounts for the hospital, `
        + 'the diagnosis group (MS-DRG) and the discharge destination. '), t41?.src ? h('span', { class: 'note-src' }, '(', sourceLinks(t41.src), ')') : null),
      h('li', null, `Placement-related is the adjusted gap minus the adjusted gap for patients who went home on their own${isNum(home) ? ` (${fmt1(home)} days)` : ''}. `
        + 'It keeps only the extra days associated with going to post-acute care, and it is the default.'),
      h('li', null, 'This hospital\'s own gap, offered once a hospital is chosen, scales the adjusted column so that its average across the mix '
        + 'equals the hospital\'s cost-report gap. A gap of zero or less counts as no extra days.'),
      h('li', null, `The mix is MedPAC's for ${sept?.year ?? 'its sample year'}.${mixNote} `, sept?.src ? h('span', { class: 'note-src' }, '(', sourceLinks(sept.src), ')') : null)),

    h('h3', null, 'Formulas'),
    h('p', null, 'In these formulas, ', v('d'), ' is a destination, ', v('mix[d]'), ' the share of MA patients who go there and ', v('e[d]'),
      ' the extra days per stay under the chosen gap. ', v('t0'), ' and ', v('t1'), ' are the plan decision times today and with faster decisions. ',
      v('cvar'), ' is the variable cost of a day, ', v('rate'), ' the per-diem rate and ', v('cm'), ' the margin on an added admission.'),
    h('dl', { class: 'formulas' }, formulas().map(([t, f]) => h('div', { class: 'formulas__row' }, h('dt', null, t), h('dd', null, h('code', null, f))))),
    h('p', null, v('W'), ' is capped at the hospital\'s occupied bed-days (occupancy × beds × 365), and ', v('S'), ' cannot exceed ', v('W'), '. '
      + 'Every input is held to the range below, so a typed or linked value outside it is moved to the nearest limit.'),
    table({ 'data-table': 'inputs' }, [['Input'], ['Default', true], ['Allowed range', true]],
      INPUTS.filter(([k]) => ranges[k]).map(([k, label, f]) => h('tr', null,
        h('th', { scope: 'row' }, label),
        isNum(defaults[k]) ? h('td', { class: 'num' }, f(defaults[k]))
          : h('td', { class: 'dtable__note' }, k === 'fill' ? 'from occupancy' : 'preset or hospital'),
        h('td', { class: 'num' }, `${f(ranges[k][0])} to ${f(ranges[k][1])}`)))),

    assumptions.length ? [
      h('h3', null, 'Assumptions'),
      assumptionList(assumptions),
    ] : null,

    h('h3', null, 'What the calculator does not measure'),
    h('ul', { class: 'mlist' },
      h('li', null, 'The share of extra days that were truly avoidable. MedPAC\'s gaps are associations and do not answer that.'),
      h('li', null, 'Decision times for skilled nursing facilities. The default wait comes from a survey of inpatient rehabilitation '
        + 'facilities, and the model applies it to both.'),
      h('li', null, 'How many MA contracts pay hospitals per diem rather than per case. MedPAC says per-stay payment is common; '
        + 'the per-diem option is there for contracts that differ.')),

    ctx?.placement && ctx?.adjusted && isNum(ctx.maStays2023) && sept?.year && isNum(stays?.ach) && isNum(sept?.sampleMillions?.ma) ? [
      h('h3', null, 'The national estimate'),
      h('p', null, `MedPAC counted ${stays.ach} acute hospital stays per 1,000 MA enrollees in ${sept.year}, in a sample of `
        + `${sept.sampleMillions.ma} million enrollees: about ${fmtNum(ctx.maStays2023)} stays. Applying the mix and the extra days per stay gives `
        + `${fmtNum(ctx.placement.bedDays)} extra MA bed-days a year under the placement-related gap (${fmtNum(ctx.placement.beds)} beds on an average day) `
        + `and ${fmtNum(ctx.adjusted.bedDays)} under the full adjusted gap (${fmtNum(ctx.adjusted.beds)} beds). `
        + `It combines ${sept.year} volumes with FY${t41?.fy ?? D.meta?.latestFy} gaps, so read it as a rough range.`),
    ] : null);
}

function limitsPart() {
  return part('methods-limits', 'Limitations',
    h('ul', { class: 'mlist' },
      h('li', null, 'These are associations, not causes. Neither MedPAC\'s gaps nor the cost-report gaps show why MA stays run longer. '
        + 'Prior authorization is one possible reason among several.'),
      h('li', null, 'MedPAC\'s adjustment accounts for hospital, diagnosis group and destination, but not for every difference between patients. '
        + 'Income and dual eligibility, for example, differ between the two groups.'),
      h('li', null, 'Observation stays are outpatient and are not in these counts. MA patients are more likely to have observation stays '
        + 'for some conditions, which can change who is counted as an inpatient.'),
      h('li', null, 'The calculator applies national averages to one hospital. A hospital\'s own patients, contracts and post-acute options will differ.'),
      h('li', null, 'Dollar figures rest on single illustrative inputs. They are not a hospital\'s finances.'),
      h('li', null, 'MedPAC\'s September 2026 figures, used for the discharge mix and median stays, are preliminary.')));
}

function aboutPart(D) {
  const built = D.meta?.builtOn;
  return part('methods-about', 'About',
    dateline(D, 'methods__date'),
    h('p', null, 'Built by ', h('a', { href: SITE.linkedin }, SITE.byline), ', using Claude Code.'),
    h('p', null, 'The code and the data pipeline are public on ', h('a', { href: SITE.repo }, 'GitHub'),
      '. Corrections are welcome there as issues.'),
    built ? h('p', null, `The cost-report data runs through report periods ending ${fmtDate(built)}.`) : null,
    h('p', null, 'The page loads fonts from Google Fonts. It has no analytics, no cookies, and sends nothing else anywhere.'),
    h('p', null, `${DISCLAIMER} Code MIT-licensed. Federal source data is public domain.`));
}

export function renderMethods(D) {
  const parts = [sourcesPart(D), costReportPart(D), calculatorPart(D), limitsPart(), aboutPart(D)];
  // Without JavaScript (the pre-rendered page) each link is a plain anchor to its part. With it, the click scrolls
  // instead, so the route stays #methods (the router reads #methods-sources as an unknown page).
  const jump = (target) => (e) => {
    e.preventDefault();
    target.scrollIntoView();
    target.focus({ preventScroll: true });
  };
  return h('div', { class: 'wrap view methods' },
    h('h1', null, 'Methods'),
    h('p', { class: 'methods__lead' }, 'Where the numbers on this site come from, and how they are built.'),
    h('nav', { class: 'methods__toc', 'aria-label': 'On this page' },
      h('ul', null, parts.map((p) => {
        const h2 = p.querySelector('h2');
        return h('li', null, h('a', { href: `#${h2.id}`, onclick: jump(h2) }, h2.textContent));
      }))),
    parts);
}
