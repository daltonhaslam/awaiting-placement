// Screenshots of the fixture-built page (see _lib.mjs), saved to e2e/screenshots/ (gitignored).
// Usage: node e2e/shot.mjs                      the standard set: # at 1280 and 360, light and dark
//        node e2e/shot.mjs <hash> <name> [width] [theme] [full=1] [selector]   (selector: shoot one element)
//        E2E_DOCS=1 shoots the committed docs/index.html (real data) instead of the fixture build.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { builtPagePath } from './_lib.mjs';

const args = process.argv.slice(2);
const shots = args.length
  ? [{ hash: args[0], name: args[1] || 'shot', width: Number(args[2] || 1280), theme: args[3] || 'light', full: args[4] !== '0', sel: args[5] }]
  : [1280, 360].flatMap((width) => ['light', 'dark'].map((theme) => ({ hash: '', name: `home-${width}-${theme}`, width, theme, full: true })));

const out = new URL('screenshots/', import.meta.url);
mkdirSync(out, { recursive: true });
const page0 = `file://${builtPagePath()}`;
const browser = await chromium.launch({ channel: 'chrome' });
for (const { hash, name, width, theme, full, sel } of shots) {
  const p = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(page0 + hash);
  await p.evaluate(() => document.fonts.ready);
  // Let the Now Serving count-up finish: the digits have held still for 30 frames.
  await p.evaluate(() => new Promise((done) => {
    let last = null;
    let still = 0;
    const tick = () => {
      const now = document.querySelector('.led__digits')?.textContent;
      still = now === last ? still + 1 : 0;
      last = now;
      if (still >= 30) done(); else requestAnimationFrame(tick);
    };
    tick();
  }));
  const path = new URL(`${name}.png`, out).pathname;
  if (sel) await p.locator(sel).first().screenshot({ path });
  else await p.screenshot({ path, fullPage: full });
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(path, '| errors:', errors.length ? errors : 'none', '| scrollWidth', sw, 'vs', width);
  await p.close();
}
await browser.close();
