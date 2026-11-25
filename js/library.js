// Subwoofer, amplifier and vehicle libraries: browse, detail, add/edit, AI lookup, manual import.
import { h, clear, units, numField, textField, selectField, toast, modal, confirmBox, safeUrl, uid, n1, fracIn, local } from './ui.js';
import { all, save, remove, builtin, storeState, allSubs, allAmps, allVehicles } from './store.js';
import * as P from './physics.js';
import { maxRated } from './system.js';
import { getSample, lookupSub, extractFromManual, estimateVehicle, pdfToText, errorText, aiDisabled } from './ai.js';

const keys = (path) => (Array.isArray(path) ? path : path.split('.'));
const get = (o, path) => keys(path).reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, path, v) => { const ks = keys(path); let c = o; ks.slice(0, -1).forEach((k) => { if (c[k] == null || typeof c[k] !== 'object') c[k] = {}; c = c[k]; }); c[ks[ks.length - 1]] = v; };

// ---------------------------------------------------------------- vehicle years
export const YEAR_MIN = 1960, YEAR_MAX = 2026;
export const YEARS = Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MAX - i); // newest first
const clampYear = (y) => (y == null || y === '' || !isFinite(+y) ? null : Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(+y))));
/** Year range of a vehicle from yearFrom/yearTo, or parsed from an older free-text "years" field. */
export function yearRange(v) {
  let from = clampYear(v?.yearFrom), to = clampYear(v?.yearTo);
  if (from == null && to == null && v?.years) {
    const found = String(v.years).match(/\d{4}/g) || [];
    from = clampYear(found[0]); to = clampYear(found[found.length - 1]);
    if (/(\+|present|now|current)\s*$/i.test(v.years) && found.length === 1) to = YEAR_MAX;
  }
  if (from == null) from = to;
  if (to == null) to = from;
  if (from != null && to < from) [from, to] = [to, from];
  return { from, to };
}
export const yearsLabel = ({ from, to }) => (from == null ? '' : from === to ? String(from) : `${from}–${to}`);
function normalizeYears(v) {
  const r = yearRange(v);
  v.yearFrom = r.from; v.yearTo = r.to; v.years = yearsLabel(r);
  return v;
}

// ---------------------------------------------------------------- schemas
const SUB_SCHEMA = [
  { title: 'Identity', fields: [
    { k: 'brand', label: 'Brand', type: 'text', req: true }, { k: 'model', label: 'Model', type: 'text', req: true }, { k: 'series', label: 'Series', type: 'text' },
    { k: 'size', label: 'Nominal size', unit: 'in', type: 'num' }, { k: 'shape', label: 'Cone shape', type: 'select', options: ['round', 'square'] }] },
  { title: 'Voice coils & power', fields: [
    { k: 'coils', label: 'Voice coils', type: 'select', options: [1, 2, 4] }, { k: 'coilOhms', label: 'Ohms per coil', type: 'num', unit: 'Ω' },
    { k: 'paramWiring', label: 'Specs measured with coils', type: 'select', options: ['single', 'series', 'parallel'] },
    { k: 'rms', label: 'RMS power', unit: 'W', type: 'num' }, { k: 'peak', label: 'Peak power', unit: 'W', type: 'num' },
    { k: 'ampMin', label: 'Recommended amp, min', unit: 'W', type: 'num' }, { k: 'ampMax', label: 'Recommended amp, max', unit: 'W', type: 'num' },
    { k: 'sens', label: 'Sensitivity (1 W/1 m)', unit: 'dB', type: 'num' }, { k: 'vcDia', label: 'Voice coil diameter', unit: 'in', type: 'num' }] },
  { title: 'Thiele/Small parameters', fields: [
    { k: 'fs', label: 'Fs (free-air resonance)', unit: 'Hz', type: 'num', ts: true }, { k: 'qts', label: 'Qts (total Q)', type: 'num', ts: true },
    { k: 'qes', label: 'Qes (electrical Q)', type: 'num', ts: true }, { k: 'qms', label: 'Qms (mechanical Q)', type: 'num', ts: true },
    { k: 'vas', label: 'Vas (equivalent volume)', unit: 'L', type: 'num', ts: true }, { k: 'sd', label: 'Sd (cone area)', unit: 'cm²', type: 'num', ts: true },
    { k: 'xmax', label: 'Xmax (one-way linear)', unit: 'mm', type: 'num', ts: true }, { k: 'xmech', label: 'Xmech (mechanical limit)', unit: 'mm', type: 'num' },
    { k: 're', label: 'Re (DC resistance)', unit: 'Ω', type: 'num', ts: true }, { k: 'le', label: 'Le (inductance)', unit: 'mH', type: 'num', ts: true },
    { k: 'bl', label: 'BL (motor force)', unit: 'T·m', type: 'num', ts: true }, { k: 'mms', label: 'Mms (moving mass)', unit: 'g', type: 'num', ts: true },
    { k: 'cms', label: 'Cms (compliance)', unit: 'mm/N', type: 'num', ts: true }, { k: 'rmsMech', label: 'Rms (mechanical loss)', unit: 'kg/s', type: 'num', ts: true }] },
  { title: 'Mounting & physical', fields: [
    { k: 'overallDia', label: 'Overall (frame) diameter', kind: 'len', type: 'num' }, { k: 'cutout', label: 'Cutout diameter', kind: 'len', type: 'num' },
    { k: 'boltCircle', label: 'Bolt circle', kind: 'len', type: 'num' }, { k: 'motorDia', label: 'Motor / magnet diameter', kind: 'len', type: 'num' },
    { k: 'mountDepth', label: 'Mounting depth', kind: 'len', type: 'num' }, { k: 'ventClearance', label: 'Rear vent clearance', kind: 'len', type: 'num' },
    { k: 'displacement', label: 'Driver displacement', kind: 'vol', type: 'num' }, { k: 'weight', label: 'Weight', unit: 'lb', type: 'num' }] },
  { title: 'Materials', fields: [
    { k: 'cone', label: 'Cone', type: 'text' }, { k: 'surround', label: 'Surround', type: 'text' }, { k: 'basket', label: 'Basket', type: 'text' }, { k: 'magnet', label: 'Magnet', type: 'text' }] },
  { title: 'Factory sealed box', fields: [
    { k: 'factory.sealed.vol', label: 'Net volume', kind: 'vol', type: 'num' }, { k: 'factory.sealed.min', label: 'Min volume', kind: 'vol', type: 'num' }, { k: 'factory.sealed.max', label: 'Max volume', kind: 'vol', type: 'num' },
    { k: 'factory.sealed.qtc', label: 'Qtc', type: 'num' }, { k: 'factory.sealed.fc', label: 'Fc', unit: 'Hz', type: 'num' }, { k: 'factory.sealed.f3', label: 'F3', unit: 'Hz', type: 'num' },
    { k: 'factory.sealed.ext.w', label: 'External width', kind: 'len', type: 'num' }, { k: 'factory.sealed.ext.h', label: 'External height', kind: 'len', type: 'num' }, { k: 'factory.sealed.ext.d', label: 'External depth', kind: 'len', type: 'num' }] },
  { title: 'Factory ported box', fields: [
    { k: 'factory.ported.vol', label: 'Net volume', kind: 'vol', type: 'num' }, { k: 'factory.ported.min', label: 'Min volume', kind: 'vol', type: 'num' }, { k: 'factory.ported.max', label: 'Max volume', kind: 'vol', type: 'num' },
    { k: 'factory.ported.fb', label: 'Tuning (Fb)', unit: 'Hz', type: 'num' }, { k: 'factory.ported.f3', label: 'F3', unit: 'Hz', type: 'num' },
    { k: 'factory.ported.port.type', label: 'Port type', type: 'select', options: ['', 'slot', 'round'] },
    { k: 'factory.ported.port.w', label: 'Slot width', kind: 'len', type: 'num' }, { k: 'factory.ported.port.h', label: 'Slot height', kind: 'len', type: 'num' },
    { k: 'factory.ported.port.dia', label: 'Round port diameter', kind: 'len', type: 'num' }, { k: 'factory.ported.port.count', label: 'Number of ports', type: 'num' },
    { k: 'factory.ported.port.len', label: 'Port length', kind: 'len', type: 'num' }, { k: 'factory.ported.port.area', label: 'Port area', kind: 'area', type: 'num' },
    { k: 'factory.ported.ext.w', label: 'External width', kind: 'len', type: 'num' }, { k: 'factory.ported.ext.h', label: 'External height', kind: 'len', type: 'num' }, { k: 'factory.ported.ext.d', label: 'External depth', kind: 'len', type: 'num' }] },
  { title: 'Factory 4th order bandpass', fields: [
    { k: 'factory.bp4.rear', label: 'Sealed (rear) volume', kind: 'vol', type: 'num' }, { k: 'factory.bp4.front', label: 'Ported (front) volume', kind: 'vol', type: 'num' },
    { k: 'factory.bp4.portArea', label: 'Port area', kind: 'area', type: 'num' }, { k: 'factory.bp4.portLen', label: 'Port length', kind: 'len', type: 'num' }] },
  { title: 'Source & notes', fields: [
    { k: 'source.label', label: 'Source (manual / spec sheet)', type: 'text' }, { k: 'source.url', label: 'Source link (https)', type: 'text' }, { k: 'notes', label: 'Notes', type: 'area' }] },
];
const AMP_SCHEMA = [
  { title: 'Identity', fields: [
    { k: 'brand', label: 'Brand', type: 'text', req: true }, { k: 'model', label: 'Model', type: 'text', req: true }, { k: 'series', label: 'Series', type: 'text' },
    { k: 'class', label: 'Class', type: 'select', options: ['D', 'BD', 'AB', 'H', 'Other'] }, { k: 'channels', label: 'Channels', type: 'num' }] },
  { title: 'RMS power at 14.4 V (per channel / mono)', fields: [
    { k: 'power.4', label: '@ 4 Ω', unit: 'W', type: 'num' }, { k: 'power.3', label: '@ 3 Ω', unit: 'W', type: 'num' }, { k: 'power.2', label: '@ 2 Ω', unit: 'W', type: 'num' },
    { k: 'power.1', label: '@ 1 Ω', unit: 'W', type: 'num' }, { k: 'power.half', path: ['power', '0.5'], label: '@ 0.5 Ω', unit: 'W', type: 'num' },
    { k: 'minOhms', label: 'Minimum stable load', unit: 'Ω', type: 'num' }, { k: 'bridgeable', label: 'Bridgeable', type: 'select', options: ['', 'true', 'false'] },
    { k: 'cea2006', label: 'CEA/CTA-2006 rated', type: 'select', options: ['', 'true', 'false'] }] },
  { title: 'Electrical', fields: [
    { k: 'fuse', label: 'Fuse rating', unit: 'A', type: 'num' }, { k: 'wire', label: 'Power/ground wire', type: 'text' },
    { k: 'currentMax', label: 'Max current draw', unit: 'A', type: 'num' }, { k: 'efficiency', label: 'Efficiency', unit: '%', type: 'num' }] },
  { title: 'Controls & filters', fields: [
    { k: 'lpf', label: 'Low-pass filter', type: 'text' }, { k: 'subsonic', label: 'Subsonic / high-pass', type: 'text' },
    { k: 'bassBoost', label: 'Bass boost', type: 'text' }, { k: 'remote', label: 'Remote level control', type: 'text' }, { k: 'freqResponse', label: 'Frequency response', type: 'text' }] },
  { title: 'Size', fields: [
    { k: 'dims.l', label: 'Length', kind: 'len', type: 'num' }, { k: 'dims.w', label: 'Width', kind: 'len', type: 'num' }, { k: 'dims.h', label: 'Height', kind: 'len', type: 'num' }, { k: 'weight', label: 'Weight', unit: 'lb', type: 'num' }] },
  { title: 'Source & notes', fields: [
    { k: 'source.label', label: 'Source (manual / spec sheet)', type: 'text' }, { k: 'source.url', label: 'Source link (https)', type: 'text' }, { k: 'notes', label: 'Notes', type: 'area' }] },
];
const VEH_SCHEMA = [
  { title: 'Vehicle', fields: [
    { k: 'category', label: 'Type', type: 'select', options: ['Car', 'Truck', 'SUV', 'Van'] }, { k: 'body', label: 'Body style', type: 'text', placeholder: 'Sedan, Crew cab, Hatchback…' },
    { k: 'doors', label: 'Doors', type: 'select', options: [2, 3, 4, 5] },
    { k: 'yearFrom', label: 'Year from', type: 'select', options: ['', ...YEARS], numeric: true }, { k: 'yearTo', label: 'Year to', type: 'select', options: ['', ...YEARS], numeric: true },
    { k: 'make', label: 'Make', type: 'text', req: true }, { k: 'model', label: 'Model', type: 'text', req: true },
    { k: 'cabinLength', label: 'Cabin length (for cabin gain)', kind: 'len', type: 'num' }, { k: 'notes', label: 'Notes', type: 'area' }] },
];
const KIND_META = {
  subs: { title: 'Subwoofers', one: 'subwoofer', schema: SUB_SCHEMA, list: allSubs },
  amps: { title: 'Amplifiers', one: 'amplifier', schema: AMP_SCHEMA, list: allAmps },
  vehicles: { title: 'Vehicles', one: 'vehicle', schema: VEH_SCHEMA, list: allVehicles },
};
const filters = { subs: { q: '', brand: '', size: '' }, amps: { q: '', brand: '', minW: '' }, vehicles: { q: '', cat: '', doors: '', year: '' } };

// ---------------------------------------------------------------- list views
export function renderLibrary(kind) {
  const meta = KIND_META[kind];
  const root = h('div');
  const listHost = h('div', { class: 'lib-grid' });
  const shared = storeState.mode === 'shared';
  const head = h('div', { class: 'page-head' },
    h('div', null, h('p', { class: 'eyebrow' }, 'Library'), h('h1', null, meta.title)),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onclick: () => editItem(kind, null) }, `Add ${meta.one}`),
      kind === 'subs' ? h('button', { class: 'btn', onclick: () => importManual() }, 'Import from a manual') : null,
      kind === 'subs' ? h('button', { class: 'btn', onclick: () => aiLookupDialog() }, 'AI spec lookup') : null,
      kind === 'vehicles' ? h('button', { class: 'btn', onclick: () => aiVehicleDialog() }, 'AI space estimate') : null));
  const note = h('p', { class: 'muted' }, shared
    ? `Anyone with access to this page shares this library. ${storeState.readOnly ? 'You can browse it; your access level does not allow adding entries.' : 'What you add here is visible to everyone else who opens it.'}`
    : 'Built-in entries come from manufacturer manuals and spec sheets. Entries you add are saved in this browser.');
  const f = filters[kind];
  const rerender = () => renderList(kind, listHost);
  const bar = h('div', { class: 'filter-bar' },
    h('input', { type: 'search', id: `q-${kind}`, placeholder: kind === 'vehicles' ? 'Search make, model, body…' : 'Search brand or model…', value: f.q, 'aria-label': 'Search', oninput: (e) => { f.q = e.target.value; rerender(); } }),
    kind === 'subs' ? h('select', { 'aria-label': 'Size', onchange: (e) => { f.size = e.target.value; rerender(); } }, ['', 6.5, 8, 10, 12, 13, 15, 18].map((s) => h('option', { value: s, selected: String(f.size) === String(s) }, s ? `${s}"` : 'All sizes'))) : null,
    kind !== 'vehicles' ? h('select', { 'aria-label': 'Brand', onchange: (e) => { f.brand = e.target.value; rerender(); } }, ['', ...new Set(meta.list().map((x) => x.brand))].map((b) => h('option', { value: b, selected: f.brand === b }, b || 'All brands'))) : null,
    kind === 'amps' ? h('select', { 'aria-label': 'Power', onchange: (e) => { f.minW = e.target.value; rerender(); } }, ['', 500, 1000, 1500, 3000].map((w) => h('option', { value: w, selected: String(f.minW) === String(w) }, w ? `${w} W and up` : 'Any power'))) : null,
    kind === 'vehicles' ? h('select', { 'aria-label': 'Type', onchange: (e) => { f.cat = e.target.value; rerender(); } }, ['', 'Car', 'Truck', 'SUV', 'Van'].map((c) => h('option', { value: c, selected: f.cat === c }, c || 'All types'))) : null,
    kind === 'vehicles' ? h('select', { 'aria-label': 'Doors', onchange: (e) => { f.doors = e.target.value; rerender(); } }, ['', 2, 4].map((d) => h('option', { value: d, selected: String(f.doors) === String(d) }, d ? `${d}-door` : 'Any doors'))) : null,
    kind === 'vehicles' ? h('select', { 'aria-label': 'Model year', onchange: (e) => { f.year = e.target.value; rerender(); } }, ['', ...YEARS].map((y) => h('option', { value: y, selected: String(f.year) === String(y) }, y || `Any year (${YEAR_MIN}–${YEAR_MAX})`))) : null);
  root.append(head, note, bar, listHost);
  rerender();
  return root;
}

function renderList(kind, host) {
  const f = filters[kind], meta = KIND_META[kind];
  const q = f.q.trim().toLowerCase();
  let items = meta.list().filter((x) => !q || JSON.stringify([x.brand, x.model, x.series, x.make, x.body, x.category, x.years]).toLowerCase().includes(q));
  if (kind === 'subs') { if (f.size) items = items.filter((x) => String(x.size) === String(f.size)); if (f.brand) items = items.filter((x) => x.brand === f.brand); }
  if (kind === 'amps') { if (f.brand) items = items.filter((x) => x.brand === f.brand); if (f.minW) items = items.filter((x) => maxRated(x) >= +f.minW); }
  if (kind === 'vehicles') { if (f.cat) items = items.filter((x) => x.category === f.cat); if (f.doors) items = items.filter((x) => String(x.doors) === String(f.doors));
    if (f.year) items = items.filter((x) => { const r = yearRange(x); return r.from == null || (+f.year >= r.from && +f.year <= r.to); }); }
  clear(host);
  if (!items.length) { host.append(h('div', { class: 'card empty' }, h('h3', null, 'Nothing matches'), h('p', null, `Clear the filters, or add the ${meta.one} yourself.`))); return; }
  if (kind === 'vehicles') {
    const groups = {};
    items.forEach((v) => { (groups[v.category] = groups[v.category] || []).push(v); });
    host.classList.remove('lib-grid');
    Object.entries(groups).forEach(([cat, vs]) => host.append(h('h2', { class: 'group-title' }, cat), h('div', { class: 'lib-grid' }, vs.map((v) => vehicleCard(v)))));
    return;
  }
  host.classList.add('lib-grid');
  items.forEach((x) => host.append(kind === 'subs' ? subCard(x) : ampCard(x)));
}
const badges = (x) => [
  x.source?.verified && !x._edited ? h('span', { class: 'pill good' }, 'Manufacturer data') : null,
  x._edited ? h('span', { class: 'pill' }, 'Edited') : null,
  x._custom ? h('span', { class: 'pill' }, x.aiSourced ? 'AI-sourced: verify' : 'Added by a user') : null,
  x.typical ? h('span', { class: 'pill warn' }, 'Typical size') : null,
];
function subCard(s) {
  const d = P.deriveDriver(s);
  return h('article', { class: 'card lib-card' },
    h('div', { class: 'lib-card-head' }, h('div', null, h('p', { class: 'eyebrow' }, s.brand), h('h3', null, s.model)), h('span', { class: 'size-badge' }, `${s.size || '?'}"`)),
    h('div', { class: 'badges' }, badges(s), d.issues.length ? h('span', { class: 'pill warn' }, 'Spec conflict') : null),
    h('dl', { class: 'mini-specs' }, [['RMS', `${s.rms ?? '—'} W`], ['Coils', `${s.coils || 1} × ${s.coilOhms || '?'} Ω`], ['Fs', `${n1(d.fs)} Hz`], ['Qts', n1(d.qts, 3)], ['Vas', `${n1(d.vas * 1000)} L`], ['Xmax', `${s.xmax ?? '—'} mm`],
      ['Sealed', s.factory?.sealed?.vol ? units.fmtVol(s.factory.sealed.vol) : '—'], ['Ported', s.factory?.ported?.vol ? `${units.fmtVol(s.factory.ported.vol)}${s.factory.ported.fb ? ` @ ${s.factory.ported.fb}` : ''}` : '—']].map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
    cardActions('subs', s));
}
function ampCard(a) {
  const pw = Object.entries(a.power || {}).filter(([, p]) => p).sort((x, y) => +y[0] - +x[0]).map(([z, p]) => `${p} W @ ${z} Ω`).join(' · ');
  return h('article', { class: 'card lib-card' },
    h('div', { class: 'lib-card-head' }, h('div', null, h('p', { class: 'eyebrow' }, a.brand), h('h3', null, a.model)), h('span', { class: 'size-badge' }, `${maxRated(a)} W`)),
    h('div', { class: 'badges' }, badges(a), a.cea2006 ? h('span', { class: 'pill' }, 'CEA-2006') : null),
    h('p', { class: 'mono small' }, pw || 'No power ratings yet'),
    h('dl', { class: 'mini-specs' }, [['Class', a.class || '—'], ['Min load', a.minOhms ? `${a.minOhms} Ω` : '—'], ['Fuse', a.fuse ? `${a.fuse} A` : '—'], ['Wire', a.wire || '—'], ['Subsonic', a.subsonic || '—'], ['LPF', a.lpf || '—']].map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
    cardActions('amps', a));
}
function vehicleCard(v) {
  return h('article', { class: 'card lib-card' },
    h('div', { class: 'lib-card-head' }, h('div', null, h('p', { class: 'eyebrow' }, `${v.category} · ${v.doors}-door · ${v.body || ''}`), h('h3', null, `${yearsLabel(yearRange(v)) ? yearsLabel(yearRange(v)) + ' ' : ''}${v.make ? v.make + ' ' : ''}${v.model}`))),
    h('div', { class: 'badges' }, badges(v)),
    h('ul', { class: 'loc-list' }, (v.locations || []).map((l) => h('li', null, h('b', null, l.name), h('span', { class: 'mono small' }, l.shape === 'wedge' ? `${units.fmtLen(l.w)} W × ${units.fmtLen(l.h)} H × ${units.fmtLen(l.d)}/${units.fmtLen(l.dTop)} D` : units.dims(l.w, l.h, l.d))))),
    v.notes ? h('p', { class: 'muted small' }, v.notes) : null,
    cardActions('vehicles', v));
}
function cardActions(kind, x) {
  return h('div', { class: 'btn-row card-actions' },
    h('button', { class: 'btn btn-sm primary', onclick: () => useInDesign(kind, x) }, 'Use in design'),
    h('button', { class: 'btn btn-sm', onclick: () => showDetail(kind, x) }, 'Details'),
    h('button', { class: 'btn btn-sm ghost', onclick: () => editItem(kind, x) }, 'Edit'));
}
async function useInDesign(kind, x) {
  const { setDs, go, app } = await import('./app.js');
  const { applyFactory } = await import('./model.js');
  if (kind === 'subs') setDs({ subId: x.id, wiringZ: null, chambers: null, ...applyFactory(app.ds, x, app.ds.type) });
  if (kind === 'amps') setDs({ ampId: x.id, wiringZ: null });
  if (kind === 'vehicles') setDs({ vehicleId: x.id, locationId: x.locations?.[0]?.id });
  go('design');
  toast(`${x.brand || x.make || ''} ${x.model} is now in your design.`, 'good');
}

// ---------------------------------------------------------------- detail
function fmtVal(f, v) {
  if (v == null || v === '') return '—';
  if (f.kind === 'len') return units.fmtLen(+v);
  if (f.kind === 'vol') return units.fmtVol(+v, 3);
  if (f.kind === 'area') return units.fmtArea(+v);
  return `${v}${f.unit ? ' ' + f.unit : ''}`;
}
function showDetail(kind, x) {
  const meta = KIND_META[kind];
  const body = h('div', { class: 'detail' });
  if (kind === 'subs') {
    const d = P.deriveDriver(x);
    if (d.issues.length) body.append(h('div', { class: 'card issues' }, h('h3', null, 'Spec consistency check'), d.issues.map((i) => h('p', { class: 'note warn' }, i))));
    const derived = [['Bl', `${n1(d.bl, 2)} T·m`, 'bl'], ['Mms', `${n1(d.mms * 1000, 1)} g`, 'mms'], ['Cms', `${n1(d.cms * 1000, 3)} mm/N`, 'cms'], ['Rms', `${n1(d.rms, 2)} kg/s`, 'rmsMech'], ['Vd (Sd × Xmax)', `${n1(d.vd * 1e6, 0)} cm³`], ['EBP (Fs/Qes)', `${n1(d.ebp, 0)} → ${d.ebp > 90 ? 'ported' : d.ebp < 50 ? 'sealed' : 'either'}`], ['Calculated 1 W/1 m', `${n1(d.spl1w, 1)} dB`], ['Qtc 0.707 sealed', `${units.fmtVol((P.sealedVolumeForQtc(d, 0.707) || 0) / P.FT3)}`]];
    body.append(h('div', { class: 'card' }, h('h3', null, 'Calculated from the published specs'), h('dl', { class: 'spec-dl' }, derived.map(([k, v, key]) => h('div', null, h('dt', null, k, key && d.derived.has(key) ? h('small', null, ' (derived)') : null), h('dd', null, v))))));
  }
  meta.schema.forEach((sec) => {
    const rows = sec.fields.map((f) => [f, get(x, f.path || f.k)]).filter(([, v]) => v != null && v !== '');
    if (!rows.length) return;
    body.append(h('div', { class: 'card' }, h('h3', null, sec.title), h('dl', { class: 'spec-dl' }, rows.map(([f, v]) => {
      if (f.k === 'source.url') { const u = safeUrl(v); return h('div', null, h('dt', null, f.label), h('dd', null, u ? h('a', { href: u, target: '_blank', rel: 'noopener' }, 'Open source') : String(v))); }
      return h('div', null, h('dt', null, f.label), h('dd', null, fmtVal(f, v)));
    }))));
  });
  if (kind === 'vehicles') body.append(h('div', { class: 'card' }, h('h3', null, 'Install locations'), h('ul', { class: 'loc-list' }, (x.locations || []).map((l) => h('li', null, h('b', null, l.name), ` ${l.shape === 'wedge' ? 'wedge' : 'box'}: ${units.fmtLen(l.w)} W × ${units.fmtLen(l.h)} H × ${units.fmtLen(l.d)}${l.shape === 'wedge' ? ` / ${units.fmtLen(l.dTop)}` : ''} D`, l.openingW ? ` · opening ${units.fmtLen(l.openingW)} × ${units.fmtLen(l.openingH)}` : '', l.notes ? h('div', { class: 'muted small' }, l.notes) : null)))));
  modal({ title: `${x.brand || x.make || ''} ${x.model}`, body, wide: true, actions: [
    ...(x._builtin && x._edited ? [{ label: 'Reset to manufacturer data', onClick: async (c) => { await remove(kind, x.id); c(); toast('Restored the original data.'); } }] : []),
    ...(x._custom ? [{ label: 'Delete', kind: 'danger', onClick: async (c) => { if (await confirmBox(`Delete ${x.model}?`, 'This removes it from the shared library for everyone.')) { await remove(kind, x.id); c(); toast('Deleted.'); } } }] : []),
    { label: 'Edit', onClick: (c) => { c(); editItem(kind, x); } },
    { label: 'Use in design', kind: 'primary', onClick: (c) => { c(); useInDesign(kind, x); } },
  ] });
}

// ---------------------------------------------------------------- editor
export function editItem(kind, item, opts = {}) {
  const meta = KIND_META[kind];
  const isNew = !item || opts.asNew;
  const draft = JSON.parse(JSON.stringify(item || defaults(kind)));
  if (isNew && !opts.keepId) draft.id = uid(kind === 'subs' ? 's' : kind === 'amps' ? 'a' : 'v');
  delete draft._builtin; delete draft._custom; delete draft._edited;
  if (kind === 'vehicles' && (draft.years || draft.yearFrom || draft.yearTo)) normalizeYears(draft);
  const body = h('div', { class: 'editor' });
  const draw = () => {
    clear(body);
    if (opts.banner) body.append(opts.banner);
    if (kind === 'subs') body.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-sm', onclick: () => aiFill(draft, draw) }, 'Fill missing specs with AI'),
      h('button', { class: 'btn btn-sm', onclick: () => importManual(draft, draw) }, 'Read specs from a manual')));
    meta.schema.forEach((sec) => {
      body.append(h('fieldset', { class: 'fs' }, h('legend', null, sec.title), h('div', { class: 'fs-grid' }, sec.fields.map((f) => fieldFor(draft, f)))));
    });
    if (kind === 'vehicles') body.append(locationsEditor(draft, draw));
    if (kind === 'subs') {
      const d = P.deriveDriver(draft);
      if (d.issues.length) body.append(h('div', { class: 'issues' }, d.issues.map((i) => h('p', { class: 'note warn' }, i))));
    }
  };
  draw();
  modal({ title: isNew ? `Add ${meta.one}` : `Edit ${item.model}`, body, wide: true, actions: [
    { label: 'Cancel', onClick: (c) => c() },
    { label: isNew ? `Add to library` : 'Save changes', kind: 'primary', onClick: async (c) => {
      const req = meta.schema.flatMap((s) => s.fields).filter((f) => f.req && !get(draft, f.k));
      if (req.length) { toast(`Fill in ${req.map((f) => f.label.toLowerCase()).join(' and ')}.`, 'bad'); return; }
      if (kind === 'subs' && !(draft.fs && (draft.qts || (draft.qes && draft.qms)) && (draft.vas || (draft.cms && draft.sd)))) { toast('A sub needs at least Fs, Qts (or Qes + Qms) and Vas to be simulated.', 'bad'); return; }
      if (kind === 'vehicles') normalizeYears(draft);
      try { await save(kind, draft); c(); toast(isNew ? 'Added to the library.' : 'Saved.', 'good'); opts.onSaved?.(draft); }
      catch { toast('Could not save. You may not have permission to add to this shared library.', 'bad'); }
    } },
  ] });
}
function defaults(kind) {
  if (kind === 'subs') return { brand: '', model: '', size: 12, shape: 'round', coils: 2, coilOhms: 4, paramWiring: 'series', factory: {}, source: {} };
  if (kind === 'amps') return { brand: '', model: '', class: 'D', channels: 1, power: {}, minOhms: 1, source: {} };
  return { category: 'Car', body: '', doors: 4, make: '', model: '', years: '', yearFrom: null, yearTo: null, cabinLength: 100, locations: [{ id: 'trunk', name: 'Trunk', shape: 'rect', w: 38, h: 14, d: 28, openingW: 40, openingH: 14, notes: '' }] };
}
function fieldFor(draft, f) {
  const path = f.path || f.k;
  const v = get(draft, path);
  const id = `e-${f.k.replace(/\W/g, '-')}`;
  if (f.type === 'text') return textField({ id, label: f.label, value: v, placeholder: f.placeholder, onChange: (x) => set(draft, path, x) });
  if (f.type === 'area') return h('label', { class: 'field field-wide', for: id }, h('span', { class: 'field-label' }, f.label), h('textarea', { id, rows: 3, onchange: (e) => set(draft, path, e.target.value) }, v || ''));
  if (f.type === 'select') return selectField({ id, label: f.label, value: v ?? '', options: f.options.map((o) => ({ value: o, label: o === '' ? '—' : o === 'true' ? 'Yes' : o === 'false' ? 'No' : String(o) })), onChange: (x) => set(draft, path, x === '' ? null : x === 'true' ? true : x === 'false' ? false : isFinite(+x) && (f.numeric || typeof f.options[0] === 'number') ? +x : x) });
  return numField({ id, label: f.label, kind: f.kind || 'plain', unit: f.unit, value: v, onChange: (x) => set(draft, path, x) });
}
function locationsEditor(draft, redraw) {
  const locs = draft.locations || (draft.locations = []);
  return h('fieldset', { class: 'fs' }, h('legend', null, 'Install locations (measure inside, in the space the box will sit)'),
    ...locs.map((l, i) => h('div', { class: 'loc-edit' },
      h('div', { class: 'fs-grid' },
        textField({ id: `l${i}-name`, label: 'Name', value: l.name, onChange: (x) => { l.name = x; l.id = l.id || x.toLowerCase().replace(/\W+/g, '-'); } }),
        selectField({ id: `l${i}-shape`, label: 'Shape', value: l.shape, options: [{ value: 'rect', label: 'Rectangular space' }, { value: 'wedge', label: 'Wedge (behind a seat)' }], onChange: (x) => { l.shape = x; redraw(); } }),
        numField({ id: `l${i}-w`, label: 'Width', kind: 'len', value: l.w, onChange: (x) => { l.w = x; } }),
        numField({ id: `l${i}-h`, label: 'Height', kind: 'len', value: l.h, onChange: (x) => { l.h = x; } }),
        numField({ id: `l${i}-d`, label: l.shape === 'wedge' ? 'Depth at floor' : 'Depth', kind: 'len', value: l.d, onChange: (x) => { l.d = x; } }),
        l.shape === 'wedge' ? numField({ id: `l${i}-dt`, label: 'Depth at top', kind: 'len', value: l.dTop, onChange: (x) => { l.dTop = x; } }) : null,
        numField({ id: `l${i}-ow`, label: 'Opening width', kind: 'len', value: l.openingW, onChange: (x) => { l.openingW = x; } }),
        numField({ id: `l${i}-oh`, label: 'Opening height', kind: 'len', value: l.openingH, onChange: (x) => { l.openingH = x; } }),
        textField({ id: `l${i}-notes`, label: 'Notes', value: l.notes, onChange: (x) => { l.notes = x; } })),
      h('button', { class: 'btn btn-sm ghost', onclick: () => { locs.splice(i, 1); redraw(); } }, 'Remove location'))),
    h('button', { class: 'btn btn-sm', onclick: () => { locs.push({ id: `loc${locs.length + 1}`, name: 'New location', shape: 'rect', w: 36, h: 14, d: 20 }); redraw(); } }, 'Add a location'));
}

// ---------------------------------------------------------------- AI
const cleanSub = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) if (v !== null && v !== undefined && v !== '' && !['found', 'confidence', 'uncertain', 'manual'].includes(k)) out[k] = v;
  return out;
};
function aiProgress(label) {
  const ctl = new AbortController();
  const status = h('p', { class: 'ai-status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), label);
  const m = modal({ title: 'Working…', body: status, actions: [{ label: 'Stop', onClick: (c) => { ctl.abort(); c(); } }] });
  return { ctl, close: () => m.close(), status };
}
async function guardAI() {
  const s = await getSample();
  if (!s || aiDisabled()) { toast('AI is not available in this view. Open the page on claude.ai to use it.', 'bad'); return false; }
  return true;
}
function aiLookupDialog() {
  const st = { brand: '', model: '', extra: '' };
  modal({ title: 'AI spec lookup', body: h('div', { class: 'editor' },
    h('p', { class: 'muted' }, 'Claude fills in the specs it knows for this model, including the factory box recommendations. It answers from what it learned in training and cannot browse the web from here, so check the numbers against the manual. Importing the actual manual is the most reliable path.'),
    h('div', { class: 'fs-grid' },
      textField({ id: 'ai-brand', label: 'Brand', value: '', placeholder: 'JL Audio', onChange: (v) => { st.brand = v; } }),
      textField({ id: 'ai-model', label: 'Model', value: '', placeholder: '12W6v3-D4', onChange: (v) => { st.model = v; } }),
      textField({ id: 'ai-extra', label: 'Anything else (optional)', value: '', placeholder: 'dual 2 ohm version, 2019 model', onChange: (v) => { st.extra = v; } }))),
  actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Look it up', kind: 'primary', onClick: async (c) => {
    if (!st.brand || !st.model) { toast('Enter a brand and a model.', 'bad'); return; }
    if (!(await guardAI())) return;
    c();
    const p = aiProgress(`Looking up the ${st.brand} ${st.model}…`);
    try {
      const res = await lookupSub(st, { signal: p.ctl.signal });
      p.close();
      if (!res?.found) { toast(res?.notes || 'Claude did not recognize that model. Try importing the manual instead.', 'warn'); return; }
      const draft = { ...defaults('subs'), ...cleanSub(res), aiSourced: true, source: { label: `AI lookup (${res.confidence || 'unknown'} confidence)${res.manual ? ` · manual: ${res.manual}` : ''}`, verified: false } };
      editItem('subs', draft, { keepId: false, banner: aiBanner(res) });
    } catch (e) { p.close(); if (e?.code !== 'cancelled') toast(errorText(e), 'bad'); }
  } }] });
}
function aiBanner(res) {
  return h('div', { class: 'note warn' }, h('b', null, `AI result, ${res.confidence || 'unknown'} confidence. `), 'Review every number against the manual before saving.',
    res.uncertain?.length ? ` Unsure about: ${res.uncertain.join(', ')}.` : '', res.manual ? ` Manual: ${res.manual}.` : '', res.notes ? ` ${res.notes}` : '');
}
async function aiFill(draft, redraw) {
  if (!draft.brand || !draft.model) { toast('Enter the brand and model first.', 'bad'); return; }
  if (!(await guardAI())) return;
  const p = aiProgress(`Asking Claude about the ${draft.brand} ${draft.model}…`);
  try {
    const res = await lookupSub({ brand: draft.brand, model: draft.model }, { signal: p.ctl.signal });
    p.close();
    if (!res?.found) { toast('Claude did not recognize that model.', 'warn'); return; }
    let filled = 0;
    const merge = (target, src) => { for (const [k, v] of Object.entries(src)) { if (v == null || ['found', 'confidence', 'uncertain', 'manual', 'brand', 'model'].includes(k)) continue; if (typeof v === 'object' && !Array.isArray(v)) { target[k] = target[k] || {}; merge(target[k], v); } else if (target[k] == null || target[k] === '') { target[k] = v; filled++; } } };
    merge(draft, res);
    draft.aiSourced = true;
    redraw();
    toast(`Filled ${filled} empty field${filled === 1 ? '' : 's'}. Existing values were kept. Check them against the manual.`, 'good');
  } catch (e) { p.close(); if (e?.code !== 'cancelled') toast(errorText(e), 'bad'); }
}
export function importManual(target, redraw) {
  const st = { files: [], text: '', hint: target?.model || '' };
  const fileInput = h('input', { type: 'file', id: 'man-file', accept: 'application/pdf,image/jpeg,image/png,image/webp', multiple: true, onchange: (e) => { st.files = [...e.target.files]; } });
  modal({ title: 'Read specs from a manual', body: h('div', { class: 'editor' },
    h('p', { class: 'muted' }, 'Upload the owner\'s manual or spec sheet (PDF), or photos of the spec page. Claude reads the T/S table and the recommended-enclosure table and fills in the form for you to check.'),
    h('label', { class: 'field field-wide', for: 'man-file' }, h('span', { class: 'field-label' }, 'PDF or photos'), fileInput),
    h('label', { class: 'field field-wide', for: 'man-text' }, h('span', { class: 'field-label' }, 'Or paste the spec text'), h('textarea', { id: 'man-text', rows: 5, placeholder: 'Fs 26.7 Hz, Qts 0.444, Vas 2.84 cu ft…', onchange: (e) => { st.text = e.target.value; } })),
    textField({ id: 'man-hint', label: 'Which model (if the manual covers several)', value: st.hint, onChange: (v) => { st.hint = v; } })),
  actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Read it', kind: 'primary', onClick: async (c) => {
    if (!st.files.length && !st.text.trim()) { toast('Choose a file or paste some text.', 'bad'); return; }
    if (!(await guardAI())) return;
    c();
    const p = aiProgress('Reading the document…');
    try {
      let text = st.text, images = [];
      for (const f of st.files) {
        if (f.type === 'application/pdf') {
          p.status.lastChild.textContent = `Extracting text from ${f.name}…`;
          const r = await pdfToText(f).catch(() => null);
          if (!r || r.text.replace(/\s|\[Page \d+\]/g, '').length < 40) { p.close(); toast('That PDF has no readable text (it may be scanned). Upload photos of the spec page instead.', 'bad'); return; }
          text += `\n${r.text}`;
        } else images.push(f);
      }
      if (images.length) {
        const lim = await (await getSample()).limits().catch(() => null);
        if (!lim?.images) { if (!text) { p.close(); toast('This view cannot send images. Paste the text or upload a PDF.', 'bad'); return; } images = []; }
        else images = images.slice(0, lim.images.maxCount);
      }
      p.status.lastChild.textContent = 'Claude is reading the spec tables…';
      const res = await extractFromManual({ text, images, hint: st.hint }, { signal: p.ctl.signal });
      p.close();
      const models = (res?.models || []).filter((m) => m && (m.fs || m.vas || m.model));
      if (!models.length) { toast('No subwoofer specs were found in that document.', 'warn'); return; }
      const pick = (m) => {
        const data = { ...defaults('subs'), ...cleanSub(m), source: { label: `Read from ${res.documentTitle || 'uploaded manual'}`, verified: false } };
        if (target && redraw) { Object.assign(target, { ...data, id: target.id }); redraw(); toast('Specs filled in from the manual. Check them, then save.', 'good'); }
        else editItem('subs', data, { banner: h('div', { class: 'note' }, 'Read from your document. Check the values, then add it to the library.') });
      };
      if (models.length === 1) pick(models[0]);
      else modal({ title: 'This manual covers several models', body: h('div', { class: 'btn-col' }, models.map((m) => h('button', { class: 'btn', onclick: (e) => { e.target.closest('.modal-wrap').remove(); pick(m); } }, `${m.brand || ''} ${m.model || 'Unnamed'} · Fs ${m.fs ?? '?'} · Re ${m.re ?? '?'} Ω`))) });
    } catch (e) { p.close(); if (e?.code !== 'cancelled') toast(errorText(e), 'bad'); }
  } }] });
}
function aiVehicleDialog() {
  const st = { year: '', make: '', model: '', body: '' };
  modal({ title: 'AI space estimate', body: h('div', { class: 'editor' },
    h('p', { class: 'muted' }, 'Claude estimates the trunk, cargo or behind-seat space for your vehicle so you can start designing. Measure before you cut: trims and model years differ.'),
    h('div', { class: 'fs-grid' },
      selectField({ id: 'v-year', label: 'Year', value: '', options: [{ value: '', label: 'Choose a year' }, ...YEARS.map((y) => ({ value: y, label: String(y) }))], onChange: (v) => { st.year = v; } }),
      textField({ id: 'v-make', label: 'Make', value: '', placeholder: 'Chevrolet', onChange: (v) => { st.make = v; } }),
      textField({ id: 'v-model', label: 'Model', value: '', placeholder: 'Silverado 1500', onChange: (v) => { st.model = v; } }),
      textField({ id: 'v-body', label: 'Body / cab', value: '', placeholder: 'Crew cab', onChange: (v) => { st.body = v; } }))),
  actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Estimate', kind: 'primary', onClick: async (c) => {
    if (!st.make || !st.model) { toast('Enter at least a make and model.', 'bad'); return; }
    if (!(await guardAI())) return;
    c();
    const p = aiProgress(`Estimating spaces in the ${st.year} ${st.make} ${st.model}…`);
    try {
      const res = await estimateVehicle(st, { signal: p.ctl.signal });
      p.close();
      const draft = { ...defaults('vehicles'), ...res, years: res.years || st.year, yearFrom: null, yearTo: null, aiSourced: true,
        locations: (res.locations || []).map((l, i) => ({ id: `loc${i + 1}`, ...l })), notes: `AI estimate (${res.confidence || 'unknown'} confidence). ${res.notes || ''} Measure before building.` };
      delete draft.confidence;
      editItem('vehicles', draft, { banner: h('div', { class: 'note warn' }, h('b', null, 'Estimated sizes. '), 'Measure your vehicle and correct these before you build.') });
    } catch (e) { p.close(); if (e?.code !== 'cancelled') toast(errorText(e), 'bad'); }
  } }] });
}
