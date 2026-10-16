import copy, json, os, shutil, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import build_data
from ap import content

CONTENT = build_data.CONTENT_DIR
KEYS = {'t0', 't1', 'cvar', 'rate', 'cm', 'fill', 'mix', 'lenses'}


def mutate(fn):
    """Copy the content dir, apply fn(files dict), write back, return load_content's result or raise."""
    d = Path(tempfile.mkdtemp())
    try:
        files = {p.name: json.loads(p.read_text(encoding='utf-8')) for p in CONTENT.glob('*.json')}
        fn(files)
        for n, v in files.items():
            (d / n).write_text(json.dumps(v), encoding='utf-8')
        return content.load_content(d)
    finally:
        shutil.rmtree(d)


def first_src(files):
    return files['sources.json'][0]


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = content.load_content(CONTENT)

    def test_shape(self):
        self.assertEqual(set(self.c), {'medpac', 'kff2026', 'timeline', 'sides', 'assumptions', 'sources'})
        self.assertEqual(set(self.c['sides']), {'hospitals', 'plans', 'unsettled'})
        for k, v in self.c['sides'].items():
            self.assertTrue(3 <= len(v) <= 7, k)

    def test_assumption_keys_cover_defaults(self):
        keys = {a['key'] for a in self.c['assumptions']}
        self.assertEqual(keys, KEYS)
        self.assertTrue(set(build_data.MODEL_STATIC['defaults']) - {'pay', 'lens'} <= keys)

    def test_derived_medpac_numbers(self):
        lenses, mix, medpac = build_data.derive_medpac(self.c['medpac'])
        self.assertEqual(lenses['placement'], {'home': 0, 'hha': 0.2, 'snf': 1.2, 'irf': 2.1})
        self.assertEqual(lenses['adjusted'], {'home': 0.2, 'hha': 0.4, 'snf': 1.4, 'irf': 2.3})
        self.assertEqual(lenses['unadjusted'], {'home': 0.3, 'hha': 0.5, 'snf': 1.6, 'irf': 2.9})
        self.assertEqual(mix, {'home': 0.65, 'hha': 0.17, 'snf': 0.15, 'irf': 0.03})
        self.assertEqual(medpac, {'ma': 5.7, 'ffs': 5.2, 'fy': 2024})

    def test_every_source_in_site_list(self):
        urls = {s['url'] for s in self.c['sources']}
        def walk(o):
            if isinstance(o, dict):
                if 'url' in o and 'label' in o:
                    yield o
                for v in o.values():
                    yield from walk(v)
            elif isinstance(o, list):
                for v in o:
                    yield from walk(v)
        for s in walk({k: v for k, v in self.c.items() if k != 'sources'}):
            self.assertIn(s['url'], urls)

    def test_bad_sources_rejected(self):
        def setv(k, v):
            return lambda f: first_src(f).__setitem__(k, v)
        def delurl(f): del first_src(f)['url']
        for fn in (delurl, setv('url', 'http://x.org/a'), setv('type', 'blog'), setv('verified', False),
                   setv('verified', 'true')):
            with self.assertRaises(ValueError):
                mutate(fn)

    def test_bad_nested_source_rejected(self):
        def f(files):
            files['sides.json']['hospitals'][0]['src'][0]['verified'] = False
        with self.assertRaises(ValueError):
            mutate(f)

    def test_item_without_src_rejected(self):
        def f(files):
            files['sides.json']['plans'][0]['src'] = []
        with self.assertRaises(ValueError):
            mutate(f)

    def test_missing_assumption_rejected(self):
        def f(files):
            files['assumptions.json'] = [a for a in files['assumptions.json'] if a['key'] != 'cm']
        with self.assertRaises(ValueError):
            mutate(f)

    def test_missing_src_key_rejected(self):
        targets = {
            'timeline': lambda f: f['timeline.json'][0],
            'side item': lambda f: f['sides.json']['plans'][0],
            'assumption': lambda f: f['assumptions.json'][0],
            't41': lambda f: f['medpac.json']['t41'],
            'sept': lambda f: f['medpac.json']['sept'],
            'kff2026': lambda f: f['kff2026.json'],
        }
        for name, get in targets.items():
            with self.subTest(name):
                with self.assertRaises(ValueError):
                    mutate(lambda f: get(f).pop('src'))

    def test_side_items_have_unique_stable_keys(self):
        keys = [it['key'] for k in ('hospitals', 'plans', 'unsettled') for it in self.c['sides'][k]]
        self.assertEqual(len(keys), len(set(keys)))
        for k in ('obs-stays', 'duals-share', 'plans-right-level', 'plans-incomplete-requests'):
            self.assertIn(k, keys)

    def test_bad_side_keys_rejected(self):
        def missing(f): del f['sides.json']['plans'][0]['key']
        def blank(f): f['sides.json']['plans'][0]['key'] = ''
        def shouty(f): f['sides.json']['plans'][0]['key'] = 'Plans Right Level'
        def dupe(f): f['sides.json']['plans'][1]['key'] = f['sides.json']['hospitals'][0]['key']
        for fn in (missing, blank, shouty, dupe):
            with self.subTest(fn.__name__):
                with self.assertRaises(ValueError):
                    mutate(fn)

    def test_short_is_optional_but_validated(self):
        plans = {it['key']: it for it in self.c['sides']['plans']}
        self.assertTrue(plans['plans-incomplete-requests']['short'])
        for bad in ('', '   ', 'ends with a period.', 7):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    mutate(lambda f: f['sides.json']['plans'][1].__setitem__('short', bad))
        mutate(lambda f: f['sides.json']['plans'][2].__setitem__('short', 'a clause without a period'))

    def test_via_optional_https_only(self):
        self.assertTrue(any('via' in s for s in self.c['sources']))
        with self.assertRaises(ValueError):
            mutate(lambda f: first_src(f).__setitem__('via', 'http://x.org/api'))
        with self.assertRaises(ValueError):
            mutate(lambda f: first_src(f).__setitem__('note', 'extra'))
        mutate(lambda f: first_src(f).__setitem__('via', 'https://x.org/api'))

    def test_urls_are_not_api_endpoints(self):
        for s in self.c['sources']:
            self.assertNotIn('/api/', s['url'])
            self.assertNotIn('eutils', s['url'])


if __name__ == '__main__':
    unittest.main()
