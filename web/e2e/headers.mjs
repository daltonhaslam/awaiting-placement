// Serve the fixture-built page with the exact headers from vercel.json and check the page still works under them.
// Usage: node e2e/headers.mjs
import { chromium } from 'playwright';
import { serveWithHeaders, builtPage, firstHospital, makeCheck } from './_lib.mjs';

const html = builtPage();
const { base, close } = serveWithHeaders(html);
const { check, report } = makeCheck('headers check');
const browser = await chromium.launch({ channel: 'chrome' });
const id = firstHospital(html).id;
for (const hash of ['', '#methods', `#hospital-${id}`, `#calculator?h=${id}&l=hospital&p=diem`]) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + hash);
  await page.waitForFunction(() => document.querySelector('#main > div'));
  await page.waitForLoadState('networkidle'); // fonts and any blocked request have settled
  check(!errors.length, `${hash || '#'}: ${errors.join(' | ')}`);
  // fonts.check() is true even for faces that never loaded; require an actually loaded face.
  for (const fam of ['Big Shoulders Display', 'Overpass', 'Overpass Mono', 'Doto']) {
    const loaded = await page.evaluate(async (f) => {
      await document.fonts.load(`16px "${f}"`).catch(() => []);
      return [...document.fonts].some((x) => x.family.replace(/"/g, '') === f && x.status === 'loaded');
    }, fam);
    check(loaded, `${hash || '#'}: font "${fam}" blocked or not loaded`);
  }
  await page.close();
}
await browser.close();
close();
report();
