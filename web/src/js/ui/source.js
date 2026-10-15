import { h } from '../dom.js';

// Only https links leave the page; anything else renders as plain text.
export function safeHref(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// The first SRC of an object-or-list source (null when there is none).
export const firstSrc = (src) => (Array.isArray(src) ? src[0] : src) ?? null;

// A source's short name, its label up to the first comma: "MedPAC" from "MedPAC, Report to the Congress, June 2026, …".
export const shortName = (x) => String(x?.label ?? '').split(',')[0].trim();

const asList = (src) => (Array.isArray(src) ? src : [src]).filter(Boolean);

// The sources of several claims as one list, each source once (by URL, or by label when it has none).
export const mergeSources = (...srcs) => {
  const seen = new Set();
  return srcs.flatMap(asList).filter((x) => {
    const key = x.url ?? x.label;
    return !seen.has(key) && seen.add(key);
  });
};

// Identifiers such as "CMS-2552-10", "CMS-0057-F" or "MS-DRG" never break at their hyphens: each is set on one line
// (".nw"). The no-break hyphen (U+2011) is outside Overpass's latin subset, so it would come from a fallback face.
const ID = /(\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b)/;
export const keepIds = (text) => String(text ?? '').split(ID)
  .map((part, i) => (i % 2 ? h('span', { class: 'nw' }, part) : part)).filter((part) => part !== '');

// One SRC or a list of them ({label, url}) as "A; B", each a link when its URL is safe.
export function sourceLinks(src) {
  return asList(src).flatMap((x, i) => {
    const href = safeHref(x.url);
    const node = href ? h('a', { href }, keepIds(x.label)) : keepIds(x.label);
    return i ? ['; ', node] : [node];
  });
}

// Plain-language names for the kinds of organization behind a source.
export const SRC_TYPE = {
  gov: 'government', 'peer-reviewed': 'peer-reviewed', nonprofit: 'nonprofit', 'trade-group': 'trade group',
  industry: 'industry', 'advocacy-funded': 'advocacy-funded', 'think-tank': 'think tank',
};

// The small label that names a source's type, or null for an unknown type.
const typeLabel = (x) => (SRC_TYPE[x?.type] ? h('span', { class: 'src-type' }, SRC_TYPE[x.type]) : null);

// Sources, each followed by its type ("AMRPA, 2024 survey · trade group; KFF, … · nonprofit").
export const typedSources = (src) => asList(src).flatMap((x, i) => {
  const t = typeLabel(x);
  return [i ? '; ' : null, ...sourceLinks(x), t ? ['\u00a0· ', t] : null]; // no break before the dot: a line never starts with it
});

// The calculator's assumptions as a list: label and default, the reason, and each source with its type.
// `srcLabel` prefixes the source line ("Source: " in the calculator drawer, nothing on the methods page).
export const assumptionList = (items, { srcLabel = null } = {}) => (items.length
  ? h('ul', { class: 'assume' }, items.map((a) => h('li', { class: 'assume__item' },
    h('p', { class: 'assume__head' }, h('span', { class: 'assume__label' }, a.label),
      a.value ? h('span', { class: 'assume__value' }, `Default: ${a.value}`) : null),
    a.why ? h('p', { class: 'assume__why' }, keepIds(a.why)) : null,
    a.src ? h('p', { class: 'assume__src' }, srcLabel, typedSources(a.src)) : null)))
  : null);
