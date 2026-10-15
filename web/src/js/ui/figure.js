import { h } from '../dom.js';
import { sourceLinks } from './source.js';

// Figures number themselves in creation order; every render calls resetFigures() first.
let count = 0;
export const resetFigures = () => { count = 0; };

// A report figure: "Fig. N", title, one-line takeaway, the chart, its table twin, and a source line.
// `n` overrides the running number (later figures continue from it). `methods`: the source line also links to the
// methods page, for figures built here (cost-report figures, the calculator) rather than read from one source.
export function figure({ n, title, takeaway, source, chart, table, id, methods = false }) {
  count = n ?? count + 1;
  return h('figure', { class: 'fig', id },
    h('figcaption', { class: 'fig__head' },
      h('span', { class: 'fig__no' }, `Fig. ${count}`),
      h('span', { class: 'fig__title' }, title),
      takeaway ? h('span', { class: 'fig__take' }, takeaway) : null),
    h('div', { class: 'fig__body' }, chart),
    table ?? null,
    source ? h('p', { class: 'fig__src' }, 'Source: ', sourceLinks(source),
      methods ? ['\u00a0· ', h('a', { href: '#methods' }, 'Methods')] : null) : null);
}
