// Hash routes are plain anchors so deep links survive any host.
//   #  home    #wait #gap #share #calculator #sides  home sections
//   #calculator?b=300&a=0.5   calculator view (query decoded by the calculator, not here)
//   #hospital-220071          hospital profile        #methods   methods
export const SECTIONS = ['wait', 'gap', 'share', 'calculator', 'sides'];

export function parseHash(hash) {
  let s = String(hash || '').replace(/^#\/?/, '');
  const q = s.indexOf('?');
  const query = q >= 0 ? s.slice(q + 1) : null;
  if (q >= 0) s = s.slice(0, q);
  try {
    s = decodeURIComponent(s);
  } catch {
    return { view: 'notfound' };
  }
  if (!s || s === 'top') return query == null ? { view: 'home' } : { view: 'notfound' };
  if (s === 'methods' && query == null) return { view: 'methods' };
  if (s === 'calculator') return { view: 'calculator', section: 'calculator', query: query ?? '' };
  if (SECTIONS.includes(s) && query == null) return { view: 'home', section: s };
  const m = /^hospital-([0-9]{6})$/.exec(s);
  if (m && query == null) return { view: 'hospital', id: m[1] };
  return { view: 'notfound' };
}

export function link(view, arg) {
  if (!view || view === 'home') return '#';
  if (view === 'hospital') return `#hospital-${arg}`;
  return `#${view}`;
}

export function onRoute(cb) {
  const fire = () => cb(parseHash(window.location.hash));
  window.addEventListener('hashchange', fire);
  fire();
}
