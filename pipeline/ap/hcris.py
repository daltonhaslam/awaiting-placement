"""Stdlib HCRIS extract: cost-report zip -> one dict per acute-hospital report."""
import csv
import io
import zipfile
from datetime import datetime

from .clean import ACUTE_SUFFIX

S3 = 'S300001'
G3 = 'G300000'
COLUMNS = ['fy', 'ccn', 'rpt_rec_num', 'status', 'fy_bgn', 'fy_end', 'period_days', 'name', 'city', 'state', 'zip',
           'beds', 'bed_days', 'ip_days', 'nursery_days', 'tot_disch', 'ffs_disch', 'ma_disch', 'ffs_days_l1',
           'ffs_days_icu', 'ma_days', 'resid_fte', 'npr', 'opex']
ICU_LINES = ('00800', '00900', '01000', '01100', '01200')

# field -> (worksheet, line, column), 5-char zero-padded
CELLS = {
    'ma_days':       (S3, '00200', '00600'),
    'ma_disch':      (S3, '00200', '01300'),
    'ffs_days_l1':   (S3, '00100', '00600'),
    'ffs_disch':     (S3, '00100', '01300'),
    'tot_disch':     (S3, '00100', '01500'),
    'beds':          (S3, '01400', '00200'),
    'bed_days':      (S3, '01400', '00300'),
    'ip_days':       (S3, '01400', '00800'),
    'nursery_days':  (S3, '01300', '00800'),
    'resid_fte':     (S3, '01400', '00900'),
    'npr':           (G3, '00300', '00100'),
    'opex':          (G3, '00400', '00100'),
}
ALPHA_CELLS = {
    'name':  ('S200001', '00300', '00100'),
    'city':  ('S200001', '00200', '00100'),
    'state': ('S200001', '00200', '00200'),
    'zip':   ('S200001', '00200', '00300'),
}

_ICU_COL = '00600'
_WKSHTS = {S3, G3}
_NEEDED = {(w, l, c): f for f, (w, l, c) in CELLS.items()}
for _l in ICU_LINES:
    _NEEDED[(S3, _l, _ICU_COL)] = 'icu:' + _l
_ALPHA_NEEDED = {(w, l, c): f for f, (w, l, c) in ALPHA_CELLS.items()}

def member(zf, kind):
    """Find the *_<kind>.CSV member case-insensitively (kind: RPT|NMRC|ALPHA)."""
    suffix = '_' + kind.upper() + '.CSV'
    for n in zf.namelist():
        if n.upper().endswith(suffix):
            return n
    raise KeyError('no %s member in zip' % kind)


def _rows(zf, name):
    with zf.open(name) as raw:
        yield from csv.reader(io.TextIOWrapper(raw, encoding='latin-1', newline=''))


def _num(s):
    try:
        v = float(s)
    except ValueError:
        return None
    return int(v) if v == int(v) else v


def _date(s):
    try:
        return datetime.strptime(s.strip(), '%m/%d/%Y').date()
    except ValueError:
        return None


def _acute(ccn):
    return len(ccn) == 6 and ccn.isdigit() and ACUTE_SUFFIX[0] <= int(ccn[2:]) <= ACUTE_SUFFIX[1]


def extract_year(zip_path, fy):
    with zipfile.ZipFile(zip_path) as zf:
        reports = {}
        for r in _rows(zf, member(zf, 'RPT')):
            if len(r) < 8:
                continue
            ccn = r[2].strip()
            if not _acute(ccn):
                continue
            bgn, end, proc = _date(r[5]), _date(r[6]), _date(r[7])
            rid = int(r[0])
            reports[r[0].strip()] = {
                'fy': fy, 'ccn': ccn, 'rpt_rec_num': rid, 'status': r[4].strip(),
                'fy_bgn': bgn.isoformat() if bgn else '',
                'fy_end': end.isoformat() if end else '',
                'period_days': (end - bgn).days + 1 if bgn and end else '',
                'proc_dt': proc.isoformat() if proc else '',
            }
        vals = {rid: {} for rid in reports}
        for r in _rows(zf, member(zf, 'NMRC')):
            if len(r) < 5 or r[1] not in _WKSHTS:
                continue
            rid = r[0].strip()
            if rid not in vals:
                continue
            f = _NEEDED.get((r[1], r[2].strip().zfill(5), r[3].strip().zfill(5)))
            if f is None:
                continue
            v = _num(r[4])
            if v is not None:
                vals[rid][f] = v
        text = {rid: {} for rid in reports}
        for r in _rows(zf, member(zf, 'ALPHA')):
            if len(r) < 5 or r[1] != 'S200001':
                continue
            rid = r[0].strip()
            if rid not in text:
                continue
            f = _ALPHA_NEEDED.get((r[1], r[2].strip().zfill(5), r[3].strip().zfill(5)))
            if f is not None:
                text[rid][f] = r[4].strip()
    out = []
    for rid, row in reports.items():
        v = vals[rid]
        icu = [v['icu:' + l] for l in ICU_LINES if 'icu:' + l in v]
        for f in CELLS:
            row[f] = v.get(f, '')
        row['ffs_days_icu'] = sum(icu) if icu else ''
        for f in ALPHA_CELLS:
            row[f] = text[rid].get(f, '')
        out.append(row)
    return out


def dedupe(rows):
    """One row per (ccn, fy): longest period, then latest proc_dt, then highest rpt_rec_num."""
    best = {}
    for r in rows:
        key = (r['ccn'], r['fy'])
        rank = (r['period_days'] or 0, r['proc_dt'], r['rpt_rec_num'])
        if key not in best or rank > best[key][0]:
            best[key] = (rank, r)
    return [best[k][1] for k in sorted(best)]
