// AI design assistant: chat that can read and change the design through page tools.
import { h, clear, toast } from './ui.js';
import { getSample, errorText, aiDisabled } from './ai.js';
import { app, setDs, go } from './app.js';
import { summaryText, applyFactory, bandpassDims } from './model.js';
import { allSubs, allAmps, allVehicles, getSub } from './store.js';
import * as G from './geometry.js';

const RULES = `You are the built-in assistant of EnclosureIQ, a car-audio subwoofer enclosure designer. You talk with someone designing a sub box for their vehicle.
You can read and change their design with the tools. When they describe what they want ("two 12s ported in my crew cab", "make it fit my trunk", "lower the tuning"), do it with update_design and the other tools, then explain the result in plain words using the numbers the tool returns (size, volume, tuning, F3, excursion, port speed, fit, warnings).
Rules:
- Only use subwoofer, amplifier and vehicle ids returned by search_library. If what they want is not in the library, say so and suggest adding it on the Subwoofers / Amplifiers / Vehicles pages (those pages can import a manual or look specs up).
- Volumes are cubic feet per sub, dimensions are inches, tuning in Hz.
- After changes, check the returned warnings and fit; fix problems if you can (for example resize to the space, change port area) and say what you changed.
- Be honest about limits: simulations are estimates; vehicle sizes marked typical must be measured.
- Answer general car-audio questions (wiring, gain setting, amps, building) directly and practically.
- Keep replies short: a few sentences or a short list.`;

const DESIGN_KEYS = {
  name: 'string', type: 'sealed | ported | bp4 | bp6p | bp6s | bp6q | bp8s | ib', shape: 'rect | wedge', slope: 'back | front (which face is angled on a wedge)',
  mount: 'front | rear | up | down (firing direction)', blowThrough: 'boolean', subId: 'id from search_library(subs)', n: 'number of subs 1-8', isobaric: 'boolean',
  vehicleId: 'id from search_library(vehicles)', locationId: 'location id within the vehicle', ampId: 'id from search_library(amps) or null', useAmpPower: 'boolean (simulate with amp power)',
  power: 'watts RMS per sub when not using amp power', wiringZ: 'final load in ohms (must be one of the wiring options)', vnet: 'net cu ft per sub (sealed/ported)', fb: 'port tuning Hz (ported)',
  h: 'external height in', d: 'external depth in (bottom depth for wedge)', dTop: 'top depth for wedge', w: 'external width in (only used when lockWidth is true)', lockWidth: 'boolean',
  t: 'material thickness in (0.5, 0.625, 0.75, 1)', baffleLayers: '1-3', braceVol: 'cu ft', 'port': '{kind: slot|round|aero, w: slot width in, dia: round port diameter in, count}',
  chambers: 'bandpass only: array (rear first) of {vol: cu ft per sub, port: {fb, kind, dia, w, count} or null for sealed}', ibVol: 'trunk cu ft for free air',
  hp: '{order: 0|2|4, fc: Hz} subsonic filter', lp: '{order: 0|2|4, fc: Hz} low-pass', cabin: 'boolean cabin gain',
};

function resultBrief() {
  const r = app.res;
  return {
    summary: summaryText(r),
    wiringOptions: r.wiring.map((w) => ({ ohms: +w.z.toFixed(3), how: w.ways[0], ampWatts: r.amp ? null : undefined })),
    fit: r.fit ? { fits: r.fit.fits, checks: r.fit.checks.map((c) => `${c.ok ? 'OK' : 'FAIL'} ${c.label}: ${typeof c.have === 'number' ? c.have.toFixed(2) : c.have} vs ${typeof c.need === 'number' ? c.need.toFixed(2) : c.need}`) } : null,
    warnings: r.box.warnings, notes: r.box.notes,
  };
}
const TOOLS = [
  { name: 'get_design', description: 'Returns the current design: vehicle, subs, enclosure, dimensions, volumes, ports, simulated results, wiring options, vehicle fit and warnings.', execute: () => ({ fields: pick(app.ds), ...resultBrief() }) },
  { name: 'search_library', description: 'Search the subwoofer, amplifier or vehicle library. Returns ids and key specs (subs include factory box recommendations; vehicles include install locations with ids and sizes).',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['subs', 'amps', 'vehicles'] }, query: { type: 'string', description: 'brand, model, body style, words' }, size: { type: 'number', description: 'sub size in inches' } }, required: ['kind'] },
    execute: (inp) => {
      const q = String(inp.query || '').toLowerCase().split(/\s+/).filter(Boolean);
      const match = (o) => q.every((w) => JSON.stringify(o).toLowerCase().includes(w));
      if (inp.kind === 'subs') return allSubs().filter((s) => (!inp.size || +s.size === +inp.size) && match([s.brand, s.model, s.series, s.size])).slice(0, 15).map((s) => ({ id: s.id, brand: s.brand, model: s.model, size: s.size, rms: s.rms, coils: `${s.coils}x${s.coilOhms}ohm`, fs: s.fs, qts: s.qts, vas_L: s.vas, xmax_mm: s.xmax, mountDepth_in: s.mountDepth, factory: s.factory }));
      if (inp.kind === 'amps') return allAmps().filter((a) => match([a.brand, a.model, a.series])).slice(0, 15).map((a) => ({ id: a.id, brand: a.brand, model: a.model, powerByOhms: a.power, minOhms: a.minOhms, fuse: a.fuse }));
      return allVehicles().filter((v) => match([v.make, v.model, v.body, v.category, v.years, `${v.doors}-door`])).slice(0, 15).map((v) => ({ id: v.id, name: `${v.years || ''} ${v.make || ''} ${v.model}`.trim(), category: v.category, body: v.body, doors: v.doors, typicalSizes: !!v.typical, locations: v.locations }));
    } },
  { name: 'update_design', description: `Change any design fields and re-run the simulation. Returns the updated results. Fields: ${JSON.stringify(DESIGN_KEYS)}`,
    inputSchema: { type: 'object', properties: { patch: { type: 'object', description: 'fields to change' } }, required: ['patch'] },
    execute: (inp) => {
      const patch = typeof inp.patch === 'object' && inp.patch ? { ...inp.patch } : {};
      for (const k of Object.keys(patch)) if (!(k in DESIGN_KEYS)) delete patch[k];
      if (patch.subId && !allSubs().find((s) => s.id === patch.subId)) throw new Error(`Unknown subId ${patch.subId}. Use search_library first.`);
      if (patch.ampId && !allAmps().find((a) => a.id === patch.ampId)) throw new Error(`Unknown ampId ${patch.ampId}.`);
      if (patch.vehicleId) { const v = allVehicles().find((x) => x.id === patch.vehicleId); if (!v) throw new Error(`Unknown vehicleId ${patch.vehicleId}.`); if (!patch.locationId) patch.locationId = v.locations?.[0]?.id; }
      if (patch.port) patch.port = { ...app.ds.port, ...patch.port };
      if (patch.hp) patch.hp = { ...app.ds.hp, ...patch.hp };
      if (patch.lp) patch.lp = { ...app.ds.lp, ...patch.lp };
      if (patch.type && patch.type !== app.ds.type && !patch.chambers) patch.chambers = null;
      if (patch.type && G.BOX_TYPES[patch.type] && !G.BOX_TYPES[patch.type].shapes.includes(patch.shape || app.ds.shape)) patch.shape = G.BOX_TYPES[patch.type].shapes[0];
      if (patch.chambers) patch.chambers = patch.chambers.map((c, i) => ({ role: G.bandpassTemplate(patch.type || app.ds.type)[i]?.role || `Chamber ${i + 1}`, vol: +c.vol || 1, port: c.port ? { to: G.bandpassTemplate(patch.type || app.ds.type)[i]?.port?.to ?? 'out', kind: 'round', dia: 4, w: 2, count: 1, k: 0.732, ...c.port } : null }));
      if (patch.subId || patch.n || patch.isobaric !== undefined) patch.wiringZ = patch.wiringZ ?? null;
      const nextType = patch.type || app.ds.type;
      if (nextType.startsWith('bp')) { const dims = bandpassDims({ ...app.ds, ...patch }, getSub(patch.subId || app.ds.subId)); if (patch.h == null) patch.h = dims.h; if (patch.d == null) patch.d = dims.d; }
      setDs(patch, true);
      return { applied: Object.keys(patch), ...resultBrief() };
    } },
  { name: 'apply_factory_box', description: "Load the current sub's manufacturer-recommended box (sealed, ported or 4th order bandpass) if the library has it.",
    inputSchema: { type: 'object', properties: { which: { type: 'string', enum: ['sealed', 'ported', 'bp4'] } }, required: ['which'] },
    execute: (inp) => { const sub = getSub(app.ds.subId); const p = applyFactory(app.ds, sub, inp.which); if (!Object.keys(p).length) throw new Error('No factory recommendation of that kind for this sub.'); setDs(p, true); return { applied: Object.keys(p), ...resultBrief() }; } },
  { name: 'fit_box_to_space', description: 'Resize the box height/depth (and wedge angle) to the selected vehicle install location, leaving 1/2 inch clearance. Width then follows the volume.',
    execute: () => { const loc = app.res.loc; if (!loc) throw new Error('No vehicle location selected.'); const clr = 0.5; const p = { h: loc.h - clr, lockWidth: false }; if (loc.shape === 'wedge' && !app.ds.type.startsWith('bp')) Object.assign(p, { shape: 'wedge', slope: 'back', d: loc.d - clr, dTop: (loc.dTop ?? loc.d) - clr }); else p.d = loc.d - clr; setDs(p, true); return resultBrief(); } },
  { name: 'open_page', description: 'Show a page to the person: design, plans (build plans, cut list, PDF), subwoofers, amplifiers, vehicles, guides.',
    inputSchema: { type: 'object', properties: { page: { type: 'string', enum: ['design', 'plans', 'subwoofers', 'amplifiers', 'vehicles', 'guides'] } }, required: ['page'] },
    execute: (inp) => { go(inp.page); return 'opened'; } },
];
function pick(ds) { const o = {}; for (const k of Object.keys(DESIGN_KEYS)) o[k] = ds[k]; return o; }

// ---------------------------------------------------------------- UI
let panel = null;
const chat = { turns: [], busy: false, ctl: null };
export function assistantButton() {
  const b = h('button', { class: 'btn ai-btn', onclick: () => openAssistant() }, h('span', { class: 'ai-dot', 'aria-hidden': 'true' }), 'AI assistant');
  getSample().then((s) => { if (!s) b.hidden = true; });
  return b;
}
export function openAssistant(prefill = '') {
  if (!panel) panel = buildPanel();
  document.body.append(panel.el);
  panel.el.hidden = false;
  if (prefill) panel.input.value = prefill;
  setTimeout(() => panel.input.focus(), 50);
}
function buildPanel() {
  const log = h('div', { class: 'ai-log', 'aria-live': 'polite' });
  const input = h('textarea', { id: 'ai-input', rows: 2, placeholder: 'Tell me what you want: "Two 10s sealed under my crew cab seat"…', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
  const sendBtn = h('button', { class: 'btn primary', onclick: () => send() }, 'Send');
  const stopBtn = h('button', { class: 'btn', hidden: true, onclick: () => chat.ctl?.abort() }, 'Stop');
  const suggestions = [
    'Design a ported box for my sub that fits my trunk',
    'Make this a sealed box and keep the same size',
    'Which amplifier and wiring should I use?',
    'Why would my port make noise, and how do I fix it?',
    'Put two 12s behind the seat of a full-size extended cab truck',
  ];
  const sugg = h('div', { class: 'chips' }, suggestions.map((s) => h('button', { class: 'chip', onclick: () => { input.value = s; send(); } }, s)));
  const el = h('aside', { class: 'ai-panel', role: 'dialog', 'aria-label': 'AI assistant' },
    h('div', { class: 'ai-head' }, h('div', null, h('h2', null, 'AI assistant'), h('p', { class: 'muted small' }, 'Sees your design and can change it. Answers are estimates; check before you cut.')),
      h('button', { class: 'icon-btn', 'aria-label': 'Close assistant', onclick: () => { el.hidden = true; } }, '✕')),
    log, h('div', { class: 'ai-foot' }, chat.turns.length ? null : sugg, h('div', { class: 'ai-input-row' }, input, h('div', { class: 'btn-col' }, sendBtn, stopBtn))));
  const addMsg = (role, text) => {
    const body = h('div', { class: 'ai-text' });
    renderText(body, text);
    const m = h('div', { class: `ai-msg ai-${role}` }, body);
    log.append(m); log.scrollTop = log.scrollHeight;
    return body;
  };
  const toolNote = (txt) => { const n = h('div', { class: 'ai-tool' }, txt); log.append(n); log.scrollTop = log.scrollHeight; };
  async function send() {
    const text = input.value.trim();
    if (!text || chat.busy) return;
    const sample = await getSample();
    if (!sample || aiDisabled()) { toast('AI is not available in this view. Open the page on claude.ai to use it.', 'bad'); return; }
    sugg.remove();
    input.value = '';
    addMsg('user', text);
    chat.turns.push({ role: 'user', content: text });
    chat.busy = true; sendBtn.disabled = true; stopBtn.hidden = false;
    const out = addMsg('assistant', 'Thinking…');
    chat.ctl = new AbortController();
    const lim = await sample.limits().catch(() => null);
    const canTools = !!lim?.tools;
    const tools = canTools ? TOOLS.map((t) => ({ ...t, execute: async (inp, ctx) => {
      const label = { get_design: 'Reading your design', search_library: `Searching ${inp?.kind || 'library'}`, update_design: 'Updating the design', apply_factory_box: 'Loading the factory box', fit_box_to_space: 'Fitting the box to the space', open_page: `Opening ${inp?.page}` }[t.name] || t.name;
      toolNote(`${label}…`);
      return t.execute(inp || {}, ctx);
    } })) : undefined;
    const context = canTools ? RULES : `${RULES}\n(Tools are unavailable in this view; answer from this design summary and do not claim to change anything.)\n\nCURRENT DESIGN\n${summaryText(app.res)}`;
    const recent = chat.turns.slice(-12);
    try {
      const { text: reply } = await sample([{ role: 'user', content: context }, ...recent], {
        signal: chat.ctl.signal, tools, ...(tools ? {} : { cache: false }),
        onText: ({ text: t }) => { renderText(out, t); log.scrollTop = log.scrollHeight; },
      });
      chat.turns.push({ role: 'assistant', content: reply });
    } catch (e) {
      if (e?.text) renderText(out, e.text + (e.code === 'cancelled' ? '' : `\n\n(${errorText(e)})`));
      else renderText(out, errorText(e));
      if (e?.text) chat.turns.push({ role: 'assistant', content: e.text });
    } finally { chat.busy = false; sendBtn.disabled = false; stopBtn.hidden = true; }
  }
  return { el, input };
}
/** Minimal, safe markdown: paragraphs, "- " bullets, **bold**. */
function renderText(el, text) {
  clear(el);
  const blocks = String(text).split(/\n{2,}/);
  blocks.forEach((b) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
      const ul = h(/^\s*\d+\./.test(lines[0]) ? 'ol' : 'ul');
      lines.forEach((l) => ul.append(inline(h('li'), l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))));
      el.append(ul);
    } else el.append(inline(h('p'), lines.join('\n')));
  });
}
function inline(node, s) {
  s.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) node.append(h('b', null, part.slice(2, -2)));
    else node.append(document.createTextNode(part));
  });
  return node;
}
