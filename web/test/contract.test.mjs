// The data contract: the real ap.json and the test fixture both have the shape test/ap.schema.json pins, and the
// fixture carries the real content, model and rules (it keeps its own hand-made hospitals).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { schemaProblems, inferSchema } from './schema.mjs';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const schema = json('./ap.schema.json');
const real = json('../src/data/ap.json');
const fixture = json('./fixtures/ap.min.json');
const REFRESH = 'run `node test/fixtures/refresh.mjs` (add --schema if the pipeline changed the contract, and review that diff)';

test('ap.json has the shape the page reads (test/ap.schema.json)', () => {
  assert.deepEqual(schemaProblems(real, schema).slice(0, 20), [], REFRESH);
});

test('the fixture has the same shape', () => {
  assert.deepEqual(schemaProblems(fixture, schema).slice(0, 20), [], REFRESH);
});

test('the fixture carries the real content, model and rules, so tests exercise what the pipeline produces', () => {
  assert.deepEqual(fixture.content, real.content, `fixture content drifted: ${REFRESH}`);
  assert.deepEqual(fixture.model, real.model, `fixture model drifted: ${REFRESH}`);
  assert.deepEqual(fixture.meta.rules, real.meta.rules, `fixture rules drifted: ${REFRESH}`);
});

test('the fixture still covers every hospital field and both trend forms (a year present, a year missing)', () => {
  const fields = Object.keys(schema.properties.hospitals.items.properties);
  for (const f of fields) assert.ok(fixture.hospitals.some((h) => f in h), `no fixture hospital has ${f}`);
  assert.ok(fixture.hospitals.some((h) => h.trend.includes(null)), 'a missing trend year');
});

test('the checker reports a renamed key, a dropped key, a retyped value and an unknown key', () => {
  const bad = structuredClone(real);
  bad.gapHist.p10x = bad.gapHist.p10;
  delete bad.gapHist.p10;
  delete bad.hospitals[0].name;
  bad.hospitals[1].gap = '0.4';
  bad.meta.extra = 1;
  assert.deepEqual(schemaProblems(bad, schema), [
    '$.meta.extra: not in the contract',
    '$.hospitals[0].name: missing',
    '$.hospitals[1].gap: string, expected number',
    '$.gapHist.p10: missing',
    '$.gapHist.p10x: not in the contract',
  ]);
});

test('inferSchema: union types, required only when always present, items merged', () => {
  assert.deepEqual(inferSchema([{ a: 1, b: [null, [1.5]] }, { a: 'x' }]), {
    type: 'object',
    properties: { a: { type: ['number', 'string'] }, b: { type: 'array', items: { type: ['array', 'null'], items: { type: 'number' } } } },
    required: ['a'],
    additionalProperties: false,
  });
});
