"""Extract every pinned HCRIS cost-report zip into pipeline/derived/hcris_extract.csv."""
import csv
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from ap import hcris  # noqa: E402
from ap.hcris import COLUMNS  # noqa: E402

ROOT = HERE.parent


def pinned_years(sources_path=HERE / 'sources.json'):
    """Fiscal years of every hcris_fy<year> entry in sources.json, so adding a source adds the year."""
    matches = (re.fullmatch(r'hcris_fy(\d{4})', x['name']) for x in json.loads(Path(sources_path).read_text(encoding='utf-8')))
    return sorted(int(m.group(1)) for m in matches if m)


YEARS = pinned_years()


def main():
    out, t0 = [], time.time()
    for fy in YEARS:
        z = ROOT / 'data' / 'raw' / ('hcris_fy%d' % fy) / ('HOSP10FY%d.ZIP' % fy)
        if not z.exists():
            sys.exit('%s is missing: run `python3 -I pipeline/fetch.py` first (about 1.2 GB for every year). The committed '
                     'pipeline/derived/hcris_extract.csv already holds this step\'s output, so build_data.py works without it.' % z)
        rows = hcris.dedupe(hcris.extract_year(str(z), fy))
        out.extend(rows)
        print('FY%d: %d reports  (%.0fs elapsed)' % (fy, len(rows), time.time() - t0), flush=True)
    out.sort(key=lambda r: (r['fy'], r['ccn']))
    dest = HERE / 'derived' / 'hcris_extract.csv'
    dest.parent.mkdir(exist_ok=True)
    with open(dest, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction='ignore')
        w.writeheader()
        w.writerows(out)
    print('wrote %d rows to %s' % (len(out), dest))


if __name__ == '__main__':
    main()
