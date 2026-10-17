"""Build web/src/data/ap.json (the site's single data contract) from the committed HCRIS extract.

    python3 -I pipeline/build_data.py
    python3 -I pipeline/build_data.py --refresh-names   # rewrite derived/hgi_names.csv from the pinned raw file first

Display names and cities come from derived/hgi_names.csv, a committed copy of the Hospital General Information columns
the site uses, so a rebuild does not depend on fetching that file (CMS rotates its download URL with each release).
Without the table, the raw file in data/raw/ is read instead.

Cited content (pipeline/content/*.json) is required and is the single source of the MedPAC numbers: the model
lenses, the discharge mix and the cross-check are all derived from it.
"""
import csv
import json
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE_DIR))
from ap import clean, content as content_mod, names  # noqa: E402
from ap.hcris import COLUMNS  # noqa: E402

ROOT = PIPELINE_DIR.parent
EXTRACT = PIPELINE_DIR / 'derived' / 'hcris_extract.csv'
HGI = ROOT / 'data' / 'raw' / 'hospital_general_info' / 'Hospital_General_Information.csv'
NAMES = PIPELINE_DIR / 'derived' / 'hgi_names.csv'
NAME_COLUMNS = ['ccn', 'name', 'city']
CONTENT_DIR = PIPELINE_DIR / 'content'
OUT_PATH = ROOT / 'web' / 'src' / 'data' / 'ap.json'

REASONS = ['state', 'period', 'no_ma', 'ma_volume', 'ffs_volume', 'inconsistent', 'alos']
MIN_ROWS_PER_YEAR = 2000
COVID_FYS = [2020, 2021, 2022]
DESTS = ['home', 'hha', 'snf', 'irf']
MODEL_STATIC = {
    'defaults': {'t0': 2.5, 't1': 1.0, 'cvar': 800, 'pay': 'case', 'rate': 2500, 'cm': 4500, 'lens': 'placement'},
    'ranges': {'beds': [5, 3000], 'occ': [0.05, 1], 'dis': [50, 200000], 'mcr': [0, 1], 'ma': [0, 1],
               't0': [0, 7], 't1': [0, 7], 'cvar': [300, 2000], 'rate': [500, 6000], 'cm': [0, 15000],
               'fill': [0, 1]},
}
PRESETS = [
    ('community', 'Community', '100 to 199 beds', lambda d: 100 <= d['beds'] <= 199),
    ('regional', 'Regional', '300 to 449 beds', lambda d: 300 <= d['beds'] <= 449),
    ('academic', 'Academic', '600 or more beds with residents', lambda d: d['beds'] >= 600 and d['teach']),
]


def load_extract():
    with open(EXTRACT, newline='', encoding='utf-8') as f:
        r = csv.DictReader(f)
        missing = [c for c in COLUMNS if c not in (r.fieldnames or [])]
        if missing:
            raise SystemExit(f'schema drift: extract is missing columns {missing}')
        rows = list(r)
    seen = set()
    for row in rows:
        k = (row['fy'], row['ccn'])
        if k in seen:
            raise SystemExit(f'schema drift: duplicate (fy, ccn) {k}')
        seen.add(k)
    counts = Counter(int(r['fy']) for r in rows)
    thin = {fy: n for fy, n in counts.items() if n < MIN_ROWS_PER_YEAR}
    if thin:
        raise SystemExit(f'schema drift: years with fewer than {MIN_ROWS_PER_YEAR} acute rows: {thin}')
    return rows


def read_raw_hgi():
    with open(HGI, newline='', encoding='utf-8-sig') as f:
        return {r['Facility ID']: r for r in csv.DictReader(f)}


def names_rows(raw, ccns):
    """The names table: Hospital General Information's name and city for each CCN in the extract that it lists."""
    return [{'ccn': c, 'name': raw[c]['Facility Name'], 'city': raw[c]['City/Town']} for c in sorted(ccns) if c in raw]


def write_names(rows):
    NAMES.parent.mkdir(exist_ok=True)
    with open(NAMES, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=NAME_COLUMNS)
        w.writeheader()
        w.writerows(rows)


def load_names():
    """{ccn: {'ccn', 'name', 'city'}} from the committed table, else from the raw file the table is derived from."""
    if NAMES.exists():
        with open(NAMES, newline='', encoding='utf-8') as f:
            return {r['ccn']: r for r in csv.DictReader(f)}
    if HGI.exists():
        raw = read_raw_hgi()
        return {r['ccn']: r for r in names_rows(raw, raw)}
    raise SystemExit('missing pipeline/derived/hgi_names.csv: run python3 -I pipeline/fetch.py --only hospital_general_info, '
                     'then python3 -I pipeline/build_data.py --refresh-names')


def classify(rows):
    """Derive every row, attach its exclusion reason. Returns list of derived dicts."""
    out = []
    for row in rows:
        d = clean.derive(row)
        d['fy'] = int(row['fy'])
        d['reason'] = clean.exclusion_reason(d)
        out.append(d)
    return out


def _median(ds, k):
    return statistics.median(d[k] for d in ds)


def derive_medpac(medpac):
    """(lenses, mix, crossCheck.medpac) from the cited MedPAC tables, the one source of these numbers."""
    rows = {x['dest']: x for x in medpac['t41']['rows']}
    home = rows['home']['adj']
    lenses = {'unadjusted': {d: round(rows[d]['diff'], 1) for d in DESTS},
              'adjusted': {d: round(rows[d]['adj'], 1) for d in DESTS},
              'placement': {d: round(rows[d]['adj'] - home, 1) for d in DESTS}}
    sept = medpac['sept']
    # MedPAC's labeled rehab share is inpatient rehab alone (long-term care hospitals are a separate, smaller segment).
    ma = sept['mix']['ma']
    mix = {'home': ma['none'], 'hha': ma['hha'], 'snf': ma['snf'], 'irf': ma['irf']}
    all_ = medpac['t41']['all']
    return lenses, mix, {'ma': all_['maLos'], 'ffs': all_['ffsLos'], 'fy': medpac['t41']['fy']}


def fmt_days(v):
    """2.5 -> '2.5 days', 1.0 -> '1.0 day': one decimal, as the assumptions table has always shown the waits."""
    return f"{v:.1f} day{'' if v == 1 else 's'}"


def fmt_pct_number(share):
    """0.65 -> '65', 0.025 -> '2.5': a share as a percent number, at most one decimal, no trailing zero."""
    return f'{round(share * 100, 1):g}'


def derive_ma_stays(medpac):
    """MA inpatient stays in the MedPAC sample year: ACH stays per 1,000 enrollees x enrollees (millions)."""
    sept = medpac['sept']
    return round(sept['staysPer1000']['ma']['ach'] / 1000 * sept['sampleMillions']['ma'] * 1e6)


def weighted(ds):
    ma_d = sum(d['ma_disch'] for d in ds)
    ffs_d = sum(d['ffs_disch'] for d in ds)
    return {'maShare': ma_d / (ma_d + ffs_d), 'maAlos': sum(d['ma_days'] for d in ds) / ma_d,
            'ffsAlos': sum(d['ffs_days'] for d in ds) / ffs_d}


def pct(sorted_vals, p):
    k = (len(sorted_vals) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def coverage(ds):
    """{fy: Counter(reason -> n, 'clean' -> n, 'acute' -> n)}"""
    cov = defaultdict(Counter)
    for d in ds:
        c = cov[d['fy']]
        c['acute'] += 1
        c[d['reason'] or 'clean'] += 1
    return cov


def build():
    return _build()[0]


def _build():
    """(ap.json dict, per-year coverage), so the coverage table reuses the one classification pass."""
    rows = load_extract()
    hgi = load_names()
    ds = classify(rows)
    content = content_mod.load_content(CONTENT_DIR)
    lenses, mix, medpac_all = derive_medpac(content['medpac'])
    ma_stays = derive_ma_stays(content['medpac'])
    fys = sorted({d['fy'] for d in ds})
    latest = fys[-1]
    by_fy = defaultdict(list)
    for d in ds:
        if d['reason'] is None:
            by_fy[d['fy']].append(d)
    all_cov = coverage(ds)
    cov = all_cov[latest]

    series = []
    for fy in fys:
        w = weighted(by_fy[fy])
        series.append({'fy': fy, 'n': len(by_fy[fy]), 'maShare': round(w['maShare'], 3),
                       'maAlos': round(w['maAlos'], 2), 'ffsAlos': round(w['ffsAlos'], 2)})
    wl = weighted(by_fy[latest])

    def stays_effect(lens):
        bed_days = round(ma_stays * sum(mix[k] * lenses[lens][k] for k in DESTS))
        return {'bedDays': bed_days, 'beds': round(bed_days / 365)}

    emitted = {d['ccn'] for d in by_fy[latest]}
    by_year = {fy: {d['ccn']: d for d in by_fy[fy]} for fy in fys}

    def trend_of(ccn):
        out = []
        for fy in fys:
            d = by_year[fy].get(ccn)
            out.append([round(d['ma_share'], 3), round(d['ma_alos'], 2), round(d['ffs_alos'], 2)] if d else None)
        return out

    hospitals = []
    for d in sorted(by_fy[latest], key=lambda d: d['ccn']):
        g = hgi.get(d['ccn'], {})
        city = g.get('city') or d['city']
        hospitals.append({
            'id': d['ccn'],
            'name': names.display_name(g.get('name'), d['name']),
            'city': names.smart_title(' '.join(city.split())),
            'st': d['state'], 'beds': int(d['beds']), 'occ': round(d['occ'], 3), 'occFlag': clean.occ_flag(d),
            'dis': int(d['tot_disch']), 'mcr': round(d['mcr'], 3), 'ma': round(d['ma_share'], 3),
            'maAlos': round(d['ma_alos'], 2), 'ffsAlos': round(d['ffs_alos'], 2), 'gap': round(d['gap'], 2),
            'teach': d['teach'], 'trend': trend_of(d['ccn']),
            **({'checkData': True} if clean.check_data(d) else {}),  # omitted when false, to keep the file small
        })

    # Prose in content/*.json that quotes a figure from this data or from medpac.json carries a {placeholder}, filled here
    # so it cannot go stale. An unknown placeholder fails the build.
    # The assumption values quote the model's defaults and its discharge mix, so they cannot disagree with the calculator.
    sept = content['medpac']['sept']
    dflt = MODEL_STATIC['defaults']
    fills = {'medianOcc': f"{statistics.median(h['occ'] for h in hospitals) * 100:.1f}%", 'latestFy': str(latest),
             'pacYear': str(sept['year']), 'irfStaysMa': str(sept['staysPer1000']['ma']['irf']),
             'irfStaysFfs': str(sept['staysPer1000']['ffs']['irf']),
             't0Days': fmt_days(dflt['t0']), 't1Days': fmt_days(dflt['t1']),
             'cvar': f"${dflt['cvar']:,}", 'rate': f"${dflt['rate']:,}", 'cm': f"${dflt['cm']:,}",
             'mixHome': fmt_pct_number(mix['home']), 'mixHha': fmt_pct_number(mix['hha']),
             'mixSnf': fmt_pct_number(mix['snf']), 'mixIrf': fmt_pct_number(mix['irf']),
             'mixIrfFfs': fmt_pct_number(sept['mix']['ffs']['irf'])}

    def fill(text, where):
        out = re.sub(r'\{(\w+)\}', lambda m: fills.get(m[1], m[0]), text)
        if left := re.findall(r'\{\w+\}', out):
            raise SystemExit(f'content: {where}: unknown placeholder {left}')
        return out
    for a in content['assumptions']:
        a['value'] = fill(a['value'], f"assumptions.{a['key']}")
        a['why'] = fill(a['why'], f"assumptions.{a['key']}")
    for k, items in content['sides'].items():
        for it in items:
            for f in ('text', 'short'):
                if f in it:
                    it[f] = fill(it[f], f"sides.{k}.{it['key']}")

    presets = []
    for pid, label, note, pred in PRESETS:
        grp = [d for d in by_fy[latest] if pred(d)]
        presets.append({'id': pid, 'label': label, 'note': note, 'n': len(grp), 'beds': round(_median(grp, 'beds')),
                        'occ': round(_median(grp, 'occ'), 3),
                        'dis': round(_median(grp, 'tot_disch')),
                        'mcr': round(_median(grp, 'mcr'), 3), 'ma': round(_median(grp, 'ma_share'), 3)})

    gaps = sorted(d['gap'] for d in by_fy[latest])
    w = 0.25
    lo = int(gaps[0] // w)
    hi = int(gaps[-1] // w)
    counts = Counter(int(g // w) for g in gaps)
    bins = [{'x0': round(i * w, 2), 'x1': round((i + 1) * w, 2), 'n': counts.get(i, 0)} for i in range(lo, hi + 1)]

    return {
        'meta': {'latestFy': latest, 'trendFys': fys, 'covidFys': COVID_FYS, 'rules': clean.rules(),
                 'builtOn': max(d['fy_end'] for d in ds), 'nClean': len(by_fy[latest]), 'nAcute': cov['acute'],
                 'exclusions': {k: cov[k] for k in REASONS},
                 'crossCheck': {'hcris': {'ma': round(wl['maAlos'], 2), 'ffs': round(wl['ffsAlos'], 2)}, 'medpac': medpac_all}},
        'national': {'series': series,
                     'context': {'maStays2023': ma_stays, 'placement': stays_effect('placement'),
                                 'adjusted': stays_effect('adjusted')}},
        'model': {'dests': DESTS, 'lenses': lenses, 'mix': mix, **MODEL_STATIC},
        'presets': presets,
        'hospitals': hospitals,
        'gapHist': {'binWidth': w, 'bins': bins, 'median': round(pct(gaps, .5), 2), 'p10': round(pct(gaps, .1), 2),
                    'p90': round(pct(gaps, .9), 2)},
        'content': content,
    }, all_cov


def dump(out):
    return json.dumps(out, sort_keys=False, separators=(',', ':'))


def print_coverage(cov):
    cols = ['acute'] + REASONS + ['clean']
    print('fy    ' + ''.join(f'{c:>13}' for c in cols))
    for fy in sorted(cov):
        print(f'{fy}  ' + ''.join(f'{cov[fy][c]:>13}' for c in cols))


def refresh_names():
    if not HGI.exists():
        raise SystemExit('--refresh-names needs the raw file: run python3 -I pipeline/fetch.py --only hospital_general_info')
    rows = names_rows(read_raw_hgi(), {r['ccn'] for r in load_extract()})
    write_names(rows)
    print(f'wrote {NAMES} ({len(rows):,} hospitals)')


def main():
    args = sys.argv[1:]
    if args not in ([], ['--refresh-names']):
        raise SystemExit('usage: python3 -I pipeline/build_data.py [--refresh-names]')
    if args:
        refresh_names()
    out, cov = _build()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(dump(out), encoding='utf-8')
    print_coverage(cov)
    flagged = [x for x in out['hospitals'] if x.get('checkData')]
    print(f"check this hospital's data: {len(flagged)}")
    for x in flagged:
        print(f"  {x['id']}  {x['gap']:+.2f}  {x['name']}")
    print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size:,} bytes), nClean={out['meta']['nClean']}")


if __name__ == '__main__':
    main()
