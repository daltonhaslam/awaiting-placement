// The "Now serving" scroll counter: the pure step function, the top-bar unit, the calculator's notice, and the
// scroll binding driven through a stubbed layout (linkedom has none).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const dom = parseHTML('<!doctype html><html><head></head><body>'
  + '<header class="topbar" id="topbar"><span id="queue-slot"></span><span id="theme-slot"></span></header>'
  + '<main id="main"></main></body></html>');
const observers = []; // every ResizeObserver callback, so a test can fire one after a layout change
Object.assign(globalThis, {
  window: dom.window, document: dom.document, Node: dom.Node, HTMLElement: dom.HTMLElement,
  requestAnimationFrame: (f) => { f(0); return 1; }, cancelAnimationFrame: () => {},
  ResizeObserver: class { constructor(cb) { observers.push(cb); } observe() {} disconnect() {} },
});

const { loadData } = await import('../src/js/data.js');
const { servingAt, queueNumbers, queue, calledNotice, bindQueue } = await import('../src/js/ui/queue.js');
const { renderCalculator } = await import('../src/js/views/calculator.js');
const { renderHome } = await import('../src/js/views/home.js');

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ap.min.json', import.meta.url), 'utf8'));
const withContent = (content) => loadData({ ...structuredClone(fixture), content });
const D = withContent(fixture.content);
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const digits = (q) => q.el.querySelector('.led__digits').getAttribute('data-value');
const withIrf = (patch) => {
  const c = structuredClone(fixture.content);
  Object.assign(c.medpac.t41.rows.find((r) => r.dest === 'irf'), patch);
  return withContent(c);
};
// Emulate prefers-reduced-motion for the duration of fn.
const reduced = (fn) => {
  const had = Object.hasOwn(dom.window, 'matchMedia');
  const prev = dom.window.matchMedia;
  dom.window.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q });
  try { return fn(); } finally { if (had) dom.window.matchMedia = prev; else delete dom.window.matchMedia; }
};

test('servingAt: steps from `from` once per third, reaching `to` only at p >= 1', () => {
  assert.equal(servingAt(0, 7, 10), 7);
  assert.equal(servingAt(0.2, 7, 10), 7);
  assert.equal(servingAt(1 / 3, 7, 10), 8);
  assert.equal(servingAt(0.34, 7, 10), 8);
  assert.equal(servingAt(0.67, 7, 10), 9);
  assert.equal(servingAt(0.99, 7, 10), 9);
  assert.equal(servingAt(0.999999, 7, 10), 9);
  assert.equal(servingAt(1, 7, 10), 10);
});

test('servingAt: out-of-range and non-finite progress clamps', () => {
  assert.equal(servingAt(-0.5, 7, 10), 7);
  assert.equal(servingAt(-Infinity, 7, 10), 7);
  assert.equal(servingAt(NaN, 7, 10), 7);
  assert.equal(servingAt(1.7, 7, 10), 10);
  assert.equal(servingAt(Infinity, 7, 10), 10);
  assert.equal(servingAt(0.5, 3, 9), 6); // any span, one step per 1/(to - from)
});

test('queueNumbers: rounded IRF days from the data, never literals', () => {
  assert.deepEqual(queueNumbers(D), { from: 7, to: 10 });
  assert.deepEqual(queueNumbers(withIrf({ ffsLos: 6.2, maLos: 11.6 })), { from: 6, to: 12 });
});

test('queueNumbers: off without content, an IRF row, finite days, or a longer MA wait', () => {
  assert.equal(queueNumbers(withContent(null)), null);
  assert.equal(queueNumbers(null), null);
  const c = structuredClone(fixture.content);
  c.medpac.t41.rows = c.medpac.t41.rows.filter((r) => r.dest !== 'irf');
  assert.equal(queueNumbers(withContent(c)), null);
  assert.equal(queueNumbers(withIrf({ maLos: 'n/a' })), null);
  assert.equal(queueNumbers(withIrf({ maLos: 7.2 })), null); // rounds to the same number: nothing to wait for
  assert.equal(queueNumbers(withIrf({ maLos: 5.0 })), null);
});

test('queue: null when content is absent', () => {
  assert.equal(queue(withContent(null)), null);
  assert.equal(queue(withIrf({ ffsLos: null })), null);
});

test('queue: a decorative LED and ticket reading NOW SERVING 07 · YOUR NO. 10', () => {
  const q = queue(D);
  assert.equal(q.el.getAttribute('aria-hidden'), 'true');
  // On screen the Doto LED shows O for 0 (its zero is slashed); the ticket (Big Shoulders Display) keeps the digit.
  assert.equal(text(q.el), 'Now serving O7 Your no. 10');
  assert.equal(digits(q), '07');
  assert.equal(q.el.querySelector('.queue__n').textContent, '10');
  assert.equal(q.el.querySelector('[role], [aria-live], [tabindex], a, button'), null, 'nothing for assistive tech to reach');
  const q2 = queue(withIrf({ ffsLos: 6.2, maLos: 11.6 }));
  assert.equal(text(q2.el), 'Now serving O6 Your no. 12');
});

test('queue.setProgress: steps up toward the calculator and back down', () => {
  const q = queue(D);
  assert.equal(q.setProgress(0), 7);
  assert.equal(digits(q), '07');
  assert.equal(q.setProgress(0.34), 8);
  assert.equal(digits(q), '08');
  assert.equal(q.setProgress(0.99), 9);
  assert.equal(digits(q), '09');
  assert.equal(q.setProgress(1), 10);
  assert.equal(digits(q), '10');
  assert.equal(q.setProgress(0.5), 8);
  assert.equal(digits(q), '08');
  assert.equal(q.setProgress(-3), 7);
  assert.equal(digits(q), '07');
});

test('queue.setProgress: reduced motion keeps the static pair 07 · 10', () => {
  reduced(() => {
    const q = queue(D);
    assert.equal(q.setProgress(0.5), 7);
    assert.equal(q.setProgress(1), 7);
    assert.equal(digits(q), '07');
    assert.equal(text(q.el), 'Now serving O7 Your no. 10');
  });
});

test('calledNotice: one quiet line from the data, absent without content', () => {
  const el = calledNotice(D);
  assert.equal(el.textContent, 'Now serving 10. Please proceed.');
  assert.ok(!el.classList.contains('is-on'), 'hidden until called');
  assert.equal(el.getAttribute('aria-live'), null, 'not announced');
  assert.equal(calledNotice(withIrf({ ffsLos: 6.2, maLos: 11.6 })).textContent, 'Now serving 12. Please proceed.');
  assert.equal(calledNotice(withContent(null)), null);
});

test('calculator header: the notice sits beside the No. 04 stub; none without content', () => {
  const el = renderCalculator(D, { query: '' });
  const head = el.querySelector('.sec__head');
  const notice = head.querySelector('.called');
  assert.ok(notice, 'notice in the header');
  assert.ok(head.querySelector('.sec__line .stub') && notice.parentElement === head.querySelector('.sec__line'), 'same line as the stub');
  assert.equal(head.querySelector('h2').id, 'calculator');
  assert.ok(el.querySelector('.calc__led'), 'the readout LED is untouched');
  const bare = renderCalculator(withContent(null), { query: '' });
  assert.equal(bare.querySelector('.called'), null);
  assert.equal(bare.querySelector('.sec__line'), null, 'plain stub header');
  assert.match(text(bare.querySelector('.sec__head')), /No\. 04/);
});

// ---------- the scroll binding, on a stubbed layout ----------
// Document y positions (scrollY = 0) for the pieces the binding measures. The top bar is 52 px tall.
const LAYOUT = { bar: 52, panels: [180, 420], hero: [0, 700], calc: [3052, 4600], called: [3170, 3200] };
const H = 900;
function mountHome(data) {
  const main = document.getElementById('main');
  main.replaceChildren();
  renderHome(main, data);
  let y = 0;
  let shift = 0; // a layout shift: everything measured moves by this many px
  Object.defineProperty(dom.window, 'scrollY', { configurable: true, get: () => y });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, get: () => H });
  const rect = (el, [top, bottom]) => {
    if (el) el.getBoundingClientRect = () => ({ top: top + shift - y, bottom: bottom + shift - y, height: bottom - top, left: 0, right: 0, width: 0 });
  };
  rect(document.getElementById('topbar'), [y, LAYOUT.bar]);
  document.getElementById('topbar').getBoundingClientRect = () => ({ top: 0, bottom: LAYOUT.bar, height: LAYOUT.bar });
  rect(main.querySelector('.hero__panels'), LAYOUT.panels);
  rect(main.querySelector('.hero'), LAYOUT.hero);
  rect(document.getElementById('calculator')?.closest('section'), LAYOUT.calc);
  rect(main.querySelector('.called'), LAYOUT.called);
  const scroll = (to) => { y = to; dom.window.dispatchEvent(new dom.window.Event('scroll')); };
  const relayout = (dy) => { shift = dy; };
  return { main, scroll, relayout };
}
const slot = () => document.getElementById('queue-slot');
const shown = () => slot().querySelector('.queue');
// Count live scroll listeners on window.
const listeners = new Set();
const add = dom.window.addEventListener.bind(dom.window);
const remove = dom.window.removeEventListener.bind(dom.window);
dom.window.addEventListener = (type, fn, opts) => { if (type === 'scroll') listeners.add(fn); return add(type, fn, opts); };
dom.window.removeEventListener = (type, fn, opts) => { if (type === 'scroll') listeners.delete(fn); return remove(type, fn, opts); };

test('bindQueue: without content the feature is off and nothing is attached', () => {
  const { main } = mountHome(withContent(null));
  const unbind = bindQueue(withContent(null), { slot: slot(), root: main });
  assert.equal(typeof unbind, 'function');
  assert.equal(slot().children.length, 0);
  assert.equal(listeners.size, 0);
  unbind();
});

test('bindQueue: appears once the hero panels are under the top bar, steps by thirds, calls the number once', () => {
  const { main, scroll } = mountHome(D);
  const unbind = bindQueue(D, { slot: slot(), root: main });
  const q = shown();
  const notice = main.querySelector('.called');
  const read = () => q.querySelector('.led__digits').getAttribute('data-value');
  assert.equal(listeners.size, 1, 'one scroll listener');
  assert.ok(!q.classList.contains('is-on'), 'hidden while the hero panels are in view');
  scroll(LAYOUT.panels[1] - LAYOUT.bar);
  assert.ok(!q.classList.contains('is-on'), 'still hidden with the panels just touching the bar');
  scroll(LAYOUT.panels[1] - LAYOUT.bar + 1);
  assert.ok(q.classList.contains('is-on'), 'shown once the hero panels are under the top bar');
  assert.equal(read(), '07');
  // Progress runs from the end of the hero (y 648) to the top of the calculator (y 3000), both under a 52 px bar.
  const at = (p) => Math.round(648 + p * (3000 - 648));
  scroll(at(0.34));
  assert.equal(read(), '08');
  scroll(at(0.7));
  assert.equal(read(), '09');
  assert.ok(!notice.classList.contains('is-on'));
  scroll(at(1));
  assert.equal(read(), '10');
  assert.ok(notice.classList.contains('is-on'), 'number called at the calculator');
  scroll(at(0.5));
  assert.equal(read(), '08', 'steps back down');
  scroll(at(1));
  scroll(LAYOUT.hero[0]);
  assert.ok(!q.classList.contains('is-on'), 'hidden again at the hero');
  unbind();
  assert.equal(listeners.size, 0, 'scroll listener removed');
  assert.equal(slot().children.length, 0, 'top-bar unit removed');
});

test('bindQueue: re-binding leaves one unit and one listener; the number is called at most once per page view', async () => {
  const fresh = await import(`../src/js/ui/queue.js?rebind=${Date.now()}`); // clean once-per-page-view state
  const first = mountHome(D);
  const unbind = fresh.bindQueue(D, { slot: slot(), root: first.main });
  first.scroll(800);
  first.scroll(3100);
  assert.ok(first.main.querySelector('.called').classList.contains('is-on'), 'called the first time');
  unbind();
  assert.equal(listeners.size, 0);
  // The story page is rendered again (a route round trip) and bound again.
  const second = mountHome(D);
  const rebound = fresh.bindQueue(D, { slot: slot(), root: second.main });
  second.scroll(800);
  second.scroll(3100);
  assert.equal(slot().querySelectorAll('.queue').length, 1);
  assert.equal(listeners.size, 1);
  assert.ok(!second.main.querySelector('.called').classList.contains('is-on'), 'already called earlier in this page view');
  rebound();
  assert.equal(listeners.size, 0);
});

test('bindQueue: the notice waits for the top-bar counter to be on screen', async () => {
  const fresh = await import(`../src/js/ui/queue.js?gate=${Date.now()}`);
  const { main, scroll } = mountHome(D);
  // A layout where the calculator's notice is reached while the hero's panels still cover the bar's mark:
  // the hero panels end far down, so the small copy is not yet shown when progress completes.
  const panels = main.querySelector('.hero__panels');
  panels.getBoundingClientRect = () => ({ top: 180, bottom: 5200, height: 5020, left: 0, right: 0, width: 0 });
  const unbind = fresh.bindQueue(D, { slot: slot(), root: main });
  scroll(1500);
  scroll(3100);
  assert.ok(!shown().classList.contains('is-on'), 'counter hidden');
  assert.ok(!main.querySelector('.called').classList.contains('is-on'), 'so nothing is called');
  unbind();
});

test('bindQueue: a deep link that lands on the calculator shows 10 without calling it', async () => {
  // Fresh module state: import a second copy.
  const fresh = await import(`../src/js/ui/queue.js?fresh=${Date.now()}`);
  const { main, scroll } = mountHome(D);
  scroll(3100);
  const unbind = fresh.bindQueue(D, { slot: slot(), root: main });
  assert.equal(shown().querySelector('.led__digits').getAttribute('data-value'), '10');
  assert.equal(shown().querySelector('.led__digits').textContent, '1O', 'Doto glyphs: O for 0');
  assert.ok(!main.querySelector('.called').classList.contains('is-on'), 'no wait, no call');
  scroll(1500);
  scroll(3100);
  assert.ok(main.querySelector('.called').classList.contains('is-on'), 'called after the reader actually waited');
  unbind();
});

test('bindQueue: a layout shift under a deep link is not the reader waiting', async () => {
  const fresh = await import(`../src/js/ui/queue.js?shift=${Date.now()}`);
  const { main, scroll, relayout } = mountHome(D);
  scroll(3100);
  const unbind = fresh.bindQueue(D, { slot: slot(), root: main });
  // Fonts swap in and the page above the calculator shortens; scroll anchoring moves scrollY to match and fires a
  // scroll event BEFORE the ResizeObserver callback re-measures.
  relayout(-310);
  scroll(2790);
  for (const cb of observers) cb([]); // the observer catches up
  scroll(2790);
  assert.equal(shown().querySelector('.led__digits').getAttribute('data-value'), '10', 'still reads the reader\'s number');
  assert.ok(!main.querySelector('.called').classList.contains('is-on'), 'no call: nobody waited');
  scroll(1500);
  scroll(2800);
  assert.ok(main.querySelector('.called').classList.contains('is-on'), 'a real wait still calls it');
  unbind();
});

test('bindQueue: reduced motion shows the static pair and never calls the number', async () => {
  const fresh = await import(`../src/js/ui/queue.js?reduced=${Date.now()}`);
  reduced(() => {
    const { main, scroll } = mountHome(D);
    const unbind = fresh.bindQueue(D, { slot: slot(), root: main });
    scroll(800);
    scroll(3100);
    assert.equal(text(shown()), 'Now serving O7 Your no. 10');
    assert.ok(!main.querySelector('.called').classList.contains('is-on'));
    unbind();
  });
});

test('bindQueue: the notice dismisses on its own, and unbinding mid-notice clears it', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const fresh = await import(`../src/js/ui/queue.js?timer=${Date.now()}`);
    let { main, scroll } = mountHome(D);
    let unbind = fresh.bindQueue(D, { slot: slot(), root: main });
    const notice = () => main.querySelector('.called');
    scroll(800);
    scroll(3100);
    assert.ok(notice().classList.contains('is-on'));
    mock.timers.tick(5000);
    assert.ok(notice().classList.contains('is-on'), 'still showing after 5 s');
    mock.timers.tick(1500);
    assert.ok(!notice().classList.contains('is-on'), 'gone by itself');
    unbind();
    const again = await import(`../src/js/ui/queue.js?timer2=${Date.now()}`);
    ({ main, scroll } = mountHome(D));
    unbind = again.bindQueue(D, { slot: slot(), root: main });
    scroll(800);
    scroll(3100);
    assert.ok(notice().classList.contains('is-on'));
    unbind();
    assert.ok(!notice().classList.contains('is-on'), 'unbinding hides it');
  } finally {
    mock.timers.reset();
  }
});
