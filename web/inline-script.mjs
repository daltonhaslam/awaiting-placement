// Make bundled JS safe to inline in a <script> element, and compute its CSP hash.
import { createHash } from 'node:crypto';

// '</script' would close the element; '<!--' can open an HTML-comment state inside it.
export function escapeInlineScript(js) {
  const out = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '\\x3c!--');
  if (/<!--|<\/script/i.test(out)) throw new Error('inline script still contains <!-- or </script after escaping');
  return out;
}

export const cspHash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

// Replace the script-src directive of a CSP value with 'self' plus exactly the given hashes: every other script is inline,
// so 'unsafe-inline' is never allowed; 'self' permits only Vercel Web Analytics' /_vercel/insights/script.js.
export const withScriptHashes = (csp, hashes) => csp.replace(/script-src[^;]*/, `script-src 'self' ${hashes.join(' ')}`);
