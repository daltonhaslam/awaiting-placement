import { h } from '../dom.js';
import { section } from '../ui/ticket.js';
import { sign, DEST_LABEL } from '../ui/sign.js';
import { sourceLinks } from '../ui/source.js';
import { fmtDate } from '../format.js';

const STEPS = [
  { title: 'Medically ready', note: 'The care team agrees the patient no longer needs hospital care.' },
  { title: 'Referral sent', note: 'A case manager sends referrals to facilities that can meet the patient\'s needs.' },
  { title: 'Facility accepts', note: 'A facility reviews the record and offers a bed.' },
  { title: 'Plan authorization', note: 'MA plans can require it. Traditional Medicare generally does not for these stays.', ma: true },
  { title: 'Transport home or to facility', note: 'The hospital bed opens for the next patient.' },
];

// The decision-deadline item: its title names decisions, and it states a deadline or time frame. CMS-0057-F's
// other item (the 2027 API requirements) does not name decisions, so it never matches.
const isDeadlines = (t) => /decision/i.test(t.title || '') && /deadline|time ?frame|hours|days/i.test(`${t.title} ${t.body}`);

// The decision-deadline rule, only as the cited timeline states it (the pipeline admits verified items only).
function deadlineLine(D, now) {
  const item = (D.content?.timeline || []).find(isDeadlines);
  if (!item?.body || !/^\d{4}(-\d{2})?/.test(item.date || '')) return null;
  const when = fmtDate(item.date.slice(0, 7)); // month and year: "Jan 2026"
  const since = now.toISOString().slice(0, 10) >= item.date ? 'Since' : 'From';
  return h('p', { class: 'path__rule' },
    h('span', { class: 'path__when' }, `${since} ${when}`), ' ',
    h('span', null, item.body), ' ',
    item.src ? h('span', { class: 'path__src' }, sourceLinks(item.src)) : null);
}

// `now` is the reader's current date (injectable for tests): the rule is "Since" once it is in force.
export function renderPathway(D, now = new Date()) {
  return section({ no: 1, title: 'The last step before leaving', id: 'wait' },
    h('p', null, 'A patient is ', h('em', null, 'awaiting placement'), ' when they are medically ready to leave the hospital '
      + 'but cannot safely go home. They need a bed somewhere that can keep caring for them: a skilled nursing facility, '
      + 'an inpatient rehabilitation facility, or a long-term care hospital. Until that bed is arranged, they stay in a hospital bed.'),
    h('p', null, 'Arranging the move takes several handoffs, and any of them can add a day. A facility may not have a bed, '
      + 'a family may need time to choose, or a request may be missing information. Coverage shapes two steps. '
      + 'Medicare Advantage (MA) plans can limit which facilities are in network, and they can require their approval, '
      + 'called prior authorization, before a patient moves to a facility. If the plan denies the request, the hospital can '
      + 'ask for a peer-to-peer review with the plan\'s physician, appeal, or look for a different level of care. '
      + 'Traditional Medicare does not require prior authorization for these stays. It pays for a skilled nursing stay only '
      + 'after three inpatient midnights, and observation days do not count, though most MA plans and many accountable care '
      + 'organizations waive that rule. Some patients no longer need skilled care at all and wait for a custodial placement '
      + 'that neither program pays for.'),
    h('ol', { class: 'path', 'aria-label': 'Steps from medically ready to leaving the hospital' },
      STEPS.map((st, i) => h('li', { class: st.ma ? 'path__step path__step--ma' : 'path__step' },
        h('span', { class: 'path__node', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'path__title' }, st.title),
        h('span', { class: 'path__note' }, st.note)))),
    h('div', { class: 'dests' },
      h('h3', { class: 'dests__label' }, 'Where patients go next'),
      h('ul', { class: 'dests__list' }, Object.keys(DEST_LABEL).map((d) => h('li', null, sign(d))))),
    deadlineLine(D, now));
}
