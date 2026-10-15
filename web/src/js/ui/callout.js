import { h } from '../dom.js';

// A boxed note with a short list: items are strings or elements (e.g. text plus a source link).
export function callout({ title, items }) {
  return h('aside', { class: 'callout' },
    h('h3', { class: 'callout__title' }, title),
    h('ul', { class: 'callout__list' }, items.map((x) => h('li', null, x))));
}
