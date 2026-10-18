import { h, s } from '../dom.js';
import { scaleLinear } from 'd3-scale';
import { tooltip } from '../ui/tooltip.js';
import { fmtBeds, fmtPct } from '../format.js';
import { mount, bindTip, swapSvg, yAxis, legend, lineKey, fin, r1 } from './shared.js';

// Beds held as the MA share runs from 0 to 100%: "Today" (--ma, solid) and "With faster decisions" (--ma, dashed),
// one y-axis from zero, a marker at the current share, a crosshair that snaps to the nearest computed share.
// points: [{ma, beds, bedsFaster}] (model.curve, evenly spaced from 0 to 1); current: {beds, bedsFaster} at `ma`.
// Calls that only move the current share (same points, same width) update the marker and its dots in place;
// new points or a new width redraw the lines.
export const SERIES = [
  { key: 'beds', label: 'Today', cls: 'curve__line' },
  { key: 'bedsFaster', label: 'With faster decisions', cls: 'curve__line curve__line--faster' },
];
const num = (x) => fin(x) ?? 0;
const tickText = (t) => (Number.isInteger(t) ? String(t) : t.toFixed(1));
const sigOf = (points) => points.map((p) => `${p.ma},${num(p.beds).toFixed(4)},${num(p.bedsFaster).toFixed(4)}`).join(';');

export const maCurve = (el, opts) => mount(el, opts, draw);

// The legend mirrors the marks: a short solid or dashed stroke per series, and the marker.
export const curveLegend = () => legend([
  { kind: 'line', tone: 'ma', label: SERIES[0].label },
  { kind: 'line', tone: 'ma', dash: true, label: SERIES[1].label },
  { kind: 'marker', label: 'Current share' },
]);

const ariaFor = (points, current, share) => {
  const last = points[points.length - 1];
  return `Line chart of beds held at MA shares from 0 to 100%. At 100%: ${fmtBeds(num(last?.beds))} beds today, `
    + `${fmtBeds(num(last?.bedsFaster))} with faster decisions. Current share ${fmtPct(share)}: ${fmtBeds(num(current.beds))} beds today, `
    + `${fmtBeds(num(current.bedsFaster))} with faster decisions.`;
};
const anchorFor = (share) => (share > 0.8 ? 'end' : share < 0.2 ? 'start' : 'middle');

function draw(el, c) {
  const { points = [], current = {}, ma = 0 } = c.opts;
  const W = Math.max(260, c.width);
  const share = Math.min(1, Math.max(0, num(ma)));
  const d = c.drawn;
  if (d && d.W === W && (d.points === points || d.sig === sigOf(points))) {
    d.points = points;
    moveMarker(d, current, share);
    return;
  }
  c.drawn = build(el, points, current, share, W);
}

// Current-share marker, its label and its two dots; nothing else moves.
function moveMarker(d, current, share) {
  const x = d.px(share);
  d.marker.setAttribute('x1', x);
  d.marker.setAttribute('x2', x);
  d.label.setAttribute('x', x);
  d.label.setAttribute('text-anchor', anchorFor(share));
  d.label.textContent = `Current share ${fmtPct(share)}`;
  SERIES.forEach((sr) => {
    d.dots[sr.key].setAttribute('cx', x);
    d.dots[sr.key].setAttribute('cy', d.py(current[sr.key]));
  });
  d.svg.setAttribute('aria-label', ariaFor(d.points, current, share));
}

function build(el, points, current, share, W) {
  const wide = W >= 560;
  const H = wide ? 270 : 230;
  const M = { top: 46, right: wide ? 168 : 14, bottom: 46, left: 40 };
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const top = Math.max(0, ...points.map((p) => Math.max(num(p.beds), num(p.bedsFaster))));
  const x = scaleLinear().domain([0, 1]).range([0, pw]);
  const y = scaleLinear().domain([0, top > 0 ? top : 1]).nice(4).range([ph, 0]);
  const px = (v) => r1(x(num(v)));
  const py = (v) => r1(y(num(v)));
  const path = (k) => points.map((p, i) => `${i ? 'L' : 'M'}${px(p.ma)},${py(p[k])}`).join('');
  const last = points[points.length - 1];

  const hoverDots = SERIES.map((sr) => s('circle', { class: `curve__dot curve__dot--${sr.key}`, r: 4.5 }));
  const hover = s('g', { class: 'curve__hover', visibility: 'hidden' }, s('line', { class: 'curve__cross', y1: 0, y2: ph }), hoverDots);
  const hit = s('rect', { class: 'curve__hit', x: 0, y: 0, width: Math.max(0, pw), height: ph });

  // End labels ride the lines on wide screens, unless the two ends sit too close to read apart.
  const ends = wide && last ? SERIES.filter((sr, i) => i === 0 || Math.abs(py(last.beds) - py(last.bedsFaster)) >= 14) : [];

  const marker = s('line', { class: 'curve__marker', x1: px(share), x2: px(share), y1: -6, y2: ph });
  const label = s('text', { class: 'curve__marker-label', x: px(share), y: -12, 'aria-hidden': 'true' });
  // Faster first, so the solid "Today" line draws over it where they meet.
  const dots = Object.fromEntries([...SERIES].reverse().map((sr) => [sr.key,
    s('circle', { class: `curve__dot curve__dot--${sr.key}`, r: 4.5 })]));
  const svg = s('svg', { class: 'curve__svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', focusable: 'false' },
    s('g', { transform: `translate(${M.left},${M.top})` },
      yAxis(y, y.ticks(4), { group: 'curve__ytick', line: 'curve__', w: pw, fmt: tickText }),
      s('text', { class: 'curve__axis-title', x: -M.left, y: -32, 'aria-hidden': 'true' }, 'Beds held, average day'),
      s('g', { class: 'curve__xtick', 'aria-hidden': 'true' }, [0, 0.25, 0.5, 0.75, 1].map((t) => s('text', {
        x: px(t), y: ph + 18, 'text-anchor': t === 0 ? 'start' : t === 1 ? 'end' : 'middle' }, fmtPct(t)))),
      s('text', { class: 'curve__axis-title', x: pw, y: ph + 40, 'text-anchor': 'end', 'aria-hidden': 'true' },
        'Share of Medicare patients in MA plans'),
      marker, label,
      [...SERIES].reverse().map((sr) => s('path', { class: sr.cls, d: path(sr.key) })),
      Object.values(dots),
      ends.map((sr) => s('text', { class: 'curve__end', x: pw + 10, y: py(last[sr.key]), dy: '0.32em', 'aria-hidden': 'true' }, sr.label)),
      hover, hit));

  // Crosshair: snap to the nearest computed share (the points are evenly spaced) and list both series there.
  // The hit rect's box is read once per hover; a resize redraws everything, so it never goes stale.
  let box = null;
  const show = (e) => {
    if (!points.length) return;
    box ??= hit.getBoundingClientRect();
    const f = box.width > 0 ? (e.clientX - box.left) / box.width : 0;
    const p = points[Math.round(Math.min(1, Math.max(0, f)) * (points.length - 1))];
    hover.setAttribute('visibility', 'visible');
    hover.setAttribute('transform', `translate(${px(p.ma)},0)`);
    SERIES.forEach((sr, k) => hoverDots[k].setAttribute('cy', py(p[sr.key])));
    tooltip.show(e.clientX, e.clientY, [
      h('b', null, `MA share ${fmtPct(p.ma)}`),
      ...SERIES.map((sr) => h('span', { class: 'tip__row' }, lineKey(sr.cls), h('strong', null, `${fmtBeds(num(p[sr.key]))} beds`), ` ${sr.label}`)),
    ]);
  };
  bindTip(hit, show, () => { box = null; hover.setAttribute('visibility', 'hidden'); }, { drag: true });

  swapSvg(el, 'curve__svg', svg);
  const d = { W, points, sig: sigOf(points), svg, marker, label, dots, px, py };
  moveMarker(d, current, share);
  return d;
}
