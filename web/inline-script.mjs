// Make bundled JS safe to inline in a <script> element, and compute its CSP hash.
import { createHash } from 'node:crypto';

// '</script' would close the element; '<!--' can open an HTML-comment state inside it.
export function escapeInlineScript(js) {
  const out = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '\\x3c!--');
  if (/<!--|<\/script/i.test(out)) throw new Error('inline script still contains <!-- or </script after escaping');
  return out;
}

export const cspHash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

// Replace the script-src directive of a CSP value with exactly the given hashes: every script on the page is inline,
// so neither 'self' nor 'unsafe-inline' is allowed.
export const withScriptHashes = (csp, hashes) => csp.replace(/script-src[^;]*/, `script-src ${hashes.join(' ')}`);
