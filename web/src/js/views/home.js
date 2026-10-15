import { h } from '../dom.js';
import { renderHero } from './hero.js';
import { renderPathway } from './pathway.js';
import { renderGap } from './gap.js';
import { renderShare } from './share.js';
import { renderCalculator } from './calculator.js';
import { renderSides } from './sides.js';

// The story page: hero, then No. 01-05. `route.query` restores the calculator from #calculator?….
export function renderHome(main, D, route = {}) {
  main.append(h('div', { class: 'home' },
    renderHero(D),
    renderPathway(D),
    renderGap(D),
    renderShare(D),
    renderCalculator(D, { query: route.query }),
    renderSides(D)));
  return main;
}
