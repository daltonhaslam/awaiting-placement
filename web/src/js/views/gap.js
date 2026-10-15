import { h } from '../dom.js';
import { section } from '../ui/ticket.js';
import { figure } from '../ui/figure.js';
import { tableAlt } from '../ui/tableAlt.js';
import { callout } from '../ui/callout.js';
import { sourceLinks, mergeSources } from '../ui/source.js';
import { DEST_LABEL } from '../ui/sign.js';
import { fmt1, fmtPct, fmtSigned, isNum } from '../format.js';
import { dumbbell } from '../charts/dumbbell.js';
import { mixBars, MIX_KEYS } from '../charts/mixBars.js';
import { legend } from '../charts/shared.js';

// No. 02, "How much longer": the stay gap by where the patient went next, where patients went, and what the gap does not show.
const named = (r) => DEST_LABEL[r.dest] ?? r.label;
const byKey = (list, key) => (Array.isArray(list) ? list : []).find((x) => x.key === key);
const withSrc = (text, src) => [text, ' ', h('span', { class: 'callout__src' }, '(', sourceLinks(src), ')')];

export function renderGap(D) {
  const t41 = D.content?.medpac?.t41;
  const sept = D.content?.medpac?.sept;
  const rows = t41?.rows ?? [];
  const sides = D.content?.sides ?? {};
  const ltch = sept?.medians?.find((m) => m.dest === 'ltch');

  const dbHost = h('div', { class: 'chart' });
  const mixHost = h('div', { class: 'chart' });
  const top = rows.at(-1);

  const gapFig = figure({
    title: `Average hospital stay by where the patient went next, FY${t41?.fy ?? D.meta?.latestFy}`,
    takeaway: `The gap grows with the level of care needed next${top && isNum(top.diff) ? `: ${fmt1(rows[0].diff)} days for patients who went home, ${fmt1(top.diff)} days for inpatient rehab (unadjusted).` : '.'}`,
    source: t41?.src,
    chart: h('div', { class: 'chartbox' },
      legend([{ kind: 'dot', tone: 'ffs', label: 'Traditional Medicare' }, { kind: 'dot', tone: 'ma', label: 'Medicare Advantage' }]),
      dbHost),
    table: tableAlt({
      caption: 'Average length of stay in days, by discharge destination',
      columns: [
        { key: 'dest', label: 'Destination', fmt: (_, r) => named(r) },
        { key: 'ffsLos', label: 'Traditional Medicare', fmt: fmt1 },
        { key: 'maLos', label: 'Medicare Advantage', fmt: fmt1 },
        { key: 'diff', label: 'Unadjusted gap', fmt: (v) => fmtSigned(v, fmt1) },
        { key: 'adj', label: 'Adjusted gap', fmt: (v) => fmtSigned(v, fmt1) },
        { key: 'adjPct', label: 'Adjusted gap, %', fmt: (v) => `${fmt1(v)}%` },
      ],
      rows,
    }),
  });
  dumbbell(dbHost, rows);

  const mix = sept?.mix;
  const noneMa = mix?.ma?.none;
  const noneFfs = mix?.ffs?.none;
  const mixFig = figure({
    title: `Where patients went after the hospital${sept?.year ? `, ${sept.year}` : ''}`,
    takeaway: isNum(noneMa) && isNum(noneFfs)
      ? `${fmtPct(noneFfs)} of traditional Medicare patients and ${fmtPct(noneMa)} of MA patients used no post-acute care. Shares are rounded, so a bar can add to 99% or 101%.`
      : null,
    source: sept?.src,
    chart: h('div', { class: 'chartbox' },
      legend(MIX_KEYS.map((k) => ({ kind: 'swatch', tone: k.tone, label: k.label })), 'Destinations'),
      mixHost),
    table: tableAlt({
      caption: `Share of patients by what came after the hospital${sept?.year ? `, ${sept.year}` : ''}`,
      columns: [
        { key: 'label', label: 'After the hospital' },
        { key: 'ffs', label: 'Traditional Medicare', fmt: (v) => fmtPct(v) },
        { key: 'ma', label: 'Medicare Advantage', fmt: (v) => fmtPct(v) },
      ],
      rows: MIX_KEYS.map((k) => ({ label: k.label, ffs: mix?.ffs?.[k.key], ma: mix?.ma?.[k.key] })),
    }),
  });
  mixBars(mixHost, mix ?? {});

  const irf = rows.find((r) => r.dest === 'irf') ?? top;
  const unadjusted = irf && isNum(irf.adj) && isNum(irf.diff)
    ? withSrc(`The averages above are unadjusted. After MedPAC adjusts for hospital, diagnosis group and destination, the gap by destination is smaller (for ${DEST_LABEL[irf.dest]?.toLowerCase() ?? 'the longest-stay group'}, ${fmt1(irf.adj)} days instead of ${fmt1(irf.diff)}).`, t41.src)
    : null;
  const observation = byKey(sides.unsettled, 'obs-stays');
  const dual = byKey(sides.unsettled, 'duals-share');
  const authz = byKey(sides.plans, 'plans-right-level');
  const incomplete = byKey(sides.plans, 'plans-incomplete-requests');

  // The plans' two points read as one sentence when the content carries a `short` form of each; otherwise the first stands alone.
  const merged = authz?.short && incomplete?.short;
  const plans = authz && (merged ? `${authz.short}, and ${incomplete.short}.` : authz.text);
  const items = [
    unadjusted,
    observation && withSrc(observation.text, observation.src),
    dual && withSrc(dual.text, dual.src),
    plans && withSrc(plans, merged ? mergeSources(authz.src, incomplete.src) : authz.src),
  ].filter(Boolean);

  // Fig. 2's lead-in: which coverage more often left without post-acute care (the direction is read from the data).
  const mixLead = isNum(noneMa) && isNum(noneFfs) && noneMa !== noneFfs
    ? h('p', null, `Where patients went next also differs by coverage: MA patients were ${noneMa > noneFfs ? 'more' : 'less'} likely `
      + 'than traditional Medicare patients to leave the hospital without post-acute care.')
    : null;

  return section({ no: 2, title: 'How much longer', id: 'gap' },
    h('p', null, 'On average, Medicare Advantage (MA) patients stay in the hospital longer than traditional Medicare patients. '
      + 'The gap is small for patients who go home and widens for those who need a facility next. These figures come from MedPAC, '
      + 'the commission that advises Congress on Medicare payment.'),
    gapFig,
    mixLead,
    mixFig,
    ltch ? h('p', null, `For the few patients who go on to a long-term care hospital, the median hospital stay was ${ltch.ffs} days in traditional Medicare and ${ltch.ma} days in Medicare Advantage (${sept.year ? `${sept.year}, ` : ''}unadjusted). `,
      h('span', { class: 'note-src' }, '(', sourceLinks(sept.src), ')')) : null,
    callout({ title: 'What this gap does and does not show', items }));
}
