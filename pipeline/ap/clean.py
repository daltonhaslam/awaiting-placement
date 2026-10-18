"""Derived fields and exclusion rules for the HCRIS hospital-year extract (listed for readers on the methods page).

Blank cells in the extract mean "missing" (HCRIS omits zero cells), so every function here tolerates
None / '' and never raises on them.
"""

# The exclusion thresholds. exclusion_reason applies them and build_data emits them as meta.rules,
# so the methods page states exactly what the code does.
MIN_PERIOD_DAYS = 300
MIN_MA_DISCHARGES = 30
MIN_FFS_DISCHARGES = 100
ALOS_RANGE = (2, 15)
EXCLUDED_STATES = {'40': 'Puerto Rico', '21': 'Maryland'}  # CCN state code -> label (Maryland is not under IPPS)
ACUTE_SUFFIX = (1, 879)    # short-term acute care hospitals: CCN ends in 0001 to 0879
CAH_SUFFIX = (1300, 1399)  # critical access hospitals use this range and are not included
OCC_PLAUSIBLE = (0.05, 1.0)  # occupancy outside this is flagged and not shown
# "Check this hospital's data": a clean hospital whose gap is far outside the usual range is kept (in every count,
# the histogram and the national numbers) but marked on its page, and the calculator uses national averages for it.
CHECK_GAP_DAYS = 3.0  # |MA ALOS - traditional ALOS| above this, in days
CHECK_ALOS_RATIO = 2.0  # longer ALOS more than this many times the shorter one
# The "Teaching hospital" badge needs this many full-time-equivalent interns and residents (S-3 line 14 column 9). A few
# hospitals report a fraction of one FTE (residents rotating through from another hospital's program). The Academic
# preset still counts any resident.
TEACH_MIN_FTE = 10
# A report that is not a year long (365 days, or 366 in a leap year) has its counts scaled to 365 days on the hospital
# pages and in the calculator: in FY2024, 7 reports run 382 to 425 days and a few run 300 to 364. Shares and stays are
# ratios and unchanged; national figures pool the counts as reported.
YEAR_DAYS = (365, 366)


def rules():
    """The thresholds above, as the JSON-ready dict build_data publishes in meta.rules."""
    return {'periodDays': MIN_PERIOD_DAYS, 'maDischarges': MIN_MA_DISCHARGES, 'ffsDischarges': MIN_FFS_DISCHARGES,
            'alos': list(ALOS_RANGE), 'excludedStates': list(EXCLUDED_STATES.values()),
            'acuteSuffix': list(ACUTE_SUFFIX), 'cahSuffix': list(CAH_SUFFIX), 'occPlausible': list(OCC_PLAUSIBLE),
            'checkGapDays': CHECK_GAP_DAYS, 'checkAlosRatio': CHECK_ALOS_RATIO, 'teachFte': TEACH_MIN_FTE,
            'yearDays': list(YEAR_DAYS)}


def _num(v):
    if v is None or v == '':
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _div(a, b):
    return a / b if a is not None and b else None


def derive(row):
    """Return a copy of `row` with numeric fields parsed and derived fields added (None where undefined)."""
    d = dict(row)
    for k in ('period_days', 'beds', 'bed_days', 'ip_days', 'tot_disch', 'ffs_disch', 'ffs_days_l1',
              'resid_fte', 'npr', 'opex'):
        d[k] = _num(row.get(k))
    # Blank means zero for these (HCRIS omits zero cells)
    for k in ('ffs_days_icu', 'nursery_days', 'ma_disch', 'ma_days'):
        d[k] = _num(row.get(k)) or 0.0
    d['ffs_days'] = None if d['ffs_days_l1'] is None else d['ffs_days_l1'] + d['ffs_days_icu']
    d['ffs_alos'] = _div(d['ffs_days'], d['ffs_disch'])
    d['ma_alos'] = _div(d['ma_days'], d['ma_disch'])
    d['gap'] = None if d['ma_alos'] is None or d['ffs_alos'] is None else d['ma_alos'] - d['ffs_alos']
    both = None if d['ffs_disch'] is None else d['ma_disch'] + d['ffs_disch']
    d['ma_share'] = _div(d['ma_disch'], both)
    d['mcr'] = _div(both, d['tot_disch'])
    d['occ'] = None if d['ip_days'] is None else _div(d['ip_days'] - d['nursery_days'], d['bed_days'])
    d['has_residents'] = (d['resid_fte'] or 0) > 0
    d['teach'] = (d['resid_fte'] or 0) >= TEACH_MIN_FTE
    # Annual counts for the hospital pages and the calculator (see YEAR_DAYS); None stays None.
    for k in ('tot_disch', 'ma_disch', 'ffs_disch'):
        d[f'{k}_yr'] = None if d[k] is None else annual(d[k], d)
    return d


def is_scaled(d):
    """True when the report's period is not a year (see YEAR_DAYS), so its counts are scaled."""
    p = d.get('period_days')
    return bool(p) and not YEAR_DAYS[0] <= p <= YEAR_DAYS[1]


def annual(count, d):
    """A count from the report d, scaled to 365 days when its period is not a year."""
    return count * 365 / d['period_days'] if is_scaled(d) else count


def exclusion_reason(d):
    """First failing rule, in the order below (the methods page lists them the same way), or None if the hospital-year is clean."""
    ccn = str(d.get('ccn') or '')
    if ccn[:2] in EXCLUDED_STATES:
        return 'state'
    if d.get('period_days') is None or d['period_days'] < MIN_PERIOD_DAYS:
        return 'period'
    if d['ma_disch'] <= 0:
        return 'no_ma'
    if d['ma_disch'] < MIN_MA_DISCHARGES:
        return 'ma_volume'
    if d['ffs_disch'] is not None and d['ffs_disch'] < MIN_FFS_DISCHARGES:
        return 'ffs_volume'
    if (any(d.get(k) is None for k in ('beds', 'bed_days', 'tot_disch', 'ffs_disch'))
            or d['bed_days'] <= 0 or d['occ'] is None
            or d['ma_disch'] + d['ffs_disch'] > d['tot_disch'] or d['ma_days'] <= 0
            or not d.get('ffs_days') or d['ffs_days'] <= 0):
        return 'inconsistent'
    lo, hi = ALOS_RANGE
    if not (lo <= d['ma_alos'] <= hi and lo <= d['ffs_alos'] <= hi):
        return 'alos'
    return None


def occ_flag(d):
    """True when occupancy is implausible (outside OCC_PLAUSIBLE) or not computable: show "check data"."""
    o = d.get('occ')
    return o is None or not OCC_PLAUSIBLE[0] <= o <= OCC_PLAUSIBLE[1]


def check_data(d):
    """True when the gap is far outside the usual range (see CHECK_GAP_DAYS and CHECK_ALOS_RATIO above)."""
    ma, ffs = d.get('ma_alos'), d.get('ffs_alos')
    if ma is None or ffs is None:
        return False
    if abs(ma - ffs) > CHECK_GAP_DAYS:
        return True
    lo, hi = min(ma, ffs), max(ma, ffs)
    return lo > 0 and hi > CHECK_ALOS_RATIO * lo
