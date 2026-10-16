import { fmtBeds, fmtDays, fmtMoney, fmtNum, fmtPct, fmtSigned } from '../format.js';
import { FILL_LO } from '../model.js';

// The calculator's words: lens and payment options, ledger rows, and the note under each result.
// Kept apart from calculator.js so the copy can be read and edited in one place.

export const LENSES = [
  { id: 'placement', label: 'Placement-related (adjusted)', short: 'placement-related gap',
    explain: 'MedPAC\'s adjusted gap for each destination, minus the gap for patients who went home on their own. '
      + 'Only days associated with post-acute placement count. The smallest of the three measures.' },
  { id: 'adjusted', label: 'Full adjusted gap', short: 'full adjusted gap',
    explain: 'MedPAC\'s gap after adjusting for hospital, diagnosis group and destination. '
      + 'It also counts the extra days seen for patients who go home.' },
  { id: 'unadjusted', label: 'Unadjusted', short: 'unadjusted gap',
    explain: 'The raw difference in average stay by destination, before any adjustment for differences between hospitals '
      + 'or patients. The largest of the three measures.' },
  { id: 'hospital', label: 'This hospital\'s own gap', short: 'this hospital\'s own gap', explain: '' },
];

export const PAYS = [
  { id: 'case', label: 'Per case', note: 'one payment per stay, like MS-DRG' },
  { id: 'diem', label: 'Per diem', note: 'paid by the day' },
];

// Ledger rows: [key, label]. The first group is beds and days, the second dollars.
export const LEDGER = [
  ['bedDays', 'Extra MA bed-days a year'],
  ['bedShare', 'Share of beds'],
  ['alosAdded', 'Days added to the average stay, all patients'],
  ['occWithout', 'Occupancy without the extra MA days'],
  ['savedBedDays', 'Bed-days freed by faster decisions'],
  ['addedAdmissions', 'Added admissions a year'],
];
export const DOLLARS = [
  ['excessNet', 'Hospital\'s net on the extra days'],
  ['fasterNet', 'Hospital\'s net from faster decisions'],
];

const days2 = (x) => `${x.toFixed(2)} days`;
// Totals: compact and signed ("−$998K"); anything that rounds to zero is plain "$0".
const money = (x) => (Math.abs(x) < 0.5 ? '$0' : fmtSigned(x, fmtMoney));
// A per-day or per-admission input, exact ("$4,500", not "$5K").
const usd = (x) => `$${fmtNum(x)}`;

// {key: [value, note]} for every ledger and dollar row, from compute() result `r` and the inputs behind it.
export function ledgerRows(r, inputs) {
  const perDay = inputs.pay === 'diem' ? inputs.rate - inputs.cvar : -inputs.cvar; // the hospital's net on one extra day
  const margin = r.addedAdmissions > 0 ? `, plus ${usd(inputs.cm)} of margin on each added admission` : '';
  let excess;
  let faster;
  if (inputs.pay === 'case') {
    excess = `Under per-case payment the plan pays once for the stay, so each extra day adds about ${usd(inputs.cvar)} of variable cost and no revenue.`;
    faster = `Variable cost avoided on freed days${margin}.`;
  } else if (perDay > 0) {
    excess = 'Under per-diem contracts the plan pays for each day, so these days bring in revenue. Faster decisions trade that revenue for open beds.';
    faster = `Margin on added admissions, minus the per-diem net the freed days would have earned.${r.dollars.fasterNet < 0 ? ' Negative here: those days earned more than the added admissions would.' : ''}`;
  } else if (perDay < 0) {
    excess = `The per-diem rate (${usd(inputs.rate)}) is below the variable cost of a day (${usd(inputs.cvar)}), so each extra day loses money even though the plan pays for it.`;
    faster = `Each freed day stops losing ${usd(-perDay)}${margin}.`;
  } else {
    excess = 'The per-diem rate equals the variable cost of a day, so the extra days net nothing.';
    faster = 'Margin on added admissions. The freed days netted nothing.';
  }
  return {
    bedDays: [fmtNum(r.bedDays), r.capped
      ? `Capped at the hospital's occupied bed-days. ${fmtNum(r.nMA)} MA discharges × ${r.perMA.toFixed(3)} extra days each would be ${fmtNum(r.nMA * r.perMA)}.`
      : `About ${fmtNum(r.nMA)} MA discharges × ${r.perMA.toFixed(3)} extra days each, weighted by where patients go next.`],
    bedShare: [fmtPct(r.bedShare, 1), `Of ${fmtNum(inputs.beds)} beds.`],
    alosAdded: [`+${days2(r.alosAdded)}`, `Average stay ${days2(r.alos)} with the extra MA days, ${days2(Math.max(0, r.alos - r.alosAdded))} without.`],
    occWithout: [fmtPct(r.occWithout, 1), `Now ${fmtPct(inputs.occ, 1)}.`],
    savedBedDays: [fmtNum(r.savedBedDays), r.speedup > 0
      ? `${fmtBeds(r.bedsFreed)} beds on an average day, from deciding ${fmtDays(r.speedup)} sooner.`
      : 'No speed-up, so no bed-days freed.'],
    addedAdmissions: [fmtNum(r.addedAdmissions), r.fill > 0
      ? `If ${fmtPct(r.fill)} of freed bed-days go to new patients staying ${r.alos.toFixed(1)} days on average.`
      : inputs.fill == null
        ? `None assumed: at or below ${fmtPct(FILL_LO)} occupancy the model leaves freed beds empty. Change this under Assumptions.`
        : `None, because you set refilled beds to ${fmtPct(0)}. Change this under Assumptions.`],
    excessNet: [money(r.dollars.excessNet), excess],
    fasterNet: [money(r.dollars.fasterNet), faster],
  };
}
