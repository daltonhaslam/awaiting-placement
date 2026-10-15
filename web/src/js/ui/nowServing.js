import { h } from '../dom.js';
import { isNum, ledGlyphs } from '../format.js';

// The "Now Serving" LED panel: dot-matrix digits (Doto) on a dark plate. Red lives here and nowhere else.
const ariaFor = new WeakMap(); // panel -> (value) => aria-label
const frames = new WeakMap(); // panel -> pending animation frame

// Caption under a panel, with an optional series key (ffs | ma) so the color is never the only cue.
export function panelSub(text, series) {
  return h('p', { class: 'panel__sub' }, series ? h('span', { class: `key key--${series}`, 'aria-hidden': 'true' }) : null,
    h('span', null, text));
}

// The spoken form of a panel or ticket: "LABEL value. Sublabel", as a function of the value.
export const defaultAria = ({ label, sublabel }) => (v) => `${label} ${v}${sublabel ? `. ${sublabel}` : ''}`;

// The LED's digits: the number in data-value, Doto glyphs on screen (see ledGlyphs).
const setDigits = (el, v) => {
  el.setAttribute('data-value', v);
  el.textContent = ledGlyphs(v);
  return el;
};
export const ledDigits = (value) => setDigits(h('span', { class: 'led__digits' }), value);

// ariaLabel: a string, or a function of the value when update() will change it.
export function nowServing({ label, value, sublabel, ariaLabel, series }) {
  const aria = typeof ariaLabel === 'function' ? ariaLabel
    : ariaLabel != null ? () => ariaLabel : defaultAria({ label, sublabel });
  const el = h('div', { class: 'panel led', role: 'img', 'aria-label': aria(value) },
    h('div', { class: 'panel__plate led__plate' },
      h('span', { class: 'panel__label' }, label),
      h('span', { class: 'led__screen' }, ledDigits(value))),
    sublabel ? panelSub(sublabel, series) : null);
  ariaFor.set(el, aria);
  return el;
}

export const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const still = () => typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function'
  || typeof window.matchMedia !== 'function' || reducedMotion();

// Show `value` (a string such as "07" or "2.7"). Numeric values count from the shown number, or opts.from,
// keeping the target's decimals and zero padding; anything else, or reduced motion, is set at once.
export function update(el, value, { from, ms = 450 } = {}) {
  const digits = el.querySelector('.led__digits');
  const aria = ariaFor.get(el);
  if (aria) el.setAttribute('aria-label', aria(value));
  if (frames.has(el)) window.cancelAnimationFrame(frames.get(el));
  frames.delete(el);
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value);
  const start = Number(from ?? digits.getAttribute('data-value'));
  const end = Number(value);
  if (!m || !isNum(start) || start === end || still()) {
    setDigits(digits, value);
    return;
  }
  const dp = m[2]?.length ?? 0;
  const show = (x) => x.toFixed(dp).padStart(value.length, '0');
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    setDigits(digits, t < 1 ? show(start + (end - start) * (1 - (1 - t) ** 3)) : value);
    if (t < 1) frames.set(el, window.requestAnimationFrame(step));
    else frames.delete(el);
  };
  setDigits(digits, show(start));
  frames.set(el, window.requestAnimationFrame(step));
}
