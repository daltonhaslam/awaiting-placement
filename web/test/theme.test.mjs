// Theme button: choosing the system's own scheme returns to "follow system" instead of pinning it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const dom = parseHTML('<!doctype html><html><head></head><body></body></html>');
const store = new Map();
let systemDark = false;
const osListeners = [];
const mql = { get matches() { return systemDark; }, addEventListener: (type, fn) => { if (type === 'change') osListeners.push(fn); } };
Object.assign(globalThis, {
  window: Object.assign(dom.window, { matchMedia: () => mql }),
  document: dom.document,
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
});
const { THEME_KEY } = await import('../src/js/site.js');
const { themeButton } = await import('../src/js/ui/theme.js');
const root = document.documentElement;
const click = (btn) => btn.dispatchEvent(new dom.window.Event('click'));

test('system light: first click pins dark, second click returns to following the system', () => {
  systemDark = false;
  const btn = themeButton();
  click(btn);
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(store.get(THEME_KEY), 'dark');
  click(btn);
  assert.equal(root.hasAttribute('data-theme'), false, 'attribute removed');
  assert.equal(store.has(THEME_KEY), false, 'stored value removed');
});

test('system dark: first click pins light, second click returns to following the system', () => {
  systemDark = true;
  const btn = themeButton();
  click(btn);
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(store.get(THEME_KEY), 'light');
  click(btn);
  assert.equal(root.hasAttribute('data-theme'), false);
  assert.equal(store.has(THEME_KEY), false);
});

test('following the system, the label tracks an OS scheme change made while the page is open', () => {
  systemDark = false;
  root.removeAttribute('data-theme');
  const btn = themeButton();
  assert.equal(btn.textContent, 'Night');
  systemDark = true;
  osListeners.forEach((fn) => fn());
  assert.equal(btn.textContent, 'Day');
  assert.equal(btn.getAttribute('aria-label'), 'Switch to day mode');
});
