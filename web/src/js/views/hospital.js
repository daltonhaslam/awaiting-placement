import { h } from '../dom.js';
import { fmt2, fmtDays, fmtNum, fmtPct, fmtSigned, isNum, plural, shownGap } from '../format.js';
import { encodeState, defaultInputs, inputsFromHospital, hasExcess, ownGapOk } from '../model.js';
import { link } from '../router.js';
import { hcrisSource } from '../content.js';
import { figure } from '../ui/figure.js';
import { tableAlt } from '../ui/tableAlt.js';
import { callout } from '../ui/callout.js';
import { renderNotFound } from './notFound.js';
import { legend, axisPad } from '../charts/shared.js';
import { lineSeries } from '../charts/lineSeries.js';
import { gapStrip, clipHist } from '../charts/gapStrip.js';

// A hospital's own FY cost-report figures. Raw and self-reported: never presented as an adjusted or causal measure.

const days = (v) => fmtSigned(v, fmtDays);

// The route's title: the hospital's name, with its city and state when other hospitals share the name (36 names do),
// so tabs, history and bookmarks tell them apart ("Mercy Hospital (Springfield, MO)").
const nameCounts = new WeakMap();
export function hospitalTitle(D, x) {
  let counts = nameCounts.get(D.hospitals);
  if (!counts) {
    counts = new Map();
    for (const y of D.hospitals) counts.set(y.name, (counts.get(y.name) ?? 0) + 1);
    nameCounts.set(D.hospitals, counts);
  }
  const where = [x.city, x.st].filter(Boolean).join(', ');
  return counts.get(x.name) > 1 && where ? `${x.name} (${where})` : x.name;
}

// Share of hospitals whose gap is smaller than this one, computed from the hospital list itself:
// exact, and unlike the binned histogram it does not blur hospitals sharing a bin with this one.
function gapPercentile(D, gap) {
  const gaps = D.hospitals.map((x) => x.gap).filter(isNum);
  return gaps.length ? (100 * gaps.filter((g) => g < gap).length) / gaps.length : null;
}

// "This gap is larger than at N% of hospitals", with natural wording at the extremes.
export const rankSentence = (p) => (Math.round(p) < 1 ? 'This gap is smaller than at almost all hospitals.'
  : Math.round(p) > 99 ? 'This gap is larger than at more than 99% of hospitals.'
    : `This gap is larger than at ${Math.round(p)}% of hospitals.`);

export const CHECK_DATA_NOTE = 'Check this hospital\'s data. The gap in its cost report is far outside the usual range, which often means '
  + 'days from another unit, such as swing beds, were reported on the acute line.';

function calculatorHref(D, x) {
  const inputs = { ...defaultInputs(D, D.presets.find((p) => p.id === 'regional') ?? D.presets[0]), ...inputsFromHospital(D, x) };
  // The hospital lens only for a gap above zero that is not marked "check this hospital's data"; else the default lens.
  if (hasExcess(x) && ownGapOk(x)) inputs.lens = 'hospital';
  return `#calculator?${new URLSearchParams(encodeState(inputs, x.id))}`;
}

// Why the calculator does not open on this hospital's own gap, if it does not: the first that applies.
function ctaNote(x) {
  const note = x.checkData ? ' This hospital\'s gap is far outside the usual range, so the calculator opens with MedPAC\'s national averages instead.'
    : !hasExcess(x) ? ' This hospital\'s cost report shows no longer MA stays. The calculator opens with MedPAC\'s national averages instead, which may not fit this hospital.'
      : null;
  return note && h('span', { class: 'card__note' }, note);
}

const notFound = (D) => renderNotFound(D, {
  title: 'Hospital not found',
  lead: 'No hospital in this data has that CCN. A hospital is left out when its cost report fails the checks described in the methods, '
    + 'or when it is not a short-term acute care hospital (critical access hospitals, for example).',
});

export function renderHospital(D, id) {
  const x = D.hospitalsById.get(id);
  if (!x) return notFound(D);

  const fys = D.meta.trendFys ?? [];
  const fy = D.meta.latestFy;
  const hcris = hcrisSource(D);
  const tr = (k) => fys.map((_, i) => x.trend?.[i]?.[k] ?? null);
  const years = fys.filter((_, i) => x.trend?.[i]);
  const covid = { xs: D.meta.covidFys ?? [], label: 'COVID years' };
  const hasGap = isNum(x.gap);
  const pct = hasGap ? gapPercentile(D, x.gap) : null;
  // The line shows a gap computed from the displayed (rounded) stay lengths so it adds up; ranking and the model use the raw gap.
  const shown = shownGap(x);
  const longer = hasGap && shown > 0;

  const header = h('header', { class: 'profile__head' },
    h('a', { class: 'profile__back', href: link('share') }, 'Back to the national picture'),
    h('h1', null, x.name),
    h('p', { class: 'profile__meta' }, `${x.city}, ${x.st} · CCN ${x.id} · ${fmtNum(x.beds)} beds`),
    x.teach ? h('ul', { class: 'badges', 'aria-label': 'Hospital type' }, h('li', null, 'Teaching hospital')) : null);

  const stat = (label, value, note) => h('div', { class: 'stat' }, h('dt', null, label), ' ', h('dd', { class: note ? 'stat__text' : null }, value, note ? h('span', { class: 'stat__note' }, ` ${note}`) : null));
  const card = h('section', { class: 'card', 'aria-labelledby': 'cost-report' },
    h('h2', { id: 'cost-report' }, `What its FY${fy} cost report says`),
    h('p', { class: 'card__basis' }, `Medicare Advantage (MA) and traditional Medicare stays. From this hospital's FY${fy} cost report (self-reported, not adjusted for case mix).`),
    h('p', { class: 'card__days' },
      // A no-break space before each "·" keeps it with the figure before it, so a wrapped line never starts with it.
      h('span', { class: 'nw' }, 'MA ', h('strong', null, fmtDays(x.maAlos))), '\u00a0· ',
      h('span', { class: 'nw' }, 'traditional ', h('strong', null, fmtDays(x.ffsAlos))), '\u00a0· ',
      h('span', { class: 'nw' }, 'gap ', h('strong', null, days(shown)))),
    // A flagged hospital's gap is not ranked: it is far outside the usual range.
    hasGap && !x.checkData ? h('p', { class: 'card__rank' }, longer
      ? rankSentence(pct)
      : 'MA stays were not longer here. Traditional Medicare stays averaged the same or longer.') : null,
    h('dl', { class: 'stats' },
      stat('MA share of Medicare discharges', fmtPct(x.ma)),
      x.occFlag ? stat('Occupancy', 'looks off in this cost report', 'The reported figure is outside a plausible range, so it is not shown.')
        : stat('Occupancy', fmtPct(x.occ)),
      stat('Total discharges', fmtNum(x.dis))),
    x.checkData ? h('p', { class: 'card__note' }, CHECK_DATA_NOTE) : null,
    isNum(x.ma) && x.ma > 0.9 ? h('p', { class: 'card__note' }, 'Nearly all Medicare patients here are in MA. The traditional Medicare average rests on a small, selected group, so the gap is less reliable.') : null);

  const hist = D.gapHist;
  const stripHost = h('div', { class: 'chart' });
  const stripFig = figure({
    title: `Stay gap at this hospital against all hospitals, FY${fy}`,
    takeaway: hist && isNum(hist.median)
      ? `Median ${days(hist.median)}. The middle 80% of hospitals fall between ${days(hist.p10)} and ${days(hist.p90)}.` : null,
    source: hcris,
    methods: true,
    chart: stripHost,
    table: tableAlt({
      caption: 'Number of hospitals by size of the stay gap, in days. The first and last rows combine the outlying hospitals.',
      columns: [
        { key: 'label', label: 'Gap range' },
        { key: 'n', label: 'Hospitals', fmt: (v) => fmtNum(v) },
      ],
      rows: clipHist(hist).rows,
    }),
  });
  // Positioned by the raw gap; labeled with the card's rounded gap, so one page never shows two different numbers.
  if (hist?.bins?.length) gapStrip(stripHost, { hist, value: x.gap, shown });

  let trend = h('p', { class: 'profile__lead' }, 'This hospital has fewer than two years of cost reports that passed the data checks, so no trend is shown.');
  if (years.length >= 2) {
    const shares = tr(0).filter(isNum);
    const stays = [...tr(1), ...tr(2)].filter(isNum);
    const shareHost = h('div', { class: 'chart' });
    const alosHost = h('div', { class: 'chart' });
    const rows = fys.map((fyr, i) => ({ fy: fyr, ma: x.trend?.[i]?.[0] ?? null, maAlos: x.trend?.[i]?.[1] ?? null, ffsAlos: x.trend?.[i]?.[2] ?? null }));
    const missing = fys.length - years.length;
    const gapNote = missing ? `${missing} ${plural(missing, 'year')} had no report that passed the data checks and ${plural(missing, 'is', 'are')} left blank, not drawn as zero. ` : '';
    const shareFig = figure({
      title: 'MA share of Medicare discharges at this hospital',
      takeaway: `${gapNote}Shaded years were affected by COVID.`.trim(),
      source: hcris,
      methods: true,
      chart: shareHost,
      table: tableAlt({
        caption: 'MA share of Medicare discharges, by fiscal year',
        columns: [{ key: 'fy', label: 'Fiscal year' }, { key: 'ma', label: 'MA share', fmt: (v) => fmtPct(v, 1) }],
        rows,
      }),
    });
    const alosFig = figure({
      title: 'Average length of stay at this hospital, by coverage',
      source: hcris,
      methods: true,
      chart: h('div', { class: 'chartbox' },
        legend([{ kind: 'line', tone: 'ma', label: 'Medicare Advantage' }, { kind: 'line', tone: 'ffs', label: 'Traditional Medicare' }, { kind: 'swatch', tone: 'covid', label: covid.label }]),
        alosHost),
      table: tableAlt({
        caption: 'Average length of stay in days, by fiscal year',
        columns: [
          { key: 'fy', label: 'Fiscal year' },
          { key: 'maAlos', label: 'Medicare Advantage', fmt: fmt2 },
          { key: 'ffsAlos', label: 'Traditional Medicare', fmt: fmt2 },
        ],
        rows,
      }),
    });
    const shareMax = Math.min(1, Math.max(0.1, Math.ceil((Math.max(...shares) * 1.15) * 10) / 10));
    lineSeries(shareHost, {
      x: fys, yLabel: 'Share of Medicare discharges in MA', yMax: shareMax, yTicks: 3, shade: covid,
      fmt: (v) => fmtPct(v, 1), tickFmt: (v) => fmtPct(v),
      series: [{ key: 'share', label: 'MA share', tone: 'ma', values: tr(0) }],
    });
    lineSeries(alosHost, {
      x: fys, yLabel: 'Average days in hospital', ...axisPad(stays), yTicks: 3, shade: covid, fmt: fmt2, tickFmt: (v) => String(v),
      series: [
        { key: 'ma', label: 'Medicare Advantage', tone: 'ma', values: tr(1) },
        { key: 'ffs', label: 'Traditional Medicare', tone: 'ffs', values: tr(2) },
      ],
    });
    trend = h('div', null, shareFig, alosFig);
  }

  const cant = callout({
    title: "What this can't show",
    items: [
      'The gap is raw. It is not adjusted for case mix, so a hospital that treats sicker or more complex MA patients will show a longer gap with no delay involved.',
      'It is not split by where patients went next, so it cannot separate waiting for a post-acute bed from other reasons for a longer stay.',
      'Across hospitals the gap does not rise with MA share. A high share and a long gap at one hospital should not be read as cause and effect.',
    ],
  });

  return h('div', { class: 'wrap view profile' },
    header,
    card,
    h('section', { 'aria-labelledby': 'vs-nation' }, h('h2', { id: 'vs-nation' }, 'Compared with other hospitals'), stripFig),
    h('section', { 'aria-labelledby': 'own-trend' }, h('h2', { id: 'own-trend' }, 'Over the years'), trend),
    cant,
    h('p', { class: 'profile__cta' },
      h('a', { class: 'btn', href: calculatorHref(D, x) }, 'Open in calculator'),
      ctaNote(x),
      x.occFlag ? h('span', { class: 'card__note' }, ' The calculator uses a typical occupancy instead of this hospital\'s flagged figure.') : null),
    h('p', null, h('a', { href: link('share') }, 'Back to the national picture')));
}
