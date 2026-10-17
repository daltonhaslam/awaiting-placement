import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { SITE, FONTS_HREF } from '../src/js/site.js';
import { cardHtml, cardImageUrl, cardNumbers, iconSvg } from '../og-card.mjs';
import { loadData } from '../src/js/data.js';
import { escapeInlineScript, cspHash } from '../inline-script.mjs';
import { parseHTML } from 'linkedom';
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
});
test('fonts are self-hosted: an inline @font-face for every family in FONTS_HREF, each file a woff2 in docs/fonts/', () => {
  const fams = [...FONTS_HREF.matchAll(/family=([^:&]+)/g)].map((m) => m[1].replace(/\+/g, ' '));
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  const faces = [...style.matchAll(/@font-face\{([^}]*)\}/g)].map((m) => m[1])
    .map((b) => ({ family: /font-family:"?([^";]+)"?/.exec(b)?.[1], src: /src:url\(([^)]+)\)/.exec(b)?.[1] }))
    .filter((f) => fams.includes(f.family));
  for (const f of fams) assert.ok(faces.some((x) => x.family === f), `${f}: @font-face in the page`);
  for (const { family, src } of faces) {
    assert.match(src, /^fonts\/[a-z-]+\.woff2$/, `${family}: same-origin relative url`);
    assert.equal(readFileSync(new URL(`../../docs/${src}`, import.meta.url)).subarray(0, 4).toString('latin1'), 'wOF2', `${src} is woff2`);
  }
  assert.ok(readFileSync(new URL('../../docs/fonts/OFL.txt', import.meta.url), 'utf8').includes('SIL Open Font License'));
});
test('the page makes no third-party request: no external stylesheet, script, font, image or preconnect', () => {
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|<link rel="preconnect"|<noscript><link/);
  // Every <link>, <script src> and CSS url() points at this origin (canonical and og:url name the site, they load nothing).
  const loads = [...html.matchAll(/<link [^>]*href="([^"]+)"/g)].filter((m) => !/rel="canonical"/.test(m[0])).map((m) => m[1])
    .concat([...html.matchAll(/<script [^>]*src="([^"]+)"/g)].map((m) => m[1]))
    .concat([...(/<style>([\s\S]*?)<\/style>/.exec(html)[1]).matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/^["']|["']$/g, '')));
  for (const u of loads) assert.ok(!/^(https?:)?\/\//.test(u), `third-party load: ${u.slice(0, 80)}`);
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
test('pre-render is deterministic: a second build is byte-identical, and its date is the publication month', async () => {
  const again = mkdtempSync(join(tmpdir(), 'ap-build-'));
  execFileSync('node', ['build.mjs'], { cwd, env: { ...process.env, AP_DATA: 'test/fixtures/ap.min.json', BUILD_OUT_DIR: again } });
  assert.equal(readFileSync(join(again, 'index.html'), 'utf8'), html);
  // The fixture's one timeline item is dated 2026-01-01: "Upcoming" and "From" only when published before it.
  const opts = { origin: SITE.url };
  const before = (await prerender(fixture, { ...opts, published: '2025-06' })).main;
  const after = (await prerender(fixture, { ...opts, published: '2026-10' })).main;
  assert.match(before, /board__status">Upcoming/);
  assert.match(before, /path__when">From /);
  assert.doesNotMatch(after, /board__status/);
  assert.match(after, /path__when">Since /);
  await assert.rejects(prerender(fixture, { ...opts, published: 'soon' }), /publication month/);
});
test('head script names the route in data-boot (router.parseHash, inlined)', () => {
  const head = /<head>[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const boot = (hash) => {
    const attrs = {};
    const doc = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, createElement: () => ({}), head: { appendChild() {} } };
    new Function('localStorage', 'document', 'location', head)({ getItem: () => null }, doc, { hash });
    return attrs['data-boot'];
  };
  for (const [hash, want] of [['', 'home'], ['#gap', 'home'], ['#calculator?b=300&a=0.5', 'home'], ['#methods', 'methods'],
    ['#hospital-220071', 'other'], ['#nope', 'other']]) {
    assert.equal(boot(hash), want, `data-boot for "${hash}"`);
  }
});
test('head script stays ES5 syntax, and a failing route part leaves the theme alone', () => {
  const head = /<head>[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(html)[1];
  // One newer construct is a parse error in an old browser, which drops the whole script (the theme too).
  assert.doesNotMatch(head, /\?\?|\?\.[^\d]|catch\s*\{|=>|`|\b(let|const|class)\s/);
  const attrs = {};
  const doc = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };
  const location = { get hash() { throw new Error('no hash'); } };
  new Function('localStorage', 'document', 'location', head)({ getItem: () => 'dark' }, doc, location);
  assert.equal(attrs['data-theme'], 'dark');
  assert.equal(attrs['data-boot'], undefined);
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
test('CSP: hashes only for scripts, same-origin fonts, nothing else loadable or submittable, no third-party origin', () => {
  const csp = vercelCsp();
  const dir = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.ok(dir['script-src'].every((v) => /^'sha256-[A-Za-z0-9+/=]+'$/.test(v)), `script-src: ${dir['script-src']}`);
  assert.deepEqual(dir['font-src'], ["'self'"]);
  assert.deepEqual(dir['img-src'], ["'self'", 'data:']);
  for (const k of ['connect-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']) assert.deepEqual(dir[k], ["'none'"], k);
  assert.deepEqual(dir['require-trusted-types-for'], ["'script'"], 'no HTML string sinks (e2e:headers proves enforcement)');
  assert.doesNotMatch(csp, /https?:|blob:|unsafe-eval/);
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
test('favicon.ico and apple-touch-icon.png exist beside the page, are linked, and show the LED mark', () => {
  assert.match(html, /<link rel="icon" href="favicon\.ico" sizes="32x32">/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/);
  assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
  const png = readFileSync(docs('apple-touch-icon.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [180, 180]);
  // ICO: reserved 0, type 1, then one 16-byte directory entry per image (width/height bytes), each image a PNG.
  const ico = readFileSync(docs('favicon.ico'));
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2)], [0, 1]);
  const n = ico.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < n; i++) {
    const e = 6 + 16 * i;
    sizes.push(ico[e]);
    const off = ico.readUInt32LE(e + 12);
    assert.equal(ico.subarray(off + 1, off + 4).toString(), 'PNG', `image ${i} is a PNG`);
    assert.ok(off + ico.readUInt32LE(e + 8) <= ico.length, `image ${i} inside the file`);
  }
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32]);
});
test('the icons are current: run `node icons.mjs` after the hero number or the mark changes', () => {
  const stamp = JSON.parse(readFileSync(new URL('../icons.stamp.json', import.meta.url), 'utf8'));
  assert.equal(stamp.svgSha256, createHash('sha256').update(iconSvg(D, { square: true }) + iconSvg(D)).digest('hex'));
  assert.ok(iconSvg(D).includes(`>${cardNumbers(D).now}</text>`));
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
