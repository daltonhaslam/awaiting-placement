"""Load and validate the cited content (pipeline/content/*.json) that build_data embeds as ap.json `content`.

Every source must be an https URL with a known type and verified == true. The build fails (ValueError) otherwise.
"""
import json
import re
from pathlib import Path

SRC_TYPES = {'gov', 'peer-reviewed', 'nonprofit', 'trade-group', 'industry', 'advocacy-funded', 'think-tank'}
ASSUMPTION_KEYS = {'t0', 't1', 'cvar', 'rate', 'cm', 'fill', 'mix', 'lenses'}
SIDES = ('hospitals', 'plans', 'unsettled')
SRC_KEYS = {'label', 'url', 'type', 'verified', 'via'}
KEY_RE = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')
DATE_RE = re.compile(r'^\d{4}(-\d{2}(-\d{2})?)?$')


def _fail(path, msg):
    raise ValueError(f'content: {path}: {msg}')


def check_src(s, path):
    if not isinstance(s, dict):
        _fail(path, 'source must be an object')
    extra = set(s) - SRC_KEYS
    if extra:
        _fail(path, f'unexpected source keys {sorted(extra)}')
    for k in ('label', 'url', 'type'):
        if not isinstance(s.get(k), str) or not s[k].strip():
            _fail(path, f'source missing {k}')
    if not s['url'].startswith('https://') or len(s['url']) <= len('https://'):
        _fail(path, f"source url must be https: {s['url']!r}")
    if s['type'] not in SRC_TYPES:
        _fail(path, f"unknown source type {s['type']!r}")
    if 'via' in s and not (isinstance(s['via'], str) and s['via'].startswith('https://') and len(s['via']) > 8):
        _fail(path, f"source via must be an https URL: {s['via']!r}")
    if s.get('verified') is not True:
        _fail(path, f"source not verified: {s['url']}")
    return s


def check_srcs(v, path):
    """v is one SRC or a non-empty list of SRCs. Returns the list of SRCs."""
    items = [v] if isinstance(v, dict) else v
    if not isinstance(items, list) or not items:
        _fail(path, 'needs at least one source')
    return [check_src(s, f'{path}[{i}]') for i, s in enumerate(items)]


def collect_srcs(o, path='content'):
    """Yield (path, SRC-or-list) for every `src` key anywhere in o."""
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'src':
                yield f'{path}.src', v
            else:
                yield from collect_srcs(v, f'{path}.{k}')
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from collect_srcs(v, f'{path}[{i}]')


def load_content(dir):
    """Return the validated `content` dict for ap.json."""
    d = Path(dir)

    def read(name):
        p = d / f'{name}.json'
        if not p.exists():
            _fail(name, 'file missing')
        return json.loads(p.read_text(encoding='utf-8'))

    medpac, kff = read('medpac'), read('kff2026')
    c = {'medpac': medpac, 'kff2026': kff, 'timeline': read('timeline'), 'sides': read('sides'),
         'assumptions': read('assumptions'), 'sources': read('sources')}

    if not isinstance(c['sources'], list) or not c['sources']:
        _fail('sources', 'empty site source list')
    site_urls = set()
    for i, s in enumerate(c['sources']):
        site_urls.add(check_src(s, f'sources[{i}]')['url'])
    for path, v in collect_srcs({k: c[k] for k in c if k != 'sources'}):
        for s in check_srcs(v, path):
            if s['url'] not in site_urls:
                _fail(path, f"source not in the site source list: {s['url']}")

    # every cited block must carry its own non-empty src (collect_srcs only sees keys that exist)
    required = [('medpac.t41', medpac.get('t41')), ('medpac.sept', medpac.get('sept')), ('kff2026', kff)]
    required += [(f'timeline[{i}]', t) for i, t in enumerate(c['timeline'])]
    required += [(f'assumptions[{i}]', a) for i, a in enumerate(c['assumptions'])]
    for k in SIDES:
        required += [(f'sides.{k}[{i}]', it) for i, it in enumerate(c['sides'].get(k, []))]
    for path, obj in required:
        if not isinstance(obj, dict) or 'src' not in obj:
            _fail(path, 'missing src')
        check_srcs(obj['src'], f'{path}.src')

    if set(c['sides']) != set(SIDES):
        _fail('sides', f'needs exactly {SIDES}')
    for k in SIDES:
        if not 3 <= len(c['sides'][k]) <= 5:
            _fail(f'sides.{k}', 'needs 3 to 5 items')
        for i, it in enumerate(c['sides'][k]):
            if not str(it.get('text', '')).strip():
                _fail(f'sides.{k}[{i}]', 'empty text')
            if not KEY_RE.match(str(it.get('key', ''))):
                _fail(f'sides.{k}[{i}]', 'needs a stable key (lowercase words joined by hyphens)')
            if 'short' in it and (not isinstance(it['short'], str) or not it['short'].strip() or it['short'].endswith('.')):
                _fail(f'sides.{k}[{i}]', 'short must be non-empty text without a final period')
    seen = [it['key'] for k in SIDES for it in c['sides'][k]]
    dupes = sorted({x for x in seen if seen.count(x) > 1})
    if dupes:
        _fail('sides', f'duplicate item keys {dupes}')
    for i, t in enumerate(c['timeline']):
        if not DATE_RE.match(str(t.get('date', ''))) or not t.get('title') or not t.get('body'):
            _fail(f'timeline[{i}]', 'needs date (YYYY, YYYY-MM or YYYY-MM-DD), title and body')
    keys = [a.get('key') for a in c['assumptions']]
    if set(keys) != ASSUMPTION_KEYS or len(keys) != len(ASSUMPTION_KEYS):
        _fail('assumptions', f'keys must be exactly {sorted(ASSUMPTION_KEYS)}, got {keys}')
    for a in c['assumptions']:
        for k in ('label', 'value', 'why'):
            if not str(a.get(k, '')).strip():
                _fail(f"assumptions.{a['key']}", f'missing {k}')
    rows = medpac['t41']['rows']
    if {r['dest'] for r in rows} != {'home', 'hha', 'snf', 'irf'}:
        _fail('medpac.t41.rows', 'needs home, hha, snf, irf')
    return c
