// Smoke test of the built page in installed Chrome. Builds from the fixture (see _lib.mjs); E2E_DOCS=1 tests docs/.
// The page is served with the production headers; the font stylesheet is stubbed (empty CSS), so any console error is real.
// Usage: node e2e/smoke.mjs   (exit 1 on any failure)
import { chromium } from 'playwright';
import { serveWithHeaders, builtPage, firstHospital, makeCheck } from './_lib.mjs';
import { HASH_DEBOUNCE_MS, LIVE_DEBOUNCE_MS, NOTICE_FADE_MS } from '../src/js/timing.js';

const html = builtPage();
const { base: PAGE, close } = serveWithHeaders(html);
const hospital = firstHospital(html);
const data = JSON.parse(/<script id="ap-data" type="application\/json">(.*?)<\/script>/s.exec(String(html))[1]);
const HOSTILE = '#calculator?b=abc&a=5&l=<script>&h=../x';
// Fixture edge cases: gap below zero, flagged occupancy, a missing trend year (real builds: unknown ids render not-found).
const EDGE_IDS = ['050123', '060456', '070789'];
const ROUTES = ['', '#wait', '#share', '#methods', '#calculator', '#hospital-000000', '#hospital-999999', `#hospital-${hospital.id}`, ...EDGE_IDS.map((id) => `#hospital-${id}`), '#gap', '#nope-route',
  HOSTILE, `#calculator?h=${hospital.id}&l=hospital`];
const { check, report } = makeCheck('smoke');
// Waits poll for the state they expect instead of sleeping. A debounce is allowed several times its length to land.
const POLL = { timeout: 6 * Math.max(HASH_DEBOUNCE_MS, LIVE_DEBOUNCE_MS) };
// n animation frames: lets synchronous follow-up work (draws, hashchange handlers) finish before a check that nothing happened.
// Like waitForFunction, but a timeout is recorded as a failed check (anything else still throws).
const until = (page, what, fn, arg) => page.waitForFunction(fn, arg, POLL)
  .catch((e) => { if (e.name !== 'TimeoutError') throw e; check(false, `timed out waiting for ${what}`); });
const frames = (page, n = 3) => page.evaluate((k) => new Promise((done) => { const f = (i) => (i ? requestAnimationFrame(() => f(i - 1)) : done()); f(k); }), n);
const browser = await chromium.launch({ channel: 'chrome' });
const stubFonts = (ctx) => ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
const newPage = async (opts) => {
  const ctx = await browser.newContext(opts);
  await stubFonts(ctx);
  return ctx.newPage();
};

for (const scheme of ['light', 'dark']) {
  for (const width of [1280, 360]) {
    for (const hash of ROUTES) {
      const page = await newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(PAGE + hash);
      await page.waitForFunction(() => document.querySelector('#main > div'));
      await frames(page);
      const label = `${hash || '#'} @${width} ${scheme}`;
      check(!errors.length, `${label}: console errors ${JSON.stringify(errors)}`);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `${label}: horizontal overflow (scrollWidth ${sw})`);
      const text = await page.evaluate(() => document.getElementById('main').innerText);
      check(!/\bNaN\b|\bundefined\b|\[object Object\]/.test(text), `${label}: NaN/undefined/[object] in text`);
      const title = await page.title();
      check(title.startsWith('Awaiting Placement:') || title.endsWith(' · Awaiting Placement'), `${label}: title (${title})`);
      const unlabeled = await page.evaluate(() => [...document.querySelectorAll('svg:not([aria-hidden="true"])')]
        .filter((el) => !el.closest('[aria-hidden="true"]') && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
        .map((el) => el.getAttribute('class') || 'svg'));
      check(!unlabeled.length, `${label}: svg without an aria-label (${unlabeled})`);
      check(await page.$('#footer a[href^="https://github.com/"]') !== null, `${label}: footer with the repo link`);
      await page.close();
    }
  }
}
// Route content checks.
{
  const page = await newPage();
  await page.goto(`${PAGE}#hospital-000000`);
  await page.waitForSelector('#main h1');
  check((await page.textContent('#main h1')) === 'Hospital not found', 'unknown hospital shows not-found');
  check((await page.title()) === 'Hospital not found · Awaiting Placement', `not-found names itself in the title (${await page.title()})`);
  check((await page.$('#main input[role="combobox"]')) !== null, 'not-found view has a search box');
  await page.goto(`${PAGE}#hospital-${hospital.id}`);
  await page.reload();
  await page.waitForSelector('#main h1');
  check((await page.textContent('#main h1')) === hospital.name, 'known hospital shows its name');
  const shared = data.hospitals.filter((x) => x.name === hospital.name).length > 1;
  const named = shared ? `${hospital.name} (${[hospital.city, hospital.st].filter(Boolean).join(', ')})` : hospital.name;
  check((await page.title()) === `${named} · Awaiting Placement`, `a hospital route names the hospital in the title (${await page.title()})`);
  await page.goto(`${PAGE}#hospital-999999`);
  await page.reload();
  await page.waitForSelector('#main h1');
  check((await page.textContent('#main h1')) === 'Hospital not found' && (await page.$('#main input[role="combobox"]')) !== null, '#hospital-999999 shows not-found with search');
  await page.goto(`${PAGE}#hospital-${hospital.id}`);
  await page.reload();
  await page.waitForSelector('#main h1');
  const prof = await page.innerText('#main');
  check(/MA share of Medicare discharges\s*\d+%/.test(prof) && /gap [+\u2212]?\d/.test(prof), 'profile shows share and gap');
  check((await page.$$('#main svg.ls__svg')).length === 2 && (await page.$$('#main svg.gs__svg')).length === 1, 'profile draws the gap strip and two trend charts');
  await page.click('#main a.btn');
  await page.waitForSelector('.calc__led');
  check((await page.evaluate(() => location.hash)).includes(`h=${hospital.id}`), 'Open in calculator carries the hospital');
  check((await page.$eval('input[name="lens"]:checked', (el) => el.value)) === 'hospital', 'calculator opens on the hospital lens');
  // Theme toggle flips data-theme.
  await page.click('.theme-btn');
  const t = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check(t === 'dark' || t === 'light', 'theme toggle sets data-theme');
  await page.close();
}
// Methods: every exclusion rule and source from the data; the on-page contents scroll without changing the route.
{
  const page = await newPage();
  await page.goto(`${PAGE}#methods`);
  await page.waitForSelector('#main h1');
  check((await page.textContent('#main h1')) === 'Methods', 'methods heading');
  check((await page.title()) === 'Methods · Awaiting Placement', `methods title (${await page.title()})`);
  check(/Published Oct 2026\s· Data: FY\d{4} cost reports, MedPAC \w+ \d{4}/.test(await page.innerText('section[aria-labelledby="methods-about"]')), 'methods About carries the dateline');
  const reasons = await page.$$eval('tr[data-reason]', (rows) => rows.map((r) => r.getAttribute('data-reason')));
  check(reasons.join() === Object.keys(data.meta.exclusions).join(), `methods lists every exclusion rule (${reasons})`);
  // Overpass Mono draws "÷" as a minus-like bar: no text set in the mono face may carry it, and formulas set no ligatures.
  const mono = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#main *')].filter((el) => /^"?Overpass Mono/.test(getComputedStyle(el).fontFamily));
    const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('');
    return { n: els.length, div: els.filter((el) => own(el).includes('÷')).map(own),
      lig: [...document.querySelectorAll('.formulas code, .mpart p code')].filter((el) => getComputedStyle(el).fontVariantLigatures !== 'none').length };
  });
  check(mono.n > 15 && !mono.div.length && !mono.lig, `methods: mono text has no "÷" and formulas set no ligatures (${mono.n} mono, ${JSON.stringify(mono.div)}, ${mono.lig} with ligatures)`);
  const links = await page.$$eval('table[data-table="sources"] a', (as) => as.map((a) => a.href));
  check(links.length === data.content.sources.length && links.every((u) => u.startsWith('https://')), `methods links every source over https (${links.length})`);
  await page.click('.methods__toc a >> text=About');
  await page.waitForFunction(() => document.activeElement?.id === 'methods-about', null, POLL);
  const r = await page.evaluate(() => [location.hash, document.getElementById('methods-about').getBoundingClientRect().top, document.activeElement?.id]);
  check(r[0] === '#methods' && r[1] < 200 && r[2] === 'methods-about', `methods contents link scrolls in place (${r})`);
  await page.close();
}
// Home: hero, LED count-up lands on the data value, pathway, sections in order.
for (const motion of ['no-preference', 'reduce']) {
  const page = await newPage({ reducedMotion: motion });
  await page.goto(PAGE);
  await page.waitForSelector('.hero h1');
  check((await page.textContent('.hero h1')) === 'Ready to leave the hospital. Still waiting for the next bed.', `home h1 (${motion})`);
  // The hero's LED (the top bar's small copy comes first in the document, so name the hero's).
  if (motion === 'reduce') check((await page.getAttribute('.hero .led__digits', 'data-value')) === '07', 'LED is static under reduced motion');
  await page.waitForFunction(() => document.querySelector('.hero .led__digits')?.getAttribute('data-value') === '07', null, { timeout: 3000 })
    .catch(() => check(false, `LED count-up ends at 07 (${motion})`));
  // Doto's zero is slashed, so the LED shows the letter O for 0; the panel's spoken name keeps the number.
  const led = await page.evaluate(() => [document.querySelector('.hero .led__digits').textContent, document.querySelector('.hero .led').getAttribute('aria-label')]);
  check(led[0] === 'O7' && /^Now serving 07:/.test(led[1]), `LED shows O7 and is named 07 (${led})`);
  const ids = await page.$$eval('.sec h2', (els) => els.map((e) => e.id).join(','));
  check(ids === 'wait,gap,share,calculator,sides', `section order ${ids}`);
  check((await page.$$('.dests .sign')).length === 5, 'five destination signs');
  check((await page.$$('section[aria-labelledby="sides"] ol.board > li')).length > 0, 'No. 05 shows the policy timeline');
  await page.close();
}
// The skip link moves focus to <main> without changing the route or wiping the page.
{
  const page = await newPage();
  await page.goto(PAGE);
  await page.waitForSelector('.hero h1');
  await page.focus('.skip');
  await page.keyboard.press('Enter');
  const r = await page.evaluate(() => [location.hash, document.activeElement?.id, !!document.querySelector('.hero h1'), document.title]);
  check(r[0] === '', `skip link leaves the hash alone (${r[0]})`);
  check(r[1] === 'main', `skip link focuses #main (${r[1]})`);
  check(r[2], 'skip link keeps the page rendered');
  await page.close();
}
// A saved theme is applied in <head>, before <body> exists (no flash of the wrong theme).
{
  const ctx = await browser.newContext({ colorScheme: 'light' });
  await stubFonts(ctx);
  // Init scripts run before <html> exists, so watch the whole document for the attribute.
  await ctx.addInitScript(() => {
    new MutationObserver((ms, obs) => {
      if (ms.some((m) => m.attributeName === 'data-theme')) {
        window.__themeBeforeBody = document.body === null;
        obs.disconnect();
      }
    }).observe(document, { attributes: true, subtree: true });
  });
  const page = await ctx.newPage();
  await page.goto(PAGE);
  await page.waitForSelector('.theme-btn');
  await page.click('.theme-btn'); // light -> dark, saved
  await page.reload();
  await page.waitForSelector('.hero h1');
  const r = await page.evaluate(() => [document.documentElement.getAttribute('data-theme'), window.__themeBeforeBody]);
  check(r[0] === 'dark', `saved theme persists across reload (${r[0]})`);
  check(r[1] === true, 'saved theme applied before <body> is parsed');
  await ctx.close();
}
// Calculator: the slider moves the readout; a shared link restores; a hostile link loads clamped and inert.
const ledLabel = (page) => page.getAttribute('.calc__led', 'aria-label');
const setRange = (page, sel, v) => page.$eval(sel, (el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
{
  const page = await newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${PAGE}#calculator`);
  await page.waitForSelector('.calc__led');
  const top = await page.evaluate(() => document.getElementById('calculator').getBoundingClientRect().top);
  check(top >= 0 && top < 400, `#calculator scrolls the section into view (top ${top})`);
  const before = await ledLabel(page);
  await setRange(page, '.calc__track input[type="range"]', 0.9);
  await page.waitForFunction((b) => document.querySelector('.calc__led').getAttribute('aria-label') !== b, before, POLL);
  const after = await ledLabel(page);
  check(before !== after && /About \d+(\.\d)? beds held/.test(after), `slider changes the readout (${before} -> ${after})`);
  check((await page.inputValue('input[name="maPct"]')) === '90', 'number field follows the slider');
  await until(page, 'the hash to carry the scenario', () => /a=0\.9/.test(location.hash));
  const hash = await page.evaluate(() => location.hash);
  check(/^#calculator\?.*a=0\.9/.test(hash), `hash carries the scenario (${hash})`);
  await until(page, 'the live announcement', () => document.querySelector('.calc__results [aria-live="polite"]').textContent !== '');
  const said = await page.textContent('.calc__results [aria-live="polite"]');
  check(/^About \d+(\.\d)? beds held on an average day\.$/.test(said), `live region announces the result (${said})`);
  await page.click('.calc__share-row .btn');
  await until(page, 'the copy button to report', () => document.querySelector('.calc__copied').textContent !== '');
  check(/Copied|Link selected/.test(await page.textContent('.calc__copied')), 'copy button reports what it did');
  // The copied link, opened fresh and then reloaded, restores the scenario and its readout.
  const shared = await page.inputValue('.calc__link');
  await page.goto(shared);
  await page.reload();
  await page.waitForSelector('.calc__led');
  check((await ledLabel(page)) === after, `copied link restores the readout after a reload (${await ledLabel(page)} vs ${after})`);
  check((await page.inputValue('input[name="maPct"]')) === '90', 'copied link restores the MA share after a reload');
  // Pick a hospital through the omnibox with the keyboard.
  await page.fill('section[aria-labelledby="calculator"] .omni input', hospital.name);
  await page.keyboard.press('Enter');
  await until(page, 'the hash to carry the picked hospital', (id) => location.hash.includes(`h=${id}`), hospital.id);
  check((await page.inputValue('.calc__link')).includes(`h=${hospital.id}`), 'picked hospital goes into the share link');
  check((await page.evaluate(() => location.hash)).includes(`h=${hospital.id}`), 'picked hospital goes into the hash');
  check(!(await page.isDisabled('input[name="lens"][value="hospital"]')), 'own-gap lens enabled after a pick');
  // The No. 03 lookup navigates to the hospital route.
  await page.goto(`${PAGE}#share`);
  await page.fill('section[aria-labelledby="share"] .omni input', hospital.name);
  await page.keyboard.press('Enter');
  await until(page, 'the No. 03 lookup to open the hospital route', (id) => location.hash === `#hospital-${id}`, hospital.id);
  check((await page.evaluate(() => location.hash)) === `#hospital-${hospital.id}`, 'No. 03 lookup opens the hospital route');
  // Typing a real name and pressing Enter lands on that hospital (Massachusetts General when the data has it).
  const mgh = data.hospitals.find((x) => /massachusetts general/i.test(x.name)) ?? hospital;
  await page.goto(`${PAGE}#share`);
  await page.fill('section[aria-labelledby="share"] .omni input', /massachusetts general/i.test(mgh.name) ? 'massachusetts general' : mgh.name);
  await page.keyboard.press('Enter');
  await page.waitForFunction((id) => location.hash === `#hospital-${id}`, mgh.id, POLL);
  await until(page, 'the hospital page', (n) => document.querySelector('#main h1')?.textContent === n, mgh.name);
  check((await page.textContent('#main h1')) === mgh.name, `omnibox Enter lands on ${mgh.name}`);
  // A new scenario link while the page is mounted restores it in place.
  await page.evaluate(() => { location.hash = '#calculator?b=900&a=0.25'; });
  await until(page, 'hashchange to restore beds', () => document.querySelector('input[name="beds"]').value === '900');
  check((await page.inputValue('input[name="beds"]')) === '900', 'hashchange restores beds');
  check((await page.inputValue('input[name="maPct"]')) === '25', 'hashchange restores MA share');
  // A bare #calculator link (nav, hero) keeps the reader's scenario.
  await page.evaluate(() => { location.hash = '#calculator'; });
  await frames(page); // nothing should change, so there is no state to poll for
  check((await page.inputValue('input[name="beds"]')) === '900', 'bare #calculator keeps the scenario');
  check(!errors.length, `calculator interaction errors ${JSON.stringify(errors)}`);
  await page.close();
}
{
  const page = await newPage({ viewport: { width: 360, height: 800 } });
  await page.goto(PAGE);
  await page.waitForSelector('.hero h1');
  const baseline = await page.evaluate(() => document.querySelectorAll('script').length);
  await page.goto(PAGE + HOSTILE);
  await page.reload();
  await page.waitForSelector('.calc__led');
  const r = await page.evaluate(() => ({
    scripts: document.querySelectorAll('script').length,
    ma: document.querySelector('.calc__track input[type="range"]').value,
    lens: document.querySelector('input[name="lens"]:checked')?.value,
    link: document.querySelector('.calc__link').value,
    text: document.querySelector('#calculator').closest('section').innerText,
  }));
  check(r.scripts === baseline, `hostile link adds no script (${r.scripts} vs ${baseline})`);
  check(r.ma === '1' && r.lens === 'placement', `hostile link clamps and falls back (${r.ma}, ${r.lens})`);
  check(!/h=|script/.test(r.link), `hostile link drops bad keys (${r.link})`);
  check(!/\bNaN\b|undefined|Infinity/.test(r.text), 'hostile link: no NaN in the calculator');
  await page.close();
}
// Now serving: past the hero a small LED in the top bar steps toward the reader's number, calls it once at the
// calculator, steps back down on the way up, holds the static pair under reduced motion, and leaves with the story page.
{
  const irf = data.content.medpac.t41.rows.find((r) => r.dest === 'irf');
  const [FROM, TO] = [irf.ffsLos, irf.maLos].map((x) => String(Math.round(x)).padStart(2, '0'));
  const state = (page) => page.evaluate(() => {
    const q = document.querySelector('#topbar .queue');
    const n = document.querySelector('.called');
    const css = (el) => el && getComputedStyle(el);
    return { count: document.querySelectorAll('#topbar .queue').length, on: !!q?.classList.contains('is-on'),
      shown: !!q && css(q).display !== 'none' && css(q).visibility === 'visible' && Number(css(q).opacity) > 0.99,
      digits: q?.querySelector('.led__digits').getAttribute('data-value'),
      ticket: q?.querySelector('.queue__n').textContent, hidden: q?.getAttribute('aria-hidden'),
      notice: n && css(n).visibility === 'visible' && Number(css(n).opacity) > 0.99 ? n.textContent : null,
      listeners: window.__scroll, sw: document.documentElement.scrollWidth };
  });
  const scrollTo = (page, where) => page.evaluate((w) => {
    const bar = document.getElementById('topbar').getBoundingClientRect().height;
    const top = (el) => el.getBoundingClientRect().top + scrollY;
    const y = { hero: 0, share: top(document.getElementById('share')) - 200,
      calculator: top(document.getElementById('calculator').closest('section')) - bar + 1,
      gap: top(document.getElementById('gap')) }[w];
    window.scrollTo(0, y);
  }, where);
  const counting = async (opts) => {
    const ctx = await browser.newContext(opts);
    await stubFonts(ctx);
    // Count live window scroll listeners, to show the counter's binding comes and goes with the story page.
    await ctx.addInitScript(() => {
      window.__scroll = 0;
      const add = window.addEventListener;
      const remove = window.removeEventListener;
      const live = new Set();
      window.addEventListener = function (t, f, o) { if (t === 'scroll' && !live.has(f)) { live.add(f); window.__scroll = live.size; } return add.call(this, t, f, o); };
      window.removeEventListener = function (t, f, o) { if (t === 'scroll' && live.delete(f)) window.__scroll = live.size; return remove.call(this, t, f, o); };
    });
    return ctx.newPage();
  };
  // The e2e page stubs the web fonts, so the metric-matched local fallbacks set the bar: at 360 the unit may size itself
  // away for lack of room. It must never wrap or overflow the bar.
  for (const width of [1280, 414, 360]) {
    const page = await counting({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(PAGE);
    await page.waitForSelector('.hero h1');
    await until(page, 'the counter to bind', () => document.querySelector('#topbar .queue'));
    await frames(page);
    let s = await state(page);
    const at = `@${width}`;
    check(s.count === 1 && !s.on && s.hidden === 'true' && s.listeners === 1, `queue: bound, hidden and aria-hidden at the hero ${at} (${JSON.stringify(s)})`);
    await scrollTo(page, 'share');
    await until(page, 'the counter to show mid-page', ([from, to]) => {
      const q = document.querySelector('#topbar .queue');
      if (!q?.classList.contains('is-on')) return false;
      const d = Number(q.querySelector('.led__digits').getAttribute('data-value'));
      const css = getComputedStyle(q);
      return d > Number(from) && d < Number(to) && (css.display === 'none' || Number(css.opacity) > 0.99);
    }, [FROM, TO]);
    s = await state(page);
    check(s.on && (s.shown || width === 360) && s.digits > FROM && s.digits < TO && s.ticket === TO,
      `queue: shown mid-page and between ${FROM} and ${TO} ${at} (${JSON.stringify(s)})`);
    check(!s.notice, `queue: no notice before the calculator ${at}`);
    await scrollTo(page, 'calculator');
    await until(page, `the counter to read ${TO}`, (to) => document.querySelector('#topbar .led__digits')?.getAttribute('data-value') === to, TO);
    await until(page, 'the notice to fade in', () => {
      const n = document.querySelector('.called');
      const css = n && getComputedStyle(n);
      return !!css && css.visibility === 'visible' && Number(css.opacity) > 0.99;
    });
    s = await state(page);
    check(s.digits === TO, `queue: reads ${TO} at the calculator ${at} (${s.digits})`);
    check(s.notice === `Now serving ${TO}. Please proceed.`, `queue: the calculator header calls the number ${at} (${s.notice})`);
    check(s.sw <= width, `queue: no horizontal overflow ${at} (${s.sw})`);
    const bar = await page.evaluate(() => {
      const R = (sel) => document.querySelector(sel).getBoundingClientRect();
      const q = R('#topbar .queue');
      const links = [...document.querySelectorAll('.sections a')].map((a) => a.getBoundingClientRect());
      const shown = getComputedStyle(document.querySelector('#topbar .queue')).display !== 'none';
      return { fits: !shown || (q.left >= R('.wordmark').right && q.right <= R('#theme-slot').left && q.top >= 0),
        oneRow: R('#theme-slot').top < R('.wordmark').bottom, tap: Math.min(...links.map((b) => Math.min(b.width, b.height))) };
    });
    check(bar.fits && bar.oneRow, `queue: sits between the wordmark and the theme button without wrapping the bar ${at} (${JSON.stringify(bar)})`);
    check(bar.tap >= 44, `nav tap targets at least 44 px ${at} (${bar.tap.toFixed(1)})`);
    await scrollTo(page, 'gap');
    await until(page, 'the counter to step back down', (to) => Number(document.querySelector('#topbar .led__digits')?.getAttribute('data-value')) < Number(to), TO);
    s = await state(page);
    check(s.digits < TO && s.digits >= FROM, `queue: steps back down above the calculator ${at} (${s.digits})`);
    await scrollTo(page, 'hero');
    await until(page, 'the counter to hide at the hero', () => !document.querySelector('#topbar .queue')?.classList.contains('is-on'));
    check(!(await state(page)).on, `queue: hidden again at the hero ${at}`);
    // Leave the story page and come back: no counter elsewhere, one counter and one listener on return.
    await page.evaluate(() => { location.hash = '#methods'; });
    await page.waitForSelector('#main h1');
    s = await state(page);
    check(s.count === 0 && s.listeners === 0, `queue: gone on #methods ${at} (${s.count}, ${s.listeners})`);
    await page.evaluate(() => { location.hash = '#hospital-000000'; });
    await page.waitForSelector('#main .notfound, #main h1');
    await frames(page);
    s = await state(page);
    check(s.count === 0 && s.listeners === 0, `queue: gone on not-found ${at}`);
    await page.evaluate(() => { location.hash = '#gap'; });
    await page.waitForSelector('.hero h1');
    await until(page, 'the counter to re-bind', () => document.querySelectorAll('#topbar .queue').length === 1 && window.__scroll === 1);
    s = await state(page);
    check(s.count === 1 && s.listeners === 1, `queue: re-bound once on return ${at} (${s.count}, ${s.listeners})`);
    await scrollTo(page, 'share');
    await frames(page);
    await scrollTo(page, 'calculator');
    await until(page, `the counter to read ${TO}`, (to) => document.querySelector('#topbar .led__digits')?.getAttribute('data-value') === to, TO);
    await page.waitForTimeout(NOTICE_FADE_MS + 200); // a call that should not happen: give the fade time to show if it did
    s = await state(page);
    check(s.digits === TO && !s.notice, `queue: number called at most once per page view ${at} (${s.notice})`);
    check(!errors.length, `queue: page errors ${JSON.stringify(errors)}`);
    await page.close();
  }
  // Reduced motion: the static pair, no stepping, no call.
  const page = await counting({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(PAGE);
  await page.waitForSelector('.hero h1');
  await scrollTo(page, 'share');
  await until(page, 'the static pair to show', () => {
    const q = document.querySelector('#topbar .queue');
    return !!q?.classList.contains('is-on') && Number(getComputedStyle(q).opacity) > 0.99;
  });
  let s = await state(page);
  check(s.shown && s.digits === FROM && s.ticket === TO, `queue: static pair ${FROM} · ${TO} under reduced motion (${s.digits} · ${s.ticket})`);
  await scrollTo(page, 'calculator');
  await frames(page);
  await page.waitForTimeout(NOTICE_FADE_MS + 200); // a call that should not happen: give the fade time to show if it did
  s = await state(page);
  check(s.digits === FROM && !s.notice, `queue: no stepping and no call under reduced motion (${s.digits}, ${s.notice})`);
  await page.close();
}
const TO_DIGITS = String(Math.round(data.content.medpac.t41.rows.find((r) => r.dest === 'irf').maLos)).padStart(2, '0');
// Deep link to the calculator: the reader did not wait, so the notice must never be called. Run on fresh pages, with the
// font stylesheet arriving late and shrinking the text (a layout shift under the reader, as a real font swap is): the
// browser's scroll anchoring then fires a scroll event before the page has re-measured.
{
  for (let i = 0; i < 10; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (r) => {
      await new Promise((done) => setTimeout(done, 40 + (i % 5) * 50));
      await r.fulfill({ status: 200, contentType: 'text/css', body: 'p, h2, h3, li { font-size: .85em !important; }' });
    });
    const page = await ctx.newPage();
    await page.goto(`${PAGE}#calculator`);
    await until(page, 'the late stylesheet', () => [...document.styleSheets].some((x) => (x.href || '').includes('fonts.googleapis')));
    await frames(page, 30);
    const r = await page.evaluate(() => ({ on: !!document.querySelector('.called.is-on'), digits: document.querySelector('#topbar .led__digits')?.getAttribute('data-value') }));
    check(!r.on, `deep link #calculator (fresh load ${i + 1}): the notice was called`);
    check(r.digits === TO_DIGITS, `deep link (fresh load ${i + 1}): the counter reads ${TO_DIGITS} (${r.digits})`);
    await ctx.close();
  }
}
// Two hash navigations in quick succession right after load: each section lands where scroll-padding-top puts it.
{
  for (const width of [1280, 360]) {
    for (let i = 0; i < 4; i++) {
      const page = await newPage({ viewport: { width, height: 900 } });
      await page.goto(`${PAGE}#share`);
      await page.waitForTimeout(i * 30); // 0 to 90 ms after load
      for (const id of ['gap', 'wait', 'calculator']) {
        await page.evaluate((x) => { location.hash = `#${x}`; }, id);
        await until(page, `#${id} to land below the bar @${width}`, (x) => {
          const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
          return Math.abs(document.getElementById(x).getBoundingClientRect().top - pad) <= 2;
        }, id);
        await frames(page, 10); // and it stays there
        const off = await page.evaluate((x) => {
          const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
          return document.getElementById(x).getBoundingClientRect().top - pad;
        }, id);
        check(Math.abs(off) <= 2, `rapid navigation to #${id} @${width} (load +${i * 30} ms) lands ${off.toFixed(1)} px off`);
      }
      await page.close();
    }
  }
}
// Chart x labels never collide, at phone, tablet (where FY labels once overran: "FY201FY2017") and desktop widths.
{
  for (const width of [390, 640, 768, 820, 1024, 1280]) {
    for (const hash of ['', `#hospital-${hospital.id}`]) {
      const page = await newPage({ viewport: { width, height: 900 } });
      await page.goto(PAGE + hash);
      await page.waitForSelector('#main svg');
      await frames(page, 5);
      const hits = await page.evaluate(() => [...document.querySelectorAll('.ls__xticks, .gs__xticks, .curve__xtick, .db__ticks')].flatMap((g) => {
        const boxes = [...g.querySelectorAll('text')].map((t) => t.getBoundingClientRect()).filter((r) => r.width).sort((a, b) => a.left - b.left);
        return boxes.slice(1).filter((r, i) => r.left < boxes[i].right - 0.5 && Math.abs(r.top - boxes[i].top) < 4).map(() => g.getAttribute('class'));
      }));
      check(!hits.length, `x labels overlap ${hash || '#'} @${width} (${hits})`);
      await page.close();
    }
  }
}
// Home renders (hero h1 and the LED panel) in under 2.5 s on a cold load with the font stylesheet stubbed.
{
  const page = await newPage({ viewport: { width: 1280, height: 900 } });
  const t0 = Date.now();
  await page.goto(PAGE);
  await page.waitForSelector('.hero h1');
  await page.waitForSelector('.hero .led__digits');
  const ms = Date.now() - t0;
  check(ms < 2500, `home renders in under 2.5 s (${ms} ms)`);
  await page.close();
}
// Bed board at 2,500 beds: one full paint (model, board, curve, ledger) measured with frames run synchronously.
{
  const page = await newPage({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce' });
  await page.goto(`${PAGE}#calculator`);
  await page.waitForSelector('.bb svg');
  const t = await page.evaluate(() => {
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { cb(performance.now()); return 0; };
    const f = document.querySelector('input[name="beds"]');
    const time = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };
    const grow = time(() => { f.value = '2500'; f.dispatchEvent(new Event('input', { bubbles: true })); });
    const r = document.querySelector('.calc__track input[type="range"]');
    const toggle = time(() => { r.value = '0.95'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    window.requestAnimationFrame = raf;
    const svg = document.querySelector('.bb svg');
    return { grow, toggle, cells: svg.querySelectorAll('rect').length, w: svg.getBoundingClientRect().right, vw: innerWidth };
  });
  console.log(`bed board: preset -> 2,500 beds paint ${t.grow.toFixed(1)} ms; MA-share change paint ${t.toggle.toFixed(1)} ms; ${t.cells} cells`);
  check(t.cells === 2500, `2,500 cells (${t.cells})`);
  check(t.grow < 50 && t.toggle < 50, `paint under 50 ms (${t.grow.toFixed(1)}, ${t.toggle.toFixed(1)})`);
  check(t.w <= t.vw, `bed board fits at 360 (${t.w} vs ${t.vw})`);
  await page.close();
}
await browser.close();
close();
report();
