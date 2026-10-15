import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, link } from '../src/js/router.js';

test('home and sections', () => {
  assert.deepEqual(parseHash(''), { view: 'home' });
  assert.deepEqual(parseHash('#gap'), { view: 'home', section: 'gap' });
});
test('calculator with query', () => {
  assert.deepEqual(parseHash('#calculator?b=300&a=0.5'), { view: 'calculator', section: 'calculator', query: 'b=300&a=0.5' });
  assert.deepEqual(parseHash('#calculator'), { view: 'calculator', section: 'calculator', query: '' });
});
test('hospital ids are validated', () => {
  assert.deepEqual(parseHash('#hospital-220071'), { view: 'hospital', id: '220071' });
  assert.equal(parseHash('#hospital-22007').view, 'notfound');
  assert.equal(parseHash('#hospital-../x').view, 'notfound');
  assert.equal(parseHash('#<img src=x>').view, 'notfound');
});
test('link round-trips', () => {
  assert.deepEqual(parseHash(link('hospital', '220071')), { view: 'hospital', id: '220071' });
  assert.equal(link('methods'), '#methods');
});
