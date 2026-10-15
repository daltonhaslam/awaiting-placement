import { h } from '../dom.js';
import { link } from '../router.js';
import { omnibox } from '../ui/omnibox.js';
import { hospitalIndex } from '../ui/search.js';

// A link that matches nothing: say so plainly, offer the hospital search and a way back.
export function renderNotFound(D, {
  title = 'Page not found',
  lead = 'Nothing on this site matches that link. To find a hospital, search by name, city or CCN.',
} = {}) {
  return h('div', { class: 'wrap view notfound' },
    h('h1', null, title),
    h('p', { class: 'notfound__lead' }, lead),
    omnibox(() => hospitalIndex(D), { label: 'Search for a hospital', placeholder: 'Hospital name, city or CCN' }),
    h('p', { class: 'notfound__links' },
      h('a', { href: link('home') }, 'Back to the start'), h('span', { 'aria-hidden': 'true' }, ' · '),
      h('a', { href: link('methods') }, 'Methods')));
}
