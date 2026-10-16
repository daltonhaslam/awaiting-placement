// Bundle JS, inline CSS + data, write ../docs/index.html (one self-contained page).
// Env: AP_DATA  data file (default src/data/ap.json, produced by the pipeline);
//      BUILD_OUT_DIR  write index.html there instead of ../docs (tests).
// Only a build with neither set updates vercel.json's CSP hashes.
import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { escapeInlineScript, cspHash, withScriptHashes } from './inline-script.mjs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { SITE, FONTS_HREF, THEME_KEY } from './src/js/site.js';
import { cardImageUrl, cardNumbers } from './og-card.mjs';

const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p), 'utf8');

const dataPath = process.env.AP_DATA ? resolve(process.env.AP_DATA) : fileURLToPath(here('src/data/ap.json'));
if (!existsSync(dataPath)) {
  console.error(`Data file not found: ${dataPath}\nRun the pipeline (python3 -I pipeline/build_data.py) to produce web/src/data/ap.json, or set AP_DATA=<path>.`);
  process.exit(1);
}
const rawData = readFileSync(dataPath, 'utf8');
const { latestFy, nClean } = JSON.parse(rawData).meta;

// The explicit night-mode toggle reuses the dark media block's tokens verbatim.
const tokens = read('src/styles/tokens.css');
const darkDecls = /:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/.exec(tokens)?.[1];
if (!darkDecls) throw new Error('tokens.css: dark media block not found');
const css = (await transform([tokens, `:root[data-theme="dark"] {${darkDecls}}`, ...['base', 'components', 'charts'].map((n) => read(`src/styles/${n}.css`))].join('\n'),
  { loader: 'css', minify: true })).code;
const js = (await build({ entryPoints: [fileURLToPath(here('src/js/main.js'))], bundle: true, format: 'iife',
  minify: true, write: false, target: 'es2020', legalComments: 'none' })).outputFiles[0].text;
// Escape every '<' so no data string can close the script element.
const data = rawData.replace(/</g, '\\u003c');

// Attribute values in the head: a quote or angle bracket in the copy must not end the attribute or the tag.
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Under 160 characters, so search results and link previews show it whole.
const DESC = `Medicare Advantage patients stay longer in the hospital before post-acute care. What those days mean for beds. `
  + `Profiles of ${nClean.toLocaleString('en-US')} hospitals, FY${latestFy} cost reports.`;
if (DESC.length > 160) throw new Error(`meta description is ${DESC.length} characters; keep it under 160`);
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  // Non-blocking: the hashed head script appends the stylesheet link (no inline event handler, so no 'unsafe-inline').
  + `<noscript><link rel="stylesheet" href="${FONTS_HREF}"></noscript>`;
const cardN = cardNumbers(JSON.parse(rawData));
// The favicon is a tiny Now Serving LED: the housing (--led-bg) with the hero's number in the LED orange (--led).
const ICON = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#111513"/><text x="16" y="22" font-family="monospace" font-weight="700" font-size="16" text-anchor="middle" fill="#ff6a3d">${cardN.now}</text></svg>`)}">`;
const OG_ALT = `Awaiting Placement: Ready to leave the hospital. Still waiting for the next bed. Now serving ${cardN.now}, your number ${cardN.you}: average days in hospital before inpatient rehab, traditional Medicare vs Medicare Advantage.`;
const OG = `<meta property="og:image" content="${cardImageUrl(readFileSync(here('../docs/og.png')))}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`
  + `<meta property="og:image:alt" content="${attr(OG_ALT)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image:alt" content="${attr(OG_ALT)}">`;
const CANON = new URL(SITE.url).href;
// Light and dark page colours from tokens.css, so the browser chrome matches the page on phones.
const THEME_COLOR = `<meta name="theme-color" content="#f4f3ee" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)">`;
const title = `${SITE.name}: Medicare Advantage and hospital length of stay`;
// Apply a saved Day/Night choice before first paint (no flash), then start the non-blocking font stylesheet.
// Inline scripts are allowed by their sha256 in the CSP (see below), not by 'unsafe-inline'.
const THEME_JS = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});`
  + `if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`
  + `var l=document.createElement('link');l.rel='stylesheet';l.href=${JSON.stringify(FONTS_HREF)};document.head.appendChild(l);`;
const THEME = `<script>${THEME_JS}</script>`;
const APP_JS = escapeInlineScript(js);
const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
  + `<title>${attr(title)}</title><meta name="description" content="${attr(DESC)}"><link rel="canonical" href="${CANON}">${THEME_COLOR}`
  + `<meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(DESC)}"><meta property="og:type" content="website"><meta property="og:url" content="${CANON}">`
  + `<meta property="og:site_name" content="${attr(SITE.name)}"><meta property="og:locale" content="en_US">${OG}`
  + `${THEME}${ICON}${FONTS}<style>${css}</style></head><body>${read('src/shell.html')}`
  + `<script id="ap-data" type="application/json">${data}</script><script>${APP_JS}</script></body></html>`;

// Pin the CSP's script-src to exactly these two inline scripts. Only the real build (default data, default output) may
// rewrite the tracked vercel.json; fixture/test builds must never touch tracked files, or vercel.json desyncs from docs/.
if (!process.env.BUILD_OUT_DIR && !process.env.AP_DATA) {
  const vercelPath = fileURLToPath(here('../vercel.json'));
  const vercel = readFileSync(vercelPath, 'utf8');
  const csp = withScriptHashes(/"Content-Security-Policy",\s*"value": "([^"]*)"/.exec(vercel)[1], [cspHash(THEME_JS), cspHash(APP_JS)]);
  writeFileSync(vercelPath, vercel.replace(/("Content-Security-Policy",\s*"value": ")[^"]*"/, `$1${csp}"`));
}

const outDir = process.env.BUILD_OUT_DIR ?? fileURLToPath(here('../docs/'));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), doc);
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`${join(outDir, 'index.html')} ${kb(doc)} (js ${kb(js)}, css ${kb(css)}, data ${kb(data)})`);
