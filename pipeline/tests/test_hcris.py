import io, os, sys, unittest, zipfile, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from ap import hcris

RPT = "\n".join([
  "1,1,010001,,1,01/01/2024,12/31/2024,03/01/2025,N,N,,,,,,,,",
  "2,1,010001,,5,01/01/2024,06/30/2024,04/01/2025,N,N,,,,,,,,",   # shorter duplicate
  "3,1,011300,,1,01/01/2024,12/31/2024,03/01/2025,N,N,,,,,,,,",   # CAH -> excluded
])
NMRC = "\n".join([
  "1,S300001,00200,00600,5000", "1,S300001,00200,01300,1000",      # MA days, discharges
  "1,S300001,00100,00600,4000", "1,S300001,00800,00600,500",       # FFS line1 + ICU line8
  "1,S300001,00801,00600,200",  "1,S300001,01203,00600,50",        # subscripted ICU units count too
  "1,S300001,00100,00601,100",  "1,S300001,00200,00601,25",        # PARHM column 6.01 adds to column 6
  "1,S300001,01000,00601,10",
  "1,S300001,00100,01300,950",  "1,S300001,00100,01500,4000",
  "1,S300001,01400,00200,200",  "1,S300001,01400,00300,73200",
  "1,S300001,01400,00800,50000","1,S300001,01300,00800,1000",
  "1,G300000,00300,00100,250000000", "1,G300000,00400,00100,240000000",
  "2,S300001,00200,01300,10",
])
ALPHA = "\n".join([
  "1,S200001,00300,00100,TEST HOSPITAL", "1,S200001,00200,00100,SPRINGFIELD",
  "1,S200001,00200,00200,IL", "1,S200001,00200,00300,62701",
])

class T(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix='.zip', delete=False)
        with zipfile.ZipFile(self.tmp, 'w') as z:
            z.writestr('HOSP10_2024_RPT.CSV', RPT)
            z.writestr('hosp10_2024_NMRC.CSV', NMRC)
            z.writestr('HOSP10_2024_ALPHA.CSV', ALPHA)
        self.tmp.close()
    def tearDown(self):
        os.unlink(self.tmp.name)

    def test_acute_only_and_dedupe(self):
        rows = hcris.dedupe(hcris.extract_year(self.tmp.name, 2024))
        self.assertEqual([r['ccn'] for r in rows], ['010001'])
        self.assertEqual(rows[0]['rpt_rec_num'], 1)   # longest period wins
        self.assertEqual(rows[0]['period_days'], 366)  # inclusive, leap year

    def test_fields(self):
        r = hcris.dedupe(hcris.extract_year(self.tmp.name, 2024))[0]
        self.assertEqual((r['ma_days'], r['ma_disch']), (5025, 1000))
        self.assertEqual((r['ffs_days_l1'], r['ffs_days_icu'], r['ffs_disch']), (4100, 760, 950))
        self.assertEqual((r['tot_disch'], r['beds'], r['nursery_days']), (4000, 200, 1000))
        self.assertEqual((r['npr'], r['opex']), (250000000, 240000000))
        self.assertEqual((r['name'], r['city'], r['state'], r['zip']), ('TEST HOSPITAL', 'SPRINGFIELD', 'IL', '62701'))

    def test_icu_lines_cover_subscripts(self):
        # Every line from 8 through 12.99 in column 6 or 6.01 is an ICU day cell; neighbours are not.
        for line in ('00800', '00801', '00950', '01200', '01299'):
            self.assertEqual(hcris._field('S300001', line, '00600'), 'icu', line)
            self.assertEqual(hcris._field('S300001', line, '00601'), 'icu', line)
        for line, col in (('00700', '00600'), ('01300', '00600'), ('00800', '00800'), ('00800', '01300')):
            self.assertNotEqual(hcris._field('S300001', line, col), 'icu', (line, col))


class PinnedYearsTest(unittest.TestCase):
    def test_years_come_from_sources_json(self):
        import extract_hcris
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'sources.json')
            with open(path, 'w') as f:
                f.write('[{"name":"hcris_fy2025"},{"name":"hospital_general_info"},{"name":"hcris_fy2023"}]')
            self.assertEqual(extract_hcris.pinned_years(path), [2023, 2025])
        self.assertTrue(extract_hcris.YEARS and extract_hcris.YEARS == sorted(extract_hcris.YEARS))


if __name__ == '__main__':
    unittest.main()
