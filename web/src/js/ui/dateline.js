import { h } from '../dom.js';
import { fmtDate } from '../format.js';
import { PUBLISHED } from '../site.js';
import { medpacReportDate } from '../content.js';

const nw = (...text) => h('span', { class: 'nw' }, ...text);

// The dateline: "Published Oct 2026 · Data: FY2024 cost reports, MedPAC June 2026" (data parts from D). Each phrase
// stays on one line, so a narrow screen breaks between them, never inside one ("MedPAC" / "June 2026"), and the
// no-break space keeps the "·" with the date before it, so a line never starts with it.
export function dateline(D, cls) {
  const fy = D.meta?.latestFy;
  const report = medpacReportDate(D);
  const data = [fy ? `FY${fy} cost reports` : null, report ? `MedPAC ${report}` : null].filter(Boolean);
  return h('p', { class: cls },
    nw('Published ', h('time', { datetime: PUBLISHED }, fmtDate(PUBLISHED))),
    data.length ? ['\u00a0· Data: ', data.map((x, i) => [i ? ', ' : null, nw(x)])] : '');
}
