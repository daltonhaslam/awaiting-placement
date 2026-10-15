import { h } from '../dom.js';
import { section } from '../ui/ticket.js';
import { figure } from '../ui/figure.js';
import { tableAlt } from '../ui/tableAlt.js';
import { sourceLinks } from '../ui/source.js';
import { hcrisSource } from '../content.js';
import { omnibox } from '../ui/omnibox.js';
import { hospitalIndex } from '../ui/search.js';
import { fmt1, fmt2, fmtPct } from '../format.js';
import { lineSeries } from '../charts/lineSeries.js';
import { legend, niceMax, axisPad } from '../charts/shared.js';

// No. 03, "A growing share of the room": MA's share of Medicare discharges over time, how stays moved, and a hospital lookup.

// Did both average stays sit above their last pre-COVID value in every COVID year? False when the series has no
// COVID year or no earlier year to compare with.
export function bothRoseInCovid(series, covidFys) {
  const covid = series.filter((r) => covidFys.includes(r.fy));
  const before = series.filter((r) => !covidFys.includes(r.fy) && r.fy < Math.min(...covid.map((c) => c.fy))).at(-1);
  return !!before && covid.length > 0
    && covid.every((r) => r.maAlos > before.maAlos && r.ffsAlos > before.ffsAlos);
}

export function renderShare(D) {
  const series = D.national?.series ?? [];
  const first = series[0];
  const last = series.at(-1);
  const fys = series.map((r) => r.fy);
  const hcris = hcrisSource(D);
  const kff = D.content?.kff2026;
  const cc = D.meta?.crossCheck;
  const covid = { xs: D.meta?.covidFys ?? [], label: 'COVID years' };
  const maLonger = series.length > 0 && series.every((r) => r.maAlos > r.ffsAlos);
  const covidRise = bothRoseInCovid(series, covid.xs);
  const bothRose = first && last && last.maAlos > first.maAlos && last.ffsAlos > first.ffsAlos;

  const shareHost = h('div', { class: 'chart' });
  const shareFig = figure({
    title: 'Medicare Advantage share of Medicare discharges',
    takeaway: first && last ? `In the hospitals studied here, MA went from ${fmtPct(first.maShare, 1)} of Medicare discharges in FY${first.fy} to ${fmtPct(last.maShare, 1)} in FY${last.fy}.` : null,
    source: hcris,
    methods: true,
    chart: shareHost,
    table: tableAlt({
      caption: 'MA share of Medicare discharges, by fiscal year',
      columns: [
        { key: 'fy', label: 'Fiscal year' },
        { key: 'maShare', label: 'MA share', fmt: (v) => fmtPct(v, 1) },
        { key: 'n', label: 'Hospitals', fmt: (v) => v.toLocaleString('en-US') },
      ],
      rows: series,
    }),
  });
  lineSeries(shareHost, {
    x: fys, yLabel: 'Share of Medicare discharges in MA', yMax: niceMax(series.map((r) => r.maShare)), yTicks: 3,
    fmt: (v) => fmtPct(v, 1), tickFmt: (v) => fmtPct(v),
    series: [{ key: 'share', label: 'MA share', tone: 'ma', values: series.map((r) => r.maShare) }],
  });

  const alosHost = h('div', { class: 'chart' });
  const check = cc?.hcris && cc?.medpac
    ? ` Hospitals' own cost reports land close to MedPAC's claims-based figures: ${fmt2(cc.hcris.ma)} vs ${fmt2(cc.hcris.ffs)} days against ${fmt1(cc.medpac.ma)} vs ${fmt1(cc.medpac.ffs)} in FY${cc.medpac.fy}.`
    : '';
  const alosFig = figure({
    title: 'Average length of stay, by coverage (unadjusted)',
    takeaway: `${[
      maLonger ? `MA stays averaged longer than traditional Medicare stays in every year shown${covidRise ? ', and both rose in the COVID years' : ''}.`
        : covidRise ? 'Both averages rose in the COVID years.' : null,
      check.trim() || null].filter(Boolean).join(' ')}`,
    source: hcris,
    methods: true,
    chart: h('div', { class: 'chartbox' },
      legend([{ kind: 'line', tone: 'ma', label: 'Medicare Advantage' }, { kind: 'line', tone: 'ffs', label: 'Traditional Medicare' }, ...(covid.xs.length ? [{ kind: 'swatch', tone: 'covid', label: covid.label }] : [])]),
      alosHost),
    table: tableAlt({
      caption: 'Average length of stay in days, by fiscal year',
      columns: [
        { key: 'fy', label: 'Fiscal year' },
        { key: 'maAlos', label: 'Medicare Advantage', fmt: fmt2 },
        { key: 'ffsAlos', label: 'Traditional Medicare', fmt: fmt2 },
      ],
      rows: series,
    }),
  });
  lineSeries(alosHost, {
    x: fys, yLabel: 'Average days in hospital', ...axisPad(series.flatMap((r) => [r.maAlos, r.ffsAlos])), yTicks: 3, shade: covid, fmt: fmt2, tickFmt: (v) => String(v),
    series: [
      { key: 'ma', label: 'Medicare Advantage', tone: 'ma', values: series.map((r) => r.maAlos) },
      { key: 'ffs', label: 'Traditional Medicare', tone: 'ffs', values: series.map((r) => r.ffsAlos) },
    ],
  });

  return section({ no: 3, title: 'A growing share of the room', id: 'share' },
    h('p', null, first && last
      ? `In the hospitals studied here, Medicare Advantage (MA) rose from ${fmtPct(first.maShare)} of Medicare discharges in FY${first.fy} `
        + `to ${fmtPct(last.maShare)} in FY${last.fy}.${bothRose ? ' Over the same years, average stays rose for both MA and traditional Medicare patients.' : ''}`
      : 'Medicare Advantage (MA) accounts for a growing share of Medicare discharges.'),
    shareFig,
    kff ? h('p', { class: 'fig-note' }, `For context, KFF reports that ${fmtPct(kff.share)} of Medicare beneficiaries were enrolled in MA in 2026. That counts people, not hospital discharges. `,
      h('span', { class: 'note-src' }, '(', sourceLinks(kff.src), ')')) : null,
    alosFig,
    h('div', { class: 'lookup' },
      h('h3', { class: 'lookup__title' }, 'Look up a hospital'),
      h('p', { class: 'lookup__text' }, 'Each hospital has its own stay gap and MA share. Search by name, city or six-digit CMS certification number (CCN).'),
      omnibox(() => hospitalIndex(D), { label: 'Hospital name, city or CCN', placeholder: 'For example, a hospital name or city' })));
}
