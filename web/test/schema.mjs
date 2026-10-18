// A small JSON Schema subset (type, properties, required, additionalProperties: false, items), enough to pin the shape
// of ap.json: a renamed, dropped or retyped key fails a test instead of quietly rendering "—" on the live page.
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export function schemaProblems(value, schema, path = '$') {
  const types = [].concat(schema.type ?? []);
  const t = typeOf(value);
  if (types.length && !types.includes(t)) return [`${path}: ${t}, expected ${types.join(' or ')}`];
  const out = [];
  if (t === 'object' && schema.properties) {
    for (const k of schema.required ?? []) if (!(k in value)) out.push(`${path}.${k}: missing`);
    for (const [k, v] of Object.entries(value)) {
      if (k in schema.properties) out.push(...schemaProblems(v, schema.properties[k], `${path}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${path}.${k}: not in the contract`);
    }
  }
  if (t === 'array' && schema.items) value.forEach((v, i) => out.push(...schemaProblems(v, schema.items, `${path}[${i}]`)));
  return out;
}

// Infer a schema from documents: the union of the types seen, a property required when every instance has it, no other
// properties. Numbers are all "number" (JSON does not keep 1.0 apart from 1).
export function inferSchema(values) {
  const types = [...new Set(values.map(typeOf))].sort();
  const s = { type: types.length === 1 ? types[0] : types };
  const objs = values.filter((v) => typeOf(v) === 'object');
  if (objs.length) {
    const keys = [...new Set(objs.flatMap(Object.keys))];
    s.properties = Object.fromEntries(keys.map((k) => [k, inferSchema(objs.filter((o) => k in o).map((o) => o[k]))]));
    s.required = keys.filter((k) => objs.every((o) => k in o));
    s.additionalProperties = false;
  }
  const items = values.filter((v) => typeOf(v) === 'array').flat();
  if (items.length) s.items = inferSchema(items);
  return s;
}
