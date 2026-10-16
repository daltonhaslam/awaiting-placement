import { clear, flushDraws } from './dom.js';
import { SITE } from './site.js';
import { onRoute } from './router.js';
import { loadData } from './data.js';
import { themeButton } from './ui/theme.js';
import { tooltip } from './ui/tooltip.js';
import { trackTopbar } from './ui/topbar.js';
import { bindQueue } from './ui/queue.js';
import { resetFigures } from './ui/figure.js';
import { update } from './ui/nowServing.js';
import { renderHome } from './views/home.js';
import { renderHospital, hospitalTitle } from './views/hospital.js';
import { restoreCalculator, disposeCalculator } from './views/calculator.js';
import { renderMethods } from './views/methods.js';
import { renderNotFound } from './views/notFound.js';
import { renderFooter } from './views/footer.js';

const D = loadData();
const HOME_TITLE = document.title;
const main = document.getElementById('main');
document.getElementById('theme-slot').append(themeButton());
trackTopbar(document.getElementById('topbar'));
document.getElementById('footer').replaceChildren(renderFooter(D)); // replaces the pre-rendered copy

// The skip link moves focus without touching the route (a bare #main would read as an unknown route).
document.querySelector('.skip')?.addEventListener('click', (e) => { e.preventDefault(); main.focus(); });

// Each route names itself in the tab, history and bookmarks ("Massachusetts General Hospital · Awaiting Placement").
function titleFor(r) {
  if (r.view === 'methods') return 'Methods';
  if (r.view === 'hospital') {
    const x = D.hospitalsById.get(r.id);
    return x ? hospitalTitle(D, x) : 'Hospital not found';
  }
  return 'Page not found';
}

function view(r) {
  if (r.view === 'methods') return renderMethods(D);
  if (r.view === 'hospital') return renderHospital(D, r.id);
  return renderNotFound(D);
}

// The story page stays mounted while the hash moves between its sections; other routes re-render.
// The top-bar "Now serving" counter lives only on the story page. It binds once the route has set the scroll
// position (so a deep link to #calculator doesn't count as having waited) and unbinds when the page goes.
const queueSlot = document.getElementById('queue-slot');
let current = null;
let unbindQueue = null;
// Pre-rendered: the build puts the story page and Methods in <main> (see prerender.mjs), and the head script's data-boot
// shows the one this route renders. The first render below replaces it in the same task (clear, render, draw), so no
// frame shows an empty page, and nothing pre-rendered (ids, landmarks) survives. The hero LED the reader is already
// looking at keeps its number instead of resetting to 00 to count up.
const shownLed = document.documentElement.getAttribute('data-boot') === 'home'
  ? main.querySelector('[data-prerender="home"] .hero .led__digits')?.getAttribute('data-value') : null;
onRoute((r) => {
  tooltip.hide();
  const key = r.view === 'home' || r.view === 'calculator' ? 'home' : `${r.view}:${r.id ?? ''}`;
  if (key !== current) {
    unbindQueue?.();
    unbindQueue = null;
    disposeCalculator();
    resetFigures();
    clear(main);
    if (key === 'home') {
      renderHome(main, D, r);
      const led = current === null && shownLed ? main.querySelector('.hero .led') : null;
      if (led) update(led, shownLed, { from: shownLed });
    } else main.append(view(r));
    flushDraws();
    // A new page puts focus on its heading, so a keyboard or screen-reader user lands where they navigated to. The
    // story page keeps today's behaviour: its sections scroll into view without moving focus.
    if (key !== 'home') {
      const h1 = main.querySelector('h1');
      if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
    }
    if (current === null) document.documentElement.removeAttribute('data-boot');
    current = key;
  } else if (r.view === 'calculator' && r.query) restoreCalculator(r.query); // a new scenario link while the page is up
  if (r.section) document.getElementById(r.section)?.scrollIntoView();
  else window.scrollTo(0, 0);
  if (key === 'home' && !unbindQueue) unbindQueue = bindQueue(D, { slot: queueSlot, root: main });
  document.title = key === 'home' ? HOME_TITLE : `${titleFor(r)} · ${SITE.name}`;
});
