// DOM helpers, units, modal, toast. All text from data goes through textContent.

export function h(tag, attrs, ...kids) {
  const svgTags = /^(svg|g|path|line|rect|circle|polygon|polyline|text|defs|marker|ellipse|tspan|pattern|clipPath|use)$/;
  const el = svgTags.test(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  appendKids(el, kids);
  return el;
}
function appendKids(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null);
export const uid = (p = 'c') => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---------- persistence for per-viewer conveniences ----------
export const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};

// ---------- units ----------
export const units = {
  sys: local.get('bw.units', 'imperial'),
  set(s) { this.sys = s; local.set('bw.units', s); },
  get metric() { return this.sys === 'metric'; },
  lenUnit() { return this.metric ? 'mm' : 'in'; },
  volUnit() { return this.metric ? 'L' : 'ft³'; },
  areaUnit() { return this.metric ? 'cm²' : 'in²'; },
  // display value from imperial
  len(v) { return v == null ? null : this.metric ? v * 25.4 : v; },
  vol(v) { return v == null ? null : this.metric ? v * 28.3168 : v; },
  area(v) { return v == null ? null : this.metric ? v * 6.4516 : v; },
  // imperial from display value
  lenIn(v) { return v == null ? null : this.metric ? v / 25.4 : v; },
  volIn(v) { return v == null ? null : this.metric ? v / 28.3168 : v; },
  areaIn(v) { return v == null ? null : this.metric ? v / 6.4516 : v; },
  fmtLen(v, dp) { if (v == null || !isFinite(v)) return '—'; return this.metric ? `${Math.round(v * 25.4)} mm` : `${fracIn(v)}"`; },
  fmtLenDec(v, dp = 2) { if (v == null || !isFinite(v)) return '—'; return this.metric ? `${(v * 25.4).toFixed(0)} mm` : `${v.toFixed(dp)}"`; },
  fmtVol(v, dp = 2) { if (v == null || !isFinite(v)) return '—'; return this.metric ? `${(v * 28.3168).toFixed(1)} L` : `${v.toFixed(dp)} ft³`; },
  fmtArea(v) { if (v == null || !isFinite(v)) return '—'; return this.metric ? `${(v * 6.4516).toFixed(0)} cm²` : `${v.toFixed(1)} in²`; },
  dims(w, h, d) { return this.metric ? `${Math.round(w * 25.4)} × ${Math.round(h * 25.4)} × ${Math.round(d * 25.4)} mm` : `${fracIn(w)}" × ${fracIn(h)}" × ${fracIn(d)}"`; },
};
export function fracIn(v) {
  if (v == null || !isFinite(v)) return '—';
  const neg = v < 0; v = Math.abs(v);
  const r = Math.round(v * 16) / 16;
  const whole = Math.floor(r + 1e-9), frac = Math.round((r - whole) * 16);
  let s;
  if (!frac) s = String(whole);
  else {
    const g = frac % 8 === 0 ? 8 : frac % 4 === 0 ? 4 : frac % 2 === 0 ? 2 : 1;
    s = `${whole ? whole + ' ' : ''}${frac / g}/${16 / g}`;
  }
  return (neg ? '−' : '') + s;
}
export const n1 = (v, dp = 1) => (v == null || !isFinite(v) ? '—' : (+v).toFixed(dp));

// ---------- form fields ----------
let fid = 0;
/** Numeric input bound to an object path. kind: 'len' | 'vol' | 'area' | 'plain'. */
export function numField({ label, value, onChange, kind = 'plain', step = 'any', min, max, unit, hint, id, disabled }) {
  const conv = { len: 'len', vol: 'vol', area: 'area' }[kind];
  const shown = conv ? units[conv](value) : value;
  const u = unit ?? (kind === 'len' ? units.lenUnit() : kind === 'vol' ? units.volUnit() : kind === 'area' ? units.areaUnit() : '');
  const dp = kind === 'len' ? (units.metric ? 0 : 3) : kind === 'vol' ? (units.metric ? 1 : 3) : 4;
  const inputId = id || `f${++fid}`;
  const input = h('input', {
    id: inputId, type: 'number', inputmode: 'decimal', step, min, max, disabled,
    value: shown == null || !isFinite(shown) ? '' : String(+(+shown).toFixed(dp)),
    onchange: (e) => {
      const raw = e.target.value === '' ? null : +e.target.value;
      if (raw != null && !isFinite(raw)) return;
      onChange(raw == null ? null : conv ? units[`${conv}In`](raw) : raw);
    },
  });
  return h('label', { class: 'field', for: inputId },
    h('span', { class: 'field-label' }, label),
    h('span', { class: 'field-input' }, input, u ? h('span', { class: 'field-unit' }, u) : null),
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}
export function textField({ label, value, onChange, placeholder, id, type = 'text', list }) {
  const inputId = id || `f${++fid}`;
  return h('label', { class: 'field', for: inputId },
    h('span', { class: 'field-label' }, label),
    h('span', { class: 'field-input' }, h('input', { id: inputId, type, value: value ?? '', placeholder, list, onchange: (e) => onChange(e.target.value) })));
}
export function selectField({ label, value, options, onChange, id, groups }) {
  const inputId = id || `f${++fid}`;
  const sel = h('select', { id: inputId, onchange: (e) => onChange(e.target.value) });
  const addOpt = (parent, o) => parent.append(h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label));
  if (groups) for (const [g, opts] of groups) { const og = h('optgroup', { label: g }); opts.forEach((o) => addOpt(og, o)); sel.append(og); }
  else options.forEach((o) => addOpt(sel, o));
  return h('label', { class: 'field', for: inputId }, label ? h('span', { class: 'field-label' }, label) : null, h('span', { class: 'field-input' }, sel));
}
export function seg({ value, options, onChange, label, small }) {
  return h('div', { class: `seg${small ? ' seg-sm' : ''}`, role: 'radiogroup', 'aria-label': label },
    options.map((o) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(o.value === value), class: o.value === value ? 'on' : '',
      disabled: o.disabled, title: o.title, onclick: () => onChange(o.value),
    }, o.icon || null, h('span', null, o.label))));
}
export function toggle({ label, checked, onChange, id }) {
  const inputId = id || `f${++fid}`;
  return h('label', { class: 'toggle', for: inputId }, h('input', { id: inputId, type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }), h('span', { class: 'toggle-track' }), h('span', null, label));
}

// ---------- toast & modal ----------
export function toast(msg, kind = 'info') {
  let host = $('#toasts');
  if (!host) { host = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  host.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3800);
}
export function modal({ title, body, actions = [], wide, onClose }) {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
    h('div', { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', { class: `btn ${a.kind || ''}`, onclick: () => a.onClick(close), disabled: a.disabled }, a.label))) : null));
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  setTimeout(() => wrap.querySelector('input,select,textarea,button')?.focus(), 30);
  return { close, el: wrap };
}
export function confirmBox(title, text, okLabel = 'Delete') {
  return new Promise((res) => {
    modal({ title, body: h('p', null, text), actions: [
      { label: 'Cancel', onClick: (c) => { c(); res(false); } },
      { label: okLabel, kind: 'danger', onClick: (c) => { c(); res(true); } },
    ], onClose: () => res(false) });
  });
}
