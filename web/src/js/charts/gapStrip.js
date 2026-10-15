import { h, s } from '../dom.js';
import { scaleLinear } from 'd3-scale';
import { tooltip } from '../ui/tooltip.js';
import { fmtDays, fmtNum, fmtSigned, isNum } from '../format.js';
import { mount, bindTip, swapSvg, yAxis, r1 } from './shared.js';

// The national spread of hospital stay gaps (MA minus traditional Medicare, FY latest) as a histogram,
// with one hospital marked. Options: hist {bins:[{x0,x1,n}], median, p10, p90}; value: this hospital's gap (number or null).
export const gapStrip = (el, opts) => mount(el, opts, draw);

const sd = (v) => fmtSigned(v, fmtDays);
// Bin edges sit on quarter days, so they are labeled to two decimals ("−0.25 to 0.00 days"), never rounded to one.
const edge = (v) => fmtSigned(v, (a) => a.toFixed(2));
const EXT = 0.75; // width, in days of the axis, given to each combined end bin
const EPS = 1e-9;

// Clip the histogram to roughly the 1st to 99th percentile of hospitals, rounded out to whole days, and fold
// everything beyond into one combined end bin each. Returns {lo, hi, rows:[{x0, x1, n, over: 'low'|'high'|null, label}]}.
export function clipHist(hist) {
  const bins = (hist?.bins ?? []).filter((b) => isNum(b.x0) && isNum(b.x1) && isNum(b.n));
  if (!bins.length) return { lo: -1, hi: 1, rows: [] };
  const total = bins.reduce((a, b) => a + b.n, 0);
  let lo = bins[0].x0;
  let hi = bins.at(-1).x1;
  if (total > 0) {
    let cum = 0;
    let a = null;
    let z = null;
    for (const b of bins) {
      cum += b.n;
      if (a == null && cum / total >= 0.01) a = b.x0;
      if (z == null && cum / total >= 0.99) z = b.x1;
    }
    const L = Math.max(lo, Math.floor(a + EPS));
    const U = Math.min(hi, Math.ceil(z - EPS));
    if (U > L) { lo = L; hi = U; }
  }
  const sum = (f) => bins.filter(f).reduce((a, b) => a + b.n, 0);
  const lowN = sum((b) => b.x1 <= lo + EPS && b.x0 < lo - EPS);
  const highN = sum((b) => b.x0 >= hi - EPS && b.x1 > hi + EPS);
  const hasLow = bins[0].x0 < lo - EPS;
  const hasHigh = bins.at(-1).x1 > hi + EPS;
  const inner = bins.filter((b) => b.x0 >= lo - EPS && b.x1 <= hi + EPS).map((b) => ({ ...b, over: null, label: `${edge(b.x0)} to ${edge(b.x1)} days` }));
  return {
    lo, hi,
    rows: [
      ...(hasLow ? [{ x0: lo - EXT, x1: lo, n: lowN, over: 'low', label: `${edge(lo)} days or lower, combined` }] : []),
      ...inner,
      ...(hasHigh ? [{ x0: hi, x1: hi + EXT, n: highN, over: 'high', label: `${edge(hi)} days or higher, combined` }] : []),
    ],
  };
}
const tickText = (v) => (v === 0 ? '0' : fmtSigned(v, (a) => String(+a.toFixed(1))));

function draw(el, c) {
  const { hist, value } = c.opts;
  const { lo, hi, rows } = clipHist(hist);
  const W = Math.max(260, c.width);
  const wide = W >= 560;
  const H = wide ? 288 : 268;
  const M = { top: 40, right: 14, bottom: 88, left: 40 };
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const dLo = rows.length ? rows[0].x0 : lo;
  const dHi = rows.length ? rows.at(-1).x1 : hi;
  const lowOver = rows[0]?.over === 'low';
  const highOver = rows.at(-1)?.over === 'high';
  const x = scaleLinear().domain([dLo, dHi > dLo ? dHi : dLo + 1]).range([0, pw]);
  const top = Math.max(1, ...rows.map((b) => b.n));
  const y = scaleLinear().domain([0, top]).nice(3).range([ph, 0]);
  const px = (v) => r1(x(v));
  const py = (v) => r1(y(v));
  // A hospital beyond the clip sits in its end bin; the label still shows its real gap.
  const you = !isNum(value) || !rows.length ? null
    : value < lo && lowOver ? (x(lo - EXT) + x(lo)) / 2
      : value > hi && highOver ? (x(hi) + x(hi + EXT)) / 2
        : x(Math.min(dHi, Math.max(dLo, value)));
  const ownBin = you == null ? -1 : rows.findIndex((b, i) => you >= x(b.x0) - 1e-6 && (you < x(b.x1) - 1e-6 || i === rows.length - 1));
  const { median, p10, p90 } = hist ?? {};
  const band = isNum(p10) && isNum(p90);
  const by = ph + 62;
  const nAll = rows.reduce((a, b) => a + b.n, 0);
  const bins = rows;

  const aria = `Histogram of the gap in average stay, MA minus traditional Medicare, across ${fmtNum(nAll)} hospitals, from ${sd(lo)} to ${sd(hi)}${lowOver || highOver ? ', with hospitals beyond that range combined into end bars' : ''}. `
    + (isNum(median) ? `The national median is ${sd(median)}. ` : '')
    + (band ? `The middle 80% of hospitals fall between ${sd(p10)} and ${sd(p90)}. ` : '')
    + (you != null ? `This hospital is at ${sd(value)}.` : 'This hospital has no gap to place.');

  const bars = rows.map((b, i) => {
    const gapPx = b.over ? 0 : 1;
    const r = s('rect', { class: `gs__bar${b.over ? ' gs__bar--over' : ''}${i === ownBin ? ' gs__bar--own' : ''}`, 'data-n': b.n,
      x: px(b.x0) + (b.over === 'high' ? 4 : 0), y: py(b.n), width: Math.max(0, px(b.x1) - px(b.x0) - (b.over ? 4 : gapPx)), height: Math.max(0, r1(ph - y(b.n))) });
    const tip = (e) => tooltip.show(e.clientX, e.clientY, [
      h('b', null, b.label), `${fmtNum(b.n)} ${b.n === 1 ? 'hospital' : 'hospitals'}`]);
    bindTip(r, tip);
    return r;
  });

  const xt = x.ticks(wide ? 10 : 5).filter((v) => v >= lo && v <= hi && !(lowOver && v === lo) && !(highOver && v === hi));
  const overLabels = rows.filter((b) => b.over).map((b) => s('text', { x: r1((x(b.x0) + x(b.x1)) / 2), y: ph + 18, 'text-anchor': 'middle' }, b.over === 'low' ? `≤ ${tickText(lo)}` : `≥ ${tickText(hi)}`));
  const youX = you == null ? 0 : r1(you);
  const youLeft = you != null && youX > pw * 0.62; // label grows leftward near the right edge
  const svg = s('svg', { class: 'gs__svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', focusable: 'false', 'aria-label': aria },
    s('g', { transform: `translate(${M.left},${M.top})` },
      yAxis(y, y.ticks(3), { group: 'gs__yticks', line: 'gs__', w: pw, fmt: fmtNum }),
      s('text', { class: 'gs__axis-title', x: -M.left, y: -32, 'aria-hidden': 'true' },
        isNum(hist?.binWidth) ? `Hospitals per ${+hist.binWidth.toFixed(2)}-day bin` : 'Hospitals'),
      bars,
      dLo < 0 && dHi > 0 && s('line', { class: 'gs__zero', x1: px(0), x2: px(0), y1: 0, y2: ph, 'aria-hidden': 'true' }),
      s('g', { class: 'gs__xticks', 'aria-hidden': 'true' }, xt.map((v) => s('text', { x: px(v), y: ph + 18, 'text-anchor': 'middle' }, tickText(v))), overLabels),
      s('text', { class: 'gs__axis-title', x: pw / 2, y: ph + 38, 'text-anchor': 'middle', 'aria-hidden': 'true' }, wide ? 'Gap in average stay, days (MA minus traditional Medicare)' : 'Gap, days (MA minus traditional)'),
      band && s('g', { class: 'gs__band', 'aria-hidden': 'true' },
        s('path', { d: `M${px(p10)},${by - 4}V${by + 4}M${px(p10)},${by}H${px(p90)}M${px(p90)},${by - 4}V${by + 4}` }),
        isNum(median) && s('path', { class: 'gs__median', d: `M${px(median)},${by - 8}V${by + 8}` }),
        s('text', { x: px((p10 + p90) / 2), y: by + 22, 'text-anchor': 'middle' }, 'Middle 80% of hospitals')),
      you != null && s('g', { class: 'gs__you' },
        s('line', { x1: youX, x2: youX, y1: -8, y2: ph }),
        s('path', { class: 'gs__flag', d: `M${youX - 6},-14L${youX + 6},-14L${youX},-6Z` }),
        s('text', { x: youLeft ? youX - 10 : youX + 10, y: -14, 'text-anchor': youLeft ? 'end' : 'start' }, `This hospital ${sd(value)}`))));

  swapSvg(el, 'gs__svg', svg);
}
