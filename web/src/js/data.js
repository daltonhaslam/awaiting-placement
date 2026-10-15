// Reads the inlined contract (<script id="ap-data">) and indexes it.
// The contract's top-level keys (meta, national, model, presets, hospitals, gapHist, content) are spread onto D.
export function loadData(raw) {
  if (!raw) {
    const el = document.getElementById('ap-data');
    if (!el) throw new Error('ap-data script missing');
    raw = JSON.parse(el.textContent);
    el.remove(); // the parsed copy is all that is needed; drop the second ~1 MB string
  }
  const D = { ...raw, presetsById: new Map(raw.presets.map((x) => [x.id, x])) };
  let byId = null;
  Object.defineProperty(D, 'hospitalsById', {
    enumerable: true,
    get: () => (byId ??= new Map(raw.hospitals.map((x) => [x.id, x]))),
  });
  return D;
}
