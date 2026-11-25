// AI design assistant: chat that can read and change the design through page tools.
import { h, clear, toast } from './ui.js';
import { getSample, errorText, aiDisabled, aiAvailable, remoteAI } from './ai.js';
import { callAI } from './ai-remote.js';
import { cloud } from './auth.js';
import { signInDialog } from './account.js';
import { ASSISTANT_RULES as RULES, DESIGN_KEYS, TOOL_SPECS } from './ai-prompts.js';
import { app, setDs, go } from './app.js';
import { summaryText, applyFactory, bandpassDims } from './model.js';
import { allSubs, allAmps, allVehicles, getSub } from './store.js';
import * as G from './geometry.js';

function resultBrief() {
  const r = app.res;
  return {
    summary: summaryText(r),
    wiringOptions: r.wiring.map((w) => ({ ohms: +w.z.toFixed(3), how: w.ways[0], ampWatts: r.amp ? null : undefined })),
    fit: r.fit ? { fits: r.fit.fits, checks: r.fit.checks.map((c) => `${c.ok ? 'OK' : 'FAIL'} ${c.label}: ${typeof c.have === 'number' ? c.have.toFixed(2) : c.have} vs ${typeof c.need === 'number' ? c.need.toFixed(2) : c.need}`) } : null,
    warnings: r.box.warnings, notes: r.box.notes,
  };
}
const RUN = {
  get_design: () => ({ fields: pick(app.ds), ...resultBrief() }),
  search_library: (inp) => {
    const q = String(inp.query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const match = (o) => q.every((w) => JSON.stringify(o).toLowerCase().includes(w));
    if (inp.kind === 'subs') return allSubs().filter((s) => (!inp.size || +s.size === +inp.size) && match([s.brand, s.model, s.series, s.size])).slice(0, 15).map((s) => ({ id: s.id, brand: s.brand, model: s.model, size: s.size, rms: s.rms, coils: `${s.coils}x${s.coilOhms}ohm`, fs: s.fs, qts: s.qts, vas_L: s.vas, xmax_mm: s.xmax, mountDepth_in: s.mountDepth, factory: s.factory }));
    if (inp.kind === 'amps') return allAmps().filter((a) => match([a.brand, a.model, a.series])).slice(0, 15).map((a) => ({ id: a.id, brand: a.brand, model: a.model, powerByOhms: a.power, minOhms: a.minOhms, fuse: a.fuse }));
    return allVehicles().filter((v) => match([v.make, v.model, v.body, v.category, v.years, `${v.doors}-door`])).slice(0, 15).map((v) => ({ id: v.id, name: `${v.years || ''} ${v.make || ''} ${v.model}`.trim(), category: v.category, body: v.body, doors: v.doors, typicalSizes: !!v.typical, locations: v.locations }));
  },
  update_design: (inp) => {
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
  },
  apply_factory_box: (inp) => { const sub = getSub(app.ds.subId); const p = applyFactory(app.ds, sub, inp.which); if (!Object.keys(p).length) throw new Error('No factory recommendation of that kind for this sub.'); setDs(p, true); return { applied: Object.keys(p), ...resultBrief() }; },
  fit_box_to_space: () => { const loc = app.res.loc; if (!loc) throw new Error('No vehicle location selected.'); const clr = 0.5; const p = { h: loc.h - clr, lockWidth: false }; if (loc.shape === 'wedge' && !app.ds.type.startsWith('bp')) Object.assign(p, { shape: 'wedge', slope: 'back', d: loc.d - clr, dTop: (loc.dTop ?? loc.d) - clr }); else p.d = loc.d - clr; setDs(p, true); return resultBrief(); },
  open_page: (inp) => { go(inp.page); return 'opened'; },
};
const TOOLS = TOOL_SPECS.map((t) => ({ ...t, execute: RUN[t.name] }));
const toolLabel = (name, inp) => ({ get_design: 'Reading your design', search_library: `Searching ${inp?.kind || 'library'}`, update_design: 'Updating the design', apply_factory_box: 'Loading the factory box', fit_box_to_space: 'Fitting the box to the space', open_page: `Opening ${inp?.page}` }[name] || name);
/** The last part of the conversation, starting at a person's message so every tool call keeps its result. */
function recentMessages(msgs, max = 40) {
  if (msgs.length <= max) return msgs;
  for (let i = msgs.length - max; i < msgs.length; i++) if (msgs[i].role === 'user') return msgs.slice(i);
  return msgs.slice(-1);
}
function pick(ds) { const o = {}; for (const k of Object.keys(DESIGN_KEYS)) o[k] = ds[k]; return o; }

// ---------------------------------------------------------------- UI
let panel = null;
const chat = { turns: [], msgs: [], busy: false, ctl: null };
export function assistantButton() {
  const b = h('button', { class: 'btn ai-btn', onclick: () => openAssistant() }, h('span', { class: 'ai-dot', 'aria-hidden': 'true' }), 'AI assistant');
  aiAvailable().then((ok) => { if (!ok) b.hidden = true; });
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
    if (remoteAI()) {
      if (!cloud.user) { signInDialog('Sign in to use the AI assistant. It is free for signed-in people, with a daily limit.'); return; }
      return sendRemote(text);
    }
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
      toolNote(`${toolLabel(t.name, inp)}…`);
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
  // Website: the AI server decides, the page runs the tools it asks for, then the server continues.
  async function sendRemote(text) {
    sugg.remove();
    input.value = '';
    addMsg('user', text);
    chat.msgs.push({ role: 'user', content: text });
    chat.busy = true; sendBtn.disabled = true; stopBtn.hidden = false;
    const out = addMsg('assistant', 'Thinking…');
    chat.ctl = new AbortController();
    let shown = '';
    const show = (t) => { renderText(out, (shown + t).trim() || 'Thinking…'); log.scrollTop = log.scrollHeight; };
    try {
      for (let step = 0; step < 8; step++) {
        const res = await callAI('assistant', { messages: recentMessages(chat.msgs) }, { signal: chat.ctl.signal, onText: ({ text: t }) => show(t) });
        const msgs = Array.isArray(res.messages) ? res.messages : [{ role: 'assistant', content: res.text || '' }];
        chat.msgs.push(...msgs);
        if (res.text) { shown += `${res.text}\n\n`; show(''); }
        const calls = msgs.flatMap((m) => (m.role === 'assistant' && Array.isArray(m.content) ? m.content.filter((c) => c.type === 'tool-call') : []));
        if (!calls.length) break;
        const results = [];
        for (const c of calls) {
          toolNote(`${toolLabel(c.toolName, c.input)}…`);
          let output;
          try {
            const run = RUN[c.toolName];
            if (!run) throw new Error(`Unknown tool ${c.toolName}`);
            const value = await run(c.input || {});
            output = { type: 'json', value: JSON.parse(JSON.stringify(value ?? null)) };
          } catch (e) { output = { type: 'error-text', value: String(e?.message || e) }; }
          results.push({ type: 'tool-result', toolCallId: c.toolCallId, toolName: c.toolName, output });
        }
        chat.msgs.push({ role: 'tool', content: results });
        if (step === 7) { shown += '(Stopped after several steps. Ask me to continue if needed.)'; show(''); }
      }
      if (!shown.trim()) renderText(out, 'Done.');
    } catch (e) {
      if (e?.code === 'signin') signInDialog('Your sign-in has expired. Sign in again to keep using the assistant.');
      const partial = (shown + (e?.text || '')).trim();
      renderText(out, partial ? partial + (e?.code === 'cancelled' ? '' : `\n\n(${errorText(e)})`) : errorText(e));
      // keep the history valid: drop a trailing assistant tool request that never got its results
      const last = chat.msgs[chat.msgs.length - 1];
      if (last?.role === 'assistant' && Array.isArray(last.content) && last.content.some((c) => c.type === 'tool-call')) chat.msgs.pop();
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
