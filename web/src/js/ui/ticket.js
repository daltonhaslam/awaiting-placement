import { h } from '../dom.js';
import { panelSub, defaultAria } from './nowServing.js';
import { pad2 } from '../format.js';

// Section header: a take-a-number stub ("No. 01") above the h2, which carries the anchor id.
// `aside`, if given, shares the stub's line (the calculator's "Now serving" notice).
export function ticket(no, title, id, aside = null) {
  const stub = h('p', { class: 'stub' }, h('span', { class: 'stub__no' }, 'No.'), ' ', h('span', { class: 'stub__n' }, pad2(no)));
  return h('header', { class: 'sec__head' },
    aside ? h('div', { class: 'sec__line' }, stub, aside) : stub,
    h('h2', { class: 'sec__title', id }, title));
}

// A ticket-headed story section. `band` makes it a full-bleed wall band (the calculator).
export function section({ no, title, id, band = false, aside = null }, ...children) {
  return h('section', { class: band ? 'sec sec--band' : 'sec', 'aria-labelledby': id },
    h('div', { class: 'wrap' }, ticket(no, title, id, aside), h('div', { class: 'sec__body' }, children)));
}

// The paper "YOUR NUMBER" ticket that sits beside a Now Serving panel. The number is set in the display face.
export function numberTicket({ label, value, sublabel, series, ariaLabel }) {
  return h('div', { class: 'panel tkt', role: 'img', 'aria-label': ariaLabel ?? defaultAria({ label, sublabel })(value) },
    h('div', { class: 'panel__plate tkt__paper' },
      h('span', { class: 'panel__label' }, label),
      h('span', { class: 'tkt__value' }, value)),
    sublabel ? panelSub(sublabel, series) : null);
}
