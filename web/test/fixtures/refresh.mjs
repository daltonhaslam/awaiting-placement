// Keep the test fixture in step with the real data contract. Usage, from web/:
//   node test/fixtures/refresh.mjs            copy content, model and meta.rules from src/data/ap.json into ap.min.json
//   node test/fixtures/refresh.mjs --schema   also rewrite test/ap.schema.json from src/data/ap.json (review the diff:
//                                             every change there is a change to what the page reads)
// The fixture's hospitals, presets, national series and histogram are hand-made edge cases and are left alone.
import { readFileSync, writeFileSync } from 'node:fs';
import { inferSchema } from '../schema.mjs';

const url = (p) => new URL(p, import.meta.url);
const real = JSON.parse(readFileSync(url('../../src/data/ap.json'), 'utf8'));
const fixture = JSON.parse(readFileSync(url('ap.min.json'), 'utf8'));
fixture.meta.rules = real.meta.rules;
fixture.model = real.model;
fixture.content = real.content;
writeFileSync(url('ap.min.json'), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('wrote test/fixtures/ap.min.json');
if (process.argv.includes('--schema')) {
  const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'ap.json (web/src/data/ap.json)', ...inferSchema([real]) };
  writeFileSync(url('../ap.schema.json'), `${JSON.stringify(schema, null, 1)}\n`);
  console.log('wrote test/ap.schema.json');
}
