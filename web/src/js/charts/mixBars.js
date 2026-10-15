import { h, s } from '../dom.js';
import { tooltip } from '../ui/tooltip.js';
import { fmtPct } from '../format.js';
import { mount, fin, r1, bindTip, swapSvg } from './shared.js';

// Where patients went after the hospital: two 100% bars, traditional Medicare over MA. The ordered destinations
// (none, home health, skilled nursing, rehab or long-term care hospital) use one ink ramp, so color never competes
// with the teal/amber identity of the two rows. Values inside a segment only when they fit; else the tooltip and table carry them.
export const MIX_KEYS = [
  { key: 'none', label: 'No post-acute care', tone: 'none' },
  { key: 'hha', label: 'Home health', tone: 'hha' },
  { key: 'snf', label: 'Skilled nursing', tone: 'snf' },
  { key: 'irfLtch', label: 'Rehab or long-term care hospital', tone: 'irf' },
];
const ROWS = [
  { id: 'ffs', label: 'Traditional Medicare' },
  { id: 'ma', label: 'Medicare Advantage' },
];
const GAP = 2;

export const mixBars = (el, mix) => mount(el, mix, draw);

function draw(el, c) {
  const mix = c.opts || {};
  const W = Math.max(260, c.width);
  const wide = W >= 560;
  const barH = 24;
  const rowH = wide ? 52 : 64;
  const M = { top: 6, right: 4, bottom: 6, left: wide ? 168 : 0 };
  const pw = W - M.left - M.right;
  const H = M.top + ROWS.length * rowH + M.bottom;

  const aria = 'Stacked bars of where patients went after the hospital. '
    + ROWS.map((r) => `${r.label}: ${MIX_KEYS.map((k) => `${fmtPct(fin(mix[r.id]?.[k.key]) ?? NaN)} ${k.label.toLowerCase()}`).join(', ')}.`).join(' ');

  const g = s('g', { transform: `translate(${M.left},${M.top})` });
  ROWS.forEach((r, i) => {
    const vals = MIX_KEYS.map((k) => Math.max(0, fin(mix[r.id]?.[k.key]) ?? 0));
    const total = vals.reduce((a, b) => a + b, 0);
    const y = wide ? (rowH - barH) / 2 : 26;
    const bar = s('g', { class: 'mix__bar', transform: `translate(0,${i * rowH})` });
    // Row label: a color key dot (the row's series color) and the name.
    bar.append(
      s('circle', { class: `mix__id mix__id--${r.id}`, cx: wide ? -M.left + 5 : 5, cy: wide ? rowH / 2 : 10, r: 5, 'aria-hidden': 'true' }),
      s('text', { class: 'mix__name', x: wide ? -M.left + 18 : 18, y: wide ? rowH / 2 : 10, dy: '0.34em', 'aria-hidden': 'true' }, r.label),
      s('rect', { class: 'mix__track', x: 0, y, width: r1(pw), height: barH }));
    let acc = 0;
    MIX_KEYS.forEach((k, j) => {
      if (!(total > 0) || !(vals[j] > 0)) return;
      const x0 = acc / total * pw;
      const x1 = (acc + vals[j]) / total * pw;
      acc += vals[j];
      const w = x1 - x0;
      const seg = s('rect', { class: `mix__seg mix__seg--${k.tone}`, x: r1(x0), y, width: r1(w), height: barH });
      const shown = fmtPct(vals[j]);
      const fits = w >= shown.length * 8 + 14;
      const tip = (e) => tooltip.show(e.clientX, e.clientY, [
        h('b', null, r.label),
        h('span', { class: 'tip__row' }, h('strong', null, shown), ` ${k.label.toLowerCase()}`)]);
      bindTip(seg, tip);
      bar.append(seg);
      if (fits) bar.append(s('text', { class: `mix__val mix__val--${k.tone}`, x: r1((x0 + x1) / 2), y: y + barH / 2, dy: '0.34em', 'text-anchor': 'middle', 'aria-hidden': 'true', 'pointer-events': 'none' }, shown));
    });
    g.append(bar);
  });

  const svg = s('svg', { class: 'mix__svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', focusable: 'false', 'aria-label': aria }, g);
  swapSvg(el, 'mix__svg', svg);
}
