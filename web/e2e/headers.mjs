// Serve the fixture-built page with the exact headers from vercel.json and check the page still works under them, loads
// every web font from its own origin, and makes no request to any other origin.
// Usage: node e2e/headers.mjs
import { chromium } from 'playwright';
import { serveWithHeaders, builtPage, firstHospital, makeCheck } from './_lib.mjs';

const html = builtPage();
const { base, close } = serveWithHeaders(html);
const { check, report } = makeCheck('headers check');
const browser = await chromium.launch({ channel: 'chrome' });
const id = firstHospital(html).id;
const fontUrls = []; // each font file requested, checked for its long-lived cache header
for (const hash of ['', '#methods', `#hospital-${id}`, `#calculator?h=${id}&l=hospital&p=diem`]) {
  const page = await browser.newPage();
  const errors = [];
  const foreign = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith('data:')) foreign.push(r.url());
    else if (r.url().endsWith('.woff2')) fontUrls.push(r.url());
  });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + hash);
  await page.waitForFunction(() => document.querySelector('#main > div'));
  await page.waitForLoadState('networkidle'); // fonts and any blocked request have settled
  check(!errors.length, `${hash || '#'}: ${errors.join(' | ')}`);
  check(!foreign.length, `${hash || '#'}: third-party requests ${foreign.join(' | ')}`);
  for (const url of fontUrls.splice(0)) {
    const res = await page.request.get(url);
    check(/immutable/.test(res.headers()['cache-control'] ?? ''), `${url}: cache-control ${res.headers()['cache-control']}`);
  }
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
// Every icon the page links (and the /favicon.ico browsers ask for unprompted) is served: 200, an image type.
{
  const page = await browser.newPage();
  await page.goto(base);
  const hrefs = await page.$$eval('link[rel~="icon"], link[rel="apple-touch-icon"]', (ls) => ls.map((l) => l.href).filter((h) => !h.startsWith('data:')));
  check(hrefs.length >= 2, `icon links: ${hrefs.length}`);
  for (const url of new Set([...hrefs, `${base}favicon.ico`])) {
    const res = await page.request.get(url);
    check(res.status() === 200 && /^image\//.test(res.headers()['content-type'] ?? ''), `${url}: ${res.status()} ${res.headers()['content-type']}`);
  }
  await page.close();
}
// The CSP's require-trusted-types-for is in force: an HTML string sink throws (the app has none; this proves the header).
{
  const page = await browser.newPage();
  await page.goto(base);
  const blocked = await page.evaluate(() => { try { document.createElement('div').innerHTML = '<b>x</b>'; return false; } catch { return true; } });
  check(blocked, 'Trusted Types not enforced: innerHTML accepted a string');
  await page.close();
}
await browser.close();
close();
report();
