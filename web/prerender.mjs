// Pre-render the story page and Methods at build time, so the shipped HTML reads without JavaScript (crawlers, reader
// modes, a slow phone before the bundle has run). The page's own view code runs here in a linkedom DOM, as the unit
// tests run it: no browser, so the markup depends only on the data and the source, and a rebuild is byte-identical on
// any machine. main.js replaces this markup with its own first render (see "Pre-rendered" there).
//
// What differs from the browser's first render, by design:
//  - The date is the first day of the publication month (PUBLISHED), not the build day, so "Since"/"From" and the
//    timeline board are stable; the reader's browser re-renders them against the real date.
//  - No layout: charts draw at their fallback width; the browser redraws them at the measured one.
//  - No motion and no stored theme: the LED shows its final number, and the theme button (its label depends on the
//    reader's saved choice) is left to main.js.
import { parseHTML } from 'linkedom';

// Returns { main, footer }: the markup for <main> (the story page, then Methods) and for the footer. Each pre-rendered
// page is tagged data-prerender="home" | "methods", which the boot CSS uses to show the one the URL asks for. Methods
// also takes id="methods", so its links jump there without JavaScript. `data` is the parsed contract; the views only
// read it. The DOM globals are set for the views and left in place: the build is a one-shot process.
export async function prerender(data, { published, origin }) {
  const now = new Date(`${published}-01T00:00:00Z`);
  if (!Number.isFinite(now.getTime())) throw new Error(`prerender: bad publication month "${published}"`);
  const dom = parseHTML('<!doctype html><html><head></head><body><main id="main"></main></body></html>');
  const location = new URL(origin);
  dom.window.location = location; // the calculator's share link and the external-link check read the page URL
  Object.assign(globalThis, { window: dom.window, document: dom.document, Node: dom.Node, HTMLElement: dom.HTMLElement, location });
  const { loadData } = await import('./src/js/data.js');
  const { resetFigures } = await import('./src/js/ui/figure.js');
  const { renderHome } = await import('./src/js/views/home.js');
  const { renderMethods } = await import('./src/js/views/methods.js');
  const { renderFooter } = await import('./src/js/views/footer.js');
  const D = loadData(data);
  const main = dom.document.getElementById('main');
  resetFigures(); // as main.js does before every render, so figure numbers match the browser's
  renderHome(main, D, {}, { now, animate: false });
  main.lastElementChild.setAttribute('data-prerender', 'home');
  resetFigures();
  const methods = main.appendChild(renderMethods(D));
  methods.setAttribute('data-prerender', 'methods');
  methods.setAttribute('id', 'methods');
  return { main: main.innerHTML, footer: renderFooter(D).outerHTML };
}
