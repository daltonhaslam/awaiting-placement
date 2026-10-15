// Hospital search over hospital entries: normalization and ranking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, searchIndex, normalize } from '../src/js/ui/search.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ap.min.json', import.meta.url), 'utf8'));
// The contract fixture's hospitals plus names that exercise punctuation, abbreviations and markup.
const hospitals = [
  ...fixture.hospitals,
  { id: '150100', name: "ST. MARY'S MEDICAL CENTER", city: 'Evansville', st: 'IN' },
  { id: '460001', name: 'Utah Valley Hospital', city: 'Provo', st: 'UT' },
  { id: '460010', name: 'University of Utah Hospital', city: 'Salt Lake City', st: 'UT' },
  { id: '050010', name: "O'Connor Hospital", city: 'San Jose', st: 'CA' },
  { id: '330102', name: 'Saint Marys Hospital', city: 'Rochester', st: 'NY' },
  { id: '450002', name: 'TEXAS A&M HEALTH', city: 'Bryan', st: 'TX' },
  { id: '050020', name: 'Glendale Mem Hospital & Hlth Center', city: 'Glendale', st: 'CA' },
];
const index = buildIndex({ hospitals });
const keys = (q, limit) => searchIndex(index, q, limit).map((x) => x.key);

test('normalize strips punctuation, apostrophes and accents', () => {
  assert.equal(normalize("St. Mary's  Médical"), 'st marys medical');
  assert.equal(normalize('A&M'), 'a m');
});

test('apostrophes and periods do not block a match', () => {
  assert.equal(keys("st. mary's")[0], '150100');
});

test('"st marys" finds ST. MARY\'S MEDICAL CENTER', () => {
  const r = searchIndex(index, 'st marys');
  assert.equal(r[0].key, '150100');
  assert.equal(r[0].label, "ST. MARY'S MEDICAL CENTER");
  assert.equal(r[0].sub, 'Evansville, IN');
});

test('saint and st are interchangeable', () => {
  const k = keys('saint marys');
  assert.ok(k.includes('150100') && k.includes('330102'));
});

test("o'connor matches without the apostrophe", () => {
  assert.equal(keys('oconnor')[0], '050010');
  assert.equal(keys("o'connor")[0], '050010');
});

test('a&m matches TEXAS A&M HEALTH first', () => {
  assert.equal(keys('a&m')[0], '450002');
  assert.equal(keys('texas a&m')[0], '450002');
});

test('an exact CCN ranks first', () => {
  assert.equal(keys('460001')[0], '460001');
  assert.equal(keys('220071')[0], '220071');
});

test('city and state find hospitals', () => {
  assert.ok(keys('salt lake').includes('460010'));
  assert.deepEqual(keys('provo'), ['460001']);
});

test('common cost-report abbreviations match the full word', () => {
  assert.equal(keys('glendale memorial health')[0], '050020');
  assert.equal(keys('glendale medical center').length, 0, 'Mem is memorial, not medical');
});

test('markup and empty queries return nothing without throwing', () => {
  assert.deepEqual(searchIndex(index, '<b>'), []);
  assert.deepEqual(searchIndex(index, '<script>'), []);
  assert.deepEqual(searchIndex(index, '   '), []);
  assert.deepEqual(searchIndex(index, null), []);
});

test('limit caps the result count; labels are returned as given (rendered as text)', () => {
  assert.equal(searchIndex(index, 'hospital', 2).length, 2);
  assert.ok(searchIndex(index, 'hospital').length > 2);
  assert.equal(searchIndex(index, 'a&m')[0].label, 'TEXAS A&M HEALTH');
});
