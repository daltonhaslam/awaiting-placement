// The hospital omnibox: keyboard highlight, picking, and closing, rendered into a linkedom DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const dom = parseHTML('<!doctype html><html><head></head><body><main id="main"></main></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.document, Node: dom.Node, HTMLElement: dom.HTMLElement });

const { loadData } = await import('../src/js/data.js');
const { omnibox } = await import('../src/js/ui/omnibox.js');
const { hospitalIndex } = await import('../src/js/ui/search.js');

const D = loadData(JSON.parse(readFileSync(new URL('./fixtures/ap.min.json', import.meta.url), 'utf8')));
const fire = (el, type, props = {}) => {
  const e = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, props);
  el.dispatchEvent(e);
  return e;
};
const make = (onPick) => {
  const root = omnibox(() => hospitalIndex(D), { onPick });
  const input = root.querySelector('input');
  const list = root.querySelector('ul');
  const type = (q) => { input.value = q; fire(input, 'input'); };
  return { root, input, list, type };
};
const opts = (list) => [...list.querySelectorAll('[role="option"]')];

test('arrow keys move the highlight on the existing nodes and point aria-activedescendant at it', () => {
  const { input, list, type } = make();
  type('fixture');
  const nodes = opts(list);
  assert.ok(nodes.length >= 2, 'the fixture has several matches');
  assert.equal(nodes[0].getAttribute('aria-selected'), 'true');
  assert.equal(input.getAttribute('aria-activedescendant'), nodes[0].id);
  const down = fire(input, 'keydown', { key: 'ArrowDown' });
  assert.ok(down.defaultPrevented);
  assert.deepEqual(opts(list), nodes, 'no rebuild');
  assert.deepEqual(nodes.map((n) => n.getAttribute('aria-selected')), nodes.map((_, i) => String(i === 1)));
  assert.equal(input.getAttribute('aria-activedescendant'), nodes[1].id);
  fire(input, 'keydown', { key: 'ArrowUp' });
  fire(input, 'keydown', { key: 'ArrowUp' });
  assert.equal(nodes.at(-1).getAttribute('aria-selected'), 'true', 'wraps to the last');
  assert.equal(nodes.filter((n) => n.getAttribute('aria-selected') === 'true').length, 1);
  assert.equal(input.getAttribute('aria-activedescendant'), nodes.at(-1).id);
});

test('Enter picks the highlighted result; a mousedown picks without a blur race', () => {
  const picked = [];
  const { input, list, type } = make((r) => picked.push(r.key));
  type('fixture');
  fire(input, 'keydown', { key: 'ArrowDown' });
  fire(input, 'keydown', { key: 'Enter' });
  assert.equal(picked.length, 1);
  assert.equal(input.value, '');
  assert.equal(list.hasAttribute('hidden'), true);
  type('fixture');
  const md = fire(opts(list)[0], 'mousedown');
  assert.ok(md.defaultPrevented, 'default prevented, so the field keeps focus');
  assert.equal(picked.length, 2);
});

test('blur closes at once and no timer is left pending', () => {
  const pending = [];
  const { setTimeout: st } = globalThis;
  globalThis.setTimeout = (...a) => { pending.push(a); return st(...a); };
  try {
    const { input, list, type } = make();
    type('fixture');
    assert.equal(list.hasAttribute('hidden'), false);
    fire(input, 'blur');
    assert.equal(list.hasAttribute('hidden'), true, 'closed synchronously');
    assert.equal(input.getAttribute('aria-expanded'), 'false');
    assert.equal(input.hasAttribute('aria-activedescendant'), false);
    assert.equal(pending.length, 0, 'no pending timer after close');
  } finally {
    globalThis.setTimeout = st;
  }
});

test('Escape closes; no matches shows the empty note and no active descendant', () => {
  const { input, list, type } = make();
  type('fixture');
  fire(input, 'keydown', { key: 'Escape' });
  assert.equal(list.hasAttribute('hidden'), true);
  type('zzzzzz');
  assert.equal(opts(list).length, 1);
  assert.equal(opts(list)[0].getAttribute('aria-disabled'), 'true');
  assert.equal(input.hasAttribute('aria-activedescendant'), false);
});

test('Escape: the first press closes the list and keeps the text; a second press clears it', () => {
  const { input, list, type } = make();
  type('fixture');
  fire(input, 'keydown', { key: 'Escape' });
  assert.equal(list.hasAttribute('hidden'), true);
  assert.equal(input.value, 'fixture', 'the typed text survives closing the list');
  fire(input, 'keydown', { key: 'Escape' });
  assert.equal(input.value, '', 'a second Escape clears it');
  fire(input, 'keydown', { key: 'ArrowDown' });
  assert.equal(list.hasAttribute('hidden'), true, 'nothing left to reopen');
});

test('a closed list is never acted on unseen: Escape then Enter does nothing; ArrowDown reopens it first', () => {
  for (const closer of [(input) => fire(input, 'keydown', { key: 'Escape' }), (input) => fire(input, 'blur')]) {
    const picked = [];
    const { input, list, type } = make((r) => picked.push(r.key));
    type('fixture');
    closer(input);
    assert.equal(list.hasAttribute('hidden'), true);
    assert.equal(input.hasAttribute('aria-activedescendant'), false, 'no active descendant while closed');
    fire(input, 'keydown', { key: 'Enter' });
    assert.equal(picked.length, 0, 'Enter on a closed list picks nothing');
    fire(input, 'keydown', { key: 'ArrowDown' });
    assert.equal(list.hasAttribute('hidden'), false, 'ArrowDown reopens the list');
    assert.equal(input.getAttribute('aria-expanded'), 'true');
    const nodes = opts(list);
    assert.equal(nodes[0].getAttribute('aria-selected'), 'true', 'the first option is highlighted and visible');
    assert.equal(input.getAttribute('aria-activedescendant'), nodes[0].id);
    fire(input, 'keydown', { key: 'Enter' });
    assert.equal(picked.length, 1, 'now the reader can see what Enter picks');
  }
});

test('ArrowUp on a closed list reopens it and lands on the last option', () => {
  const { input, list, type } = make();
  type('fixture');
  fire(input, 'keydown', { key: 'Escape' });
  fire(input, 'keydown', { key: 'ArrowUp' });
  const nodes = opts(list);
  assert.equal(list.hasAttribute('hidden'), false);
  assert.equal(nodes.at(-1).getAttribute('aria-selected'), 'true');
});
