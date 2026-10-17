// Pure hospital search over hospital entries. DOM lives in omnibox.js.

// Query word -> other spellings it may match. Cost-report fallback names abbreviate ("Mem Hospital & Hlth Center").
const SYNONYMS = {
  saint: ['st'], st: ['saint'], mount: ['mt'], mt: ['mount'], fort: ['ft'], ft: ['fort'],
  memorial: ['mem'], medical: ['med'], center: ['ctr'], ctr: ['center'], hospital: ['hosp'],
  health: ['hlth'], university: ['univ'], regional: ['reg', 'rgnl'], community: ['comm'],
};

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Left out of a name's initials, so "Hospital of Univ of Pennsylvania" is "hup".
const SMALL = new Set(['of', 'the', 'and', 'at', 'in', 'for', 'a']);

function entry(x) {
  const labelNorm = normalize(x.name);
  const labelWords = labelNorm.split(' ');
  return {
    key: x.id, label: x.name, sub: [x.city, x.st].filter(Boolean).join(', '),
    labelNorm, labelWords, initials: labelWords.filter((w) => !SMALL.has(w)).map((w) => w[0]).join(''), beds: x.beds ?? 0,
    words: normalize(`${x.name} ${x.city ?? ''} ${x.st ?? ''} ${x.id}`).split(' '),
  };
}

export const buildIndex = (D) => (D.hospitals || []).map(entry);

// One index per data object, built on first use (normalizing ~2,600 names is not free at startup).
const cache = new WeakMap();
export function hospitalIndex(D) {
  if (!cache.has(D)) cache.set(D, buildIndex(D));
  return cache.get(D);
}

const matchesWord = (alts, words) => words.some((w) => alts.some((a) => w.startsWith(a)));

// A reader who types an apostrophe as a space ("king s daughters", "o bleness") splits one indexed word in two: a lone
// "s" belongs to the word before it, a lone "o" or "d" to the word after it.
const rejoin = (q) => q.replace(/(\w) s\b/g, '$1s').replace(/\b([od]) (?=\w)/g, '$1');

// Markup in a query (e.g. "<b>") is not a search term.
export function searchIndex(index, query, limit = 10) {
  const q = rejoin(normalize(String(query ?? '').replace(/<[^>]*>/g, ' ')));
  if (!q) return [];
  const tokens = q.split(' ').map((t) => [t, ...(SYNONYMS[t] || [])]);
  // One short word may be a name's initials ("mgh"); two letters would mostly hit state codes and name prefixes.
  const initials = tokens.length === 1 && q.length >= 3 && q.length <= 5 ? q : null;
  const scored = [];
  for (const e of index) {
    const byInitials = initials !== null && e.initials === initials;
    if (!byInitials && !tokens.every((alts) => matchesWord(alts, e.words))) continue;
    // Many names share initials; the one a reader abbreviates is usually the large hospital (MGH: 997 beds).
    let score = byInitials ? 300 + Math.min(e.beds, 3000) / 30 : 0;
    if (e.key === q) score += 1000;
    if (e.labelNorm === q) score += 500;
    else if (e.labelNorm.startsWith(q)) score += 200;
    if (` ${e.labelNorm} `.includes(` ${q} `)) score += 100; // the query as a phrase ("a m" in "texas a m health")
    for (const alts of tokens) if (matchesWord(alts, e.labelWords)) score += 20;
    score -= e.label.length * 0.1;
    scored.push({ key: e.key, label: e.label, sub: e.sub, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
