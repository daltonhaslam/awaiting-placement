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
# S-3 Part I lines 8 through 12 (intensive-care units), including every subscripted unit a hospital adds (8.01, 9.01,
# 12.03 ...). Matched as a range: a fixed tuple of base lines silently drops the subscripts.
ICU_LINES = ('00800', '01299')
# Title XVIII days are column 6; a PARHM-demonstration hospital splits its Medicare days between 6 and 6.01.
DAYS_COLS = ('00600', '00601')
# Day fields that sum across cells (column 6 + 6.01, every ICU line) instead of taking one cell. Each cell counts once:
# a repeated (line, column) row in the export replaces the earlier value, as it does for single-cell fields.
ADDITIVE = {'ma_days', 'ffs_days_l1', 'icu'}

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

_WKSHTS = {S3, G3}
_NEEDED = {(w, l, c): f for f, (w, l, c) in CELLS.items()}
_NEEDED[(S3, '00100', '00601')] = 'ffs_days_l1'
_NEEDED[(S3, '00200', '00601')] = 'ma_days'


def _field(ws, line, col):
    f = _NEEDED.get((ws, line, col))
    if f is None and ws == S3 and col in DAYS_COLS and ICU_LINES[0] <= line <= ICU_LINES[1]:
        return 'icu'
    return f
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
            line, col = r[2].strip().zfill(5), r[3].strip().zfill(5)
            f = _field(r[1], line, col)
            if f is None:
                continue
            v = _num(r[4])
            if v is None:
                continue
            if f in ADDITIVE:
                vals[rid].setdefault(f, {})[(line, col)] = v
            else:
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
        for f in ADDITIVE:
            if f in v:
                v[f] = sum(v[f].values())
        for f in CELLS:
            row[f] = v.get(f, '')
        row['ffs_days_icu'] = v.get('icu', '')
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
