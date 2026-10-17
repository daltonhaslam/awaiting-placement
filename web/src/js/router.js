// Hash routes are plain anchors so deep links survive any host.
//   #  home    #wait #gap #share #calculator #sides  home sections
//   #calculator?b=300&a=0.5   calculator view (query decoded by the calculator, not here)
//   #hospital-220071          hospital profile        #methods   methods
export const SECTIONS = ['wait', 'gap', 'share', 'calculator', 'sides'];

// parseHash and bootPage also ship verbatim (toString) in the build's pre-paint head script, so each is self-contained
// (SECTIONS is the one outside name, defined there too) and stays ES5 syntax: one newer construct (?? or catch {) is a
// parse error in an old browser, which drops the whole head script, theme and fonts with it.
export function parseHash(hash) {
  var s = String(hash || '').replace(/^#\/?/, '');
  var q = s.indexOf('?');
  var query = q >= 0 ? s.slice(q + 1) : null;
  if (q >= 0) s = s.slice(0, q);
  try {
    s = decodeURIComponent(s);
  } catch (e) {
    return { view: 'notfound' };
  }
  if (!s || s === 'top') return query == null ? { view: 'home' } : { view: 'notfound' };
  if (s === 'methods' && query == null) return { view: 'methods' };
  if (s === 'calculator') return { view: 'calculator', section: 'calculator', query: query == null ? '' : query };
  if (SECTIONS.indexOf(s) >= 0 && query == null) return { view: 'home', section: s };
  var m = /^hospital-([0-9]{6})$/.exec(s);
  if (m && query == null) return { view: 'hospital', id: m[1] };
  return { view: 'notfound' };
}

// The page a route's view renders: the story page (its sections and the calculator), Methods, or another (one hospital,
// not found). The head script's data-boot shows the matching pre-rendered page; the app re-renders only when it changes.
export function bootPage(view) {
  return view === 'home' || view === 'calculator' ? 'home' : view === 'methods' ? 'methods' : 'other';
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
