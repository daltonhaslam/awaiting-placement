import { h } from '../dom.js';

// The table twin of a chart, collapsed under "Show as table". columns: [{key, label, fmt?(value, row)}].
// A missing value (null/undefined) shows "—" and never reaches fmt. The first column is the row header; columns holding numbers align right in the mono face.
export function tableAlt({ caption, columns, rows }) {
  const num = columns.map((c) => rows.some((r) => typeof r[c.key] === 'number'));
  const cell = (c, r) => (r[c.key] == null ? '—' : c.fmt ? c.fmt(r[c.key], r) : r[c.key]);
  return h('details', { class: 'table-alt' },
    h('summary', null, 'Show as table'),
    h('div', { class: 'table-alt__scroll', tabindex: '0', role: 'region', 'aria-label': caption || 'Data table' },
      h('table', null,
        caption ? h('caption', null, caption) : null,
        h('thead', null, h('tr', null, columns.map((c, i) => h('th', { scope: 'col', class: num[i] ? 'num' : null }, c.label)))),
        h('tbody', null, rows.map((r) => h('tr', null, columns.map((c, i) => (i === 0
          ? h('th', { scope: 'row', class: num[i] ? 'num' : null }, cell(c, r))
          : h('td', { class: num[i] ? 'num' : null }, cell(c, r))))))))));
}

// Paper cannot click "Show as table", and a closed <details> prints nothing: open every closed table for printing.
// Returns a function that closes again just the ones it opened (the reader's own choices stay).
export function printTables(root) {
  const opened = [...root.querySelectorAll('details.table-alt')].filter((d) => !d.hasAttribute('open'));
  for (const d of opened) d.setAttribute('open', '');
  return () => { for (const d of opened) d.removeAttribute('open'); };
}
