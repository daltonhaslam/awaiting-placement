import { h } from '../dom.js';
import { SITE, DISCLAIMER } from '../site.js';

// The one site footer: who built it, what data it uses, what it is not, and where the code lives.
export function renderFooter(D) {
  const fys = Array.isArray(D.meta?.trendFys) ? D.meta.trendFys : [];
  const fy = D.meta?.latestFy;
  const span = fys.length > 1 ? `FY${fys[0]} to FY${fys.at(-1)}` : `FY${fy}`;
  const medpacFy = D.content?.medpac?.t41?.fy;
  return h('div', { class: 'wrap footer__grid' },
    h('div', { class: 'footer__col' },
      h('p', { class: 'footer__name' }, SITE.name),
      h('p', null, 'Built by ', h('a', { href: SITE.linkedin }, SITE.byline), ', using Claude Code.'),
      h('p', null, `Data: CMS hospital cost reports, ${span}`
        + `${medpacFy ? `, and MedPAC's analysis of FY${medpacFy} Medicare stays` : ''}. `,
      h('a', { href: '#methods' }, 'Methods and sources'))),
    h('div', { class: 'footer__col' },
      h('p', null, DISCLAIMER),
      h('p', null, 'Code MIT-licensed. Federal source data is public domain.'),
      h('p', null, h('a', { href: SITE.repo }, 'Source code on GitHub'))));
}
