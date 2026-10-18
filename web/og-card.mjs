// The social preview card: its HTML (pure, so a test can hash it) and its published, versioned URL.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pad2, ledGlyphs } from './src/js/format.js';
import { SITE, FONTS_HREF } from './src/js/site.js';
import { firstSrc, shortName } from './src/js/ui/source.js';

// Every face the card uses; og.mjs refuses to render if any of them fails to load.
export const CARD_FONTS = [['Big Shoulders Display', '800'], ['Big Shoulders Display', '700'], ['Overpass', '400'],
  ['Overpass', '700'], ['Doto', '800']];

// The query string changes whenever the image does, so link-preview caches fetch the new card.
export const cardImageUrl = (png) => new URL(`og.png?v=${createHash('sha256').update(png).digest('hex').slice(0, 10)}`, SITE.url).href;

// The two numbers are the hero's: mean days before inpatient rehab, traditional Medicare vs Medicare Advantage, with
// the fiscal year and the source's short name ("MedPAC") read from the same table the hero cites.
export function cardNumbers(D) {
  const t41 = D.content?.medpac?.t41;
  const irf = t41?.rows?.find((r) => r.dest === 'irf');
  if (!irf || !Number.isFinite(irf.ffsLos) || !Number.isFinite(irf.maLos)) throw new Error('OG card: inpatient rehab row missing from the data');
  const src = shortName(firstSrc(t41.src));
  if (!src) throw new Error('OG card: the inpatient rehab table has no source');
  return { now: pad2(irf.ffsLos), you: pad2(irf.maLos), fy: t41.fy, src };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const TOKENS = readFileSync(new URL('src/styles/tokens.css', import.meta.url), 'utf8');
// The first hex value of a colour token in a stylesheet (in tokens.css, the light theme's).
export const cssColor = (css, name) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\b`).exec(css)?.[1]
  ?? (() => { throw new Error(`tokens.css: --${name} not found`); })();

// The site's icon: a tiny Now Serving LED, the housing (--led-bg) with the hero's number in the LED orange (--led).
// Inlined as the SVG favicon by build.mjs and rendered to favicon.ico and apple-touch-icon.png by icons.mjs. square:
// full-bleed, for the Apple touch icon (iOS rounds the corners itself and shows transparency as black).
export function iconSvg(D, { square = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32"${square ? '' : ' rx="3"'} `
    + `fill="${cssColor(TOKENS, 'led-bg')}"/><text x="16" y="22" font-family="monospace" font-weight="700" font-size="16" `
    + `text-anchor="middle" fill="${cssColor(TOKENS, 'led')}">${cardNumbers(D).now}</text></svg>`;
}

// The hash icons.mjs records in icons.stamp.json; a test fails when it no longer matches the icons' SVG.
export const iconsStamp = (D) => createHash('sha256').update(iconSvg(D, { square: true }) + iconSvg(D)).digest('hex');

export function cardHtml(D) {
  const { now, you, fy, src } = cardNumbers(D);
  const tokens = TOKENS;
  // At feed size (about 552 px wide, 46%) only the headline, the two numbers and the 26 px lines stay legible, so the
  // unit and the two coverage names are set at 26 px beside the numbers. LinkedIn shows the domain itself.
  // The card is the hero's road sign: the sign-blue band, its white keyline, white display type, the LED and the ticket.
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS_HREF}">
<style>${tokens}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: var(--band); color: var(--band-ink); font-family: var(--font-body); position: relative; overflow: hidden; }
  body::before { content: ''; position: absolute; inset: 16px; border: 4px solid var(--keyline); border-radius: 26px; }
  .frame { position: absolute; inset: 0; padding: 56px 68px 56px; display: grid; grid-template-columns: minmax(0, 1fr) 400px; column-gap: 52px; }
  .main { display: flex; flex-direction: column; }
  .brand { font: 800 38px/1 var(--font-display); letter-spacing: .01em; padding-bottom: 14px; border-bottom: 3px solid var(--band-ink); align-self: start; }
  .head { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  h1 { font: 800 104px/.95 var(--font-display); letter-spacing: .005em; }
  h1 span { display: block; white-space: nowrap; } h1 em { font-style: normal; font-weight: 700; color: var(--band-ink-2); }
  .side { display: flex; flex-direction: column; justify-content: center; gap: 12px; }
  .unit { font: 700 26px/1.2 var(--font-body); }
  .plate { padding: 18px 24px 20px; display: flex; flex-direction: column; gap: 8px; border-radius: 6px; }
  .led { background: var(--led-bg); border: 3px solid var(--led-bezel); color: var(--led-label); }
  .tkt { background: var(--ticket); color: var(--ticket-ink); padding-left: 44px; border-radius: 0; -webkit-mask: radial-gradient(circle at 0 50%, #0000 7px, #000 7.5px) 0 0 / 100% 22px no-repeat round; }
  .lab { font: 700 17px/1 var(--font-body); letter-spacing: var(--sign-track); text-transform: uppercase; }
  .digits { font: 800 140px/.9 var(--font-led); color: var(--led); padding-left: .1em; white-space: nowrap; background: radial-gradient(circle, var(--led-dim) 0 .034em, #0000 calc(.034em + .6px)) 0 0 / .1em .1em; align-self: flex-start; }
  .num { font: 800 126px/.8 var(--font-display); padding: 8px 0 0; white-space: nowrap; }
  .sub { font: 400 26px/1.2 var(--font-body); }
  .cap { font: 400 17px/1.3 var(--font-body); color: var(--band-ink-2); }
</style></head><body><div class="frame">
  <div class="main">
    <div class="brand">${SITE.name}</div>
    <div class="head">
      <h1><span>Ready to leave</span><span>the hospital.</span><span><em>Still waiting for</em></span><span><em>the next bed.</em></span></h1>
    </div>
  </div>
  <div class="side">
    <div class="unit">Days in hospital before rehab</div>
    <div class="plate led"><span class="lab">Now serving</span><span class="digits">${ledGlyphs(now)}</span><span class="sub">Traditional Medicare</span></div>
    <div class="plate tkt"><span class="lab">Your number</span><span class="num">${you}</span><span class="sub">Medicare Advantage</span></div>
    <div class="cap">Averages before inpatient rehab, FY${fy}, ${esc(src)}</div>
  </div>
</div></body></html>`;
}
