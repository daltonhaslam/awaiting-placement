import { fmtNum, fmtPct, fmt1 } from '../format.js';
import { FILL_LO, FILL_HI } from '../model.js';

// The methods page's static wording: exclusion rules, definitions, formulas and the input table.
// Thresholds are read from the data (`meta.rules`, emitted by the pipeline from the constants it applies), never typed here.

const pad4 = (n) => String(n).padStart(4, '0');
const pctWhole = (x) => fmtPct(x);

// Exclusion rules, in the order the pipeline applies them. `r` is D.meta.rules.
export function ruleLabels(r = {}) {
  const [aLo, aHi] = r.alos ?? [];
  const states = r.excludedStates ?? [];
  return {
    state: `In ${states.length ? states.join(', or in ') : 'a state or territory left out'}`
      + `${states.includes('Maryland') ? ' (Maryland hospitals are not paid under the national inpatient payment system)' : ''}`,
    period: `Report covers fewer than ${r.periodDays ?? 'the minimum number of'} days`,
    no_ma: 'No MA discharges reported',
    ma_volume: `Fewer than ${r.maDischarges ?? 'the minimum number of'} MA discharges`,
    ffs_volume: `Fewer than ${r.ffsDischarges ?? 'the minimum number of'} traditional Medicare discharges`,
    inconsistent: 'Missing or inconsistent counts, such as more Medicare discharges than total discharges',
    alos: aLo != null ? `Average stay outside ${aLo} to ${aHi} days for either group` : 'Average stay outside the plausible range for either group',
  };
}

// Which CCNs are read: the short-term acute range, and the critical access range that is left out. Null when the data has no rules.
export const ccnRanges = (r) => (r?.acuteSuffix && r?.cahSuffix
  ? { acute: `${pad4(r.acuteSuffix[0])} to ${pad4(r.acuteSuffix[1])}`, cah: `${r.cahSuffix[0]} to ${r.cahSuffix[1]}` } : null);

export const occRange = (r) => (r?.occPlausible ? `${pctWhole(r.occPlausible[0])} to ${pctWhole(r.occPlausible[1])}` : null);

export function definitions(r) {
  const occ = r?.occPlausible
    ? `A value above ${pctWhole(r.occPlausible[1])} or below ${pctWhole(r.occPlausible[0])} is flagged and not shown.`
    : 'An implausible value is flagged and not shown.';
  return [
    ['Fiscal year', 'The year the report period begins, which is how CMS files the reports. When a hospital has more than one '
      + 'report for a year, the longest period is kept, then the most recently processed.'],
    ['Medicare Advantage (MA) days and discharges', 'Worksheet S-3, Part I, line 2: days in column 6, discharges in column 13.'],
    ['Traditional Medicare days', 'Line 1 plus lines 8 to 12 (intensive care and other special-care units, including any '
      + 'subscripted unit lines such as 8.01), column 6. Line 2 counts MA days in every unit, so the special-care lines are added '
      + 'to traditional Medicare to compare like with like. Traditional Medicare is the fee-for-service (FFS) program. '
      + 'Where a Pennsylvania Rural Health Model hospital splits its Medicare days between columns 6 and 6.01, the two are added.'],
    ['Traditional Medicare discharges', 'Line 1, column 13.'],
    ['Average stay and gap', 'Days divided by discharges, for each group. The gap is the MA average minus the traditional Medicare average.'],
    ['MA share', 'MA discharges divided by MA plus traditional Medicare discharges.'],
    ['Beds and occupancy', 'Beds and available bed-days from line 14, columns 2 and 3. Occupancy is inpatient days (line 14, column 8, '
      + `minus nursery days on line 13) divided by available bed-days. ${occ}`],
    ['Teaching hospital', 'Reports interns and residents (line 14, column 9). Used for the Academic preset.'],
    ['Names and cities', 'CMS Hospital General Information, matched by CMS certification number (CCN). '
      + 'The cost-report name is used when there is no match.'],
  ];
}

export const formulas = () => [
  ['MA discharges', 'nMA = discharges × Medicare share × MA share'],
  ['Average stay, all patients', 'alos = occupancy × beds × 365 / discharges'],
  ['Extra MA bed-days a year', 'W = nMA × Σ mix[d] × e[d]'],
  ['Beds held on an average day', 'E = W / 365'],
  ['Share of beds', 'E / beds'],
  ['Days added to the average stay', 'W / discharges'],
  ['Occupancy without the extra MA days', 'occupancy − W / (beds × 365)'],
  ['Speed-up, skilled nursing and inpatient rehab only', 's = max(0, t0 − t1)'],
  ['Bed-days freed, summed over skilled nursing and inpatient rehab', 'S = nMA × Σ mix[d] × min(s, e[d])'],
  ['Added admissions', 'A = S × fill / alos'],
  ['Refill share, unless set by hand', `fill = min(1, max(0, (occupancy − ${FILL_LO.toFixed(2)}) / ${(FILL_HI - FILL_LO).toFixed(2)}))`],
  ['Per case: net on the extra days', '−W × cvar'],
  ['Per case: net from faster decisions', 'S × cvar + A × cm'],
  ['Per diem: net on the extra days', 'W × (rate − cvar)'],
  ['Per diem: net from faster decisions', 'A × cm − S × (rate − cvar)'],
];

// [key, label, format]: the calculator's inputs, in the order the table lists them.
export const INPUTS = [
  ['beds', 'Beds (available beds from the cost report, or your own staffed count)', fmtNum],
  ['occ', 'Occupancy', (v) => fmtPct(v)],
  ['dis', 'Discharges a year, all payers', fmtNum],
  ['mcr', 'Medicare share of discharges', (v) => fmtPct(v)],
  ['ma', 'MA share of Medicare discharges', (v) => fmtPct(v)],
  ['t0', 'Plan decision time today, days', fmt1],
  ['t1', 'Plan decision time, faster, days', fmt1],
  ['cvar', 'Variable cost of one extra day', (v) => `$${fmtNum(v)}`],
  ['rate', 'Per-diem rate', (v) => `$${fmtNum(v)}`],
  ['cm', 'Margin per added admission', (v) => `$${fmtNum(v)}`],
  ['fill', 'Share of freed bed-days refilled', (v) => fmtPct(v)],
];
