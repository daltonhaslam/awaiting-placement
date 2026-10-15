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

The build writes a single page, `docs/index.html`, with the data, styles and script inlined. The only third-party request is Google Fonts. The page has no analytics, no cookies, and sends nothing else anywhere.

Not affiliated with CMS, MedPAC, any hospital, or any health plan.

## Data

| Source | Used for |
|---|---|
| CMS HCRIS hospital cost reports, form CMS-2552-10 (one pinned file per fiscal year) | Hospital-level discharges, days, beds and occupancy; MA share and length-of-stay trends; which hospitals are acute care (from the CCN) |
| CMS Hospital General Information | Display names and cities |
| MedPAC, Report to the Congress, June 2026, Ch. 4 (Table 4-1) | Mean days before post-acute care by destination, and the adjusted gap |
| MedPAC, September 2026 staff slides (preliminary) | Discharge-destination mix, median hospital stays by destination (including long-term care hospitals), and sample differences such as the dual-eligible and low-income share |
| KFF, Medicare Advantage in 2026 | MA share of beneficiaries; prior-authorization context; hospital expense per adjusted inpatient day, used in the cost assumption |
| Federal rules and reports (42 CFR 422.568, 422.572, 422.101; CMS-4201-F; CMS-0057-F; the 2025 prior-authorization pledge) | Decision deadlines and the policy timeline |
| Published studies and surveys (JAMA, HHS OIG, Senate PSI, AMRPA, the Florida Hospital Association) | Context for what hospitals and plans each report; assumptions in the calculator |

The full source list, with links, is on the site's Methods page.

## How the numbers are built

Each hospital-year comes from one cost report: duplicates are resolved by taking the longest reporting period, then the latest processing date. Nothing is summed across reports. MA share and mean stay come from the report's discharge and day counts, hospitals whose reports fail explicit checks are excluded (each rule and its count is listed on the site), and national figures are weighted across the remaining hospitals. The calculator gives one estimate of beds held on an average day for the measure you pick (the MedPAC placement-related gap, the fully adjusted gap, the unadjusted gap, or a hospital's own gap), and it applies to MA stays, not all discharges. The hero shows a national range between the two MedPAC measures. Details and limits are at [#methods](https://awaiting-placement.vercel.app/#methods).

## Rebuilding

Python is standard library only. Always run it isolated with `-I`.

```sh
python3 -I pipeline/fetch.py          # download raw files to data/raw/ and check their sha256 pins
python3 -I pipeline/extract_hcris.py  # every pinned year -> pipeline/derived/hcris_extract.csv
python3 -I pipeline/build_data.py     # -> web/src/data/ap.json
cd web && npm ci && node build.mjs    # -> docs/index.html
```

Tests:

```sh
python3 -I pipeline/run_tests.py
cd web && npm test
cd web && npm run e2e && npm run e2e:headers && npm run e2e:docs
```

`npm run e2e` builds from a small fixture. `npm run e2e:docs` tests the committed page. The e2e scripts need Chrome installed.

## Yearly refresh

- [ ] Add the new HCRIS fiscal year to `pipeline/sources.json` (the extract step reads its years from there). CMS refreshes older files quarterly, so re-pin with `python3 -I pipeline/fetch.py --refresh-hashes`, which re-downloads every source.
- [ ] Update the MedPAC, KFF and policy figures in `pipeline/content/` and check each source link.
- [ ] Run `fetch.py`, `extract_hcris.py` and `build_data.py`, then `python3 -I pipeline/run_tests.py`.
- [ ] Review any change in exclusion counts before accepting the new data.
- [ ] Bump `PUBLISHED` in `web/src/js/site.js` to the release month (the dateline reads it; nothing sets it automatically).
- [ ] `cd web && node build.mjs`, then `node og.mjs` to regenerate the share card, then `node build.mjs` again so the image URL and CSP hashes are current.
- [ ] `npm test` and all three e2e commands.
- [ ] Commit `docs/index.html`, `docs/og.png` and `vercel.json` together.

## Layout

```
docs/                 published page (index.html) and share card (og.png)
pipeline/
  ap/                 cleaning, cost-report parsing and content loading
  content/            sourced figures and copy as JSON
  derived/            extracted cost-report table (committed)
  tests/              Python tests
web/
  src/
    data/             built data contract (ap.json)
    js/               page code: views, charts, ui, model
    styles/           tokens and stylesheets
  test/               unit tests and the fixture
  e2e/                browser checks
  build.mjs           bundles everything into docs/index.html
  og.mjs              renders the share card
vercel.json           headers, including the content security policy
```

## License

Code is MIT (see `LICENSE`). The underlying federal data is in the public domain; other sources keep their own terms and are linked, not redistributed.

By [Dalton Haslam, MD, MBA](https://www.linkedin.com/in/dalton-haslam).
