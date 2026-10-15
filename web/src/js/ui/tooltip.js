import { h, clear, append } from '../dom.js';

// One shared tooltip for every chart. show(x, y) takes viewport (client) coordinates; nodes are strings or elements.
// Positioning is one transform per animation frame; the size is re-measured only when the content changes.
let el = null;
let last;
let size = null;
let frame = 0;
let at = { x: 0, y: 0 };
const PAD = 14;
const canFrame = () => typeof window.requestAnimationFrame === 'function';

function ensure() {
  if (!el) {
    el = h('div', { class: 'tip', role: 'tooltip', hidden: true });
    document.body.append(el);
  }
  return el;
}

function place() {
  frame = 0;
  if (el.hasAttribute('hidden')) return;
  if (!size) {
    const r = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { width: 0, height: 0 };
    size = { w: r.width, h: r.height };
  }
  const W = window.innerWidth || 1024;
  const H = window.innerHeight || 768;
  let left = at.x + PAD;
  let top = at.y + PAD;
  if (left + size.w > W - 8) left = at.x - size.w - PAD;
  if (top + size.h > H - 8) top = at.y - size.h - PAD;
  el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
}

export const tooltip = {
  show(x, y, nodes) {
    const t = ensure();
    if (nodes !== last || t.hasAttribute('hidden')) {
      append(clear(t), [nodes]);
      last = nodes;
      size = null;
    }
    t.removeAttribute('hidden');
    at = { x, y };
    if (!canFrame()) place();
    else if (!frame) frame = window.requestAnimationFrame(place);
  },
  hide() {
    el?.setAttribute('hidden', '');
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  },
};
