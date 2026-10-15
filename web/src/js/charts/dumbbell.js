import { h, s } from '../dom.js';
import { scaleLinear } from 'd3-scale';
import { tooltip } from '../ui/tooltip.js';
import { DEST_LABEL } from '../ui/sign.js';
import { PICTO } from '../ui/pictograms.js';
import { fmt1, fmtSigned } from '../format.js';
import { mount, fin, r1, bindTip, swapSvg } from './shared.js';

// Mean stay by destination: a traditional Medicare dot (--ffs) and an MA dot (--ma) joined by a hairline,
// one days axis from zero. rows: [{dest, maLos, ffsLos, diff, adj}] (MedPAC Table 4-1).
export const dumbbell = (el, rows) => mount(el, rows, draw);

const days = (x) => (fin(x) == null ? '—' : `${fmt1(x)} days`);
const adjText = (x) => (fin(x) == null ? 'adjusted gap not reported' : `${fmtSigned(x, fmt1)} days adjusted`);
const name = (r) => DEST_LABEL[r.dest] ?? r.label ?? r.dest;

function draw(el, c) {
  const rows = (c.opts || []).filter((r) => r && r.dest);
  const W = Math.max(260, c.width);
  const wide = W >= 560;
  const rowH = wide ? 46 : 66;
  const M = { top: 8, right: wide ? 164 : 28, bottom: 30, left: wide ? 188 : 6 };
  const pw = W - M.left - M.right;
  const H = M.top + rows.length * rowH + M.bottom;
  const top = Math.max(0, ...rows.flatMap((r) => [fin(r.maLos) ?? 0, fin(r.ffsLos) ?? 0]));
  const x = scaleLinear().domain([0, top > 0 ? top * 1.12 : 1]).nice(5).range([0, pw]);
  const px = (v) => r1(x(v));
  const ticks = x.ticks(5);
  const ph = rows.length * rowH;

  const aria = `Dot plot of average hospital stay in days by where the patient went next, traditional Medicare and Medicare Advantage. `
    + rows.map((r) => `${name(r)}: ${days(r.ffsLos)} in traditional Medicare, ${days(r.maLos)} in Medicare Advantage, ${adjText(r.adj)}.`).join(' ');

  const g = s('g', { transform: `translate(${M.left},${M.top})` },
    s('g', { class: 'db__ticks', 'aria-hidden': 'true' }, ticks.map((t) => s('g', { transform: `translate(${px(t)},0)` },
      s('line', { class: t === 0 ? 'db__base' : 'db__grid', y1: 0, y2: ph }),
      s('text', { y: ph + 18, 'text-anchor': t === 0 ? 'start' : 'middle' }, String(t))))),
    s('text', { class: 'db__axis-title', x: pw, y: ph + 18, 'text-anchor': 'end', 'aria-hidden': 'true', dy: 16 }, 'Days in hospital, average'));

  rows.forEach((r, i) => {
    const ma = fin(r.maLos);
    const ffs = fin(r.ffsLos);
    const cy = wide ? rowH / 2 : rowH - 20;
    const lo = Math.min(ma ?? Infinity, ffs ?? Infinity);
    const hi = Math.max(ma ?? -Infinity, ffs ?? -Infinity);
    const row = s('g', { class: 'db__row', transform: `translate(0,${i * rowH})` });
    row.append(s('rect', { class: 'db__hit', x: -M.left, y: 0, width: W, height: rowH }));
    // Row label: the pictogram plus the name, in the left gutter (wide) or on its own line (narrow).
    const lx = wide ? -M.left : 0;
    const ly = wide ? rowH / 2 : 18;
    row.append(
      s('g', { class: 'db__picto', transform: `translate(${lx},${ly - 11}) scale(${22 / 24})`, 'aria-hidden': 'true' }, s('path', { d: PICTO[r.dest] ?? '' })),
      s('text', { class: 'db__name', x: lx + 30, y: ly, dy: '0.34em', 'aria-hidden': 'true' }, name(r)),
      s('text', { class: 'db__adj', x: wide ? pw + 14 : pw, y: ly, dy: '0.34em', 'text-anchor': wide ? 'start' : 'end', 'aria-hidden': 'true' }, adjText(r.adj)));
    if (ma != null && ffs != null) row.append(s('line', { class: 'db__link', x1: px(lo), x2: px(hi), y1: cy, y2: cy }));
    const dot = (v, tone) => v != null && s('circle', { class: `db__dot db__dot--${tone}`, cx: px(v), cy, r: 5.5 });
    // Direct labels: the lower value sits left of its dot, the higher one right of its dot.
    const leftTone = ffs != null && ma != null && ma < ffs ? 'ma' : 'ffs';
    const lab = (v, tone) => {
      if (v == null) return false;
      const left = ma != null && ffs != null && tone === leftTone;
      return s('text', { class: 'db__val', x: px(v) + (left ? -11 : 11), y: cy, dy: '0.34em', 'text-anchor': left ? 'end' : 'start', 'aria-hidden': 'true' }, fmt1(v));
    };
    row.append(dot(ffs, 'ffs'), dot(ma, 'ma'), lab(ffs, 'ffs'), lab(ma, 'ma'));
    const tip = (e) => tooltip.show(e.clientX, e.clientY, [
      h('b', null, name(r)),
      tipRow('ffs', days(r.ffsLos), 'Traditional Medicare'),
      tipRow('ma', days(r.maLos), 'Medicare Advantage'),
      h('span', { class: 'tip__note' }, `Unadjusted gap ${fin(r.diff) == null ? '—' : fmtSigned(r.diff, fmt1)} days; ${adjText(r.adj)}`),
    ]);
    bindTip(row.firstChild, tip);
    g.append(row);
  });

  const svg = s('svg', { class: 'db__svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', focusable: 'false', 'aria-label': aria }, g);
  swapSvg(el, 'db__svg', svg);
}

const tipRow = (tone, value, label) => h('span', { class: 'tip__row' }, h('i', { class: `tip__dot tip__dot--${tone}` }), h('strong', null, value), ` ${label}`);
