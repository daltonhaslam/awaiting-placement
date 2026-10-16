import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SITE, FONTS_HREF } from '../src/js/site.js';
import { cardHtml, cardImageUrl, cardNumbers } from '../og-card.mjs';
import { loadData } from '../src/js/data.js';
import { escapeInlineScript, cspHash } from '../inline-script.mjs';
import { parseHTML } from 'linkedom';
import { parseHash } from '../src/js/router.js';
import { prerender } from '../prerender.mjs';

const cwd = new URL('..', import.meta.url).pathname;
const vercelBefore = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
const out = mkdtempSync(join(tmpdir(), 'ap-build-'));
execFileSync('node', ['build.mjs'], { cwd, env: { ...process.env, AP_DATA: 'test/fixtures/ap.min.json', BUILD_OUT_DIR: out } });
const html = readFileSync(join(out, 'index.html'), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/ap.min.json', import.meta.url), 'utf8'));

test('one data script, no raw closing tag inside it', () => {
  assert.equal(html.match(/<script id="ap-data" type="application\/json">/g).length, 1);
  const body = /<script id="ap-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.ok(!/<\/script/i.test(body));
  assert.ok(!body.includes('<'));
  assert.ok(JSON.parse(body).hospitals.length === 7);
});
test('title and fonts', () => {
  assert.match(html, /<title>Awaiting Placement/);
  assert.match(html, /<link rel="canonical" href="https:\/\/awaiting-placement\.vercel\.app\/">/);
  assert.match(html, /<meta property="og:site_name" content="Awaiting Placement">/);
  assert.match(html, /<meta name="theme-color" content="#f4f3ee" media="\(prefers-color-scheme: light\)"><meta name="theme-color" content="#0d1117" media="\(prefers-color-scheme: dark\)">/);
  const desc = /<meta name="description" content="([^"]*)">/.exec(html)[1];
  assert.ok(desc.length > 50 && desc.length <= 160, `description ${desc.length} chars`);
  assert.ok(html.includes(`<link rel="stylesheet" href="${FONTS_HREF}">`));
});
test('type system: the four families, a metric-matched local fallback for each web face, none of the old faces', () => {
  const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
  const fams = [...FONTS_HREF.matchAll(/family=([^:&]+)/g)].map((m) => m[1].replace(/\+/g, ' '));
  assert.deepEqual(fams, ['Big Shoulders Display', 'Overpass', 'Overpass Mono', 'Doto']);
  for (const f of ['Big Shoulders Fallback', 'Big Shoulders Fallback Wide', 'Overpass Fallback', 'Overpass Mono Fallback']) {
    const rules = [...tokens.matchAll(new RegExp(`@font-face \\{ font-family: '${f}';[^}]*\\}`, 'g'))].map((m) => m[0]);
    assert.ok(rules.length > 0, `${f}: @font-face`);
    for (const r of rules) assert.match(r, /size-adjust: [\d.]+%; ascent-override: [\d.]+%; descent-override: [\d.]+%/, `${f}: metric overrides`);
  }
  // Overpass draws U+00B7 with zero advance; the separator dot comes from a local face listed first.
  assert.match(tokens, /--font-body: 'Overpass Dot', 'Overpass', 'Overpass Fallback'/);
  assert.match(tokens, /font-family: 'Overpass Dot';[^}]*unicode-range: U\+00B7;/);
  assert.doesNotMatch(tokens + FONTS_HREF + html, /Instrument|Atkinson/);
});
test('missing data file fails clearly', () => {
  assert.throws(() => execFileSync('node', ['build.mjs'], { cwd, env: { ...process.env, AP_DATA: 'nope.json', BUILD_OUT_DIR: out }, stdio: 'pipe' }),
    (e) => /ap\.json|AP_DATA|not found/i.test(String(e.stderr)));
});
test('saved theme applies in <head> before first paint, guarded for blocked storage', () => {
  const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
  const script = /<script>([\s\S]*?)<\/script>/.exec(head);
  assert.ok(script, 'inline script in head');
  assert.ok(head.indexOf('<script>') < head.indexOf('<style>'), 'runs before styles');
  assert.match(script[1], /try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/);
  assert.match(script[1], /awaiting-placement-theme/);
  assert.match(script[1], /data-theme/);
});

// Pre-render: the story page and Methods are in the HTML as served, so the page reads without running any script.
test('pre-rendered: <main> carries the story page and Methods without running any script', () => {
  const { document } = parseHTML(html); // linkedom runs no scripts
  const main = document.querySelector('main');
  const home = main.querySelector('[data-prerender="home"]');
  const methods = main.querySelector('[data-prerender="methods"]');
  assert.ok(home && methods, 'both pre-rendered pages');
  assert.match(home.querySelector('.hero .dek').textContent, /^When a hospital patient on a Medicare Advantage plan needs rehab/);
  assert.equal(home.querySelector('.hero h1').textContent, 'Ready to leave the hospital. Still waiting for the next bed.');
  assert.deepEqual([...home.querySelectorAll('.sec h2')].map((x) => x.id), ['wait', 'gap', 'share', 'calculator', 'sides']);
  assert.equal(methods.id, 'methods', 'no-JS #methods links land on it');
  assert.equal(methods.querySelector('h1').textContent, 'Methods');
  assert.ok(methods.querySelectorAll('table[data-table="sources"] a').length > 0, 'the source list');
  assert.match(document.querySelector('#footer').textContent, /Source code on GitHub/);
  assert.match(main.querySelector('noscript').innerHTML, /calculator[^<]*need JavaScript/);
  assert.ok(main.textContent.replace(/\s+/g, ' ').length > 5000, 'readable text in <main>');
});
test('pre-rendered markup: no inline handlers or javascript: URLs, no duplicate ids', () => {
  const body = /<body>([\s\S]*?)<script id="ap-data"/.exec(html)[1];
  assert.doesNotMatch(body, /<[a-z][^>]*\son[a-z]+\s*=/i);
  assert.doesNotMatch(body, /javascript:/i);
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), []);
});
test('pre-render is deterministic: a second build is byte-identical, and its clock is the publication month', async () => {
  const again = mkdtempSync(join(tmpdir(), 'ap-build-'));
  execFileSync('node', ['build.mjs'], { cwd, env: { ...process.env, AP_DATA: 'test/fixtures/ap.min.json', BUILD_OUT_DIR: again } });
  assert.equal(readFileSync(join(again, 'index.html'), 'utf8'), html);
  // The fixture's one timeline item is dated 2026-01-01: "Upcoming" only when published before it.
  const opts = { origin: SITE.url };
  assert.match((await prerender(fixture, { ...opts, published: '2025-06' })).main, /board__status">Upcoming/);
  assert.doesNotMatch((await prerender(fixture, { ...opts, published: '2026-10' })).main, /board__status/);
  assert.equal(typeof globalThis.document, 'undefined', 'the DOM globals are removed afterwards');
  assert.ok(Math.abs(Date.now() - new Date().getTime()) < 1000 && new Date().getFullYear() >= 2026, 'the real clock is back');
  assert.ok(Math.random() < 1, 'Math.random is restored');
  await assert.rejects(prerender(fixture, { ...opts, published: 'soon' }), /publication month/);
});
test('head script names the route in data-boot as the router reads it', () => {
  const head = /<head>[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const boot = (hash) => {
    const attrs = {};
    const doc = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, createElement: () => ({}), head: { appendChild() {} } };
    new Function('localStorage', 'document', 'location', head)({ getItem: () => null }, doc, { hash });
    return attrs['data-boot'];
  };
  const expected = (hash) => ({ home: 'home', calculator: 'home', methods: 'methods' })[parseHash(hash).view] ?? 'other';
  for (const hash of ['', '#', '#/', '#top', '#top?x', '#wait', '#gap', '#share', '#sides', '#sides?x', '#calculator',
    '#calculator?b=300&a=0.5', '#/calculator?h=220071', '#methods', '#methods?x', '#/methods', '#hospital-220071', '#hospital-1', '#nope']) {
    assert.equal(boot(hash), expected(hash), `data-boot for "${hash}"`);
  }
});

const vercelCsp = () => {
  const cfg = JSON.parse(readFileSync(new URL('../vercel.json', new URL('..', import.meta.url)), 'utf8'));
  return cfg.headers[0].headers.find((x) => x.key === 'Content-Security-Policy').value;
};
const inlineScripts = () => [...html.matchAll(/<script(?![^>]*\btype=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

test('CSP script-src has no unsafe-inline and pins exactly the two inline scripts (hash sync is checked against docs/ below)', () => {
  const scriptSrc = /script-src([^;]*)/.exec(vercelCsp())[1];
  assert.ok(!scriptSrc.includes('unsafe-inline'));
  assert.equal(inlineScripts().length, 2, 'theme head script + app bundle');
  assert.equal([...scriptSrc.matchAll(/'sha256-/g)].length, 2, 'no stale hashes');
});
test('no inline event handlers, so no unsafe-inline is needed', () => {
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i);
});
test('fonts stylesheet is started by the head script and kept in <noscript>', () => {
  assert.match(inlineScripts()[0], /createElement\('link'\)/);
  assert.ok(inlineScripts()[0].includes(FONTS_HREF));
});
test('escapeInlineScript neutralizes </script and <!--', () => {
  assert.equal(escapeInlineScript('a="</script>";b="<!--"'), 'a="<\\/script>";b="\\x3c!--"');
  assert.doesNotMatch(escapeInlineScript('x="<!--</script><!--"'), /<!--|<\/script/i);
  assert.ok(!/<!--|<\/script/i.test(inlineScripts().join('')));
});

test('timing constants: one module, and the notice fade matches the stylesheet', async () => {
  const t = await import('../src/js/timing.js');
  assert.deepEqual(Object.keys(t).sort(), ['CALLED_MS', 'HASH_DEBOUNCE_MS', 'LIVE_DEBOUNCE_MS', 'NOTICE_FADE_MS']);
  const css = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
  const fade = /\.called\s*\{[^}]*transition:\s*opacity\s+([\d.]+)s/.exec(css);
  assert.ok(fade, 'the .called rule has an opacity transition');
  assert.equal(Number(fade[1]) * 1000, t.NOTICE_FADE_MS);
  assert.ok(t.LIVE_DEBOUNCE_MS > t.HASH_DEBOUNCE_MS, 'the announcement follows the hash write');
});

const D = loadData(JSON.parse(readFileSync(new URL('../src/data/ap.json', import.meta.url), 'utf8')));
const docs = (f) => new URL(`../../docs/${f}`, import.meta.url);
test('share card: 1200x630 PNG, absolute versioned og:image, size, alt and large-card meta', () => {
  const png = readFileSync(docs('og.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  assert.equal(/<meta property="og:image" content="([^"]+)">/.exec(html)?.[1], cardImageUrl(png));
  assert.match(cardImageUrl(png), new RegExp(`^${SITE.url}/og\\.png\\?v=[0-9a-f]{10}$`));
  assert.ok(cardImageUrl(png).endsWith(createHash('sha256').update(png).digest('hex').slice(0, 10)));
  assert.match(html, /<meta property="og:image:width" content="1200">/);
  assert.match(html, /<meta property="og:image:height" content="630">/);
  assert.match(html, /<meta property="og:image:alt" content="[^"]{20,}">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
});
test('the share card is current: run `node og.mjs` after the data, tokens, or card text change', () => {
  const stamp = JSON.parse(readFileSync(new URL('../og.stamp.json', import.meta.url), 'utf8'));
  assert.equal(stamp.htmlSha256, createHash('sha256').update(cardHtml(D)).digest('hex'));
});
test('the card shows the hero numbers, with their unit and coverage beside them', () => {
  const c = cardHtml(D);
  const { now, you } = cardNumbers(D);
  // The LED is set in Doto, whose zero is slashed: its digits show O for 0. The ticket (Big Shoulders Display) keeps the digit.
  assert.ok(c.includes(`class="digits">${now.replace(/0/g, 'O')}<`));
  assert.ok(c.includes(`class="num">${you}<`));
  assert.ok(c.includes('class="unit">Days in hospital before rehab<'));
  assert.ok(c.includes('Traditional Medicare') && c.includes('Medicare Advantage'));
  // The caption's year and source come from the hero's table, not from the card's text.
  const t41 = D.content.medpac.t41;
  assert.ok(c.includes(`class="cap">Averages before inpatient rehab, FY${t41.fy}, MedPAC<`));
  const other = structuredClone(D);
  other.content.medpac.t41 = { ...t41, fy: 2031, src: [{ label: 'Other Body, Some Report', url: 'https://x.org' }] };
  assert.ok(cardHtml(other).includes('class="cap">Averages before inpatient rehab, FY2031, Other Body<'));
  delete other.content.medpac.t41.src;
  assert.throws(() => cardNumbers(other), /no source/);
});

test('committed docs/index.html: every executable inline-script hash is in vercel.json script-src, and vice versa', () => {
  const doc = readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');
  const hashes = [...doc.matchAll(/<script(?![^>]*\btype="application\/json")[^>]*>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\bsrc=/.test(m[0].slice(0, m[0].indexOf('>'))))
    .map((m) => cspHash(m[1]));
  assert.ok(hashes.length >= 2, 'expected at least the theme and app scripts');
  const vercel = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
  const csp = /"Content-Security-Policy",\s*"value": "([^"]*)"/.exec(vercel)[1];
  const allowed = /script-src([^;]*)/.exec(csp)[1].match(/'sha256-[^']+'/g) ?? [];
  assert.deepEqual([...new Set(hashes)].sort(), [...new Set(allowed)].sort());
});

test('a fixture build leaves vercel.json untouched', () => {
  const p = new URL('../../vercel.json', import.meta.url);
  assert.equal(readFileSync(p, 'utf8'), vercelBefore);
});
