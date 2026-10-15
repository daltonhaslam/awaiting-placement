// Tiny DOM builder. Text always goes through textContent; data never reaches innerHTML.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  return finish(el, attrs, children);
}

export function s(tag, attrs, ...children) {
  return finish(document.createElementNS(SVG_NS, tag), attrs, children);
}

function finish(el, attrs, children) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Re-draw `draw(width)` now and whenever the element's width changes meaningfully (debounced).
// One observer per element: calling again replaces the previous drawing function.
// Charts are built detached, so the first draw waits for layout: flushDraws() runs it right after mounting.
const observers = new WeakMap();
const pending = new Set();
export function flushDraws() {
  for (const run of pending) run();
  pending.clear();
}
export function responsive(el, draw) {
  if (typeof ResizeObserver === 'undefined') return; // no layout engine (tests): charts keep their fallback width
  observers.get(el)?.disconnect();
  let last = -1;
  let timer = null;
  const run = () => {
    const w = Math.floor(el.clientWidth);
    if (w > 0 && Math.abs(w - last) >= 8) {
      last = w;
      draw(w);
    }
  };
  const ro = new ResizeObserver(() => {
    if (last < 0) return run();
    clearTimeout(timer);
    timer = setTimeout(run, 120);
    return undefined;
  });
  ro.observe(el);
  observers.set(el, ro);
  pending.add(run);
  requestAnimationFrame(() => { if (pending.delete(run)) run(); });
}
