import { h, s } from '../dom.js';
import { PICTO, ARROW } from './pictograms.js';

export const DEST_LABEL = { home: 'Home', hha: 'Home health', snf: 'Skilled nursing', irf: 'Inpatient rehab', ltch: 'Long-term care hospital' };
const TURN = { right: 0, down: 90, left: 180, up: 270 };

// A bare pictogram (decorative: the label beside it carries the meaning).
export const picto = (dest, cls = 'picto') => s('svg', { class: cls, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
  s('path', { d: PICTO[dest] }));

// A wayfinding plate: pictogram, label, optional direction arrow. opts: {arrow: 'right'|'left'|'up'|'down', compact, label}
export function sign(dest, { arrow, compact = false, label } = {}) {
  if (!Object.hasOwn(DEST_LABEL, dest)) throw new Error(`sign: unknown destination "${dest}"`);
  return h('div', { class: compact ? 'sign sign--compact' : 'sign' },
    picto(dest, 'sign__picto'),
    h('span', { class: 'sign__label' }, label ?? DEST_LABEL[dest]),
    arrow ? s('svg', { class: 'sign__arrow', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: ARROW, transform: TURN[arrow] ? `rotate(${TURN[arrow]} 12 12)` : null })) : null);
}
