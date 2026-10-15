import { s } from '../dom.js';
import { fmtBeds, fmtNum } from '../format.js';
import { mount } from './shared.js';

// The bed board: one SVG square per bed, filled left to right, top to bottom as
//   occupied by other patients | held by the MA excess | held, and freed by faster decisions | empty.
// The held beds sit at the edge of the occupied block, next to the empty ones they would join. A freed bed is drawn as a
// smaller amber square inside its cell (inset 2 px; 1 px on cells under 10 px; on cells under 6 px, 1 px off the top
// and left only, so a few pixels of amber remain): it never darkens, so the freed run cannot merge with the occupied
// block at any cell size, in either theme.
// Calls after the first only toggle classes on cells whose state changed; a bed-count change adds or drops
// cells at the end, and a width or count change re-lays the grid. Layout is whole-pixel, so cells stay crisp.
const CLS = ['bb-occ', 'bb-held', 'bb-freed', 'bb-empty'];
const MAX_CELLS = 5000; // well above the largest hospital; guards the DOM against absurd input
const FALLBACK_W = 560; // until the element is laid out (built detached, or no layout at all)
const P_MIN = 4;
const P_MAX = 22;

const count = (x, hi) => (Number.isFinite(x) ? Math.min(hi, Math.max(0, Math.round(x))) : 0);

// Whole cells per state; each count is capped by the one before it, and there is never more than one cell per bed.
export function boardCounts({ beds, occupied, held, freed }) {
  const n = Number.isFinite(beds) ? Math.min(MAX_CELLS, Math.max(0, Math.floor(beds + 1e-9))) : 0;
  const occ = count(occupied, n);
  const hold = count(held, occ);
  return { n, occ, held: hold, freed: count(freed, hold) };
}

// Pitch (cell + gap) so the board fills the width at about `hTarget` px tall; narrow screens get a shorter board.
export function layout(width, n) {
  const w = Math.max(40, width);
  const hTarget = w < 480 ? 210 : 250;
  const p = Math.max(P_MIN, Math.min(P_MAX, Math.floor(Math.sqrt((w * hTarget) / Math.max(1, n)))));
  const cols = Math.max(1, Math.min(n || 1, Math.floor(w / p)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const gap = p >= 12 ? 2 : 1;
  return { p, cols, rows, gap, size: p - gap, rx: p >= 12 ? 2 : p >= 7 ? 1 : 0 };
}

const FREED = 2; // index of 'bb-freed' in CLS
const freedInset = (size) => (size >= 10 ? 2 : 1);

// A cell's square for its state: the full cell, or for a freed bed the inset square described above.
function shape(b, i, st) {
  const { p, cols, size, rx } = b.L;
  const d = st === FREED ? freedInset(size) : 0;
  const side = size - (size < 6 ? d : 2 * d);
  const c = b.cells[i];
  c.setAttribute('x', (i % cols) * p + d);
  c.setAttribute('y', Math.floor(i / cols) * p + d);
  c.setAttribute('width', side);
  c.setAttribute('height', side);
  c.setAttribute('rx', d ? Math.max(0, rx - 1) : rx);
}

function place(b) {
  const L = layout(b.width, b.cells.length);
  b.L = L;
  b.svg.setAttribute('viewBox', `0 0 ${L.cols * L.p - L.gap} ${L.rows * L.p - L.gap}`);
  b.svg.setAttribute('width', L.cols * L.p - L.gap);
  b.svg.setAttribute('height', L.rows * L.p - L.gap);
  b.svg.setAttribute('class', L.p < 7 ? 'bb__svg bb__svg--fine' : 'bb__svg');
  b.cells.forEach((c, i) => shape(b, i, b.state[i]));
}

function resize(b, n) {
  if (n === b.cells.length) return false;
  if (n < b.cells.length) {
    for (const c of b.cells.splice(n)) c.remove();
    b.state.length = n;
  } else {
    const add = document.createDocumentFragment();
    for (let i = b.cells.length; i < n; i++) {
      const c = s('rect');
      b.cells.push(c);
      b.state.push(-1);
      add.append(c);
    }
    b.svg.append(add);
  }
  return true;
}

// state: {beds, occupied, held, freed} in beds (fractions allowed; each is rounded and capped by the one before it).
// The first call creates the svg; later calls (and resizes) only touch what changed.
export const bedBoard = (el, state) => mount(el, state, draw, FALLBACK_W);

function draw(el, b) {
  const { beds, occupied, held, freed } = b.opts;
  if (!b.svg) {
    b.svg = s('svg', { class: 'bb__svg', role: 'img', focusable: 'false' });
    b.cells = [];
    b.state = [];
    b.laid = -1;
    el.append(b.svg);
  }
  const { n, occ: nOcc, held: nHeld, freed: nFreed } = boardCounts({ beds, occupied, held, freed });
  const grew = resize(b, n);
  if (grew || b.laid !== b.width) { place(b); b.laid = b.width; }
  const heldFrom = nOcc - nHeld;
  const freedFrom = nOcc - nFreed;
  for (let i = 0; i < n; i++) {
    const st = i < heldFrom ? 0 : i < freedFrom ? 1 : i < nOcc ? FREED : 3;
    if (b.state[i] !== st) {
      if (st === FREED || b.state[i] === FREED) shape(b, i, st);
      b.cells[i].setAttribute('class', CLS[st]);
      b.state[i] = st;
    }
  }
  const v = (x) => fmtBeds(Number.isFinite(x) ? Math.max(0, x) : 0);
  b.svg.setAttribute('aria-label', `Bed board, ${fmtNum(n)} beds on an average day: about ${fmtNum(nOcc)} occupied, `
    + `${v(Math.min(held, nOcc))} of them held by Medicare Advantage patients' extra days`
    + `${nFreed > 0 || freed > 0 ? `, ${v(Math.min(freed, held))} of which faster decisions would free` : ''}; `
    + `${fmtNum(n - nOcc)} empty.`);
}
