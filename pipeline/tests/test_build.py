import os, statistics, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import build_data

HINT = 'missing Hospital General Information: run python3 -I pipeline/fetch.py --only hospital_general_info'
TOP = ['meta', 'national', 'model', 'presets', 'hospitals', 'gapHist', 'content']

@unittest.skipUnless(build_data.HGI.exists(), HINT)
class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = build_data.build()
    def test_top_keys(self):
        self.assertEqual(list(self.out.keys()), TOP)
    def test_n_clean(self):
        self.assertEqual(self.out['meta']['nClean'], len(self.out['hospitals']))
    def test_meta_rules_come_from_clean(self):
        from ap import clean
        self.assertEqual(self.out['meta']['rules'], clean.rules())
        self.assertEqual(self.out['meta']['rules']['alos'], [2, 15])
    def test_cross_check(self):
        h = self.out['meta']['crossCheck']['hcris']
        m = self.out['meta']['crossCheck']['medpac']
        self.assertAlmostEqual(h['ma'], m['ma'], delta=0.2)
        self.assertAlmostEqual(h['ffs'], m['ffs'], delta=0.2)
    def test_committed_equals_fresh(self):
        with open(build_data.OUT_PATH, encoding='utf-8') as f:
            self.assertEqual(f.read(), build_data.dump(self.out))
    def test_hospital_bounds(self):
        fys = set(self.out['meta']['trendFys'])
        for h in self.out['hospitals']:
            self.assertTrue(0 <= h['ma'] <= 1, h['id'])
            self.assertTrue(2 <= h['maAlos'] <= 15, h['id'])
            self.assertEqual(len(h['trend']), len(fys), h['id'])
            self.assertTrue(all(t is None or len(t) == 3 for t in h['trend']), h['id'])
    def test_ranges_cover_hospitals(self):
        rg = self.out['model']['ranges']
        for h in self.out['hospitals']:
            self.assertTrue(rg['beds'][0] <= h['beds'] <= rg['beds'][1], h['id'])
            self.assertTrue(rg['dis'][0] <= h['dis'] <= rg['dis'][1], h['id'])
            if not h['occFlag']:
                self.assertTrue(rg['occ'][0] <= h['occ'] <= rg['occ'][1], (h['id'], h['occ']))
    def test_ma_stays_derived_from_content(self):
        sept = self.out['content']['medpac']['sept']
        self.assertEqual(self.out['national']['context']['maStays2023'],
                         round(sept['staysPer1000']['ma']['ach'] / 1000 * sept['sampleMillions']['ma'] * 1e6))
    def test_assumption_quotes_median_occupancy_from_the_data(self):
        fill = next(a for a in self.out['content']['assumptions'] if a['key'] == 'fill')
        med = statistics.median(h['occ'] for h in self.out['hospitals'])
        self.assertNotIn('{', fill['why'])
        self.assertIn(f'is {med * 100:.1f}%', fill['why'])
    def test_presets(self):
        self.assertEqual([p['id'] for p in self.out['presets']], ['community', 'regional', 'academic'])
    def test_national_series(self):
        self.assertEqual([s['fy'] for s in self.out['national']['series']], self.out['meta']['trendFys'])
    def test_exclusions_sum(self):
        m = self.out['meta']
        self.assertEqual(sum(m['exclusions'].values()) + m['nClean'], m['nAcute'])

class DeriveMaStaysTest(unittest.TestCase):
    def test_follows_the_cited_numbers(self):
        m = {'sept': {'staysPer1000': {'ma': {'ach': 100}}, 'sampleMillions': {'ma': 10}}}
        self.assertEqual(build_data.derive_ma_stays(m), 1_000_000)

if __name__ == '__main__':
    unittest.main()
