import { h, s } from '../dom.js';
import { scaleLinear } from 'd3-scale';
import { tooltip } from '../ui/tooltip.js';
import { isNum } from '../format.js';
import { mount, bindTip, swapSvg, yAxis, lineKey, r1, ZIGZAG } from './shared.js';

// Lines over fiscal years on one y-axis. Options:
//   x: [2016, ...]; series: [{key, label, tone: 'ma'|'ffs', values: [number|null, ...]}] (values align with x)
//   yLabel: axis title; yMin (default 0): a raised baseline draws a clear axis break and is named in the aria-label
//   yMax, yTicks, fmt (value -> text, default 1 decimal), tickFmt, shade: {xs: [years], label}
const keyFor = (tone) => lineKey(`ls__line ls__line--${tone}`);
const TICK_CH = 0.64 * 12; // px per character of an x label: the mono face (Overpass Mono, 0.616 em) at --fs-chart-tick (12px), with margin
const TICK_GAP = 10; // least clear space between two x labels

export const lineSeries = (el, opts) => mount(el, opts, draw);

const dflt = (v) => (isNum(v) ? v.toFixed(1) : '—');

function draw(el, c) {
  const { x: xs = [], series = [], yLabel = '', yMin = 0, yMax, yTicks = 4, fmt = dflt, tickFmt = fmt, shade } = c.opts;
  const W = Math.max(260, c.width);
  const wide = W >= 560;
  const H = wide ? 300 : 260;
  const M = { top: 34, right: wide ? 168 : 52, bottom: 34, left: 44 };
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;
  const all = series.flatMap((sr) => sr.values).filter(isNum);
  const hi = isNum(yMax) ? yMax : Math.max(yMin + 1, ...all);
  const y = scaleLinear().domain([yMin, hi]).nice(yTicks).range([ph, 0]);
  const lo = y.domain()[0];
  const x = scaleLinear().domain([xs[0] ?? 0, xs.at(-1) > xs[0] ? xs.at(-1) : (xs[0] ?? 0) + 1]).range([0, pw]);
  const px = (v) => r1(x(v));
  const py = (v) => r1(y(v));
  const ticks = y.ticks(yTicks);
  const raised = lo > 0;
  const step = xs.length > 1 ? (xs.at(-1) - xs[0]) / (xs.length - 1) : 1;
  // X labels are chosen by the room between ticks, not the chart's width: "FY2016" where it fits, the bare year where
  // that fits, else every other year (always keeping the last). Each label is centered on its year; the side margins
  // hold half a label.
  const room = pw / Math.max(1, xs.length - 1);
  const fits = (chars) => room >= chars * TICK_CH + TICK_GAP;
  const fyLabels = xs.length < 2 || fits(6);
  const xt = xs.filter((_, i) => fyLabels || fits(4) || (xs.length - 1 - i) % 2 === 0);

  // Lines break at missing points rather than bridging them.
  const path = (vals) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (!isNum(v) || !isNum(xs[i])) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${px(xs[i])},${py(v)}`;
      pen = true;
    });
    return d;
  };

  const sx = (shade?.xs ?? []).filter(isNum);
  const shadeBox = sx.length ? [Math.max(x.domain()[0], Math.min(...sx) - step / 2), Math.min(x.domain()[1], Math.max(...sx) + step / 2)] : null;

  const endY = series.map((sr) => {
    const i = sr.values.findLastIndex(isNum);
    return i < 0 ? null : { sr, i, v: sr.values[i] };
  });
  const ends = endY.filter(Boolean);
  const crowded = ends.length > 1 && Math.min(...ends.slice(1).map((e, k) => Math.abs(py(e.v) - py(ends[k].v)))) < 15;
  const endText = (e) => (wide && !crowded ? `${e.sr.label} ${fmt(e.v)}` : fmt(e.v));

  const aria = `Line chart, ${yLabel || 'values'} by fiscal year ${xs[0]} to ${xs.at(-1)}. `
    + series.map((sr) => {
      const i = sr.values.findLastIndex(isNum);
      const j = sr.values.findIndex(isNum);
      return i < 0 ? `${sr.label}: no data.` : `${sr.label}: ${fmt(sr.values[j])} in ${xs[j]}, ${fmt(sr.values[i])} in ${xs[i]}.`;
    }).join(' ')
    + (shade?.label ? ` Shaded: ${shade.label}.` : '')
    + (raised ? ` The vertical axis starts at ${tickFmt(lo)}, not zero.` : '');

  const hoverDots = series.map((sr) => s('circle', { class: `ls__dot ls__dot--${sr.tone}`, r: 4.5 }));
  const hover = s('g', { class: 'ls__hover', visibility: 'hidden' }, s('line', { class: 'ls__cross', y1: 0, y2: ph }), hoverDots);
  const hit = s('rect', { class: 'ls__hit', x: 0, y: 0, width: Math.max(0, pw), height: ph });

  const svg = s('svg', { class: 'ls__svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', focusable: 'false', 'aria-label': aria },
    s('g', { transform: `translate(${M.left},${M.top})` },
      shadeBox && s('rect', { class: 'ls__shade', x: px(shadeBox[0]), y: 0, width: Math.max(0, px(shadeBox[1]) - px(shadeBox[0])), height: ph, 'aria-hidden': 'true' }),
      shadeBox && s('text', { class: 'ls__shade-label', x: px(shadeBox[0]) + 6, y: 12, 'aria-hidden': 'true' }, shade.label),
      yAxis(y, ticks, { group: 'ls__yticks', line: 'ls__', w: pw, fmt: tickFmt, base: lo }),
      s('text', { class: 'ls__axis-title', x: -M.left, y: -18, 'aria-hidden': 'true' }, raised ? `${yLabel} (axis starts at ${tickFmt(lo)}, not 0)` : yLabel),
      raised && s('g', { class: 'ls__break', 'aria-hidden': 'true' },
        s('rect', { x: -6, y: ph - 7, width: 12, height: 14 }),
        s('path', { d: ZIGZAG(0, ph) })),
      s('g', { class: 'ls__xticks', 'aria-hidden': 'true' }, xt.map((v) => s('text', {
        x: px(v), y: ph + 20, 'text-anchor': 'middle' }, fyLabels ? `FY${v}` : String(v)))),
      series.map((sr) => s('path', { class: `ls__line ls__line--${sr.tone}`, d: path(sr.values) })),
      ends.map((e) => s('circle', { class: `ls__dot ls__dot--${e.sr.tone}`, cx: px(xs[e.i]), cy: py(e.v), r: 4.5 })),
      // End labels carry the name when there is room; when the ends sit too close, the value alone (the legend names them).
      ends.map((e) => s('text', { class: 'ls__end', x: px(xs[e.i]) + 10, y: py(e.v), dy: '0.34em', 'aria-hidden': 'true' }, endText(e))),
      hover, hit));

  // Years are evenly spaced, so the nearest one is found by index. The hit rect's box is read once per hover;
  // a resize redraws everything, so it never goes stale.
  let box = null;
  const show = (e) => {
    if (!xs.length) return;
    box ??= hit.getBoundingClientRect();
    const f = box.width > 0 ? (e.clientX - box.left) / box.width : 0;
    const i = Math.round(Math.min(1, Math.max(0, f)) * (xs.length - 1));
    if (!isNum(xs[i])) return;
    hover.setAttribute('visibility', 'visible');
    hover.setAttribute('transform', `translate(${px(xs[i])},0)`);
    series.forEach((sr, k) => {
      if (isNum(sr.values[i])) { hoverDots[k].setAttribute('cy', py(sr.values[i])); hoverDots[k].removeAttribute('visibility'); } else hoverDots[k].setAttribute('visibility', 'hidden');
    });
    tooltip.show(e.clientX, e.clientY, [
      h('b', null, `FY${xs[i]}${sx.includes(xs[i]) ? ` (${shade.label})` : ''}`),
      ...series.map((sr) => h('span', { class: 'tip__row' }, keyFor(sr.tone), h('strong', null, fmt(sr.values[i])), ` ${sr.label}`)),
    ]);
  };
  bindTip(hit, show, () => { box = null; hover.setAttribute('visibility', 'hidden'); });

  swapSvg(el, 'ls__svg', svg);
}
