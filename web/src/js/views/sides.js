import { h } from '../dom.js';
import { section } from '../ui/ticket.js';
import { typedSources, keepIds } from '../ui/source.js';
import { fmtDate } from '../format.js';

// No. 05, "Both sides of the counter": findings grouped by the side that usually cites them, plus what is still open,
// each with its source and the kind of organization behind it. Then the policy timeline, set as a departures board.

const COLUMNS = [
  { key: 'hospitals', title: 'What hospitals point to' },
  { key: 'plans', title: 'What plans point to' },
  { key: 'unsettled', title: 'What the evidence can\'t settle yet' },
];

const items = (list) => (Array.isArray(list) ? list.filter((x) => x?.text) : []);

function column({ key, title }, list) {
  return h('div', { class: 'sides__col' },
    h('h3', { class: 'sides__head', id: `sides-${key}` }, title),
    h('ul', { class: 'sides__list', 'aria-labelledby': `sides-${key}` }, list.map((x) => h('li', { class: 'sides__item' },
      h('p', { class: 'sides__text' }, keepIds(x.text)),
      x.src ? h('p', { class: 'sides__src' }, typedSources(x.src)) : null))));
}

// One row per dated item. A row dated after the reader's day is marked "Upcoming" (ISO strings compare in date order).
function board(list, now) {
  const today = now.toISOString().slice(0, 10);
  return h('div', { class: 'timeline' },
    h('h3', { class: 'timeline__title', id: 'sides-timeline' }, 'Policy timeline'),
    h('p', { class: 'timeline__lead' }, 'Rules, reports and commitments on prior authorization, oldest first.'),
    // The third head labels the sources column of the wide layout (components.css: 1080 px and up); hidden otherwise.
    h('div', { class: 'board__head', 'aria-hidden': 'true' }, h('span', null, 'Date'), h('span', null, 'Rule or report'),
      h('span', { class: 'board__head-src' }, 'Source')),
    h('ol', { class: 'board', 'aria-labelledby': 'sides-timeline' }, list.map((x) => {
      const next = x.date > today;
      return h('li', { class: next ? 'board__row board__row--next' : 'board__row' },
        h('p', { class: 'board__when' },
          h('time', { class: 'board__date', datetime: x.date }, fmtDate(x.date)),
          next ? [' ', h('span', { class: 'board__status' }, 'Upcoming')] : null),
        h('div', { class: 'board__item' },
          h('p', { class: 'board__title' }, keepIds(x.title)),
          x.body ? h('p', { class: 'board__body' }, keepIds(x.body)) : null,
          x.src ? h('p', { class: 'board__src' }, typedSources(x.src)) : null));
    })));
}

// `now` is the reader's date (injectable for tests).
export function renderSides(D, now = new Date()) {
  const sides = D.content?.sides ?? {};
  const cols = COLUMNS.map((c) => [c, items(sides[c.key])]).filter(([, list]) => list.length);
  const timeline = (Array.isArray(D.content?.timeline) ? D.content.timeline : [])
    .filter((x) => x?.title && typeof x.date === 'string')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return section({ no: 5, title: 'Both sides of the counter', id: 'sides' },
    h('p', null, 'Hospitals point to prior authorization as a cause of discharge delays. Medicare Advantage (MA) plans told MedPAC '
      + 'that it helps ensure beneficiaries get to the right level of care. Each column groups findings by the side that usually cites them, '
      + 'and every item names its source and the type of organization behind it.'),
    cols.length ? h('div', { class: 'sides' }, cols.map(([c, list]) => column(c, list))) : null,
    timeline.length ? board(timeline, now) : null,
    !cols.length && !timeline.length ? h('p', { class: 'note-src' }, 'The cited material for this section is not in this build.') : null);
}
