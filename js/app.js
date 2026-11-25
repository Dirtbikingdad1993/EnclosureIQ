import { h, $, clear, units, local, numField, selectField, seg, toggle, toast, modal, fracIn, n1, uid, textField } from './ui.js';
import * as G from './geometry.js';
import * as P from './physics.js';
import { initStore, onStoreChange, storeState, allSubs, allAmps, allVehicles, getSub, saveDesign, allDesigns, deleteDesign } from './store.js';
import { defaultDesign, compute, applyFactory, summaryText, bandpassDims, optimizeBandpass, bandpassGeom } from './model.js';
import { freqChart } from './charts.js';
import { orbitView, typeIcon, shapeIcon, svgEl } from './draw.js';
import { maxRated } from './system.js';
import { renderLibrary } from './library.js';
import { renderPlans } from './plans.js';
import { renderGuides } from './guides.js';
import { openAssistant, assistantButton } from './assistant.js';

// ---------------------------------------------------------------- state
export const app = {
  ds: Object.assign(defaultDesign(), local.get('bw.draft', {})),
  res: null, view: 'design', chartTab: local.get('bw.chartTab', 'vehicle'), pins: [], orbit: {},
};
const VIEWS = [
  ['design', 'Design'], ['subwoofers', 'Subwoofers'], ['amplifiers', 'Amplifiers'], ['vehicles', 'Vehicles'],
  ['plans', 'Build plans'], ['guides', 'Guides & FAQ'], ['saved', 'Saved'],
];

export function recompute() { app.res = compute(app.ds); return app.res; }
let renderQueued = false;
/** Change the design. structural = re-render the whole view (controls change shape); otherwise only results refresh. */
export function setDs(patch, structural = false) {
  Object.assign(app.ds, patch);
  local.set('bw.draft', app.ds);
  recompute();
  if (app.view !== 'design') { if (structural) render(); return; }
  if (structural) render();
  else if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; renderResults(); }); }
}
export function loadDesign(d) {
  app.ds = Object.assign(defaultDesign(), JSON.parse(JSON.stringify(d)));
  delete app.ds.updatedAt;
  local.set('bw.draft', app.ds);
  recompute();
  go('design');
}
export function go(view) { if (location.hash !== '#' + view) location.hash = view; else route(); }

// ---------------------------------------------------------------- shell
function shell() {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Sections' }, VIEWS.map(([id, label]) => h('a', { href: '#' + id, 'data-view': id }, label)));
  const unitsSeg = seg({ small: true, label: 'Units', value: units.sys, options: [{ value: 'imperial', label: 'in' }, { value: 'metric', label: 'mm' }], onChange: (v) => { units.set(v); document.querySelector('.units-slot').replaceChildren(shellUnits()); render(); } });
  document.body.append(
    h('header', { class: 'topbar' },
      h('div', { class: 'topbar-inner' },
        h('a', { class: 'brand', href: '#design', 'aria-label': 'EnclosureIQ home' },
          svgEl(`<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="14" cy="16" r="7" fill="none" stroke="var(--accent)" stroke-width="2.4"/><circle cx="14" cy="16" r="2.2" fill="var(--accent)"/><rect x="24" y="9" width="2.4" height="14" fill="currentColor"/></svg>`),
          h('span', { class: 'brand-name' }, 'Enclosure', h('b', null, 'IQ')), h('span', { class: 'brand-sub' }, 'sub box designer')),
        nav,
        h('div', { class: 'topbar-tools' }, h('span', { class: 'units-slot' }, unitsSeg), assistantButton()))),
    h('main', { id: 'view', class: 'view' }),
    h('footer', { class: 'foot' }, h('p', null, 'Simulations use Thiele/Small small-signal models; real cars, boxes and drivers vary. Check factory data against the manual before cutting wood.')));
}
function shellUnits() { return seg({ small: true, label: 'Units', value: units.sys, options: [{ value: 'imperial', label: 'in' }, { value: 'metric', label: 'mm' }], onChange: (v) => { units.set(v); document.querySelector('.units-slot').replaceChildren(shellUnits()); render(); } }); }

function route() {
  const v = (location.hash || '#design').slice(1);
  if (v === 'results') return;
  app.view = VIEWS.find(([id]) => id === v) ? v : 'design';
  document.querySelectorAll('.nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.view === app.view ? 'page' : 'false'));
  render();
  window.scrollTo({ top: 0 });
  const bar = document.getElementById('mobile-bar');
  if (bar) bar.hidden = app.view !== 'design';
}
export function render() {
  const view = $('#view');
  const active = document.activeElement?.id;
  const scroll = window.scrollY;
  clear(view);
  if (!app.res) recompute();
  switch (app.view) {
    case 'design': view.append(designView()); break;
    case 'subwoofers': view.append(renderLibrary('subs')); break;
    case 'amplifiers': view.append(renderLibrary('amps')); break;
    case 'vehicles': view.append(renderLibrary('vehicles')); break;
    case 'plans': view.append(renderPlans(app.res)); break;
    case 'guides': view.append(renderGuides()); break;
    case 'saved': view.append(savedView()); break;
  }
  if (active) { const el = document.getElementById(active); if (el) el.focus({ preventScroll: true }); }
  window.scrollTo({ top: scroll });
}

// ---------------------------------------------------------------- design view
function step(num, title, ...body) {
  return h('section', { class: 'card step' }, h('h3', { class: 'step-title' }, h('span', { class: 'step-num' }, String(num)), title), ...body);
}
function designView() {
  const r = app.res, ds = app.ds;
  const left = h('div', { class: 'design-controls' },
    h('div', { class: 'design-name' }, textField({ id: 'ds-name', label: 'Design name', value: ds.name, onChange: (v) => setDs({ name: v }) }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: saveCurrent }, 'Save design'),
        h('button', { class: 'btn ghost', onclick: () => { app.ds = defaultDesign(); setDs({}, true); toast('Started a new design from the example.'); } }, 'New'))),
    vehicleStep(r), subStep(r), typeStep(r), sizeStep(r), r.ds.type === 'ported' ? portStep(r) : null,
    r.ds.type.startsWith('bp') ? chamberStep(r) : null, systemStep(r), signalStep(r));
  const right = h('div', { class: 'design-results', id: 'results' });
  const wrap = h('div', { class: 'design-grid' }, left, right);
  queueMicrotask(() => renderResults());
  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'Design'), h('h1', null, ds.name || 'Untitled design')),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: () => go('plans') }, 'Open build plans'), h('button', { class: 'btn', onclick: () => openAssistant() }, 'Ask the AI to design it'))),
    wrap);
}

function vehicleStep(r) {
  const ds = app.ds;
  const vs = allVehicles();
  const groups = {};
  vs.forEach((v) => { const g = `${v.category} · ${v.doors}-door`; (groups[g] = groups[g] || []).push({ value: v.id, label: `${v.years ? v.years + ' ' : ''}${v.make ? v.make + ' ' : ''}${v.model}${v.body && !v.typical ? ` (${v.body})` : ''}` }); });
  const loc = r.loc;
  return step(1, 'Vehicle & install space',
    selectField({ id: 'ds-vehicle', label: 'Vehicle', value: ds.vehicleId, groups: Object.entries(groups).sort(), onChange: (v) => { const veh = vs.find((x) => x.id === v); setDs({ vehicleId: v, locationId: veh?.locations?.[0]?.id }, true); } }),
    r.vehicle?.locations?.length > 1 ? selectField({ id: 'ds-loc', label: 'Install location', value: loc?.id, options: r.vehicle.locations.map((l) => ({ value: l.id, label: l.name })), onChange: (v) => setDs({ locationId: v }, true) }) : null,
    loc ? h('div', { class: 'loc-box' },
      h('div', { class: 'loc-dims' },
        h('span', null, h('b', null, 'Space '), loc.shape === 'wedge' ? `${units.fmtLen(loc.w)} W × ${units.fmtLen(loc.h)} H × ${units.fmtLen(loc.d)} floor / ${units.fmtLen(loc.dTop)} top D` : units.dims(loc.w, loc.h, loc.d)),
        loc.openingW ? h('span', null, h('b', null, 'Opening '), `${units.fmtLen(loc.openingW)} × ${units.fmtLen(loc.openingH)}`) : null,
        r.vehicle?.typical ? h('span', { class: 'pill warn' }, 'Typical size: measure yours') : null),
      loc.notes ? h('p', { class: 'muted small' }, loc.notes) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-sm', onclick: () => fitToSpace(loc) }, 'Fit box to this space'),
        h('button', { class: 'btn btn-sm ghost', onclick: () => go('vehicles') }, 'Add my vehicle'))) : h('p', { class: 'muted' }, 'Pick a vehicle to check fit and cabin gain.'),
    toggle({ id: 'ds-cabin', label: `Include cabin gain${r.vehicle?.cabinLength ? ` (cabin ≈ ${units.fmtLen(r.vehicle.cabinLength)}, lift starts below ${P.cabinCorner(r.vehicle.cabinLength * P.IN).toFixed(0)} Hz)` : ''}`, checked: ds.cabin, onChange: (v) => setDs({ cabin: v }) }));
}
function fitToSpace(loc) {
  const ds = app.ds, clr = 0.5;
  const patch = { h: +(loc.h - clr).toFixed(3), lockWidth: false };
  if (loc.shape === 'wedge' && !ds.type.startsWith('bp')) Object.assign(patch, { shape: 'wedge', slope: 'back', d: +(loc.d - clr).toFixed(3), dTop: +((loc.dTop ?? loc.d) - clr).toFixed(3) });
  else patch.d = +Math.min(loc.d - clr, Math.max(ds.d, (getSub(ds.subId).mountDepth || 6) + 3)).toFixed(3);
  if (ds.mount === 'up' || ds.mount === 'down') [patch.h, patch.d] = [patch.d, patch.h];
  setDs(patch, true);
  toast(app.res.fit?.fits ? 'Box resized to the space and it fits.' : 'Box resized; see the fit check for what still does not fit.', app.res.fit?.fits ? 'good' : 'warn');
}

function subStep(r) {
  const ds = app.ds, subs = allSubs();
  const groups = {};
  subs.forEach((s) => { (groups[s.brand] = groups[s.brand] || []).push({ value: s.id, label: `${s.model} · ${s.size}"${s._custom ? ' (added)' : ''}` }); });
  const s = r.sub, d = r.drv;
  const f = s.factory || {};
  return step(2, 'Subwoofer',
    selectField({ id: 'ds-sub', label: 'Model', value: ds.subId, groups: Object.entries(groups), onChange: (v) => { const sub = getSub(v); setDs({ subId: v, wiringZ: null, chambers: null, ...applyFactory(app.ds, sub, app.ds.type) }, true); } }),
    h('div', { class: 'spec-strip' },
      [['Fs', `${n1(d.fs)} Hz`], ['Qts', n1(d.qts, 3)], ['Vas', `${n1(d.vas * 1000)} L`], ['Xmax', `${n1(d.xmax * 1000)} mm`], ['EBP', n1(d.ebp, 0)], ['RMS', `${s.rms || '—'} W`]].map(([k, v]) => h('span', null, h('small', null, k), v))),
    d.issues.length ? h('p', { class: 'note warn' }, `Spec check: ${d.issues[0]}`) : null,
    h('div', { class: 'row2' },
      numField({ id: 'ds-n', label: ds.isobaric ? 'Isobaric pairs' : 'Number of subs', value: ds.n, step: 1, min: 1, max: 8, onChange: (v) => setDs({ n: Math.max(1, Math.min(8, Math.round(v || 1))), wiringZ: null }, true) }),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Loading'), toggle({ id: 'ds-iso', label: 'Isobaric (clamshell)', checked: ds.isobaric, onChange: (v) => setDs({ isobaric: v, wiringZ: null }, true) }))),
    h('div', { class: 'btn-row' },
      f.sealed?.vol ? h('button', { class: 'btn btn-sm', onclick: () => setDs(applyFactory(ds, s, 'sealed'), true) }, `Factory sealed ${units.fmtVol(f.sealed.vol)}`) : null,
      f.ported?.vol ? h('button', { class: 'btn btn-sm', onclick: () => setDs(applyFactory(ds, s, 'ported'), true) }, `Factory ported ${units.fmtVol(f.ported.vol)}${f.ported.fb ? ` @ ${f.ported.fb} Hz` : ''}`) : null,
      f.bp4 ? h('button', { class: 'btn btn-sm', onclick: () => setDs(applyFactory(ds, s, 'bp4'), true) }, 'Factory 4th order') : null,
      h('button', { class: 'btn btn-sm ghost', onclick: () => go('subwoofers') }, 'Library')));
}

function typeStep(r) {
  const ds = app.ds;
  const types = Object.entries(G.BOX_TYPES);
  const allowedShapes = G.BOX_TYPES[ds.type].shapes;
  return step(3, 'Enclosure type & shape',
    h('div', { class: 'type-grid', role: 'radiogroup', 'aria-label': 'Enclosure type' }, types.map(([id, t]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(ds.type === id), class: `type-card${ds.type === id ? ' on' : ''}`, title: t.desc || t.label,
      onclick: () => {
        const patch = { type: id, chambers: null };
        if (!G.BOX_TYPES[id].shapes.includes(ds.shape)) patch.shape = G.BOX_TYPES[id].shapes[0];
        if (id === 'ib') Object.assign(patch, { shape: 'board', h: Math.max(ds.h, (r.sub.overallDia || 12.5) + 3), w: Math.max(ds.w, 30), lockWidth: false });
        if (ds.type === 'ib' && id !== 'ib') patch.shape = 'rect';
        if (id.startsWith('bp')) Object.assign(patch, bandpassDims({ ...ds, ...patch }, r.sub));
        setDs(patch, true);
      },
    }, svgEl(typeIcon(id)), h('span', null, t.label)))),
    G.BOX_TYPES[ds.type].desc ? h('p', { class: 'muted small' }, G.BOX_TYPES[ds.type].desc) : null,
    allowedShapes.length > 1 ? seg({ label: 'Shape', value: ds.shape === 'wedge' ? `wedge-${ds.slope}` : 'rect', onChange: (v) => setDs(v === 'rect' ? { shape: 'rect' } : { shape: 'wedge', slope: v.split('-')[1], dTop: Math.min(ds.dTop || ds.d * 0.7, ds.d) }, true), options: [
      { value: 'rect', label: 'Rectangle', icon: svgEl(shapeIcon('rect')) },
      { value: 'wedge-back', label: 'Angled back', icon: svgEl(shapeIcon('wedge', 'back')) },
      { value: 'wedge-front', label: 'Angled baffle', icon: svgEl(shapeIcon('wedge', 'front')) },
    ] }) : null,
    ds.type !== 'ib' ? h('div', { class: 'row2' },
      selectField({ id: 'ds-mount', label: 'Firing direction', value: ds.mount, options: [{ value: 'front', label: 'Forward / toward cabin' }, { value: 'rear', label: 'Rearward (trunk / tailgate)' }, { value: 'up', label: 'Up-firing' }, { value: 'down', label: 'Down-firing (2" feet)' }], onChange: (v) => setDs({ mount: v }, true) }),
      !ds.type.startsWith('bp') ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Blow-through'), toggle({ id: 'ds-blow', label: 'Fire through a wall / seat', checked: ds.blowThrough, onChange: (v) => setDs({ blowThrough: v }, true) })) : null) : null);
}

function sizeStep(r) {
  const ds = app.ds, box = r.box, d = r.drv;
  const isIB = ds.type === 'ib';
  const presets = [];
  if (ds.type === 'sealed') {
    [0.707, 0.8, 0.9].forEach((q) => { const v = P.sealedVolumeForQtc(d, q); if (v) presets.push([`Qtc ${q}`, v / P.FT3]); });
  }
  if (ds.type === 'ported') { const s = P.ventedSuggestion(d); presets.push(['Keele QB3', s.vb / P.FT3, s.fb]); }
  const volField = ds.type === 'sealed' || ds.type === 'ported';
  return step(4, isIB ? 'Baffle & trunk' : 'Size & materials',
    volField ? h('div', null,
      numField({ id: 'ds-vnet', label: `Net volume per ${ds.isobaric ? 'pair' : 'sub'}`, kind: 'vol', value: ds.vnet, step: 0.01, min: 0.05, disabled: ds.lockWidth, hint: ds.lockWidth ? 'Width is locked, so volume follows the dimensions.' : `Total ${units.fmtVol((ds.vnet || 0) * ds.n)} net for ${ds.n} ${ds.isobaric ? 'pair(s)' : 'sub(s)'}.`, onChange: (v) => setDs({ vnet: Math.max(0.05, v || 0.05) }) }),
      presets.length ? h('div', { class: 'chips' }, presets.map(([l, v, fb]) => h('button', { class: 'chip', onclick: () => setDs(fb ? { vnet: +v.toFixed(3), fb: +fb.toFixed(1), lockWidth: false } : { vnet: +v.toFixed(3), lockWidth: false }, true) }, `${l}: ${units.fmtVol(v)}${fb ? ` @ ${fb.toFixed(0)} Hz` : ''}`))) : null) : null,
    isIB ? numField({ id: 'ds-ib', label: 'Trunk air volume', kind: 'vol', value: ds.ibVol, step: 0.5, min: 2, hint: 'Rough trunk volume; sedans are typically 10–16 cu ft.', onChange: (v) => setDs({ ibVol: Math.max(2, v || 2) }) }) : null,
    h('div', { class: 'row3' },
      numField({ id: 'ds-h', label: isIB ? 'Board height' : 'Height', kind: 'len', value: ds.h, step: 0.125, min: 4, onChange: (v) => setDs({ h: Math.max(4, v || 4) }) }),
      !isIB ? numField({ id: 'ds-d', label: box.shape === 'wedge' ? 'Depth (bottom)' : 'Depth', kind: 'len', value: ds.d, step: 0.125, min: 3, onChange: (v) => setDs({ d: Math.max(3, v || 3), dTop: Math.min(ds.dTop, Math.max(3, v || 3)) }) }) : null,
      box.shape === 'wedge' ? numField({ id: 'ds-dtop', label: 'Depth (top)', kind: 'len', value: ds.dTop, step: 0.125, min: 2, onChange: (v) => setDs({ dTop: Math.min(ds.d, Math.max(2, v || 2)) }) }) : null,
      numField({ id: 'ds-w', label: ds.lockWidth || isIB ? 'Width' : 'Width (auto)', kind: 'len', value: ds.lockWidth ? ds.w : box.ext?.w, step: 0.125, disabled: !ds.lockWidth && !isIB, onChange: (v) => setDs({ w: Math.max(4, v || 4) }) })),
    !isIB && !ds.type.startsWith('bp') ? toggle({ id: 'ds-lock', label: 'Set width myself (volume follows)', checked: ds.lockWidth, onChange: (v) => setDs({ lockWidth: v, w: box.ext ? +box.ext.w.toFixed(3) : ds.w }, true) }) : null,
    !isIB ? h('div', { class: 'row3' },
      selectField({ id: 'ds-t', label: 'Material', value: ds.t, options: [{ value: 0.5, label: '1/2" MDF / ply' }, { value: 0.625, label: '5/8" MDF' }, { value: 0.75, label: '3/4" MDF' }, { value: 1, label: '1" MDF' }].map((o) => ({ ...o, label: units.metric ? `${Math.round(o.value * 25.4)} mm` : o.label })), onChange: (v) => setDs({ t: +v }) }),
      selectField({ id: 'ds-bl', label: 'Front baffle layers', value: ds.baffleLayers, options: [1, 2, 3].map((n) => ({ value: n, label: `${n}${n > 1 ? ` (${units.fmtLen(n * ds.t)} thick)` : ''}` })), onChange: (v) => setDs({ baffleLayers: +v }) }),
      numField({ id: 'ds-brace', label: 'Bracing displacement', kind: 'vol', value: ds.braceVol, step: 0.01, min: 0, onChange: (v) => setDs({ braceVol: Math.max(0, v || 0) }) })) : null);
}

function portStep(r) {
  const ds = app.ds, p = r.box.ports[0];
  const slotOK = !(r.box.shape === 'wedge' && ds.slope === 'front');
  return step(5, 'Port & tuning',
    h('div', { class: 'row2' },
      numField({ id: 'ds-fb', label: 'Tuning frequency (Fb)', unit: 'Hz', value: ds.fb, step: 0.5, min: 15, max: 80, onChange: (v) => setDs({ fb: Math.max(15, Math.min(90, v || 30)) }) }),
      selectField({ id: 'ds-pk', label: 'Port type', value: slotOK ? ds.port.kind : 'round', options: [{ value: 'slot', label: 'Slot (along the side)' }, { value: 'round', label: 'Round tube' }, { value: 'aero', label: 'Aero (flared)' }].filter((o) => slotOK || o.value !== 'slot'), onChange: (v) => setDs({ port: { ...ds.port, kind: v, k: v === 'aero' ? 0.85 : 0.732 } }, true) })),
    h('div', { class: 'chips' }, [28, 30, 32, 34, 36, 38, 40].map((f) => h('button', { class: `chip${+ds.fb === f ? ' on' : ''}`, onclick: () => setDs({ fb: f }, true) }, `${f} Hz`))),
    ds.port.kind === 'slot' && slotOK
      ? numField({ id: 'ds-pw', label: 'Slot width (gap)', kind: 'len', value: ds.port.w, step: 0.125, min: 0.5, hint: p ? `Slot height ${units.fmtLen(p.h)} (inside height) → ${units.fmtArea(p.totalArea)} port area` : '', onChange: (v) => setDs({ port: { ...ds.port, w: Math.max(0.5, v || 1) } }) })
      : h('div', { class: 'row2' },
        numField({ id: 'ds-pd', label: 'Port inside diameter', kind: 'len', value: ds.port.dia, step: 0.25, min: 1, onChange: (v) => setDs({ port: { ...ds.port, dia: Math.max(1, v || 4) } }) }),
        numField({ id: 'ds-pc', label: 'Number of ports', value: ds.port.count, step: 1, min: 1, max: 6, onChange: (v) => setDs({ port: { ...ds.port, count: Math.max(1, Math.min(6, Math.round(v || 1))) } }) })),
    selectField({ id: 'ds-pkc', label: 'Port end correction', value: ds.port.k, options: [{ value: 0.613, label: 'Both ends free (0.613)' }, { value: 0.732, label: 'One end flush on the baffle (0.732)' }, { value: 0.85, label: 'Both ends flanged / flared (0.85)' }], onChange: (v) => setDs({ port: { ...ds.port, k: +v } }) }),
    p ? h('p', { class: 'calc-line' }, `Port length `, h('b', null, units.fmtLen(p.length)), ` · area ${units.fmtArea(p.totalArea)} (${n1(p.totalArea / r.box.net, 1)} ${units.metric ? 'cm²/L ×' : 'in² per ft³'})`, p.layout?.legs === 2 ? ' · folds once along the back' : '') : null);
}

function chamberStep(r) {
  const ds = app.ds;
  const ch = ds.chambers || [];
  const upd = (i, patch, structural) => { const next = ch.map((c, k) => (k === i ? { ...c, ...patch } : c)); setDs({ chambers: next }, structural); };
  return step(5, 'Bandpass chambers & ports',
    h('p', { class: 'muted small' }, 'Volumes are per sub. Chambers sit side by side across the box width; the sub mounts on the first divider, firing into the front chamber.'),
    ...ch.map((c, i) => {
      const pr = r.box.ports.find((p) => p.chamber === i);
      return h('div', { class: 'chamber' },
        h('div', { class: 'chamber-head' }, h('b', null, `${i + 1}. ${c.role}`), r.box.chambers[i] ? h('span', { class: 'muted small' }, `${units.fmtLen(r.box.chambers[i].intW)} wide inside`) : null),
        h('div', { class: 'row3' },
          numField({ id: `ch-${i}-v`, label: 'Net volume', kind: 'vol', value: c.vol, step: 0.05, min: 0.1, onChange: (v) => upd(i, { vol: Math.max(0.1, v || 0.1) }) }),
          c.port ? numField({ id: `ch-${i}-fb`, label: 'Port tuning', unit: 'Hz', value: c.port.fb, step: 0.5, min: 15, onChange: (v) => upd(i, { port: { ...c.port, fb: Math.max(15, v || 40) } }) }) : h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Port'), h('span', { class: 'muted' }, 'Sealed')),
          c.port ? selectField({ id: `ch-${i}-pk`, label: 'Port type', value: c.port.kind, options: [{ value: 'round', label: 'Round' }, { value: 'aero', label: 'Aero' }, ...(c.port.to === 'out' ? [{ value: 'slot', label: 'Slot' }] : [])], onChange: (v) => upd(i, { port: { ...c.port, kind: v } }, true) }) : null),
        c.port ? h('div', { class: 'row3' },
          c.port.kind === 'slot' ? numField({ id: `ch-${i}-pw`, label: 'Slot width', kind: 'len', value: c.port.w, step: 0.125, min: 0.5, onChange: (v) => upd(i, { port: { ...c.port, w: Math.max(0.5, v || 1) } }) })
            : numField({ id: `ch-${i}-pd`, label: 'Port diameter', kind: 'len', value: c.port.dia, step: 0.25, min: 1, onChange: (v) => upd(i, { port: { ...c.port, dia: Math.max(1, v || 3) } }) }),
          c.port.kind !== 'slot' ? numField({ id: `ch-${i}-pc`, label: 'Ports', value: c.port.count, step: 1, min: 1, max: 6, onChange: (v) => upd(i, { port: { ...c.port, count: Math.max(1, Math.round(v || 1)) } }) }) : null,
          pr ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Port length'), h('b', { class: 'mono' }, units.fmtLen(pr.length)), h('span', { class: 'field-hint' }, pr.to === 'out' ? 'exits the front' : `into chamber ${pr.to + 1}`)) : null) : null);
    }),
    h('div', { class: 'autotune' },
      h('p', { class: 'small' }, h('b', null, 'Auto-tune: '), 'search chamber volumes and port tunings for the flattest, loudest output between these frequencies.'),
      h('div', { class: 'row3' },
        numField({ id: 'bp-lo', label: 'From', unit: 'Hz', value: ds.bpTarget?.fLo ?? 32, step: 1, min: 18, onChange: (v) => { ds.bpTarget = { ...(ds.bpTarget || {}), fLo: Math.max(18, v || 32) }; } }),
        numField({ id: 'bp-hi', label: 'To', unit: 'Hz', value: ds.bpTarget?.fHi ?? 75, step: 1, min: 30, onChange: (v) => { ds.bpTarget = { ...(ds.bpTarget || {}), fHi: Math.max(30, v || 75) }; } }),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, '\u00a0'), h('button', { class: 'btn primary btn-sm', onclick: () => {
          const t = ds.bpTarget || {};
          const chambers = optimizeBandpass(ds.type, r.drv, { fLo: t.fLo ?? 32, fHi: Math.max((t.fLo ?? 32) + 10, t.fHi ?? 75), n: ds.n, geom: bandpassGeom(ds) });
          setDs({ chambers }, true); toast('Chambers tuned for the target band.', 'good');
        } }, 'Auto-tune')))),
    h('button', { class: 'btn btn-sm ghost', onclick: () => setDs({ chambers: null }, true) }, 'Reset chambers to suggested'));
}

function systemStep(r) {
  const ds = app.ds;
  const amps = allAmps();
  const groups = {};
  amps.forEach((a) => { (groups[a.brand] = groups[a.brand] || []).push({ value: a.id, label: `${a.model} · ${maxRated(a)} W max${a._custom ? ' (added)' : ''}` }); });
  const wiring = r.wiring;
  return step(r.ds.type === 'ported' || r.ds.type.startsWith('bp') ? 6 : 5, 'Amplifier & wiring',
    selectField({ id: 'ds-amp', label: 'Amplifier', value: ds.ampId || '', groups: [['None', [{ value: '', label: 'No amplifier (set power by hand)' }]], ...Object.entries(groups)], onChange: (v) => setDs({ ampId: v || null, useAmpPower: !!v && ds.useAmpPower }, true) }),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Final load (how the coils and subs are wired)'),
      h('div', { class: 'wire-list', role: 'radiogroup' }, wiring.map((w) => {
        const pa = r.amp ? (w.z < (r.amp.minOhms || 1) - 1e-6 ? null : (w.z === r.finalZ ? r.ampAt?.power : null)) : null;
        const unsafe = r.amp && w.z < (r.amp.minOhms || 1) - 1e-6;
        return h('button', { type: 'button', role: 'radio', 'aria-checked': String(w.z === r.finalZ), class: `wire${w.z === r.finalZ ? ' on' : ''}${unsafe ? ' unsafe' : ''}`, onclick: () => setDs({ wiringZ: w.z }, true) },
          h('b', null, `${+w.z.toFixed(2)} Ω`), h('span', null, w.ways[0]), unsafe ? h('em', null, 'below amp minimum') : pa ? h('em', null, `${pa.toFixed(0)} W`) : null);
      }))),
    r.amp ? toggle({ id: 'ds-useamp', label: `Simulate with the amp's power (${r.ampAt?.power ? `${(r.ampAt.power / ds.n).toFixed(0)} W per ${ds.isobaric ? 'pair' : 'sub'}` : 'not stable at this load'})`, checked: ds.useAmpPower, onChange: (v) => setDs({ useAmpPower: v }, true) }) : null,
    !(r.amp && ds.useAmpPower) ? numField({ id: 'ds-power', label: `Power per ${ds.isobaric ? 'pair' : 'sub'} (RMS)`, unit: 'W', value: ds.power, step: 10, min: 1, onChange: (v) => setDs({ power: Math.max(1, v || 1) }) }) : null,
    numField({ id: 'ds-run', label: 'Battery-to-amp wire run', unit: 'ft', value: ds.runFt || r.elec.runFt, step: 1, min: 2, onChange: (v) => setDs({ runFt: Math.max(2, v || 2) }) }));
}

function signalStep(r) {
  const ds = app.ds;
  return step(r.ds.type === 'ported' || r.ds.type.startsWith('bp') ? 7 : 6, 'Filters (amp / processor settings)',
    h('div', { class: 'row2' },
      selectField({ id: 'ds-hpo', label: 'Subsonic filter', value: ds.hp.order, options: [{ value: 0, label: 'Off' }, { value: 2, label: '12 dB/oct' }, { value: 4, label: '24 dB/oct' }], onChange: (v) => setDs({ hp: { ...ds.hp, order: +v } }) }),
      numField({ id: 'ds-hpf', label: 'Subsonic frequency', unit: 'Hz', value: ds.hp.fc, step: 1, min: 10, max: 60, onChange: (v) => setDs({ hp: { ...ds.hp, fc: Math.max(10, v || 25) } }) })),
    h('div', { class: 'row2' },
      selectField({ id: 'ds-lpo', label: 'Low-pass filter', value: ds.lp.order, options: [{ value: 0, label: 'Off' }, { value: 2, label: '12 dB/oct' }, { value: 4, label: '24 dB/oct' }], onChange: (v) => setDs({ lp: { ...ds.lp, order: +v } }) }),
      numField({ id: 'ds-lpf', label: 'Low-pass frequency', unit: 'Hz', value: ds.lp.fc, step: 1, min: 40, max: 250, onChange: (v) => setDs({ lp: { ...ds.lp, fc: Math.max(30, v || 80) } }) })),
    ds.type === 'ported' && ds.hp.order && ds.hp.fc > ds.fb ? h('p', { class: 'note warn' }, 'The subsonic filter is above the port tuning, which throws away the deepest bass this box makes. Set it 3–5 Hz below Fb.') : null);
}

// ---------------------------------------------------------------- results
function stat(label, value, sub, state) {
  return h('div', { class: `stat${state ? ' ' + state : ''}` }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value), sub ? h('span', { class: 'stat-sub' }, sub) : null);
}
export function renderResults() {
  const host = $('#results');
  if (!host) return;
  const r = app.res, ds = r.ds, box = r.box, an = r.an, sub = r.sub;
  clear(host);
  if (!box.ext || !r.sim) { host.append(h('div', { class: 'card' }, h('p', null, box.warnings[0] || 'Enter dimensions to see results.'))); return; }
  const xPct = an.maxX / (r.drv.xmax * 1000);
  const vMax = an.maxV;
  const fitState = r.fit ? (r.fit.fits ? 'good' : 'bad') : null;
  const peakCar = Math.max(...r.sim.splCabin.filter((_, i) => r.sim.freqs[i] >= 20 && r.sim.freqs[i] <= 80));
  const ampState = r.amp ? (r.ampAt?.power == null ? 'bad' : r.ampAt.power > r.ratedTotal * 1.25 ? 'warn' : r.ampAt.power < r.ratedTotal * 0.5 ? 'warn' : 'good') : null;
  const p0 = box.ports[0];
  const chips = h('div', { class: 'status-row' },
    r.fit ? h('span', { class: `pill ${fitState}` }, r.fit.fits ? `Fits the ${r.loc.name.toLowerCase()}` : 'Does not fit the space') : null,
    h('span', { class: `pill ${xPct > 1 ? 'bad' : xPct > 0.85 ? 'warn' : 'good'}` }, `Excursion ${Math.round(xPct * 100)}% of Xmax`),
    box.ports.length ? h('span', { class: `pill ${vMax > 26 ? 'bad' : vMax > 17 ? 'warn' : 'good'}` }, `Port speed ${vMax.toFixed(1)} m/s`) : null,
    r.amp ? h('span', { class: `pill ${ampState}` }, r.ampAt?.power == null ? `Amp not stable at ${r.finalZ} Ω` : `Amp ${r.ampAt.power.toFixed(0)} W @ ${+r.finalZ.toFixed(2)} Ω`) : null,
    box.warnings.length ? h('span', { class: 'pill bad' }, `${box.warnings.length} build issue${box.warnings.length > 1 ? 's' : ''}`) : h('span', { class: 'pill good' }, 'No build issues'));
  const stats = h('div', { class: 'stats' },
    stat('External size', box.shape === 'board' ? `${units.fmtLen(box.ext.w)} × ${units.fmtLen(box.ext.h)}` : units.dims(box.ext.w, box.ext.h, box.ext.d), box.shape === 'wedge' ? `top depth ${units.fmtLen(box.ext.dTop)}` : `${n1(box.weight, 0)} lb in ${ds.t}" MDF (est.)`),
    stat('Net volume', units.fmtVol(box.net), box.shape === 'board' ? 'trunk air' : `gross ${units.fmtVol(box.gross)}`),
    p0 ? stat('Tuning', `${n1(p0.fbActual ?? p0.fb)} Hz`, `${p0.kind} port ${units.fmtLen(p0.length)} long, ${units.fmtArea(p0.totalArea)}`) : r.sealed ? stat('Qtc / Fc', `${n1(r.sealed.qtc, 2)} / ${n1(r.sealed.fc, 0)} Hz`, r.sealed.qtc > 1 ? 'boomy alignment' : r.sealed.qtc < 0.6 ? 'very tight, low output' : 'balanced') : stat('System', G.BOX_TYPES[ds.type].label, ''),
    stat('F3 (no cabin gain)', r.anRaw?.f3 ? `${n1(r.anRaw.f3)} Hz` : '—', r.anRaw?.f3hi ? `upper F3 ${n1(r.anRaw.f3hi)} Hz` : 'where output is down 3 dB'),
    stat('In-car peak', `${n1(peakCar, 1)} dB`, `${r.powerPerUnit.toFixed(0)} W × ${ds.n} at 1 m`),
    stat('Load & power', `${+r.finalZ.toFixed(2)} Ω`, r.amp ? (r.ampAt?.power ? `${r.ampAt.power.toFixed(0)} W from ${r.amp.model} · subs rated ${r.ratedTotal} W` : `below ${r.amp.model}'s ${r.amp.minOhms} Ω minimum`) : `subs rated ${r.ratedTotal} W total`, ampState),
    stat('Power wiring', r.elec.gauge, `≈${r.elec.current.toFixed(0)} A full power · ${r.elec.fuse} A fuse`, r.elec.alternatorWarn ? 'warn' : null));
  const warnings = box.warnings.length || box.notes.length || r.drv.issues.length ? h('div', { class: 'card issues' },
    box.warnings.map((w) => h('p', { class: 'note bad' }, w)),
    (r.amp && r.ampAt?.power == null) ? h('p', { class: 'note bad' }, `${r.amp.brand} ${r.amp.model} is not stable at ${r.finalZ} Ω (minimum ${r.amp.minOhms} Ω). Pick a higher final load.`) : null,
    (r.amp && r.ampAt?.power && r.ampAt.power > r.ratedTotal * 1.25) ? h('p', { class: 'note warn' }, `The amp can make ${r.ampAt.power.toFixed(0)} W, more than the subs' ${r.ratedTotal} W total rating. Set the gain carefully (see the gain-setting guide).`) : null,
    r.elec.alternatorWarn ? h('p', { class: 'note warn' }, `At full power the amp can draw about ${r.elec.current.toFixed(0)} A. Consider the "Big 3" wiring upgrade or a high-output alternator.`) : null,
    box.notes.map((w) => h('p', { class: 'note' }, w))) : null;
  const fit = r.fit ? h('div', { class: 'fit' }, r.fit.checks.map((c) => h('span', { class: `fit-item ${c.ok ? 'good' : 'bad'}` }, h('b', null, c.ok ? '✓ ' : '✗ '), `${c.label}: `, typeof c.have === 'number' ? units.fmtLen(c.have) : c.have, ' vs ', typeof c.need === 'number' ? units.fmtLen(c.need) : c.need))) : null;

  host.append(...[chips, stats, fit, warnings, chartsCard(r), viewCard(r)].filter(Boolean));
  updateMobileBar(r, xPct, vMax);
}

function updateMobileBar(r, xPct, vMax) {
  let bar = document.getElementById('mobile-bar');
  if (!bar) {
    bar = h('div', { id: 'mobile-bar', class: 'mobile-bar' });
    document.body.append(bar);
  }
  bar.hidden = app.view !== 'design';
  clear(bar).append(
    h('span', null, h('small', null, 'Net'), units.fmtVol(r.box.net)),
    h('span', null, h('small', null, r.box.ports.length ? 'Tuning' : 'F3'), r.box.ports.length ? `${n1(r.box.ports[0].fb, 0)} Hz` : `${n1(r.anRaw?.f3, 0)} Hz`),
    h('span', { class: xPct > 1 ? 'bad' : '' }, h('small', null, 'Xmax'), `${Math.round(xPct * 100)}%`),
    r.fit ? h('span', { class: r.fit.fits ? 'good' : 'bad' }, h('small', null, 'Fit'), r.fit.fits ? 'Yes' : 'No') : null,
    h('a', { href: '#results', onclick: (e) => { e.preventDefault(); document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Graphs ↓'));
}

const CHARTS = [
  ['vehicle', 'In your vehicle'], ['maxspl', 'Max output'], ['excursion', 'Cone excursion'], ['port', 'Port air speed'],
  ['impedance', 'Impedance & phase'], ['power', 'Power handling'], ['delay', 'Group delay'], ['cabin', 'Vehicle transfer'],
];
function chartsCard(r) {
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, CHARTS.map(([id, label]) => h('button', {
    role: 'tab', 'aria-selected': String(app.chartTab === id), class: app.chartTab === id ? 'on' : '',
    onclick: () => { app.chartTab = id; local.set('bw.chartTab', id); renderResults(); },
  }, label)));
  const body = h('div', { class: 'chart-body' }, chartFor(app.chartTab, r));
  return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Performance graphs'),
    app.chartTab === 'vehicle' ? h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-sm', onclick: () => { app.pins.push({ name: `${app.ds.name || 'Pinned'} (${app.pins.length + 1})`, values: r.sim.splCabin.slice() }); renderResults(); toast('Curve pinned. Change the design to compare.'); } }, 'Pin this curve'),
      app.pins.length ? h('button', { class: 'btn btn-sm ghost', onclick: () => { app.pins = []; renderResults(); } }, 'Clear pins') : null) : null),
    tabs, body);
}
function chartFor(id, r) {
  const s = r.sim, f = s.freqs, ds = r.ds;
  const C = { a: 'var(--accent)', b: 'var(--blue)', c: 'var(--ink-2)', g: 'var(--good)', w: 'var(--warn)', r: 'var(--bad)' };
  const fbLines = r.box.ports.map((p) => ({ x: p.fb, label: `Fb ${p.fb}`, color: C.c }));
  const pinColors = ['#8a6fdf', '#2aa198', '#b58900', '#cb4b16'];
  switch (id) {
    case 'vehicle': return freqChart({
      freqs: f, yUnit: 'dB SPL', yFloor: Math.max(...s.splCabin) - 45,
      series: [
        { name: `In ${r.vehicle?.typical ? 'a typical' : 'your'} ${r.vehicle?.body?.toLowerCase() || 'vehicle'}`, color: C.a, values: s.splCabin, fill: true },
        { name: 'Outdoors (anechoic)', color: C.b, values: s.spl, dash: '6 4' },
        ...app.pins.map((p, i) => ({ name: p.name, color: pinColors[i % 4], values: p.values, dash: '2 3', width: 1.6 })),
      ],
      vLines: [...fbLines, r.anRaw?.f3 ? { x: r.anRaw.f3, label: `F3 ${r.anRaw.f3.toFixed(0)}`, color: C.b } : null].filter(Boolean),
      caption: `SPL at 1 m with ${r.powerPerUnit.toFixed(0)} W per ${ds.isobaric ? 'pair' : 'sub'}${ds.hp.order ? ` and the ${ds.hp.fc} Hz subsonic filter` : ''}. The in-vehicle curve adds cabin gain for a ${units.fmtLen(r.vehicle?.cabinLength || 0)} cabin (rises ${ds.cabinSlope} dB/oct below ${r.cabinLen ? P.cabinCorner(r.cabinLen).toFixed(0) : '—'} Hz).`,
    });
    case 'maxspl': return freqChart({
      freqs: f, yUnit: 'dB SPL', yFloor: Math.max(...s.splMax) - 40,
      series: [{ name: 'Max in vehicle', color: C.a, values: s.splMax, fill: true }, { name: 'Max outdoors', color: C.b, values: s.splMax.map((v, i) => v - (s.splCabin[i] - s.spl[i])), dash: '6 4' }],
      vLines: fbLines,
      caption: `The loudest each frequency can play before hitting either the subs' rated power (${r.drv.rmsPower} W) or Xmax (${(r.drv.xmax * 1000).toFixed(1)} mm), whichever comes first. Dips show where excursion limits output.`,
    });
    case 'excursion': return freqChart({
      freqs: f, yUnit: 'mm', yMin: 0,
      series: [{ name: 'Peak cone excursion', color: C.a, values: s.excursion, fill: true }],
      hLines: [{ y: r.drv.xmax * 1000, label: `Xmax ${(r.drv.xmax * 1000).toFixed(1)} mm`, color: C.r }, ...(r.sub.xmech ? [{ y: +r.sub.xmech, label: `Xmech ${r.sub.xmech} mm`, color: C.w }] : [])],
      yCeil: r.drv.xmax * 1000 * 3, vLines: fbLines,
      caption: `One-way peak excursion at ${r.powerPerUnit.toFixed(0)} W. Above the red line the coil leaves the gap: distortion rises fast and damage follows. In ported boxes excursion shoots up below tuning, which is what the subsonic filter controls.`,
    });
    case 'port': return r.box.ports.length ? freqChart({
      freqs: f, yUnit: 'm/s', yMin: 0,
      series: [{ name: 'Peak port air speed', color: C.a, values: s.portVel, fill: true }],
      hLines: [{ y: 17, label: '17 m/s: port noise starts', color: C.w }, { y: 26, label: '26 m/s: loud chuffing', color: C.r }],
      vLines: fbLines,
      caption: 'Air speed peaks near the tuning frequency. Keep it under about 17 m/s for clean daily listening; SPL builds often run 25+ m/s. More port area lowers it.',
    }) : h('p', { class: 'muted' }, 'This enclosure has no port.');
    case 'impedance': {
      const z = s.impedance.map((v) => v * r.zScale);
      return h('div', null, freqChart({
        freqs: f, yUnit: 'Ω', yMin: 0, height: 240,
        series: [{ name: `Load the amp sees (${+r.finalZ.toFixed(2)} Ω nominal)`, color: C.a, values: z }],
        hLines: r.amp ? [{ y: r.amp.minOhms, label: `${r.amp.model} minimum ${r.amp.minOhms} Ω`, color: C.r }] : [],
        vLines: fbLines,
        caption: 'Impedance of the whole wired load. Peaks mark resonances (a ported box has two, with the dip between them at the tuning frequency). Measuring this curve with a DATS or similar tool confirms the real tuning.',
      }), freqChart({ freqs: f, yUnit: '° phase', height: 180, series: [{ name: 'Acoustic phase', color: C.b, values: s.phase.map((p) => ((p % 360) + 540) % 360 - 180) }], yMin: -180, yMax: 180 }));
    }
    case 'power': {
      const pX = s.excursion.map((x) => (x > 0 ? r.powerPerUnit * ((r.drv.xmax * 1000) / x) ** 2 : NaN));
      const cap = Math.max(r.drv.rmsPower * 4, r.powerPerUnit * 2);
      return freqChart({
        freqs: f, yUnit: 'W', yMin: 0, yCeil: cap,
        series: [{ name: 'Power that reaches Xmax', color: C.a, values: pX.map((v) => Math.min(v, cap * 1.2)), fill: true }],
        hLines: [{ y: r.drv.rmsPower, label: `Sub rated ${r.drv.rmsPower} W`, color: C.w }, ...(r.ampAt?.power ? [{ y: r.ampAt.power / r.ds.n, label: `Amp per sub ${(r.ampAt.power / r.ds.n).toFixed(0)} W`, color: C.r }] : [])],
        vLines: fbLines,
        caption: 'Where the orange curve drops below a line, that much power would push the cone past Xmax at that frequency. Includes your subsonic filter.',
      });
    }
    case 'delay': return freqChart({
      freqs: f, yUnit: 'ms', series: [{ name: 'Group delay', color: C.a, values: s.groupDelay }],
      hLines: [{ y: 20, label: '≈20 ms: tightness starts to suffer', color: C.w }], yFloor: -5, yCeil: 120,
      caption: 'How late each frequency arrives. Sealed boxes stay low; ported and bandpass boxes rise near tuning. Big peaks sound like "one-note" or late bass.',
    });
    case 'cabin': {
      const gain = f.map((x) => P.cabinGainDb(x, r.cabinLen || (r.vehicle?.cabinLength || 100) * P.IN, ds.cabinSlope));
      return h('div', null, freqChart({
        freqs: f, yUnit: 'dB', yMin: 0,
        series: [{ name: `${r.vehicle?.model || 'Vehicle'} cabin gain`, color: C.a, values: gain, fill: true }],
        caption: `Small closed spaces boost low frequencies. This model rises ${ds.cabinSlope} dB per octave below the cabin's first mode. Leaky cabins (soft tops, open windows) get less; sealed small cabs get more.`,
      }), numField({ id: 'ds-cs', label: 'Cabin gain slope', unit: 'dB/oct', value: ds.cabinSlope, step: 1, min: 0, max: 18, onChange: (v) => setDs({ cabinSlope: Math.max(0, Math.min(18, v ?? 12)) }) }));
    }
  }
  return h('div');
}
function viewCard(r) {
  const ov = orbitView(r.box, r.ds, r.sub, app.orbit);
  // keep the camera where the person left it across re-renders
  const st = ov._state;
  const keep = () => { app.orbit = { yaw: st.yaw, pitch: st.pitch, xray: st.xray, finish: st.finish }; };
  ov.addEventListener('pointerup', keep); ov.addEventListener('click', keep); ov.addEventListener('change', keep); ov.addEventListener('keyup', keep);
  return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, '360° view'), h('span', { class: 'muted small' }, 'Drag to spin it any direction. X-ray shows ports and dividers.')), ov);
}

// ---------------------------------------------------------------- saved designs
async function saveCurrent() {
  const ds = app.ds;
  if (!ds.id) ds.id = uid('d');
  try { await saveDesign(ds); local.set('bw.draft', ds); toast(storeState.db && storeState.uid ? 'Saved to your designs.' : 'Saved in this browser.', 'good'); }
  catch { toast('Could not save. Check your connection and try again.', 'bad'); }
}
function savedView() {
  const list = allDesigns();
  const wrap = h('div', null, h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'Saved'), h('h1', null, 'Your designs')),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: saveCurrent }, 'Save current design'))),
    h('p', { class: 'muted' }, storeState.db && storeState.uid ? 'Designs saved here are private to you and follow you to any device you open this page on.' : 'Designs are saved in this browser.'));
  if (!list.length) { wrap.append(h('div', { class: 'card empty' }, h('h3', null, 'No saved designs yet'), h('p', null, 'Build a box on the Design tab and press "Save design". It will show up here.'))); return wrap; }
  wrap.append(h('div', { class: 'lib-grid' }, list.map((d) => {
    const s = getSub(d.subId);
    return h('article', { class: 'card lib-card' },
      h('h3', null, d.name || 'Untitled'),
      h('p', { class: 'muted small' }, `${d.n} × ${s?.brand || ''} ${s?.model || ''} · ${G.BOX_TYPES[d.type]?.label || d.type}`),
      h('p', { class: 'muted small' }, d.updatedAt ? `Saved ${new Date(d.updatedAt).toLocaleString()}` : ''),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-sm primary', onclick: () => loadDesign(d) }, 'Open'),
        h('button', { class: 'btn btn-sm', onclick: () => { const c = { ...d, id: uid('d'), name: `${d.name} copy` }; saveDesign(c).then(() => toast('Copied.')); } }, 'Duplicate'),
        h('button', { class: 'btn btn-sm danger', onclick: async () => { await deleteDesign(d.id); toast('Deleted.'); render(); } }, 'Delete')));
  })));
  return wrap;
}

// ---------------------------------------------------------------- boot
async function boot() {
  shell();
  $('#view').append(h('div', { class: 'card' }, h('p', null, 'Loading the subwoofer, amplifier and vehicle libraries…')));
  await initStore();
  recompute();
  window.addEventListener('hashchange', route);
  let storeTimer = null;
  const onStore = () => {
    clearTimeout(storeTimer);
    // wait for a dialog that is closing after a save; never redraw the page under an open dialog
    storeTimer = setTimeout(() => {
      if (document.querySelector('.modal-wrap')) { storeTimer = setTimeout(onStore, 400); return; }
      recompute();
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (app.view !== 'design' || !typing) render(); else renderResults();
    }, 60);
  };
  onStoreChange(onStore);
  route();
}
boot();
