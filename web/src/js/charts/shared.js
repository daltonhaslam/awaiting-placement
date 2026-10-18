import { h, s, responsive } from '../dom.js';
import { isNum } from '../format.js';
import { tooltip } from '../ui/tooltip.js';

// Shared by the charts: width tracking, finite-number guards, axis ticks, pointer wiring and the HTML legend.
export const FALLBACK_W = 640;
const charts = new WeakMap();

// One drawing state per host element; resize redraws with the latest options. `fallback` is the width used until
// the element is laid out (built detached, or no layout at all).
export function mount(el, opts, draw, fallback = FALLBACK_W) {
  let c = charts.get(el);
  if (!c) {
    c = { width: el.clientWidth > 0 ? el.clientWidth : fallback, opts };
    charts.set(el, c);
    responsive(el, (w) => { c.width = w; draw(el, c); });
  }
  c.opts = opts;
  draw(el, c);
  return el.querySelector('svg');
}

export const fin = (x) => (isNum(x) ? x : null);
export const r1 = (x) => +x.toFixed(1);

// Axis domains read from the data, so no chart carries a typed-in range. Finite values only.
// niceMax: the largest value (lineSeries then rounds the axis up to a tick), or undefined when there is none.
export const niceMax = (values) => {
  const v = values.filter(isNum);
  return v.length ? Math.max(...v) : undefined;
};
// axisPad: whole-unit bounds `pad` beyond the data, floored at zero: {yMin, yMax} ({} when there is no data).
export function axisPad(values, pad = 0.5) {
  const v = values.filter(isNum);
  return v.length ? { yMin: Math.max(0, Math.floor(Math.min(...v) - pad)), yMax: Math.ceil(Math.max(...v) + pad) } : {};
}

export const ZIGZAG = (x, y) => `M${x - 4},${y - 5}L${x + 4},${y - 2}L${x - 4},${y + 2}L${x + 4},${y + 5}`;

// Legend of keys that mirror the marks: kind is 'dot', 'line' (dash: true for a dashed stroke), 'marker' (a vertical
// tick) or 'swatch' (a 12 x 10 block, so its viewBox is the block's own); tone is a CSS class suffix.
export function legend(items, label = 'Legend') {
  return h('ul', { class: 'legend', 'aria-label': label },
    items.map((x) => h('li', null,
      s('svg', { class: `key key--${x.kind}`, viewBox: x.kind === 'swatch' ? '6 0 12 10' : '0 0 24 10', 'aria-hidden': 'true', focusable: 'false' },
        x.kind === 'dot' ? s('circle', { class: `key__mark key__mark--${x.tone}`, cx: 12, cy: 5, r: 4.5 })
          : x.kind === 'line' ? s('line', { class: `key__line key__line--${x.tone}${x.dash ? ' key__line--dash' : ''}`, x1: 1, y1: 5, x2: 23, y2: 5 })
            : x.kind === 'marker' ? s('line', { class: 'key__line key__line--marker', x1: 12, y1: 0, x2: 12, y2: 10 })
              : s('rect', { class: `key__mark key__mark--${x.tone}`, x: 6, y: 0, width: 12, height: 10 })),
      x.label)));
}

// The legend's line key, also used inside tooltip rows: a short stroke styled by `cls`.
export const lineKey = (cls) => s('svg', { class: 'linekey', viewBox: '0 0 24 8', 'aria-hidden': 'true', focusable: 'false' },
  s('line', { class: cls, x1: 1, y1: 4, x2: 23, y2: 4 }));

// Pointer wiring for a hover target: move or press shows (fn gets the event); leaving hides the tooltip and runs `onLeave`.
// On touch there is no hover: a tap shows the tooltip and it stays (touch fires pointerleave right after every tap, so
// that event is ignored); a second tap on the same spot, a tap outside the chart, or a scroll closes it. There is one
// shared tooltip, so at most one tapped tooltip is open: touchTip.
let touchTip = null; // { node, x, y, leave } of the tooltip a tap opened
const TAP_SLOP = 24; // px: a tap this close to the last one is "the same spot"
// The closing listeners exist only while a tapped tooltip is open, so nothing is left attached otherwise.
const outside = (e) => { if (touchTip && !touchTip.node.contains(e.target)) closeTouchTip(); };
function closeTouchTip() {
  const t = touchTip;
  touchTip = null;
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('scroll', closeTouchTip);
  t?.leave();
}
function openTouchTip(t) {
  if (!touchTip) {
    // Capture phase, so it runs before a chart's own handler (which may open a new tooltip).
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', closeTouchTip, { passive: true });
  }
  touchTip = t;
}

export function bindTip(node, fn, onLeave) {
  const leave = () => { onLeave?.(); tooltip.hide(); };
  node.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') fn(e); });
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      const t = touchTip;
      if (t?.node === node && Math.hypot(e.clientX - t.x, e.clientY - t.y) < TAP_SLOP) {
        closeTouchTip();
        return;
      }
      openTouchTip({ node, x: e.clientX, y: e.clientY, leave });
    }
    fn(e);
  });
  node.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') leave(); });
}

// Put a freshly drawn chart svg in its host, replacing the previous drawing (`cls` is the svg's class).
export function swapSvg(el, cls, svg) {
  const old = el.querySelector(`svg.${cls}`);
  if (old) old.replaceWith(svg); else el.append(svg);
}

// Left-axis ticks: one group per tick with a grid line across `w` and a right-aligned label. `group` is the
// wrapper's class, `line` the prefix of the `${line}base` / `${line}grid` classes, `base` the tick that gets the base line.
export function yAxis(scale, ticks, { group, line, w, fmt = String, base = 0 }) {
  return s('g', { class: group, 'aria-hidden': 'true' }, ticks.map((t) => s('g', { transform: `translate(0,${r1(scale(t))})` },
    s('line', { class: `${line}${t === base ? 'base' : 'grid'}`, x1: 0, x2: w }),
    s('text', { x: -8, dy: '0.32em', 'text-anchor': 'end' }, fmt(t)))));
}
