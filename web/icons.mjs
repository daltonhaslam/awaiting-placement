// Render the site icon (og-card.mjs iconSvg) to ../docs/favicon.ico (16 and 32 px PNGs) and
// ../docs/apple-touch-icon.png (180 px, full-bleed), and record a hash of the SVGs in icons.stamp.json (a test fails if
// the icons go stale). Usage: node icons.mjs, after the hero number or the LED colours change; then node build.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { loadData } from './src/js/data.js';
import { iconSvg } from './og-card.mjs';

const D = loadData(JSON.parse(readFileSync(new URL('src/data/ap.json', import.meta.url), 'utf8')));
const docs = (f) => new URL(`../docs/${f}`, import.meta.url);

const browser = await chromium.launch({ channel: 'chrome' });
const render = async (svg, px) => {
  const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>*{margin:0}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
};
const touch = await render(iconSvg(D, { square: true }), 180);
const small = [await render(iconSvg(D), 16), await render(iconSvg(D), 32)];
await browser.close();

// ICO container of PNG images: 6-byte header, a 16-byte directory entry per image, then the images.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(small.length, 4);
let offset = 6 + 16 * small.length;
const entries = small.map((png) => {
  const e = Buffer.alloc(16);
  const px = png.readUInt32BE(16);
  e[0] = px; e[1] = px; // width, height (0 would mean 256)
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
writeFileSync(docs('favicon.ico'), Buffer.concat([header, ...entries, ...small]));
writeFileSync(docs('apple-touch-icon.png'), touch);
const svgSha256 = createHash('sha256').update(iconSvg(D, { square: true }) + iconSvg(D)).digest('hex');
writeFileSync(new URL('icons.stamp.json', import.meta.url), `${JSON.stringify({ svgSha256 }, null, 2)}\n`);
console.log('wrote docs/favicon.ico, docs/apple-touch-icon.png and web/icons.stamp.json; now run node build.mjs');
