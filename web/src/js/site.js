export const SITE = {
  name: 'Awaiting Placement',
  url: 'https://awaiting-placement.vercel.app',
  repo: 'https://github.com/daltonhaslam/awaiting-placement',
  byline: 'Dalton Haslam, MD, MBA',
  linkedin: 'https://www.linkedin.com/in/dalton-haslam',
};

// The not-affiliated line, in the footer and on the methods page.
export const DISCLAIMER = 'An independent, personal project. Does not represent the work or the view of the author\'s employer, CMS, MedPAC, '
  + 'or any hospital or health plan.';

// Publication month (ISO "YYYY-MM"), shown as "Published Oct 2026" in the hero and on the methods page.
// Set by hand: bump on each release (README, "Yearly refresh").
export const PUBLISHED = '2026-10';

// localStorage key for the Day/Night choice; build.mjs inlines it into the pre-paint head script.
export const THEME_KEY = 'awaiting-placement-theme';

// The faces the page uses, as one Google Fonts css2 request. The page does not load it: web/fonts.mjs downloads these
// faces into docs/fonts/ (self-hosted), and og.mjs loads it to render the share card at build time.
// All four families, only the faces the CSS uses (the first three are variable fonts: one file
// per family and style, whatever the weights). Doto is the rounded-dot instance (ROND 100): its dots sit on a
// 0.1em grid (0.08em dots, 0.6em per digit), which the LED panel's unlit-dot texture matches.
export const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800'
  + '&family=Overpass:ital,wght@0,400;0,600;0,700;1,400'
  + '&family=Overpass+Mono:wght@500;600'
  + '&family=Doto:ROND,wght@100,800&display=swap';
