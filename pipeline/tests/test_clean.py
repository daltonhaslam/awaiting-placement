import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ap import clean

BASE = dict(fy=2024, ccn='010001', period_days=366, tot_disch=4000, ffs_disch=950, ma_disch=1000,
            ffs_days_l1=4000, ffs_days_icu=500, ma_days=5000, ip_days=50000, nursery_days=1000,
            bed_days=73200, beds=200, resid_fte=0, npr=250e6, opex=240e6)

class T(unittest.TestCase):
    def d(self, **kw): return clean.derive({**BASE, **kw})
    def test_derive(self):
        d = self.d()
        self.assertAlmostEqual(d['ffs_alos'], 4500/950)
        self.assertAlmostEqual(d['ma_alos'], 5.0)
        self.assertAlmostEqual(d['ma_share'], 1000/1950)
        self.assertAlmostEqual(d['mcr'], 1950/4000)
        self.assertAlmostEqual(d['occ'], 49000/73200)
        self.assertFalse(d['teach'])
    def test_clean_row_passes(self):
        self.assertIsNone(clean.exclusion_reason(self.d()))
    def test_rules_in_order(self):
        self.assertEqual(clean.exclusion_reason(self.d(ccn='400001')), 'state')
        self.assertEqual(clean.exclusion_reason(self.d(ccn='210001')), 'state')
        self.assertEqual(clean.exclusion_reason(self.d(period_days=200)), 'period')
        self.assertEqual(clean.exclusion_reason(self.d(ma_disch=0, ma_days=0)), 'no_ma')
        self.assertEqual(clean.exclusion_reason(self.d(ma_disch=29, ma_days=150)), 'ma_volume')
        self.assertEqual(clean.exclusion_reason(self.d(ffs_disch=99, ffs_days_l1=400, ffs_days_icu=0)), 'ffs_volume')
        self.assertEqual(clean.exclusion_reason(self.d(tot_disch=1500)), 'inconsistent')
        self.assertEqual(clean.exclusion_reason(self.d(ma_days=0)), 'inconsistent')
        self.assertEqual(clean.exclusion_reason(self.d(ma_days=20000)), 'alos')
    def test_missing_values_do_not_crash(self):
        self.assertEqual(clean.exclusion_reason(self.d(ma_disch=None, ma_days=None)), 'no_ma')
        self.assertEqual(clean.exclusion_reason(self.d(ma_disch='', ma_days='')), 'no_ma')
    def test_blanks(self):
        self.assertEqual(clean.exclusion_reason(self.d(period_days='')), 'period')
        for k in ('beds', 'bed_days', 'tot_disch', 'ffs_disch'):
            self.assertEqual(clean.exclusion_reason(self.d(**{k: ''})), 'inconsistent', k)
        d = self.d(ffs_days_icu='', nursery_days='')
        self.assertAlmostEqual(d['ffs_days'], 4000)
        self.assertIsNone(clean.exclusion_reason(d))
        empty = {k: '' for k in BASE}; empty['ccn'] = '010001'
        clean.exclusion_reason(clean.derive(empty))
        clean.occ_flag(clean.derive(empty))
    def test_order_no_ma_before_blank_inconsistent(self):
        self.assertEqual(clean.exclusion_reason(self.d(beds='', ma_disch=0, ma_days=0)), 'no_ma')
    def test_zero_bed_days(self):
        d = self.d(bed_days=0)
        self.assertIsNone(d['occ'])
        self.assertEqual(clean.exclusion_reason(d), 'inconsistent')
    def test_rules_publish_the_thresholds_the_code_uses(self):
        r = clean.rules()
        self.assertEqual((r['periodDays'], r['maDischarges'], r['ffsDischarges'], r['alos']), (300, 30, 100, [2, 15]))
        self.assertEqual(r['excludedStates'], ['Puerto Rico', 'Maryland'])
        self.assertEqual((r['acuteSuffix'], r['cahSuffix'], r['occPlausible']), ([1, 879], [1300, 1399], [0.05, 1.0]))
        # Each published threshold flips the rule it names, exactly at the boundary.
        self.assertIsNone(clean.exclusion_reason(self.d(period_days=r['periodDays'])))
        self.assertEqual(clean.exclusion_reason(self.d(period_days=r['periodDays'] - 1)), 'period')
        self.assertIsNone(clean.exclusion_reason(self.d(ma_disch=r['maDischarges'], tot_disch=4000, ma_days=150)))
        self.assertEqual(clean.exclusion_reason(self.d(ma_disch=r['maDischarges'] - 1, ma_days=150)), 'ma_volume')
        self.assertEqual(clean.exclusion_reason(self.d(ffs_disch=r['ffsDischarges'] - 1, ffs_days_l1=400, ffs_days_icu=0)), 'ffs_volume')
        for code, label in clean.EXCLUDED_STATES.items():
            self.assertEqual(clean.exclusion_reason(self.d(ccn=f'{code}0001')), 'state', label)
        self.assertFalse(clean.occ_flag({'occ': r['occPlausible'][0]}))
        self.assertTrue(clean.occ_flag({'occ': r['occPlausible'][0] - 0.001}))
        self.assertFalse(clean.occ_flag({'occ': r['occPlausible'][1]}))
        self.assertTrue(clean.occ_flag({'occ': r['occPlausible'][1] + 0.001}))

    def test_flags(self):
        self.assertTrue(clean.occ_flag(self.d(ip_days=80000, nursery_days=0)))

    def test_check_data_flag(self):
        r = clean.rules()
        self.assertEqual((r['checkGapDays'], r['checkAlosRatio']), (3.0, 2.0))
        flag = lambda ma, ffs: clean.check_data({'ma_alos': ma, 'ffs_alos': ffs})
        self.assertFalse(flag(5.0, 4.5))
        # Gap: strictly more than 3.0 days (values chosen to be exact in binary floating point).
        self.assertFalse(flag(7.0, 4.0))
        self.assertTrue(flag(7.25, 4.0))
        # Ratio: strictly more than twofold, with the gap under 3 days.
        self.assertFalse(flag(5.0, 2.5))
        self.assertTrue(flag(5.0, 2.25))
        # Either way: swapping the two stays never changes the answer.
        for ma, ffs in [(7.0, 4.0), (7.25, 4.0), (5.0, 2.5), (5.0, 2.25)]:
            self.assertEqual(flag(ma, ffs), flag(ffs, ma), (ma, ffs))
        # Zero, negative or missing stays never divide or raise; a zero stay is judged on the gap alone.
        self.assertFalse(flag(0.0, 2.0))
        self.assertFalse(flag(0.0, 0.0))
        self.assertTrue(flag(0.0, 3.5))
        self.assertFalse(flag(None, 4.0))
        self.assertFalse(clean.check_data({}))
        # Through derive(): MA 10 days a stay against traditional 4.5 is flagged, and the hospital is still clean.
        d = self.d(ma_days=10000)
        self.assertTrue(clean.check_data(d))
        self.assertIsNone(clean.exclusion_reason(d))
        self.assertFalse(clean.check_data(self.d()))

if __name__ == '__main__':
    unittest.main()
