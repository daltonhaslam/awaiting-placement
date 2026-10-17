# Awaiting Placement

**Ready to leave the hospital. Still waiting for the next bed.**
How much longer Medicare Advantage patients stay in the hospital before post-acute care, and what those days mean for beds.

Live site: **https://awaiting-placement.vercel.app**

## What the site shows

- What "awaiting placement" means, and where the discharge pathway differs between traditional Medicare and Medicare Advantage (MA).
- Mean hospital days before each kind of post-acute care, traditional Medicare vs MA, with the adjusted difference and what it does and does not show.
- The MA share of hospitals' Medicare discharges, the cost-report years, and a lookup for the profile of any acute-care hospital that passes the data checks.
- A calculator that turns an MA share and a length-of-stay gap into beds held on an average day, with every assumption listed and sourced.
- What hospitals report, what plans say, and what the evidence cannot settle yet.

Every number is either sourced or labeled as an estimate, and uncertainty sits next to the number.

## Accessibility

Works at 360 px wide and in light and dark mode. Charts and panels have text equivalents, controls work from the keyboard, and the animated displays hold still under `prefers-reduced-motion`.

## One file

The build writes a single page, `docs/index.html`, with the data, styles and script inlined. Its fonts are served from the same site (`docs/fonts/`, SIL Open Font License), so the page makes no third-party request. It has no analytics, no cookies, and sends nothing anywhere.

The build also pre-renders the story page and the Methods page into that HTML, so the text, figures and sources read without JavaScript (search and AI crawlers, reader modes, a slow phone before the script has run). It runs the page's own view code in Node against a lightweight DOM (linkedom), not in a browser, so the build needs no browser and stays byte-identical across machines. On load the script replaces the pre-rendered markup with its own render; the calculator, chart tooltips and hospital profiles need JavaScript.

An independent, personal project. Does not represent the work or the view of the author's employer, CMS, MedPAC, or any hospital or health plan.

## Data

| Source | Used for |
|---|---|
| CMS HCRIS hospital cost reports, form CMS-2552-10 (one pinned file per fiscal year) | Hospital-level discharges, days, beds and occupancy; MA share and length-of-stay trends; which hospitals are acute care (from the CCN) |
| CMS Hospital General Information (pinned; the two columns used are committed as `pipeline/derived/hgi_names.csv`) | Display names and cities |
| MedPAC, Report to the Congress, June 2026, Ch. 4 (Table 4-1) | Mean days before post-acute care by destination, and the adjusted gap |
| MedPAC, September 2026 staff slides (preliminary) | Discharge-destination mix, median hospital stays by destination (including long-term care hospitals), and sample differences such as the dual-eligible and low-income share |
| KFF, Medicare Advantage in 2026 | MA share of beneficiaries; prior-authorization context |
| KFF State Health Facts, hospital expenses per adjusted inpatient day (AHA Annual Survey) | The cost assumption in the calculator |
| Federal rules and reports (42 CFR 422.568, 422.572, 422.101; CMS-4201-F; CMS-0057-F; the 2025 prior-authorization pledge) | Decision deadlines and the policy timeline |
| Published studies and surveys (JAMA, HHS OIG, Senate PSI, AMRPA, the Florida Hospital Association) | Context for what hospitals and plans each report; assumptions in the calculator |

The full source list, with links, is on the site's Methods page.

## How the numbers are built

Each hospital-year comes from one cost report: duplicates are resolved by taking the longest reporting period, then the latest processing date. Nothing is summed across reports. MA share and mean stay come from the report's discharge and day counts, hospitals whose reports fail explicit checks are excluded (each rule and its count is listed on the site), and national figures are weighted across the remaining hospitals. The calculator gives one estimate of beds held on an average day for the measure you pick (the MedPAC placement-related gap, the fully adjusted gap, the unadjusted gap, or a hospital's own gap), and it applies to MA stays, not all discharges. The hero shows a national range between the two MedPAC measures. Details and limits are at [#methods](https://awaiting-placement.vercel.app/#methods).

## Rebuilding

Requirements: Python 3.9+ (standard library only; always run it isolated with `-I`), Node 18+ with npm, and, for the
browser checks, Google Chrome Stable (Playwright drives the installed Chrome; `npm ci` downloads no browsers). The share
card (`node og.mjs`) and the font download (`node fonts.mjs`) also need network access to Google Fonts. `node build.mjs`
itself needs no browser, including its pre-render step. Tested on macOS with Python 3.9.6 and Node 26; a rebuild there is
byte-identical to the committed `docs/index.html`, `vercel.json` and `docs/og.png`.

Fastest path (no download, seconds). The extract of the cost reports and the hospital names table are both committed:

```sh
python3 -I pipeline/build_data.py                            # -> web/src/data/ap.json (git should show no change)
cd web && npm ci && node build.mjs                           # -> docs/index.html, vercel.json (git should show no change)
```

To re-derive the names table from CMS (about 1.4 MB):

```sh
python3 -I pipeline/fetch.py --only hospital_general_info   # -> data/raw/ (gitignored), checked against its sha256 pin
python3 -I pipeline/build_data.py --refresh-names            # -> pipeline/derived/hgi_names.csv, then ap.json
```

Full path, to re-derive the committed extract from CMS (nine zips, about 1.2 GB; allow a few minutes):

```sh
python3 -I pipeline/fetch.py          # download raw files to data/raw/ and check their sha256 pins
python3 -I pipeline/extract_hcris.py  # every pinned year (FY2016 to FY2024) -> pipeline/derived/hcris_extract.csv
python3 -I pipeline/build_data.py     # -> web/src/data/ap.json
cd web && npm ci && node build.mjs    # -> docs/index.html
```

"Pinned" means `pipeline/sources.json` records the sha256 of the exact file the published numbers were built from.
CMS republishes these files (HCRIS quarterly; the Hospital General Information link carries a release token), so a
later download can fail with a checksum error. That is deliberate: different bytes mean different numbers. To move to
the new file on purpose, re-pin that one source (`fetch.py --only <name> --refresh-hashes`), rebuild, and expect
`ap.json` and the page to change. Until then the committed `pipeline/derived/hcris_extract.csv` is the reproducible input.

Tests:

```sh
python3 -I pipeline/run_tests.py
cd web && npm test
cd web && npm run e2e && npm run e2e:headers && npm run e2e:docs
```

All of them work offline. `npm run e2e` builds from a small fixture and stubs the font files, so the local fallback
fonts set every width check; `npm run e2e:docs` tests the committed page; `e2e:headers` loads the real self-hosted
fonts and fails on any request to another origin. All of them drive the installed Google Chrome Stable (Playwright
channel `chrome`), not a downloaded Chromium.

Without `data/raw/hospital_general_info`, `run_tests.py` reports OK with one test skipped: the check that the committed
names table matches the pinned raw file. Everything else, including the check that the committed `ap.json` equals a
fresh build, runs from committed files.

## Yearly refresh

- [ ] Add the new HCRIS fiscal year to `pipeline/sources.json`: copy the previous year's entry, change `name` (`hcris_fyYYYY`), `file` (`HOSP10FYYYYY.ZIP`) and `url`, then pin it with `python3 -I pipeline/fetch.py --only hcris_fyYYYY --refresh-hashes`. The extract step reads its years from there. Do not run `--refresh-hashes` without `--only` unless you mean to re-pin every year (CMS refreshes older files quarterly, so earlier years' numbers would change too). Re-pin `hospital_general_info` the same way when CMS releases a new file, then run `build_data.py --refresh-names`.
- [ ] Update the MedPAC, KFF and policy figures in `pipeline/content/`. Every `src` URL must also appear in `pipeline/content/sources.json` with `"verified": true` (set it only after opening the link; the build fails otherwise). Re-check every link (some move to new slugs each year). Search `web/src/js/views/` for the old year ("in 2026", "September 2026") and for the year-named keys `kff2026` and `maStays2023`.
- [ ] Run `fetch.py`, `extract_hcris.py` and `build_data.py`, then `python3 -I pipeline/run_tests.py`.
- [ ] Review any change in exclusion counts before accepting the new data, and the hospitals marked "check this hospital's data" (`build_data.py` prints them; the thresholds are in `pipeline/ap/clean.py`).
- [ ] Bump `PUBLISHED` in `web/src/js/site.js` to the release month (the dateline reads it; nothing sets it automatically). Update the MedPAC values pinned in `pipeline/tests/test_content.py`.
- [ ] `cd web && node og.mjs` to regenerate the share card (and `og.stamp.json`, the hash of the card's HTML that `npm test` checks), and `node icons.mjs` if the hero number changed (the favicon shows it; `icons.stamp.json` is checked the same way), then `node build.mjs` so the image URL (`?v=` content hash) and CSP hashes are current.
- [ ] `cd web && node test/fixtures/refresh.mjs` so the test fixture carries the new content and model (`npm test` fails until it does). If the pipeline added, renamed or dropped a field in `ap.json`, add `--schema` and review the `test/ap.schema.json` diff: it is the list of what the page reads.
- [ ] `npm test` and all three e2e commands.
- [ ] Commit `docs/index.html`, `docs/og.png`, the icons and `vercel.json` together.
- [ ] Push and check the `check` workflow (`.github/workflows/check.yml`, on every push to `main` and every pull request) is green: it runs the Python and unit tests, rebuilds `docs/index.html` from the committed `ap.json` and fails unless it is byte-identical, then runs `npm run e2e:docs` against the committed page. A red rebuild step means the committed page is stale: rebuild locally and commit it with `vercel.json`.

## Layout

```
.github/workflows/    check.yml: tests, byte-identical rebuild and e2e on every push to main and every pull request
docs/                 published page (index.html), share card (og.png), icons, self-hosted fonts (fonts/), and
                      hand-written 404.html, robots.txt, sitemap.xml
pipeline/
  fetch.py            download + sha256-verify raw files into data/raw/ (gitignored)
  sources.json        the raw-file pins (not the site's citation list, which is content/sources.json)
  extract_hcris.py    cost-report zips -> derived/hcris_extract.csv
  build_data.py       extract + content -> web/src/data/ap.json
  run_tests.py        runs pipeline/tests under python3 -I
  ap/                 cleaning, cost-report parsing and content loading
  content/            sourced figures and copy as JSON
  derived/            extracted cost-report table and hospital names table (committed)
  tests/              Python tests
web/
  src/
    data/             built data contract (ap.json)
    js/               page code: views, charts, ui, model
    styles/           tokens and stylesheets
  test/               unit tests, the fixture (fixtures/refresh.mjs keeps it current) and ap.schema.json, the
                      shape of ap.json that contract.test.mjs checks
  e2e/                browser checks
  build.mjs           bundles everything into docs/index.html
  prerender.mjs       renders the story page and Methods into that HTML at build time
  og.mjs              renders the share card
  og-card.mjs         the card's HTML and its versioned image URL
  og.stamp.json       hash of the card HTML; npm test fails if the card is stale
  icons.mjs           renders favicon.ico and apple-touch-icon.png (icons.stamp.json, as for the card)
  fonts.mjs           downloads the web fonts into docs/fonts/ and writes src/styles/fonts.css
  inline-script.mjs   escapes inline JS and computes its CSP hash
vercel.json           headers, including the content security policy, and the /index.html redirect
```

## License

Code is MIT (see `LICENSE`). CMS cost-report and hospital data are US federal works in the public domain, as is the committed extract derived from them. Figures transcribed from MedPAC, KFF and other published sources are attributed and linked; those sources keep their own terms.

By [Dalton Haslam, MD, MBA](https://www.linkedin.com/in/dalton-haslam).
