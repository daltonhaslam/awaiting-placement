import { h } from '../dom.js';
import { ltchShare } from '../content.js';
import { compute, curve, decodeState, encodeState, autoFill, clamp, inputsFromHospital, hasBasic, BASICS, FILL_LO, FILL_HI, DESTS, PA_DESTS } from '../model.js';
import { displayedGap, fmtBeds, fmtDays, fmtNum, fmtPct, fmtSigned, isNum } from '../format.js';
import { section } from '../ui/ticket.js';
import { nowServing, update } from '../ui/nowServing.js';
import { figure } from '../ui/figure.js';
import { tableAlt } from '../ui/tableAlt.js';
import { typedSources, assumptionList, keepIds } from '../ui/source.js';
import { omnibox } from '../ui/omnibox.js';
import { hospitalIndex } from '../ui/search.js';
import { DEST_LABEL } from '../ui/sign.js';
import { link, parseHash } from '../router.js';
import { bedBoard, boardCounts } from '../charts/bedBoard.js';
import { maCurve, curveLegend } from '../charts/maCurve.js';
import { LENSES, PAYS, LEDGER, DOLLARS, ledgerRows } from './calcCopy.js';
import { calledNotice } from '../ui/queue.js';
import { HASH_DEBOUNCE_MS, LIVE_DEBOUNCE_MS } from '../timing.js';

// No. 04, the waiting room calculator. State is the model's input object plus the chosen hospital (if any).
// Every value a reader types is clamped to D.model.ranges; text that is not a number leaves the last valid value
// in place, so compute() only ever sees finite, in-range inputs and NaN never reaches the page.

const MEDPAC = ['placement', 'adjusted', 'unadjusted'];
const HASH_KEY = { beds: 'b', occ: 'o', dis: 'd', mcr: 'm', ma: 'a' };

const raf = (f) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(f) : f());
const flag = (el, attr, on) => (on ? el.setAttribute(attr, '') : el.removeAttribute(attr));
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);
const pageUrl = () => {
  const loc = typeof window !== 'undefined' ? window.location : null;
  return loc?.href ? loc.href.split(/[?#]/)[0] : '';
};

// Module state is just the view's two exits: the restore hook and its cleanup. Both are cleared when the page goes.
let restoreHook = null;
let disposeView = null;
// A new #calculator?… arriving while the story page is mounted (pasted link, Back) restores that state.
export function restoreCalculator(query) {
  restoreHook?.(query);
}
// Called when the story page unmounts: stops pending timers and drops the restore hook, so nothing outlives the view.
export function disposeCalculator() {
  disposeView?.();
  disposeView = null;
  restoreHook = null;
}

let uid = 0;

export function renderCalculator(D, { query } = {}) {
  disposeCalculator();
  uid += 1;
  const P = { lenses: D.model.lenses, mix: D.model.mix };
  const R = D.model.ranges;
  const fy = D.meta?.latestFy;
  const fit = (name, v) => (R[name] ? clamp(v, R[name][0], R[name][1]) : v);
  const latest = D.national?.series?.at(-1);
  const t41 = D.content?.medpac?.t41;
  const sept = D.content?.medpac?.sept;
  const assumptions = Array.isArray(D.content?.assumptions) ? D.content.assumptions : [];
  const mixItem = assumptions.find((a) => a.key === 'mix');
  const mixSrc = [mixItem?.src ?? sept?.src, t41?.src].flat().filter(Boolean);
  const ltch = ltchShare(D);

  // ---------- state ----------
  function fromQuery(q) {
    const { inputs: inp, hospitalId } = decodeState(q, D);
    const given = new URLSearchParams(q || '');
    const x = hospitalId ? D.hospitalsById.get(hospitalId) ?? null : null;
    if (x) {
      const fromHospital = inputsFromHospital(D, x);
      inp.hospitalGap = fromHospital.hospitalGap;
      for (const k of BASICS) if (!given.has(HASH_KEY[k])) inp[k] = fromHospital[k]; // values in the link win over the hospital's
    } else if (inp.lens === 'hospital') inp.lens = D.model.defaults.lens;
    return { inp, x };
  }
  let { inp: inputs, x: hospital } = fromQuery(query);
  const encoded = () => encodeState(inputs, hospital?.id);
  const matchedPreset = () => (hospital ? null
    : D.presets.find((p) => BASICS.every((k) => Math.abs(fit(k, p[k]) - inputs[k]) < 1e-9)) ?? null);

  // ---------- controls ----------
  const controls = []; // {input, show()} for every control that mirrors state
  const fieldId = (name) => `calc-${uid}-${name}`;

  // A number field. pct: shown as a percent, stored as a fraction. key: the state key when the name differs.
  // dp: fixed decimals to show (e.g. "1.0 days"); otherwise up to 1 (percents) or 2, trailing zeros dropped.
  function numField(name, label, { key = name, unit, prefix, pct = false, step = 1, hideLabel = false, dp } = {}) {
    const scale = pct ? 100 : 1;
    const shown = (v) => (dp == null ? String(+(v * scale).toFixed(pct ? 1 : 2)) : (v * scale).toFixed(dp));
    const [lo, hi] = R[key] ?? [];
    const input = h('input', { type: 'number', id: fieldId(name), name, step, inputmode: 'decimal', autocomplete: 'off',
      min: isNum(lo) ? shown(lo) : null, max: isNum(hi) ? shown(hi) : null,
      'aria-describedby': `${fieldId(name)}-hint` });
    const hint = h('span', { class: 'fld__hint', id: `${fieldId(name)}-hint`, hidden: true });
    const show = () => { input.value = shown(inputs[key]); flag(hint, 'hidden', true); };
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      const n = Number(raw) / scale;
      if (raw === '' || !isNum(n)) return; // keep the last valid value
      inputs[key] = fit(key, n);
      const off = inputs[key] !== n;
      hint.textContent = off ? `Using ${shown(inputs[key])}${pct ? '%' : ''}, the ${inputs[key] < n ? 'largest' : 'smallest'} value allowed.` : '';
      flag(hint, 'hidden', !off);
      changed(input);
    });
    input.addEventListener('change', () => { input.value = shown(inputs[key]); });
    controls.push({ input, show });
    return h('div', { class: 'fld' },
      h('label', { class: hideLabel ? 'visually-hidden' : 'fld__label', for: input.id }, label),
      h('span', { class: 'fld__box' },
        prefix ? h('span', { class: 'fld__affix', 'aria-hidden': 'true' }, prefix) : null,
        input,
        unit ? h('span', { class: 'fld__affix', 'aria-hidden': 'true' }, unit) : null),
      hint);
  }

  function radios(name, legend, options, { cls = '' } = {}) {
    const inputsByValue = new Map();
    const fs = h('fieldset', { class: `seg ${cls}` },
      h('legend', { class: 'ctl__head' }, legend),
      h('div', { class: 'seg__row' }, options.map((o) => {
        const input = h('input', { type: 'radio', name, value: o.id, class: 'seg__input' });
        input.addEventListener('change', () => {
          if (!input.checked) return;
          inputs[name] = o.id;
          changed(input);
        });
        inputsByValue.set(o.id, input);
        return h('label', { class: 'seg__opt' }, input, h('span', { class: 'seg__text' }, o.label,
          o.note ? h('span', { class: 'seg__note' }, keepIds(o.note)) : null));
      })));
    controls.push({ input: null, show: () => { for (const [v, i] of inputsByValue) i.checked = inputs[name] === v; } });
    return { fs, inputsByValue };
  }

  // Start from: presets or a hospital.
  const presetBtns = D.presets.map((p) => h('button', {
    type: 'button', class: 'seg__btn', 'aria-pressed': 'false', onclick: () => usePreset(p) }, p.label));
  const note = h('p', { class: 'calc__note' });
  const picker = omnibox(() => hospitalIndex(D), { label: 'or find a hospital', onPick: (r) => {
    const x = D.hospitalsById.get(r.key);
    if (x) useHospital(x);
  } });

  function usePreset(p) {
    hospital = null;
    for (const k of BASICS) inputs[k] = fit(k, p[k]);
    inputs.hospitalGap = null;
    if (inputs.lens === 'hospital') inputs.lens = D.model.defaults.lens;
    changed(null);
  }
  function useHospital(x) {
    hospital = x;
    Object.assign(inputs, inputsFromHospital(D, x));
    changed(null);
  }

  // MA share: a slider with the national context tick, and a number field in percent.
  const hasTick = isNum(latest?.maShare);
  const range = h('input', { type: 'range', name: 'ma', id: fieldId('ma'), min: 0, max: 1, step: 0.01,
    'aria-describedby': hasTick ? `${fieldId('ma')}-tick` : null });
  range.addEventListener('input', () => {
    const n = Number(range.value);
    if (!isNum(n)) return;
    inputs.ma = fit('ma', n);
    changed(range);
  });
  controls.push({ input: range, show: () => { range.value = String(inputs.ma); range.setAttribute('aria-valuetext', `${fmtPct(inputs.ma)} of Medicare patients in MA`); } });
  const tick = hasTick ? h('p', { class: 'calc__tick', id: `${fieldId('ma')}-tick`,
    style: { left: `calc(var(--thumb-size) / 2 + (100% - var(--thumb-size)) * ${clamp(latest.maShare, 0, 1)})` } },
  h('span', { class: 'calc__tick-mark', 'aria-hidden': 'true' }),
  h('span', { class: 'calc__tick-label' }, `Hospitals studied here, FY${latest.fy}: ${fmtPct(latest.maShare)}`)) : null;
  const echo = h('p', { class: 'calc__echo', 'aria-hidden': 'true' });

  const lens = radios('lens', 'Which gap counts', LENSES, { cls: 'seg--grid' });
  const lensNote = h('p', { class: 'calc__lens-note' });
  const pay = radios('pay', 'How the plan pays the hospital', PAYS);
  const rateField = numField('rate', 'Per-diem rate', { prefix: '$', unit: 'a day', step: 100 });
  const fasterNote = h('p', { class: 'calc__faster-note' });

  // Fill: auto from occupancy unless the reader says the hospital turns patients away.
  const fillOn = h('input', { type: 'checkbox', name: 'fillOn' });
  const fillRange = h('input', { type: 'range', name: 'fill', id: fieldId('fill'), min: 0, max: 1, step: 0.05 });
  const fillOut = h('span', { class: 'calc__fill-out' });
  const fillAuto = h('p', { class: 'calc__fill-auto' });
  const fillSlider = h('div', { class: 'calc__fill-slider' },
    h('label', { class: 'fld__label', for: fillRange.id }, 'Share of freed bed-days refilled'),
    h('div', { class: 'calc__fill-row' }, fillRange, fillOut));
  // Ticking the box starts the override at what auto already shows, rounded to the slider's step.
  const seedFill = () => Math.round(autoFill(inputs.occ) * 20) / 20;
  fillOn.addEventListener('change', () => {
    inputs.fill = fillOn.checked ? seedFill() : null;
    changed(fillOn);
  });
  fillRange.addEventListener('input', () => {
    const n = Number(fillRange.value);
    if (!isNum(n)) return;
    inputs.fill = fit('fill', n);
    changed(fillRange);
  });
  controls.push({ input: fillRange, show: () => { const v = inputs.fill ?? seedFill(); fillRange.value = String(v); fillRange.setAttribute('aria-valuetext', `${fmtPct(v)} of freed bed-days refilled`); } });
  controls.push({ input: fillOn, show: () => { fillOn.checked = inputs.fill != null; } });

  // ---------- results ----------
  const led = nowServing({ label: 'Beds held, on an average day', value: '0.0',
    ariaLabel: (v) => `About ${v} beds held on an average day` });
  led.classList.add('calc__led');
  const sub = h('p', { class: 'calc__sub' });
  const cap = h('p', { class: 'calc__flag', role: 'status', hidden: true }, 'Capped at the hospital\'s occupied beds; check inputs.');
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });

  const boardEl = h('div', { class: 'bb' });
  const boardHead = h('span', { class: 'calc__board-n' });
  const legend = {};
  const legendItem = (key, label) => h('li', null, h('span', { class: `bb__key bb__key--${key}`, 'aria-hidden': 'true' }),
    h('span', null, label), (legend[key] = h('span', { class: 'bb__n' })));
  const board = h('div', { class: 'calc__board' },
    h('p', { class: 'calc__board-head' }, h('span', { class: 'ctl__head' }, 'Bed board'), boardHead),
    boardEl,
    h('ul', { class: 'bb__legend', 'aria-label': 'Bed board key' },
      legendItem('occ', 'Occupied'), legendItem('held', 'Held by longer MA stays'),
      legendItem('freed', 'Freed by faster decisions'), legendItem('empty', 'Empty')),
    h('p', { class: 'bb__cap' }, 'Each square is one bed on an average day, rounded to whole beds. '
      + 'Freed beds are part of the held beds: the ones faster plan decisions would open.'));

  const rows = {};
  const row = (key, label) => {
    const dd = h('dd');
    const rnote = h('span', { class: 'ledger__note' });
    rows[key] = { dd, note: rnote };
    return h('div', { class: 'ledger__row', 'data-row': key }, h('dt', null, h('span', { class: 'ledger__label' }, label), rnote), dd);
  };
  const ledger = h('div', { class: 'calc__ledger' },
    h('h3', { class: 'ctl__head' }, 'A year at this hospital, estimated'),
    h('dl', { class: 'ledger' }, LEDGER.map(([k, label]) => row(k, label))),
    h('h3', { class: 'ctl__head ledger__head' }, 'Dollars a year, illustrative'),
    h('dl', { class: 'ledger' }, DOLLARS.map(([k, label]) => row(k, label))),
    h('p', { class: 'ledger__foot' }, 'Dollar figures use the cost, rate and margin under Assumptions below. '
      + 'Each is a single illustrative figure, so treat these as rough.'));

  // MA-share curve figure, with its table twin rebuilt when the curve changes.
  const curveEl = h('div', { class: 'curve' });
  const take = h('span');
  const tableBox = h('div', { class: 'curve__table' });
  const curveFig = figure({
    title: 'Beds held at every MA share, for these inputs',
    takeaway: take,
    source: [{ label: 'Calculator estimate from the inputs above' }, t41?.src, sept?.src].flat().filter(Boolean),
    methods: true,
    chart: h('div', null, curveLegend(), curveEl),
    table: tableBox,
  });

  // Assumptions drawer: editable dollars and refill, the fixed destination mix, every assumption's source.
  // Destination table: the shares are fixed, so the rows are built once; extra days follow the lens.
  const mixCells = DESTS.map(() => ({ excess: h('td', { class: 'num' }), saved: h('td', { class: 'num' }) }));
  const mixBody = h('tbody', null, DESTS.map((d, i) => h('tr', null,
    h('th', { scope: 'row' }, DEST_LABEL[d]),
    h('td', { class: 'num' }, fmtPct(P.mix[d], P.mix[d] < 0.1 ? 1 : 0)),
    mixCells[i].excess, mixCells[i].saved)));
  const mixTitle = h('h3', { class: 'calc__mix-title', id: fieldId('mix') }, 'Where MA patients go after discharge, and the extra hospital days counted for each');
  const mixTable = h('table', { class: 'calc__mix', 'aria-labelledby': mixTitle.id },
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, 'Destination'),
      h('th', { scope: 'col', class: 'num' }, 'Share of MA patients'),
      h('th', { scope: 'col', class: 'num' }, 'Extra days per stay'),
      h('th', { scope: 'col', class: 'num' }, 'Days cut by faster decisions'))),
    mixBody);
  const drawer = h('details', { class: 'calc__drawer' },
    h('summary', null, h('span', { class: 'calc__drawer-title' }, 'Assumptions and sources'),
      h('span', { class: 'calc__drawer-hint' }, 'Edit the dollar inputs and see where each default comes from')),
    h('div', { class: 'calc__drawer-body' },
      h('div', { class: 'calc__drawer-grid' },
        h('div', { class: 'ctl__group' },
          numField('cvar', 'Variable cost of one extra day', { prefix: '$', step: 50 }),
          pay.fs,
          rateField,
          numField('cm', 'Margin per added admission', { prefix: '$', step: 100 })),
        h('div', { class: 'ctl__group calc__fill' },
          h('p', { class: 'ctl__head' }, 'Refilling freed beds'),
          h('label', { class: 'check' }, fillOn, h('span', null, 'Hospital regularly turns away patients')),
          fillAuto,
          fillSlider)),
      h('div', { class: 'calc__mix-wrap' }, mixTitle, h('div', { class: 'calc__mix-scroll' }, mixTable),
        h('p', { class: 'calc__mix-note' }, 'The mix is fixed in this version. A faster decision can\'t save more days than '
          + 'the extra days counted for that destination. Long-term care hospitals are left out'
          + `${isNum(ltch) ? ` (about ${fmtPct(ltch, 1)} of MA discharges)` : ''}.`,
        mixSrc.length ? [' Sources: ', typedSources(mixSrc), '.'] : null)),
      assumptionList(assumptions, { srcLabel: 'Source: ' })));

  // Share: copy the scenario's link; the read-only field is the fallback.
  const linkInput = h('input', { class: 'calc__link', type: 'text', readonly: true, 'aria-label': 'Link to this scenario', spellcheck: 'false' });
  const copied = h('span', { class: 'calc__copied', role: 'status' });
  const copyBtn = h('button', { type: 'button', class: 'btn' }, 'Copy link to this scenario');
  copyBtn.addEventListener('click', () => {
    const url = linkInput.value;
    const fallback = () => {
      linkInput.focus();
      linkInput.select?.();
      copied.textContent = 'Link selected. Copy it with Ctrl+C or ⌘C.';
    };
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null;
    if (!clip?.writeText) return fallback();
    return clip.writeText(url).then(() => { copied.textContent = 'Copied.'; }, fallback);
  });

  // ---------- layout ----------
  // The header's "Now serving 10. Please proceed." line; the top-bar counter (ui/queue.js) shows it on arrival.
  const root = section({ no: 4, title: 'The waiting room calculator', id: 'calculator', band: true, aside: calledNotice(D) },
    h('p', { class: 'calc__intro' }, 'Start from a typical hospital or look one up by name, then move the share of Medicare '
      + 'patients in Medicare Advantage (MA) plans. The calculator multiplies the hospital\'s MA discharges by the extra days '
      + 'MedPAC measured for each discharge destination. It shows the result as beds held on an average day.'),
    h('p', { class: 'calc__intro calc__intro--quiet' }, 'Every result is an estimate built from national averages and the '
      + 'inputs shown. The gaps are associations: they do not show what causes the longer stays.'),
    h('div', { class: 'calc' },
      h('div', { class: 'calc__controls' },
        h('div', { class: 'ctl__group' },
          h('p', { class: 'ctl__head', id: fieldId('start') }, 'Start from'),
          h('div', { class: 'seg__row calc__presets', role: 'group', 'aria-labelledby': fieldId('start') }, presetBtns),
          picker, note),
        h('div', { class: 'ctl__group' },
          h('label', { class: 'ctl__head', for: range.id }, 'Share of Medicare patients in MA plans'),
          h('div', { class: 'calc__share' },
            h('div', { class: 'calc__track' }, range, tick),
            numField('maPct', 'Share of Medicare patients in MA plans, percent', { key: 'ma', pct: true, unit: '%', step: 0.1, hideLabel: true })),
          echo),
        h('div', { class: 'ctl__group' },
          h('p', { class: 'ctl__head' }, 'Hospital basics'),
          h('div', { class: 'calc__basics' },
            numField('beds', 'Beds', { unit: 'beds' }),
            numField('occ', 'Occupancy', { pct: true, unit: '%', step: 0.1 }),
            numField('dis', 'Discharges a year, all payers', { step: 10 }),
            numField('mcr', 'Medicare share of discharges', { pct: true, unit: '%', step: 0.1 })),
          h('p', { class: 'fld__hint-line' }, 'Cost reports count available beds, which can exceed staffed beds. Enter your staffed count if you know it.')),
        h('div', { class: 'ctl__group' }, lens.fs, lensNote),
        h('div', { class: 'ctl__group' },
          h('p', { class: 'ctl__head' }, 'Faster authorization'),
          h('p', { class: 'calc__lead' }, 'Plan decisions take'),
          h('div', { class: 'calc__faster' },
            numField('t0', [h('span', { class: 'visually-hidden' }, 'Plan decision time, '), 'Today'], { step: 0.5, unit: 'days', dp: 1 }),
            h('span', { class: 'calc__arrow', 'aria-hidden': 'true' }, '→'),
            numField('t1', [h('span', { class: 'visually-hidden' }, 'Plan decision time, '), 'With faster decisions'], { step: 0.5, unit: 'days', dp: 1 })),
          fasterNote),
        h('div', { class: 'ctl__group calc__share-row' },
          copyBtn, linkInput, copied)),
      h('div', { class: 'calc__results' }, led, sub, cap, board, ledger, live)),
    curveFig,
    drawer);

  // ---------- paint ----------
  const show = (except) => { for (const c of controls) if (c.input !== except || !c.input) c.show(); };
  let queued = false;
  let touched = false;
  let lastCurveKey = '';
  let pts = [];
  let hashTimer = 0;
  let liveTimer = 0;
  let gone = false;

  function changed(source) {
    show(source);
    touched = true;
    if (queued) return;
    queued = true;
    raf(() => { queued = false; if (!gone) paint(); });
  }

  function writeHash() {
    hashTimer = 0;
    const w = typeof window !== 'undefined' ? window : null;
    if (!w?.history?.replaceState || !root.isConnected) return;
    const view = parseHash(w.location.hash).view;
    if (view !== 'home' && view !== 'calculator') return; // the reader has moved on; leave the URL alone
    const next = `#calculator?${encoded()}`;
    if (w.location.hash !== next) w.history.replaceState(w.history.state, '', next);
  }

  function paint() {
    const r = compute(inputs, P);
    const held = isNum(r.beds) ? r.beds : 0;
    const shown = fmtBeds(held);
    const preset = matchedPreset();
    const lensDef = LENSES.find((l) => l.id === inputs.lens) ?? LENSES[0];

    // Start from
    presetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(D.presets[i] === preset)));
    if (hospital) {
      const x = hospital;
      const edited = BASICS.some((k) => hasBasic(x, k) && Math.abs(fit(k, x[k]) - inputs[k]) > 1e-9);
      note.replaceChildren(h('strong', null, x.name), `, ${[x.city, x.st].filter(Boolean).join(', ')}. `,
        `${x.occFlag ? 'Other values' : 'Values'} from its FY${fy} cost report${edited ? ', with your edits' : ''}. `,
        x.occFlag ? 'Occupancy is set to a typical value because the figure in its cost report looks off. ' : '',
        h('a', { href: link('hospital', x.id) }, 'Hospital profile'));
    } else if (preset) {
      note.replaceChildren(h('strong', null, preset.label), `: ${preset.note}. Medians of ${fmtNum(preset.n)} `
        + `${plural(preset.n, 'hospital')}, FY${fy} cost reports.`);
    } else note.replaceChildren('Custom values. Pick a preset or a hospital to start over.');

    // MA share and lens
    echo.replaceChildren(h('strong', null, shown), ' beds held on an average day. Details below.');
    const own = lens.inputsByValue.get('hospital');
    flag(own, 'disabled', !hospital);
    own.closest('.seg__opt')?.classList.toggle('is-off', !hospital);
    if (inputs.lens === 'hospital' && hospital) {
      const g = hospital.gap; // the model's gap decides the branch; the text shows the displayed (rounded) one so it adds up
      const shownGap = displayedGap(hospital.maAlos, hospital.ffsAlos) ?? g;
      const stays = isNum(hospital.maAlos) && isNum(hospital.ffsAlos)
        ? `MA stays averaged ${fmtDays(hospital.maAlos)} and traditional Medicare stays ${fmtDays(hospital.ffsAlos)}` : '';
      lensNote.textContent = isNum(g) && g > 0
        ? `${stays ? `${stays} in its FY${fy} cost report, a gap of ${fmtSigned(shownGap, fmtDays)}` : `Its FY${fy} cost-report gap is ${fmtSigned(shownGap, fmtDays)}`}. `
          + 'The gap is raw (not adjusted) and is spread across destinations in MedPAC\'s adjusted pattern.'
        : `This hospital reports no MA excess: ${stays ? `${stays} in its FY${fy} cost report` : `its FY${fy} cost report shows no longer MA stays`}`
          + ', so nothing is counted under this lens.';
    } else lensNote.textContent = hospital ? lensDef.explain
      : `${lensDef.explain} Choose a hospital to use its own cost-report gap.`;

    // Faster authorization
    fasterNote.textContent = r.speedup > 0
      ? 'Applies to patients headed to skilled nursing or inpatient rehab, the stays that need plan approval in this model.'
      : 'No speed-up: the faster time is not shorter than today\'s, so nothing is freed.';

    // Pay and refill
    for (const p of PAYS) pay.inputsByValue.get(p.id).checked = inputs.pay === p.id;
    flag(rateField, 'hidden', inputs.pay !== 'diem');
    const auto = autoFill(inputs.occ);
    fillAuto.textContent = inputs.fill == null
      ? `Auto: ${fmtPct(auto)} at ${fmtPct(inputs.occ, 1)} occupancy. It rises from 0% at ${fmtPct(FILL_LO)} occupancy to 100% at ${fmtPct(FILL_HI)}. `
        + 'Cost-report bed counts can run above staffed beds, which keeps this low. Check the box if your hospital fills freed beds.'
      : `Auto would be ${fmtPct(auto)} at ${fmtPct(inputs.occ, 1)} occupancy; your setting replaces it.`;
    flag(fillSlider, 'hidden', inputs.fill == null);
    fillOut.textContent = fmtPct(inputs.fill ?? seedFill());

    // Readout
    update(led, shown, { ms: 280 });
    const spread = MEDPAC.map((l) => compute({ ...inputs, lens: l }, P).beds).filter(isNum);
    const lo = Math.min(...spread);
    const hi = Math.max(...spread);
    sub.textContent = `Estimate, ${lensDef.short}. `
      + (fmtBeds(lo) === fmtBeds(hi) ? `The three measures all give ${fmtBeds(lo)}.`
        : `The three measures give ${fmtBeds(lo)} to ${fmtBeds(hi)} beds.`);
    flag(cap, 'hidden', !r.capped);

    // Bed board
    const state = { beds: inputs.beds, occupied: inputs.occ * inputs.beds, held, freed: r.bedsFreed };
    const cells = boardCounts(state);
    bedBoard(boardEl, state);
    boardHead.textContent = `${fmtNum(cells.n)} ${plural(cells.n, 'bed')}`;
    legend.occ.textContent = fmtNum(cells.occ - cells.held);
    // Whole cells, so the counts add up to the board; the exact figure follows in parentheses when it differs.
    const exact = (n, x) => (fmtBeds(x) === fmtNum(n) ? fmtNum(n) : `${fmtNum(n)} (${fmtBeds(x)})`);
    legend.held.textContent = exact(cells.held, held);
    legend.freed.textContent = exact(cells.freed, r.bedsFreed);
    legend.empty.textContent = fmtNum(cells.n - cells.occ);

    // Ledger
    for (const [key, [value, text]] of Object.entries(ledgerRows(r, inputs))) {
      rows[key].dd.textContent = value;
      rows[key].note.textContent = text;
    }

    // Curve and its table. The curve is a function of these inputs only (it sweeps the MA share itself), so moving
    // the MA share, the dollars or the refill leaves the points alone and only the chart's marker moves.
    const curveKey = [inputs.beds, inputs.occ, inputs.dis, inputs.mcr, inputs.lens, inputs.t0, inputs.t1, inputs.hospitalGap].join('|');
    if (curveKey !== lastCurveKey) {
      lastCurveKey = curveKey;
      pts = curve(inputs, P);
      const per10 = pts[2].beds - pts[0].beds;
      const per10f = pts[2].bedsFaster - pts[0].bedsFaster;
      const top = compute({ ...inputs, ma: 1 }, P);
      take.textContent = `Each 10-point rise in MA share adds about ${fmtBeds(per10)} beds held, or ${fmtBeds(per10f)} with faster decisions. `
        + (top.capped ? 'The line flattens where it reaches the hospital\'s occupied beds.'
          : 'The lines are straight because the model scales with the number of MA patients.');
      const open = tableBox.firstChild?.hasAttribute('open');
      const t = tableAlt({ caption: 'Beds held on an average day, by MA share, for the current inputs',
        columns: [{ key: 'share', label: 'MA share' }, { key: 'beds', label: 'Today', fmt: fmtBeds },
          { key: 'faster', label: 'With faster decisions', fmt: fmtBeds }],
        rows: pts.filter((_, i) => i % 2 === 0).map((p) => ({ share: fmtPct(p.ma), beds: p.beds, faster: p.bedsFaster })) });
      if (open) t.setAttribute('open', '');
      tableBox.replaceChildren(t);
    }
    const atMa = { beds: held, bedsFaster: Math.max(0, (r.bedDays - r.savedBedDays) / 365) };
    maCurve(curveEl, { points: pts, current: atMa, ma: inputs.ma });

    // Destination table: extra days follow the lens.
    DESTS.forEach((d, i) => {
      mixCells[i].excess.textContent = r.excess[d].toFixed(2);
      mixCells[i].saved.textContent = PA_DESTS.includes(d) ? Math.min(r.speedup, r.excess[d]).toFixed(2) : '—';
    });

    // Share link, URL, announcement
    linkInput.value = `${pageUrl()}#calculator?${encoded()}`;
    copied.textContent = '';
    if (touched) {
      clearTimeout(hashTimer);
      hashTimer = setTimeout(writeHash, HASH_DEBOUNCE_MS);
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => { live.textContent = `About ${shown} beds held on an average day.`; }, LIVE_DEBOUNCE_MS);
    }
  }

  disposeView = () => {
    gone = true;
    clearTimeout(hashTimer);
    clearTimeout(liveTimer);
    hashTimer = 0;
    liveTimer = 0;
  };
  restoreHook = (q) => {
    const next = fromQuery(q);
    if (encodeState(next.inp, next.x?.id) === encoded()) return;
    inputs = next.inp;
    hospital = next.x;
    show(null);
    paint();
  };

  show(null);
  paint();
  return root;
}
