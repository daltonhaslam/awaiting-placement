// Shared helpers for the e2e scripts.
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, normalize, extname } from 'node:path';
import { cspHash, withScriptHashes } from '../inline-script.mjs';

const root = new URL('../../', import.meta.url);
export const vercelConfig = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));

// E2E builds from the contract-shaped fixture into a temp dir (never touches docs/).
// Set E2E_DOCS=1 to test the committed docs/index.html instead.
export function builtPagePath() {
  if (process.env.E2E_DOCS) return new URL(`${vercelConfig.outputDirectory}/index.html`, root).pathname;
  const out = mkdtempSync(join(tmpdir(), 'ap-e2e-'));
  execFileSync('node', ['build.mjs'], { cwd: new URL('web/', root).pathname, stdio: 'pipe',
    env: { ...process.env, AP_DATA: 'test/fixtures/ap.min.json', BUILD_OUT_DIR: out } });
  return join(out, 'index.html');
}
export const builtPage = () => readFileSync(builtPagePath());

// The first hospital of whichever data is under test, so route checks never hard-code an id.
export function firstHospital(html) {
  const m = /<script id="ap-data" type="application\/json">(.*?)<\/script>/s.exec(String(html));
  if (!m) throw new Error('ap-data script not found in built page');
  return JSON.parse(m[1]).hospitals[0];
}

// The static files beside the page (fonts, icons), served from the committed output directory as Vercel serves them.
const STATIC_TYPES = { '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };
const outDir = new URL(`${vercelConfig.outputDirectory}/`, root).pathname;
function staticFile(url) {
  const path = normalize(join(outDir, decodeURIComponent(new URL(url, 'http://x').pathname)));
  const type = STATIC_TYPES[extname(path)];
  if (!type || !path.startsWith(outDir) || !existsSync(path) || !statSync(path).isFile()) return null;
  return { type, body: readFileSync(path) };
}

// Serve one HTML document at / (and the committed static files beside it) with the exact response headers vercel.json
// configures.
export function serveWithHeaders(html) {
  // Each vercel.json rule applies to the paths its source pattern matches (path-to-regexp; these are plain regexes).
  const headersFor = (path) => Object.fromEntries(vercelConfig.headers.filter((r) => new RegExp(`^${r.source}$`).test(path))
    .flatMap((r) => r.headers.map((x) => [x.key, x.value])));
  const headers = headersFor('/');
  // A fixture build has different script bytes than the committed docs/, and test builds never write vercel.json:
  // re-pin script-src in memory to this page's own inline scripts (everything else in the header stays exactly as committed).
  if (!process.env.E2E_DOCS) {
    const scripts = [...String(html).matchAll(/<script(?![^>]*\btype=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => cspHash(m[1]));
    headers['Content-Security-Policy'] = withScriptHashes(headers['Content-Security-Policy'], scripts);
  }
  const server = createServer((req, res) => {
    const file = req.url === '/' ? { type: 'text/html; charset=utf-8', body: html } : staticFile(req.url);
    const path = new URL(req.url, 'http://x').pathname;
    res.writeHead(file ? 200 : 404, { 'Content-Type': file?.type ?? 'text/html; charset=utf-8', ...headersFor(path),
      ...(path === '/' ? headers : {}) });
    res.end(file?.body ?? '');
  }).listen(0);
  return { base: `http://localhost:${server.address().port}/`, close: () => server.close() };
}

// Collect failures; report() prints them and sets the exit code.
export function makeCheck(name) {
  const failures = [];
  return {
    check: (ok, msg) => { if (!ok) failures.push(msg); },
    report() {
      if (failures.length) {
        console.log(`FAIL (${failures.length})\n- ${failures.join('\n- ')}`);
        process.exitCode = 1;
      } else console.log(`${name}: all checks passed`);
    },
  };
}
