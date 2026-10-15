import { h } from '../dom.js';
import { isNum, pad2 } from '../format.js';
import { update, reducedMotion, ledDigits } from './nowServing.js';
import { CALLED_MS } from '../timing.js';

// The page is the waiting room. The hero shows NOW SERVING (traditional Medicare's average days before inpatient
// rehab) beside the reader's ticket, YOUR NUMBER (Medicare Advantage's). Once the hero display has scrolled away, a
// small copy in the top bar steps toward the reader's number as they read on, and the calculator calls it.

// The number on the board at progress p (0 to 1): one step for each 1/(to - from) of the way, `to` only at p >= 1.
export function servingAt(p, from, to) {
  if (p >= 1) return to;
  if (!(p > 0)) return from; // also NaN
  return from + Math.floor(p * (to - from));
}

// { from, to }: the hero's two numbers, rounded as the hero shows them. Null turns the feature off.
export function queueNumbers(D) {
  const irf = D?.content?.medpac?.t41?.rows?.find((r) => r.dest === 'irf');
  if (!isNum(irf?.ffsLos) || !isNum(irf?.maLos)) return null;
  const from = Math.round(irf.ffsLos);
  const to = Math.round(irf.maLos);
  return to > from ? { from, to } : null;
}

// The top-bar unit: a small LED and a paper ticket. Decorative (the hero carries the numbers in text), so aria-hidden.
// setProgress(p) shows servingAt(p) and returns it; under reduced motion it holds the static pair.
export function queue(D) {
  const n = queueNumbers(D);
  if (!n) return null;
  const led = h('span', { class: 'queue__led led__plate' },
    h('span', { class: 'queue__label' }, 'Now serving'), ' ',
    h('span', { class: 'led__screen' }, ledDigits(pad2(n.from))));
  const el = h('div', { class: 'queue', 'aria-hidden': 'true' }, led, ' ',
    h('span', { class: 'queue__tkt' }, h('span', { class: 'queue__label' }, 'Your no.'), ' ',
      h('span', { class: 'queue__n' }, pad2(n.to))));
  let shown = n.from;
  return {
    el,
    ...n,
    setProgress(p) {
      const next = reducedMotion() ? n.from : servingAt(p, n.from, n.to);
      if (next !== shown) update(led, pad2(next), { ms: 360 });
      shown = next;
      return next;
    },
  };
}

// The calculator header's one-line notice, hidden until bindQueue calls the number.
export function calledNotice(D) {
  const n = queueNumbers(D);
  return n ? h('p', { class: 'called' }, `Now serving ${pad2(n.to)}. Please proceed.`) : null;
}

let called = false; // once per page view, across re-renders of the story page

// Bind the counter to the story page in `root`, showing it in the top-bar `slot`. Returns the unbind function.
// Positions are measured once and again on any resize of the page or the top bar. A scroll frame reads scrollY and
// checks two marks against the last measurement: a layout shift (a font swap, a chart redraw) moves the page under the
// reader, and the browser's scroll anchoring fires a scroll event before the ResizeObserver callback can re-measure.
// Painting that event against the old marks would read the shift as the reader scrolling back up and count as waiting.
export function bindQueue(D, { slot, root }) {
  const q = queue(D);
  const panels = root.querySelector('.hero__panels'); // the hero's LED and ticket (stacked on phones)
  const hero = panels?.closest('.hero');
  const calc = root.querySelector('#calculator')?.closest('section');
  const notice = root.querySelector('.called');
  const bar = slot.parentElement;
  if (!q || !hero || !calc) return () => {};

  slot.append(q.el);
  let at = null; // document y of each mark, less the top bar where a mark is "reached" at the bar's lower edge
  const measure = () => {
    const y = window.scrollY || 0;
    const barH = bar.getBoundingClientRect().height;
    const docY = (el, edge) => el.getBoundingClientRect()[edge] + y;
    at = {
      barH,
      calcTop: docY(calc, 'top'),
      shown: docY(panels, 'bottom') - barH, // the hero's pair has gone under the bar: show the small copy
      start: docY(hero, 'bottom') - barH, // p = 0: the hero has scrolled away
      end: Math.floor(docY(calc, 'top') - barH), // p = 1: the calculator band reaches the bar (whole px: scrollY may stop short)
      notice: notice ? docY(notice, 'top') : null,
    };
  };

  // True when the layout has moved since measure(): the calculator band or the bar is not where it was.
  const stale = () => calc.getBoundingClientRect().top + (window.scrollY || 0) !== at.calcTop
    || bar.getBoundingClientRect().height !== at.barH;

  let frame = 0;
  let queued = false;
  let waited = false; // the counter has shown a number below the reader's since binding
  let timer = 0;
  const call = () => {
    called = true;
    notice.classList.add('is-on');
    timer = setTimeout(() => notice.classList.remove('is-on'), CALLED_MS);
  };
  const paint = () => {
    queued = false;
    if (stale()) measure();
    const y = window.scrollY || 0;
    const on = y > at.shown;
    q.el.classList.toggle('is-on', on);
    const now = q.setProgress((y - at.start) / (at.end - at.start));
    if (now < q.to) waited = true;
    // The notice answers the top-bar counter, so it is only called while that counter is on screen.
    else if (on && waited && !called && notice && y + at.barH <= at.notice && at.notice <= y + window.innerHeight) call();
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    frame = requestAnimationFrame(paint);
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); onScroll(); }) : null;
  ro?.observe(root);
  ro?.observe(bar);
  window.addEventListener('scroll', onScroll, { passive: true });
  measure();
  paint();

  return () => {
    window.removeEventListener('scroll', onScroll);
    ro?.disconnect();
    if (queued) cancelAnimationFrame(frame);
    clearTimeout(timer);
    notice?.classList.remove('is-on');
    q.el.remove();
  };
}
