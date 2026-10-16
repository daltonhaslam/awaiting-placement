// Pre-render the story page and Methods at build time, so the shipped HTML reads without JavaScript (crawlers, reader
// modes, a slow phone before the bundle has run). The page's own view code runs here in a linkedom DOM, as the unit
// tests run it: no browser, so the markup depends only on the data and the source, and a rebuild is byte-identical on
// any machine. main.js replaces this markup with its own first render (see "Pre-rendered" there).
//
// What differs from the browser's first render, by design:
//  - The clock reads the first day of the publication month (PUBLISHED), not the build day, so "Since"/"From" and the
//    timeline board are stable; the reader's browser re-renders them against the real date.
//  - No layout: charts draw at their fallback width; the browser redraws them at the measured one.
//  - No motion and no stored theme: the LED shows its final number, and the theme button (its label depends on the
//    reader's saved choice) is left to main.js.
import { parseHTML } from 'linkedom';

// Returns { main, footer }: the markup for <main> (the story page, then Methods) and for the footer. Each pre-rendered
// page is tagged data-prerender="home" | "methods", which the boot CSS uses to show the one the URL asks for. Methods
// also takes id="methods", so its links jump there without JavaScript.
export async function prerender(raw, { published, origin }) {
  const dom = parseHTML('<!doctype html><html><head></head><body><main id="main"></main></body></html>');
  const location = new URL(origin);
  dom.window.location = location; // the calculator's share link and the external-link check read the page URL
  const t = Date.parse(`${published}-01T00:00:00Z`);
  if (!Number.isFinite(t)) throw new Error(`prerender: bad publication month "${published}"`);
  const RealDate = Date;
  // `new Date()` and Date.now() read the publication date; dates built from arguments are untouched.
  class FixedDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [t])); }
    static now() { return t; }
  }
  const globals = { window: dom.window, document: dom.document, Node: dom.Node, HTMLElement: dom.HTMLElement, location, Date: FixedDate };
  const saved = Object.keys(globals).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  const random = Math.random;
  Object.assign(globalThis, globals);
  Math.random = () => { throw new Error('prerender: Math.random would make the build nondeterministic'); };
  try {
    const { loadData } = await import('./src/js/data.js');
    const { resetFigures } = await import('./src/js/ui/figure.js');
    const { renderHome } = await import('./src/js/views/home.js');
    const { renderMethods } = await import('./src/js/views/methods.js');
    const { renderFooter } = await import('./src/js/views/footer.js');
    const D = loadData(structuredClone(raw));
    const main = dom.document.getElementById('main');
    resetFigures(); // as main.js does before every render, so figure numbers match the browser's
    renderHome(main, D);
    main.lastElementChild.setAttribute('data-prerender', 'home');
    resetFigures();
    const methods = main.appendChild(renderMethods(D));
    methods.setAttribute('data-prerender', 'methods');
    methods.setAttribute('id', 'methods');
    return { main: main.innerHTML, footer: renderFooter(D).outerHTML };
  } finally {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    Math.random = random;
  }
}
