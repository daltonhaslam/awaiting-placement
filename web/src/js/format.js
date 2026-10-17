const MINUS = '−';
const DASH = '—';
export const isNum = Number.isFinite;
export const pad2 = (x) => String(Math.round(x)).padStart(2, '0');
// Doto (the LED face) draws 0 with a diagonal slash that reads as "Ø" at small sizes; its capital O is an unslashed oval
// of the same width. LED glyphs show O for 0; the value itself stays numeric everywhere else (data-value, aria-label).
export const ledGlyphs = (v) => String(v).replace(/0/g, 'O');
const comma = (n) => n.toLocaleString('en-US');
export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

export const fmtNum = (x) => (isNum(x) ? comma(Math.round(x)) : DASH);
export const fmtDays = (x) => {
  if (!isNum(x)) return DASH;
  const t = x.toFixed(1);
  return t === '1.0' ? '1 day' : `${t} days`;
};
export const fmtBeds = (x) => {
  if (!isNum(x)) return DASH;
  return Math.abs(x) < 9.95 ? x.toFixed(1) : String(Math.round(x));
};
// Fixed decimals for averages in tables and sentences; a missing value reads as a dash.
export const fmt1 = (x) => (isNum(x) ? x.toFixed(1) : DASH);
export const fmt2 = (x) => (isNum(x) ? x.toFixed(2) : DASH);
export const fmtPct = (x, dp = 0) => (isNum(x) ? `${(x * 100).toFixed(dp)}%` : DASH);
export function fmtMoney(x) {
  if (!isNum(x)) return DASH;
  const a = Math.abs(x);
  const sign = x < 0 && Math.round(a) > 0 ? MINUS : '';
  const n = a < 1000 ? Math.round(a) : a; // round to display precision before choosing the unit
  if (Math.round(n / 1000) >= 1000) return `${sign}$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${sign}$${Math.round(n / 1000)}K`;
  return `${sign}$${n}`;
}
export function fmtSigned(x, fmt) {
  if (!isNum(x)) return DASH;
  const t = fmt(Math.abs(x));
  if (t === fmt(0)) return t; // rounds to zero at display precision: no sign
  if (x > 0) return `+${t}`;
  return x < 0 ? `${MINUS}${t}` : t;
}

// The gap as displayed: the difference of the two stay lengths as displayed (1 dp), so "MA a, traditional b, gap c" always adds up.
// Integer tenths avoid float drift. Null unless both lengths are present.
const tenths = (x) => Math.round(Number(x.toFixed(1)) * 10);
export const displayedGap = (ma, ffs) => (isNum(ma) && isNum(ffs) ? (tenths(ma) - tenths(ffs)) / 10 : null);
// A hospital's gap as its pages show it: from its displayed stay lengths, or the raw gap when one is missing.
export const shownGap = (x) => displayedGap(x.maAlos, x.ffsAlos) ?? x.gap;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// An ISO date at the precision it was given: '2024-01-01' -> 'Jan 1, 2024', '2026-06' -> 'Jun 2026', '2027' -> '2027'.
export function fmtDate(iso) {
  if (typeof iso !== 'string') return DASH;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(iso);
  const mon = m?.[2] ? MONTHS[Number(m[2]) - 1] : null;
  if (!m || (m[2] && !mon)) return iso;
  if (!mon) return m[1];
  return m[3] ? `${mon} ${Number(m[3])}, ${m[1]}` : `${mon} ${m[1]}`;
}
