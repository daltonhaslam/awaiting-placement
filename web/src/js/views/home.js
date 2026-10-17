import { h } from '../dom.js';
import { renderHero } from './hero.js';
import { renderPathway } from './pathway.js';
import { renderGap } from './gap.js';
import { renderShare } from './share.js';
import { renderCalculator } from './calculator.js';
import { renderSides } from './sides.js';

// The story page: hero, then No. 01-05. `route.query` restores the calculator from #calculator?….
// `now` dates the pathway's rule and the timeline board (the reader's date by default); `animate: false` shows the
// hero LED at its number without counting up.
export function renderHome(main, D, route = {}, { now = new Date(), animate = true } = {}) {
  main.append(h('div', { class: 'home' },
    renderHero(D, { animate }),
    renderPathway(D, now),
    renderGap(D),
    renderShare(D),
    renderCalculator(D, { query: route.query }),
    renderSides(D, now)));
  return main;
}
