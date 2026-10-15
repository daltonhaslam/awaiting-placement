import { h, clear } from '../dom.js';
import { searchIndex } from './search.js';
import { link } from '../router.js';

let uid = 0;

// Accessible combobox over the hospital index. Arrow keys move, Enter or click picks; Escape closes the list, and a
// second Escape (list already closed) clears the text.
// index: an index array or a function returning one (built on first keystroke). onPick(result) replaces the default,
// which opens the hospital's profile. Names render as text only.
export function omnibox(index, { label = 'Find a hospital', placeholder = 'Hospital name, city or CCN', onPick } = {}) {
  uid += 1;
  const getIndex = typeof index === 'function' ? index : () => index;
  const listId = `omni-list-${uid}`;
  const input = h('input', {
    type: 'search', id: `omni-${uid}`, placeholder, autocomplete: 'off', spellcheck: 'false',
    role: 'combobox', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-autocomplete': 'list',
  });
  const list = h('ul', { class: 'omni__list', id: listId, role: 'listbox', 'aria-label': label, hidden: true });
  const root = h('div', { class: 'omni' },
    h('label', { class: 'omni__label', for: input.id }, label),
    h('div', { class: 'omni__field' }, input),
    list);
  let results = [];
  let options = []; // the option nodes for `results`, in order
  let active = -1;
  let open = false; // the list is on screen; keys act on what the reader can see, never on a closed list's leftovers

  const close = () => {
    open = false;
    list.setAttribute('hidden', '');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  // Move the highlight without rebuilding the list.
  const select = (i) => {
    if (options[active]) options[active].setAttribute('aria-selected', 'false');
    active = i;
    if (options[i]) {
      options[i].setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', options[i].id);
    } else input.removeAttribute('aria-activedescendant');
  };
  const go = (r) => {
    if (!r) return;
    close();
    input.value = '';
    if (onPick) onPick(r);
    else window.location.hash = link('hospital', r.key);
  };
  const paint = () => {
    clear(list);
    if (!results.length) {
      list.append(h('li', { class: 'omni__empty', role: 'option', 'aria-disabled': 'true', 'aria-selected': 'false' },
        'No matches. Try a city, a state, or the six-digit CCN.'));
    }
    options = results.map((r, i) => h('li', {
      role: 'option', id: `${listId}-${i}`, 'aria-selected': String(i === active),
      onmousedown: (e) => { e.preventDefault(); go(r); }, // keeps focus in the field, so blur never races the pick
    }, h('span', { class: 'omni__name' }, r.label), h('span', { class: 'omni__where' }, r.sub)));
    list.append(...options);
    if (active >= 0) input.setAttribute('aria-activedescendant', `${listId}-${active}`);
    else input.removeAttribute('aria-activedescendant');
    open = true;
    list.removeAttribute('hidden');
    input.setAttribute('aria-expanded', 'true');
  };

  input.addEventListener('input', () => {
    results = searchIndex(getIndex(), input.value);
    active = results.length ? 0 : -1;
    if (input.value.trim()) paint(); else close();
  });
  // An arrow key on a closed list opens it first, so the highlight it moves is on screen.
  const reopen = () => { if (open || !results.length) return; active = -1; paint(); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) {
      reopen();
      select((active + 1) % results.length);
      e.preventDefault();
    } else if (e.key === 'ArrowUp' && results.length) {
      reopen();
      select(active < 0 ? results.length - 1 : (active - 1 + results.length) % results.length);
      e.preventDefault();
    } else if (e.key === 'Enter') { if (open) go(results[active]); e.preventDefault(); }
    else if (e.key === 'Escape') {
      e.preventDefault(); // a search field would also clear itself on the first press
      if (open) close();
      else { input.value = ''; results = []; }
    }
  });
  input.addEventListener('blur', close);
  return root;
}
