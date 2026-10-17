import csv, os, statistics, sys, tempfile, unittest
from pathlib import Path
from unittest import mock
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import build_data

HINT = 'missing the names table and Hospital General Information'
TOP = ['meta', 'national', 'model', 'presets', 'hospitals', 'gapHist', 'content']

@unittest.skipUnless(build_data.NAMES.exists() or build_data.HGI.exists(), HINT)
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
    def test_side_quotes_irf_use_from_medpac_json(self):
        sept = self.out['content']['medpac']['sept']
        rate = sept['staysPer1000']
        it = next(i for items in self.out['content']['sides'].values() for i in items if i['key'] == 'irf-use-narrower')
        self.assertNotIn('{', it['text'])
        self.assertIn(f"({rate['ma']['irf']} vs {rate['ffs']['irf']} stays per 1,000 in {sept['year']})", it['text'])
    def test_assumption_values_come_from_the_model_and_medpac_json(self):
        d = build_data.MODEL_STATIC['defaults']
        a = {x['key']: x for x in self.out['content']['assumptions']}
        self.assertEqual(a['t0']['value'], build_data.fmt_days(d['t0']))
        self.assertEqual(a['t1']['value'], build_data.fmt_days(d['t1']))
        for k in ('cvar', 'rate', 'cm'):
            self.assertEqual(a[k]['value'], f"${d[k]:,}", k)
        mix = self.out['model']['mix']
        p = build_data.fmt_pct_number
        self.assertEqual(a['mix']['value'], f"Home {p(mix['home'])}%, home health {p(mix['hha'])}%, "
                                            f"skilled nursing {p(mix['snf'])}%, inpatient rehabilitation {p(mix['irf'])}%")
        sept = self.out['content']['medpac']['sept']
        self.assertIn(f"From MedPAC's {sept['year']} data: {p(mix['home'])}, {p(mix['hha'])} and {p(mix['snf'])} percent", a['mix']['why'])
        self.assertIn(f"({p(sept['mix']['ffs']['irf'])} percent in traditional Medicare)", a['mix']['why'])
        for x in a.values():
            self.assertNotIn('{', x['value'] + x['why'], x['key'])

    def test_presets(self):
        self.assertEqual([p['id'] for p in self.out['presets']], ['community', 'regional', 'academic'])
    def test_national_series(self):
        self.assertEqual([s['fy'] for s in self.out['national']['series']], self.out['meta']['trendFys'])
    def test_check_data_flag_marks_but_keeps(self):
        hs = self.out['hospitals']
        flagged = [h for h in hs if 'checkData' in h]  # any count, including none, after a refresh
        self.assertTrue(all(h['checkData'] is True for h in flagged))  # omitted, never false
        self.assertEqual(self.out['meta']['nClean'], len(hs))  # flagged hospitals stay in the list and the count
    def test_exclusions_sum(self):
        m = self.out['meta']
        self.assertEqual(sum(m['exclusions'].values()) + m['nClean'], m['nAcute'])

class NamesTableTest(unittest.TestCase):
    RAW = 'Facility ID,Facility Name,City/Town,State\n010001,SOUTHEAST HEALTH MEDICAL CENTER,DOTHAN,AL\n999999,ELSEWHERE,X,AL\n'

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.raw = self.tmp / 'hgi.csv'
        self.table = self.tmp / 'names.csv'
        self.raw.write_text(self.RAW, encoding='utf-8-sig')

    def patched(self):
        return mock.patch.multiple(build_data, HGI=self.raw, NAMES=self.table)

    def test_table_is_the_raw_names_for_extract_ccns_only(self):
        with self.patched():
            rows = build_data.names_rows(build_data.read_raw_hgi(), {'010001', '020002'})
        self.assertEqual(rows, [{'ccn': '010001', 'name': 'SOUTHEAST HEALTH MEDICAL CENTER', 'city': 'DOTHAN'}])

    def test_committed_table_is_preferred_over_the_raw_file(self):
        self.table.write_text('ccn,name,city\n010001,PINNED NAME,PINNED CITY\n', encoding='utf-8')
        with self.patched():
            self.assertEqual(build_data.load_names()['010001']['name'], 'PINNED NAME')

    def test_raw_file_is_the_fallback_when_the_table_is_missing(self):
        with self.patched():
            got = build_data.load_names()
        self.assertEqual(got['010001'], {'ccn': '010001', 'name': 'SOUTHEAST HEALTH MEDICAL CENTER', 'city': 'DOTHAN'})

    def test_neither_present_fails_with_a_hint(self):
        self.raw.unlink()
        with self.patched(), self.assertRaises(SystemExit) as e:
            build_data.load_names()
        self.assertIn('--refresh-names', str(e.exception))

    def test_write_then_load_round_trips(self):
        rows = [{'ccn': '010001', 'name': 'A "QUOTED", NAME', 'city': 'X'}]
        with self.patched():
            build_data.write_names(rows)
            self.assertEqual(build_data.load_names(), {'010001': rows[0]})


@unittest.skipUnless(build_data.NAMES.exists() and build_data.HGI.exists(), 'needs data/raw/hospital_general_info')
class CommittedNamesTableTest(unittest.TestCase):
    def test_committed_table_matches_the_pinned_raw_file(self):
        rows = build_data.names_rows(build_data.read_raw_hgi(), {r['ccn'] for r in build_data.load_extract()})
        with open(build_data.NAMES, newline='', encoding='utf-8') as f:
            self.assertEqual(list(csv.DictReader(f)), rows, 'stale: run python3 -I pipeline/build_data.py --refresh-names')


class AssumptionFormatTest(unittest.TestCase):
    def test_days_and_percents(self):
        self.assertEqual(build_data.fmt_days(2.5), '2.5 days')
        self.assertEqual(build_data.fmt_days(1.0), '1.0 day')
        self.assertEqual(build_data.fmt_days(1.5), '1.5 days')
        self.assertEqual(build_data.fmt_pct_number(0.65), '65')
        self.assertEqual(build_data.fmt_pct_number(0.025), '2.5')
        self.assertEqual(build_data.fmt_pct_number(0.07), '7')

    def test_the_content_file_types_no_number_the_build_computes(self):
        import json
        raw = {a['key']: a for a in json.loads((build_data.CONTENT_DIR / 'assumptions.json').read_text(encoding='utf-8'))}
        self.assertEqual(raw['t0']['value'], '{t0Days}')
        self.assertEqual(raw['t1']['value'], '{t1Days}')
        for k in ('cvar', 'rate', 'cm'):
            self.assertEqual(raw[k]['value'], '{%s}' % k)
        self.assertNotRegex(raw['mix']['value'], r'\d')


class DeriveMaStaysTest(unittest.TestCase):
    def test_follows_the_cited_numbers(self):
        m = {'sept': {'staysPer1000': {'ma': {'ach': 100}}, 'sampleMillions': {'ma': 10}}}
        self.assertEqual(build_data.derive_ma_stays(m), 1_000_000)

if __name__ == '__main__':
    unittest.main()
