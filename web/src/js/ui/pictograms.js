// Wayfinding pictograms: original geometric drawings on a 24x24 grid, one style (solid fill, rounded limbs),
// after the AIGA/DOT symbol signs. Every subpath winds clockwise so overlaps union under the default
// nonzero fill rule. No crosses or other medical-alarm symbols.

const f = (n) => String(+n.toFixed(2));
const pt = (x, y) => `${f(x)} ${f(y)}`;

// Clockwise on screen (y down) when the shoelace sum is positive.
const shoelace = (q) => q.reduce((a, [x1, y1], i) => {
  const [x2, y2] = q[(i + 1) % q.length];
  return a + x1 * y2 - x2 * y1;
}, 0);

function poly(points) {
  const q = shoelace(points) < 0 ? [...points].reverse() : points;
  return `M${q.map(([x, y]) => pt(x, y)).join('L')}Z`;
}

function circle(cx, cy, r) {
  return `M${pt(cx - r, cy)}A${f(r)} ${f(r)} 0 1 1 ${pt(cx + r, cy)}A${f(r)} ${f(r)} 0 1 1 ${pt(cx - r, cy)}Z`;
}

function rrect(x, y, w, h, r) {
  return `M${pt(x + r, y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x + w, y + r)}V${f(y + h - r)}`
    + `A${f(r)} ${f(r)} 0 0 1 ${pt(x + w - r, y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x, y + h - r)}`
    + `V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${pt(x + r, y)}Z`;
}

// A straight stroke of width w with round ends, as a filled outline.
function capsule(x1, y1, x2, y2, w) {
  const r = w / 2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  let nx = (-(y2 - y1) / len) * r;
  let ny = ((x2 - x1) / len) * r;
  if (shoelace([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]]) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return `M${pt(x1 + nx, y1 + ny)}L${pt(x2 + nx, y2 + ny)}A${f(r)} ${f(r)} 0 0 1 ${pt(x2 - nx, y2 - ny)}`
    + `L${pt(x1 - nx, y1 - ny)}A${f(r)} ${f(r)} 0 0 1 ${pt(x1 + nx, y1 + ny)}Z`;
}

const polyline = (points, w) => points.slice(1).map(([x, y], i) => capsule(points[i][0], points[i][1], x, y, w)).join('');

// A bed seen from the side: tall headboard, mattress, low footboard; a patient lying on it. dy shifts it down.
function bed(dy) {
  return poly([[1.5, 6.5], [3.5, 6.5], [3.5, 13.5], [20.5, 13.5], [20.5, 11], [22.5, 11], [22.5, 19.5],
    [20.5, 19.5], [20.5, 16.5], [3.5, 16.5], [3.5, 19.5], [1.5, 19.5]].map(([x, y]) => [x, y + dy]))
    + circle(7, 10.3 + dy, 2.1)
    + rrect(10.2, 9.4 + dy, 9.2, 3.1, 1.2);
}

export const PICTO = {
  // House with a door.
  home: poly([[12, 2.5], [22.5, 11.5], [19.5, 11.5], [19.5, 21.5], [14, 21.5], [14, 15.5], [10, 15.5],
    [10, 21.5], [4.5, 21.5], [4.5, 11.5], [1.5, 11.5]]),
  // A smaller house and a visiting clinician's bag (lid, body, handle).
  hha: poly([[7.5, 3], [14.5, 9.8], [12.5, 9.8], [12.5, 20.5], [9, 20.5], [9, 15.5], [6, 15.5], [6, 20.5],
    [2.5, 20.5], [2.5, 9.8], [0.5, 9.8]])
    + rrect(14, 13, 9.5, 2.7, 1)
    + rrect(14, 16.5, 9.5, 4.5, 1)
    + polyline([[16.6, 13.2], [16.6, 10.9], [20.9, 10.9], [20.9, 13.2]], 1.5),
  // A patient in bed.
  snf: bed(0),
  // A person walking with a cane.
  irf: circle(12.4, 3.4, 2.3)
    + capsule(12, 8.1, 11.7, 13.1, 4.3)
    + capsule(12.6, 13.4, 15.5, 21.3, 2.5)
    + capsule(11, 13.4, 8.3, 21.3, 2.5)
    + capsule(12.9, 8.4, 16.2, 12.4, 1.9)
    + capsule(10.9, 8.5, 8.7, 12.6, 1.9)
    + capsule(16.8, 12.3, 18, 21.6, 1.3),
  // A patient in bed under a heart-monitor trace.
  ltch: polyline([[1.6, 5.2], [8, 5.2], [9.7, 1.6], [12.3, 9.4], [14.1, 5.2], [22.4, 5.2]], 1.6) + bed(3.2),
};

// A DOT-style direction arrow pointing right; rotate for other directions.
export const ARROW = poly([[2.5, 10.4], [13, 10.4], [13, 5.5], [21.5, 12], [13, 18.5], [13, 13.6], [2.5, 13.6]]);
