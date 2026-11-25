// Drawings: 360° orbit view, orthographic blueprint views, panel details, sheet layouts, type icons.
import { h, esc, fracIn, units } from './ui.js';

export const SCREEN_PAL = {
  ink: 'var(--ink)', ink2: 'var(--ink-2)', line: 'var(--line)', dim: 'var(--blue)', accent: 'var(--accent)',
  mdf: 'var(--mdf)', mdfEdge: 'var(--mdf-edge)', paper: 'var(--surface)', hole: 'var(--hole)', port: 'var(--port)',
};
export const PRINT_PAL = {
  ink: '#1c1e21', ink2: '#5b5f66', line: '#c9c5bb', dim: '#1f5f99', accent: '#d9480f',
  mdf: '#e9d8b9', mdfEdge: '#b08a58', paper: '#ffffff', hole: '#3a3d42', port: '#6b4b2a',
};
const L = (v) => (units.metric ? `${Math.round(v * 25.4)}` : fracIn(v) + '"');

// =====================================================================
// 3D orbit view
// =====================================================================
const FINISH = {
  mdf: { base: [201, 168, 122], name: 'Raw MDF' },
  carpet: { base: [42, 44, 48], name: 'Black carpet' },
  gray: { base: [118, 121, 126], name: 'Gray carpet' },
  red: { base: [150, 32, 36], name: 'Red vinyl' },
};
export const FINISHES = Object.entries(FINISH).map(([value, f]) => ({ value, label: f.name }));

function buildModel(box, ds, sub) {
  const faces = []; // {pts:[[x,y,z]], kind, fill?, opacity?, deco?:[]}
  const { w: W, h: H } = box.ext;
  const t = box.t;
  if (box.shape === 'board') {
    const T = box.ext.d;
    const quad = (a, b, c, d, kind) => faces.push({ pts: [a, b, c, d], kind });
    quad([0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0], 'front');
    quad([0, 0, T], [0, H, T], [W, H, T], [W, 0, T], 'back');
    quad([0, 0, 0], [0, 0, T], [W, 0, T], [W, 0, 0], 'edge');
    quad([0, H, 0], [W, H, 0], [W, H, T], [0, H, T], 'edge');
    quad([0, 0, 0], [0, H, 0], [0, H, T], [0, 0, T], 'edge');
    quad([W, 0, 0], [W, 0, T], [W, H, T], [W, H, 0], 'edge');
    faces[0].face = { origin: [0, 0, -0.02], u: [1, 0, 0], v: [0, 1, 0] };
    return { faces, center: [W / 2, H / 2, T / 2], inner: [] };
  }
  const prof = box.outer; // [z, y]
  const P3 = (x, [z, y]) => [x, y, z];
  faces.push({ pts: prof.map((p) => P3(0, p)).reverse(), kind: 'side' });
  faces.push({ pts: prof.map((p) => P3(W, p)), kind: 'side' });
  const names = ['bottom', 'back', 'top', 'front'];
  prof.forEach((p, i) => {
    const q = prof[(i + 1) % prof.length];
    faces.push({ pts: [P3(0, p), P3(0, q), P3(W, q), P3(W, p)], kind: names[i] });
  });
  // front face basis: from bottom-front corner upward along the front edge
  const p0 = prof[0], p3 = prof[3];
  const len = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  const v = [0, (p3[1] - p0[1]) / len, (p3[0] - p0[0]) / len];
  const front = faces.find((f) => f.kind === 'front');
  front.face = { origin: [0, p0[1], p0[0] - 0.02], u: [1, 0, 0], v };
  // interior (x-ray)
  const inner = [];
  const D = box.ext.d;
  const ip = box.inner;
  if (ds.type.startsWith('bp')) {
    box.chambers.slice(0, -1).forEach((ch, i) => {
      const x0 = ch.z1, x1 = ch.z1 + t;
      inner.push({ pts: ip.map((p) => P3(x0, p)), kind: 'divider' });
      inner.push({ pts: ip.map((p) => P3(x1, p)).reverse(), kind: 'divider' });
      if (i === 0) {
        inner.push({ pts: ip.map((p) => P3(x1 + 0.02, p)), kind: 'ghost', face: { origin: [x1 + 0.03, t, box.tb], u: [0, 0, 1], v: [0, 1, 0] }, driverDeco: true });
      }
    });
  }
  const slot = box.ports.find((p) => p.kind === 'slot');
  box.ports.forEach((p) => {
    if (p.kind === 'slot' && p.layout) {
      const ch = box.chambers[p.chamber];
      const xWall = ds.type.startsWith('bp') ? ch.z1 - p.w - t : t + p.w;
      const yb = t, yt = H - t;
      const zA = box.tb + p.layout.wallA;
      inner.push(...slab([xWall, yb, 0], [xWall + t, yt, ds.type.startsWith('bp') ? zA : zA + 0], 'portwall'));
      if (p.layout.legs === 2) {
        const zb1 = D - t - p.w - t, zb0 = D - t - p.w;
        inner.push(...slab([xWall, yb, zb1], [t + p.w + p.layout.wallB + t, yt, zb0], 'portwall'));
      }
    } else if (p.kind !== 'slot') {
      // tube along +z from the front face, or along +x through a divider
      const items = box.face.items.filter((it) => it.kind === 'port' && it.port === box.ports.indexOf(p));
      const r = p.dia / 2 + 0.125;
      if (p.to === 'out') items.forEach((it) => inner.push(...tube([it.x, it.y, 0], [0, 0, 1], r, p.length + box.tb, 'tube')));
      else {
        const ch = box.chambers[p.chamber];
        inner.push(...tube([ch.z1 + t, H / 2, box.tb + box.intD * 0.85], [-1, 0, 0], r, p.length, 'tube'));
      }
    }
  });
  return { faces, inner, center: [W / 2, H / 2, D / 2] };
}
function slab([x0, y0, z0], [x1, y1, z1], kind) {
  const q = (a, b, c, d) => ({ pts: [a, b, c, d], kind });
  return [
    q([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]),
    q([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]),
    q([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]),
    q([x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]),
    q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]),
  ];
}
function tube(c, dir, r, len, kind) {
  const n = 10, out = [];
  const a = Math.abs(dir[2]) > 0.5 ? [1, 0, 0] : [0, 0, 1];
  const b = [0, 1, 0];
  const ring = (off) => Array.from({ length: n }, (_, i) => {
    const th = (i / n) * Math.PI * 2;
    return [0, 1, 2].map((k) => c[k] + dir[k] * off + (a[k] * Math.cos(th) + b[k] * Math.sin(th)) * r);
  });
  const r0 = ring(0), r1 = ring(len);
  for (let i = 0; i < n; i++) out.push({ pts: [r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i]], kind });
  return out;
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function decoFor(face, box, ds, sub, onDivider) {
  // driver + port graphics in face coordinates → list of {pts3d, fill}
  const out = [];
  const { origin, u, v } = face;
  const at = (fx, fy) => [0, 1, 2].map((k) => origin[k] + u[k] * fx + v[k] * fy);
  const circle = (fx, fy, r, fill, sq) => {
    const pts = [];
    if (sq) { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => pts.push(at(fx + a * r, fy + b * r))); }
    else for (let i = 0; i < 28; i++) { const th = (i / 28) * Math.PI * 2; pts.push(at(fx + Math.cos(th) * r, fy + Math.sin(th) * r)); }
    out.push({ pts, fill });
  };
  const od = sub.overallDia || (sub.cutout || 11) + 1.4;
  const sq = sub.shape === 'square';
  box.face.items.forEach((it) => {
    if (!!it.onDivider !== !!onDivider) return;
    if (it.kind === 'driver') {
      circle(it.x, it.y, od / 2, 'frame', sq);
      circle(it.x, it.y, od / 2 - 0.55, 'surround', sq);
      circle(it.x, it.y, od / 2 - 1.3, 'cone', sq);
      circle(it.x, it.y, od * 0.16, 'cap', false);
    } else if (it.kind === 'port') {
      circle(it.x, it.y, it.d / 2 + 0.35, 'flare', false);
      circle(it.x, it.y, it.d / 2, 'hole', false);
    } else if (it.kind === 'slot') {
      const x0 = it.x - it.w / 2, x1 = it.x + it.w / 2, y0 = it.y - it.h / 2, y1 = it.y + it.h / 2;
      out.push({ pts: [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)], fill: 'hole' });
    }
  });
  return out;
}

/** Interactive 360° orbit view. Drag to rotate in any direction, scroll or pinch-buttons to zoom. */
export function orbitView(box, ds, sub, opts = {}) {
  const state = { yaw: opts.yaw ?? -32, pitch: opts.pitch ?? 22, zoom: 1, xray: opts.xray ?? ds.type.startsWith('bp'), finish: opts.finish || 'carpet', spin: false };
  const svgHost = h('div', { class: 'orbit-canvas', tabindex: '0', 'aria-label': 'Enclosure 3D view. Drag or use arrow keys to rotate.' });
  const model = box.ext ? buildModel(box, ds, sub) : null;
  let raf = null;
  const render = () => {
    if (!model) { svgHost.innerHTML = ''; return; }
    const Wp = Math.max(280, svgHost.clientWidth || 520), Hp = Math.round(Math.min(420, Math.max(260, Wp * 0.62)));
    svgHost.innerHTML = isoMarkup(model, box, ds, sub, state, Wp, Hp);
  };
  // interaction: drag rotates freely, full 360° in yaw and over the top/bottom in pitch
  let drag = null;
  svgHost.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch }; svgHost.setPointerCapture(e.pointerId); stopSpin(); });
  svgHost.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.yaw = drag.yaw + (e.clientX - drag.x) * 0.6;
    state.pitch = Math.max(-90, Math.min(90, drag.pitch + (e.clientY - drag.y) * 0.5));
    readout(); render();
  });
  const end = () => { drag = null; };
  svgHost.addEventListener('pointerup', end); svgHost.addEventListener('pointercancel', end);
  svgHost.addEventListener('wheel', (e) => { e.preventDefault(); state.zoom = Math.max(0.5, Math.min(2.5, state.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); render(); }, { passive: false });
  svgHost.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
    if (!k) return; e.preventDefault(); state.yaw += k[0]; state.pitch = Math.max(-90, Math.min(90, state.pitch + k[1])); readout(); render();
  });
  const angle = h('span', { class: 'orbit-angle' });
  const readout = () => { angle.textContent = `${Math.round(((state.yaw % 360) + 360) % 360)}° around · ${Math.round(state.pitch)}° tilt`; };
  const stopSpin = () => { state.spin = false; spinBtn.setAttribute('aria-pressed', 'false'); spinBtn.textContent = 'Auto-spin'; if (raf) cancelAnimationFrame(raf); raf = null; };
  const startSpin = () => {
    state.spin = true; spinBtn.setAttribute('aria-pressed', 'true'); spinBtn.textContent = 'Stop spin';
    let last = performance.now();
    const step = (now) => { if (!state.spin || !svgHost.isConnected) return; state.yaw += (now - last) * 0.045; last = now; readout(); render(); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  };
  const spinBtn = h('button', { class: 'btn btn-sm', 'aria-pressed': 'false', onclick: () => (state.spin ? stopSpin() : startSpin()) }, 'Auto-spin');
  const view = (yaw, pitch) => () => { stopSpin(); state.yaw = yaw; state.pitch = pitch; readout(); render(); };
  const xrayBtn = h('button', { class: 'btn btn-sm', 'aria-pressed': String(state.xray), onclick: (e) => { state.xray = !state.xray; e.currentTarget.setAttribute('aria-pressed', String(state.xray)); render(); } }, 'X-ray');
  const finishSel = h('select', { class: 'mini-select', 'aria-label': 'Finish', onchange: (e) => { state.finish = e.target.value; render(); } }, FINISHES.map((f) => h('option', { value: f.value, selected: f.value === state.finish }, f.label)));
  const controls = h('div', { class: 'orbit-controls' },
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-sm', onclick: view(0, 0) }, 'Front'),
      h('button', { class: 'btn btn-sm', onclick: view(90, 0) }, 'Side'),
      h('button', { class: 'btn btn-sm', onclick: view(180, 0) }, 'Back'),
      h('button', { class: 'btn btn-sm', onclick: view(0, 90) }, 'Top'),
      h('button', { class: 'btn btn-sm', onclick: view(-32, 22) }, '3/4'),
      spinBtn, xrayBtn, finishSel,
      h('button', { class: 'btn btn-sm', 'aria-label': 'Zoom in', onclick: () => { state.zoom = Math.min(2.5, state.zoom * 1.15); render(); } }, '+'),
      h('button', { class: 'btn btn-sm', 'aria-label': 'Zoom out', onclick: () => { state.zoom = Math.max(0.5, state.zoom / 1.15); render(); } }, '−')),
    angle);
  const wrap = h('div', { class: 'orbit' }, svgHost, controls);
  let lastW = 0;
  const ro = new ResizeObserver(() => { const w = svgHost.clientWidth; if (Math.abs(w - lastW) > 2) { lastW = w; render(); } });
  ro.observe(svgHost);
  readout();
  requestAnimationFrame(render);
  wrap._state = state;
  return wrap;
}

/** Static SVG markup of the orbit view (also used for the PDF). */
export function isoMarkup(model, box, ds, sub, state, Wp, Hp, opts = {}) {
    const yaw = (state.yaw * Math.PI) / 180, pitch = (-state.pitch * Math.PI) / 180; // positive tilt looks down on the top
  // orientation of the box in the vehicle (firing direction)
  const pre = (p) => {
    const c = model.center; let [x, y, z] = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    if (ds.mount === 'up') [y, z] = [-z, y];
    else if (ds.mount === 'down') [y, z] = [z, -y];
    else if (ds.mount === 'rear') [x, z] = [-x, -z];
    return [x, y, z];
  };
  const rot = (p) => {
    let [x, y, z] = pre(p);
    [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
    return [x, y, z];
  };
  const { w, h: hh, d } = box.ext;
  const rad = 0.5 * Math.hypot(w, hh, d);
  const sc = (Math.min(Wp, Hp) * 0.44 * state.zoom) / rad;
  const prj = (p) => [Wp / 2 + p[0] * sc, Hp / 2 - p[1] * sc];
  const fin = FINISH[state.finish].base;
  const light = norm([-0.35, 0.75, -0.55]);
  const polys = [];
  const pushFace = (f, opacity, isSolid) => {
    const r = f.pts.map(rot);
    const n = norm(cross(sub3(r[2], r[0]), sub3(r[1], r[0]))); // outward normal
    const depth = r.reduce((s, p) => s + p[2], 0) / r.length;
    // faces were wound CCW seen from outside; facing the camera means normal.z < 0 (camera looks +z)
    const facing = n[2] < 0;
    if (isSolid && !facing && !state.xray) return;
    const lit = 0.5 + 0.5 * Math.max(0, -dot(n, light) * (facing ? 1 : -1));
    const col = f.kind === 'divider' ? [200, 200, 205] : f.kind === 'portwall' ? [214, 180, 130] : f.kind === 'tube' ? [70, 74, 80] : f.kind === 'ghost' ? null : fin;
    const fill = col ? `rgb(${col.map((c) => Math.round(c * lit)).join(',')})` : 'none';
    polys.push({ depth, d: r.map((p) => prj(p).map((v) => v.toFixed(1)).join(',')).join(' '), fill, opacity, stroke: f.kind === 'ghost' ? 'none' : 'rgba(0,0,0,0.35)' });
    if (f.face && (facing || state.xray)) {
      const decos = decoFor(f.face, box, ds, sub, f.driverDeco);
      decos.forEach((dc, k) => {
        const rr = dc.pts.map(rot);
        const colr = { frame: [55, 58, 62], surround: [28, 29, 31], cone: [44, 46, 50], cap: [70, 73, 78], hole: [10, 10, 12], flare: [60, 62, 66] }[dc.fill];
        const shade = 0.6 + 0.4 * lit;
        polys.push({ depth: depth - 0.001 * (k + 1), d: rr.map((p) => prj(p).map((v) => v.toFixed(1)).join(',')).join(' '), fill: `rgb(${colr.map((c) => Math.round(c * shade)).join(',')})`, opacity: f.kind === 'ghost' ? 0.9 : opacity, stroke: 'none' });
      });
    }
  };
  model.faces.forEach((f) => pushFace(f, state.xray ? 0.28 : 1, true));
  if (state.xray) model.inner.forEach((f) => pushFace(f, f.kind === 'ghost' ? 1 : 0.85, false));
  polys.sort((a, b) => b.depth - a.depth);
  // dimension labels along three edges
  const lbl = (a, b, text) => {
    const m = rot([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    const [x, y] = prj(m);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="o-dim" ${opts.inline ? 'font-size="12" font-family="Helvetica, Arial, sans-serif" fill="#1f5f99"' : ''} text-anchor="middle">${esc(text)}</text>`;
  };
  const T = box.shape === 'board' ? box.ext.d : d;
  const labels = [
    lbl([0, -1.2, -1.2], [w, -1.2, -1.2], `W ${L(w)}`),
    lbl([-1.4, 0, -1.2], [-1.4, hh, -1.2], `H ${L(hh)}`),
    lbl([w + 1.4, -1.2, 0], [w + 1.4, -1.2, T], `D ${L(T)}`),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wp} ${Hp}" width="${Wp}" height="${Hp}" role="img" aria-label="3D view of the enclosure">
    <ellipse cx="${Wp / 2}" cy="${Hp * 0.9}" rx="${Wp * 0.3}" ry="${Hp * 0.04}" class="o-shadow" ${opts.inline ? 'fill="#000" fill-opacity="0.12"' : ''}/>
    ${polys.map((p) => `<polygon points="${p.d}" fill="${p.fill}" fill-opacity="${p.opacity}" stroke="${p.stroke}" stroke-width="0.8" stroke-linejoin="round"/>`).join('')}
    ${labels.join('')}</svg>`;
  }

export function isoSnapshot(box, ds, sub, st = {}, Wp = 900, Hp = 560) {
  if (!box.ext) return '';
  const model = buildModel(box, ds, sub);
  return isoMarkup(model, box, ds, sub, { yaw: -32, pitch: 22, zoom: 1, xray: ds.type.startsWith('bp'), finish: 'mdf', ...st }, Wp, Hp, { inline: true });
}

// =====================================================================
// Orthographic blueprint views
// =====================================================================
function arrowDefs(id, pal) {
  return `<defs><marker id="${id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="${pal.dim}"/></marker></defs>`;
}
function dimLine(x1, y1, x2, y2, off, label, pal, mid, vertical) {
  // dimension between two points with an offset perpendicular to the measured direction
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * off, ny = dx / len * off;
  const a = [x1 + nx, y1 + ny], b = [x2 + nx, y2 + ny];
  const tx = (a[0] + b[0]) / 2 + (nx ? Math.sign(nx) * 4 : 0), ty = (a[1] + b[1]) / 2 + (ny ? Math.sign(ny) * 4 : 0);
  const rotDeg = vertical ? -90 : (Math.atan2(dy, dx) * 180) / Math.PI;
  const r = Math.abs(rotDeg) > 90 ? rotDeg + 180 : rotDeg;
  return `<g class="dimension">
    <line x1="${x1}" y1="${y1}" x2="${a[0]}" y2="${a[1]}" stroke="${pal.dim}" stroke-width="0.6" opacity="0.7"/>
    <line x1="${x2}" y1="${y2}" x2="${b[0]}" y2="${b[1]}" stroke="${pal.dim}" stroke-width="0.6" opacity="0.7"/>
    <line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${pal.dim}" stroke-width="0.9" marker-start="url(#${mid})" marker-end="url(#${mid})"/>
    <text x="${tx}" y="${ty}" fill="${pal.dim}" font-size="11" font-family="IBM Plex Mono, ui-monospace, monospace" text-anchor="middle" dominant-baseline="${ny > 0 ? 'hanging' : 'auto'}" transform="rotate(${r} ${tx} ${ty})" paint-order="stroke" stroke="${pal.paper}" stroke-width="3">${esc(label)}</text>
  </g>`;
}

/** Returns {front, side, top} SVG strings. */
export function orthoViews(box, ds, sub, pal = SCREEN_PAL, px = 360) {
  if (!box.ext) return {};
  const { w: W, h: H, d: D, dTop: Dt } = box.ext;
  const t = box.t;
  const od = sub.overallDia || (sub.cutout || 11) + 1.4;
  const cut = sub.cutout || od - 1.4;
  const sq = sub.shape === 'square';
  const id = 'a' + Math.random().toString(36).slice(2, 8);
  const pad = 46;
  const mk = (vw, vh, body, title) => {
    const s = (px - 2 * pad) / Math.max(vw, vh);
    const cw = vw * s + 2 * pad, ch = vh * s + 2 * pad + 18;
    return { s, open: `<svg viewBox="0 0 ${cw.toFixed(0)} ${ch.toFixed(0)}" width="${cw.toFixed(0)}" height="${ch.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, system-ui, sans-serif">${arrowDefs(id, pal)}<rect width="100%" height="100%" fill="${pal.paper}"/><text x="${pad}" y="18" fill="${pal.ink}" font-size="12" font-weight="600" letter-spacing="1">${esc(title)}</text><g transform="translate(${pad} ${pad + 10})">`, close: '</g></svg>', body };
  };
  const views = {};
  const isBoard = box.shape === 'board';
  // FRONT
  {
    const fh = H;
    const v = mk(W, fh, '', isBoard ? 'BAFFLE BOARD — FRONT' : 'FRONT VIEW');
    const s = v.s;
    let g = `<rect x="0" y="0" width="${W * s}" height="${fh * s}" fill="${pal.mdf}" stroke="${pal.ink}" stroke-width="1.4"/>`;
    if (!isBoard) g += `<rect x="${t * s}" y="${t * s}" width="${(W - 2 * t) * s}" height="${(fh - 2 * t) * s}" fill="none" stroke="${pal.ink2}" stroke-width="0.6" stroke-dasharray="4 3"/>`;
    const items = box.face.items.filter((it) => !it.onDivider);
    items.forEach((it) => {
      const cx = it.x * s, cy = (fh - it.y) * s;
      if (it.kind === 'driver') {
        if (sq) g += `<rect x="${cx - od / 2 * s}" y="${cy - od / 2 * s}" width="${od * s}" height="${od * s}" fill="${pal.hole}" fill-opacity="0.12" stroke="${pal.ink}" stroke-width="1"/><rect x="${cx - cut / 2 * s}" y="${cy - cut / 2 * s}" width="${cut * s}" height="${cut * s}" fill="none" stroke="${pal.accent}" stroke-width="1.2" stroke-dasharray="5 3"/>`;
        else g += `<circle cx="${cx}" cy="${cy}" r="${od / 2 * s}" fill="${pal.hole}" fill-opacity="0.12" stroke="${pal.ink}" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${cut / 2 * s}" fill="none" stroke="${pal.accent}" stroke-width="1.2" stroke-dasharray="5 3"/>`;
        g += `<line x1="${cx - 5}" y1="${cy}" x2="${cx + 5}" y2="${cy}" stroke="${pal.ink}" stroke-width="0.8"/><line x1="${cx}" y1="${cy - 5}" x2="${cx}" y2="${cy + 5}" stroke="${pal.ink}" stroke-width="0.8"/>`;
      } else if (it.kind === 'port') g += `<circle cx="${cx}" cy="${cy}" r="${it.d / 2 * s}" fill="${pal.hole}" fill-opacity="0.8" stroke="${pal.ink}"/>`;
      else if (it.kind === 'slot') g += `<rect x="${(it.x - it.w / 2) * s}" y="${(fh - it.y - it.h / 2) * s}" width="${it.w * s}" height="${it.h * s}" fill="${pal.hole}" fill-opacity="0.8" stroke="${pal.ink}"/>`;
    });
    g += dimLine(0, fh * s, W * s, fh * s, 22, `W ${L(W)}`, pal, id);
    g += dimLine(0, 0, 0, fh * s, 22, `H ${L(fh)}`, pal, id, true);
    const drv = items.filter((it) => it.kind === 'driver');
    if (drv[0]) {
      const c = drv[0];
      g += dimLine(0, 0, c.x * s, 0, -16, `${L(c.x)} to center`, pal, id);
      g += `<text x="${c.x * s}" y="${(fh - c.y) * s + (od / 2) * s + 13}" font-size="10" fill="${pal.accent}" text-anchor="middle" font-family="IBM Plex Mono, monospace">cutout ${esc(sq ? '□ ' : 'Ø')}${esc(L(cut))}</text>`;
    }
    if (drv.length > 1) g += dimLine(drv[0].x * s, fh * s, drv[1].x * s, fh * s, 40, `${L(drv[1].x - drv[0].x)} c-c`, pal, id);
    const slot = items.find((it) => it.kind === 'slot');
    if (slot) g += `<text x="${slot.x * s}" y="${-6}" font-size="10" fill="${pal.ink2}" text-anchor="middle">port ${esc(L(slot.w))}</text>`;
    views.front = v.open + g + v.close;
  }
  if (isBoard) return views;
  // SIDE
  {
    const v = mk(D, H, '', ds.type.startsWith('bp') ? 'SIDE VIEW' : 'SIDE VIEW (LEFT)');
    const s = v.s;
    const toSv = (pts) => pts.map(([z, y]) => `${(z * s).toFixed(1)},${((H - y) * s).toFixed(1)}`).join(' ');
    let g = `<polygon points="${toSv(box.outer)}" fill="${pal.mdf}" stroke="${pal.ink}" stroke-width="1.4"/>`;
    g += `<polygon points="${toSv(box.inner)}" fill="${pal.paper}" fill-opacity="0.6" stroke="${pal.ink2}" stroke-width="0.7" stroke-dasharray="4 3"/>`;
    // driver profile (motor depth) for front-firing boxes
    if (!ds.type.startsWith('bp')) {
      const md = sub.mountDepth || 6, mot = sub.motorDia || 5;
      const fy = (H / 2);
      const z0 = box.tb, x = (zz, yy) => `${(zz * s).toFixed(1)},${((H - yy) * s).toFixed(1)}`;
      g += `<polygon points="${x(z0, fy - od / 2 + 0.4)} ${x(z0 + md * 0.55, fy - mot / 2)} ${x(z0 + md, fy - mot / 2)} ${x(z0 + md, fy + mot / 2)} ${x(z0 + md * 0.55, fy + mot / 2)} ${x(z0, fy + od / 2 - 0.4)}" fill="${pal.hole}" fill-opacity="0.15" stroke="${pal.ink2}" stroke-width="0.8"/>`;
      g += `<text x="${(z0 + md + 0.4) * s}" y="${(H - fy) * s + 4}" font-size="10" fill="${pal.ink2}" font-family="IBM Plex Mono, monospace">${esc(L(md))} deep</text>`;
    }
    g += dimLine(0, H * s, D * s, H * s, 22, `D ${L(D)}`, pal, id);
    g += dimLine(D * s, 0, D * s, H * s, -22, `H ${L(H)}`, pal, id, true);
    if (box.shape === 'wedge') {
      const topZ0 = ds.slope === 'front' ? D - Dt : 0;
      g += dimLine(topZ0 * s, 0, (topZ0 + Dt) * s, 0, -16, `top ${L(Dt)}`, pal, id);
      const ang = (Math.atan((D - Dt) / H) * 180) / Math.PI;
      g += `<text x="${(ds.slope === 'front' ? (D - Dt) / 2 : (D + Dt) / 2) * s}" y="${H * s / 2}" font-size="11" fill="${pal.accent}" text-anchor="middle" font-family="IBM Plex Mono, monospace">${ang.toFixed(1)}°</text>`;
    }
    views.side = v.open + g + v.close;
  }
  // TOP (section at mid height)
  {
    const v = mk(W, D, '', 'TOP SECTION');
    const s = v.s;
    const zb = (ds.shape === 'wedge' ? (D + Dt) / 2 : D); // depth at mid-height for wedges
    const zFront = box.shape === 'wedge' && ds.slope === 'front' ? (D - Dt) / 2 : 0;
    const zBack = box.shape === 'wedge' && ds.slope !== 'front' ? zb : D;
    let g = `<rect x="0" y="${zFront * s}" width="${W * s}" height="${(zBack - zFront) * s}" fill="${pal.mdf}" stroke="${pal.ink}" stroke-width="1.4"/>`;
    g += `<rect x="${t * s}" y="${(zFront + box.tb) * s}" width="${(W - 2 * t) * s}" height="${(zBack - zFront - t - box.tb) * s}" fill="${pal.paper}" stroke="${pal.ink2}" stroke-width="0.7"/>`;
    const slotPorts = box.ports.filter((p) => p.kind === 'slot' && p.layout);
    slotPorts.forEach((p) => {
      const ch = box.chambers[p.chamber];
      const xw = ds.type.startsWith('bp') ? ch.z1 - p.w - t : t + p.w;
      const chx = ds.type.startsWith('bp') ? ch.z1 - p.w : t;
      g += `<rect x="${chx * s}" y="${zFront * s}" width="${p.w * s}" height="${(box.tb + p.layout.wallA + (p.layout.legs === 2 ? p.w : 0)) * s}" fill="${pal.port}" fill-opacity="0.22"/>`;
      g += `<rect x="${xw * s}" y="${zFront * s}" width="${t * s}" height="${(box.tb + p.layout.wallA) * s}" fill="${pal.mdf}" stroke="${pal.ink}" stroke-width="0.8"/>`;
      if (p.layout.legs === 2) {
        const zb1 = zBack - t - p.w;
        g += `<rect x="${t * s}" y="${zb1 * s}" width="${(p.w + p.layout.wallB + t) * s}" height="${p.w * s}" fill="${pal.port}" fill-opacity="0.22"/>`;
        g += `<rect x="${xw * s}" y="${(zb1 - t) * s}" width="${(p.layout.wallB + t) * s}" height="${t * s}" fill="${pal.mdf}" stroke="${pal.ink}" stroke-width="0.8"/>`;
      }
      g += `<text x="${(chx + p.w / 2) * s}" y="${(zFront + box.tb + 2) * s}" font-size="10" fill="${pal.port}" text-anchor="middle" font-family="IBM Plex Mono, monospace" transform="rotate(90 ${(chx + p.w / 2) * s} ${(zFront + box.tb + 2) * s})">port ${esc(L(p.length))}</text>`;
    });
    box.ports.filter((p) => p.kind !== 'slot').forEach((p, k) => {
      const items = box.face.items.filter((it) => it.kind === 'port' && it.port === box.ports.indexOf(p));
      if (p.to === 'out') items.forEach((it) => { g += `<rect x="${(it.x - p.dia / 2) * s}" y="${zFront * s}" width="${p.dia * s}" height="${(p.length + box.tb) * s}" fill="${pal.port}" fill-opacity="0.25" stroke="${pal.port}" stroke-width="0.8"/>`; });
      else { const ch = box.chambers[p.chamber]; g += `<rect x="${(ch.z1 - p.length) * s}" y="${(zFront + box.tb + box.intD * 0.85 - p.dia / 2) * s}" width="${p.length * s}" height="${p.dia * s}" fill="${pal.port}" fill-opacity="0.25" stroke="${pal.port}" stroke-width="0.8"/>`; }
    });
    if (ds.type.startsWith('bp')) {
      box.chambers.forEach((ch, i) => {
        if (i < box.chambers.length - 1) g += `<rect x="${ch.z1 * s}" y="${(zFront + box.tb) * s}" width="${t * s}" height="${(zBack - zFront - t - box.tb) * s}" fill="${pal.mdf}" stroke="${pal.ink}" stroke-width="0.8"/>`;
        g += `<text x="${((ch.z0 + ch.z1) / 2) * s}" y="${((zFront + zBack) / 2) * s}" font-size="10" fill="${pal.ink}" text-anchor="middle" font-family="IBM Plex Mono, monospace">${esc(units.fmtVol(ch.net))}</text>`;
      });
      const d0 = box.chambers[0];
      const md = sub.mountDepth || 6;
      box.face.items.filter((it) => it.onDivider).forEach((it) => {
        g += `<rect x="${(d0.z1 - md) * s}" y="${(zFront + box.tb + it.x - od / 2) * s}" width="${(md + t) * s}" height="${od * s}" fill="${pal.hole}" fill-opacity="0.15" stroke="${pal.ink2}" stroke-width="0.8" stroke-dasharray="3 2"/>`;
      });
    } else {
      const md = sub.mountDepth || 6;
      box.face.items.filter((it) => it.kind === 'driver').forEach((it) => {
        g += `<rect x="${(it.x - (sub.motorDia || 5) / 2) * s}" y="${(zFront + box.tb) * s}" width="${(sub.motorDia || 5) * s}" height="${md * s}" fill="${pal.hole}" fill-opacity="0.15" stroke="${pal.ink2}" stroke-width="0.8" stroke-dasharray="3 2"/>`;
      });
    }
    g += dimLine(0, zBack * s, W * s, zBack * s, 22, `W ${L(W)}`, pal, id);
    views.top = v.open + g + v.close;
  }
  return views;
}

/** Drawing of one panel with its cutouts and hole-center dimensions. */
export function panelSvg(p, pal = SCREEN_PAL, px = 300) {
  const pad = 34;
  const a = p.a, b = p.b;
  const s = (px - 2 * pad) / Math.max(a, b);
  const cw = a * s + 2 * pad, ch = b * s + 2 * pad;
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  let g = '';
  if (p.shape === 'trap') {
    const { bottom, top, height, slope } = p.trap;
    const pts = slope === 'front' ? [[0, 0], [bottom, 0], [bottom, height], [bottom - top, height]] : [[0, 0], [bottom, 0], [top, height], [0, height]];
    g += `<polygon points="${pts.map(([x, y]) => `${x * s},${(b - y) * s}`).join(' ')}" fill="${pal.mdf}" stroke="${pal.ink}" stroke-width="1.2"/>`;
    g += dimLine(0, b * s, bottom * s, b * s, 16, L(bottom), pal, id);
    const tx0 = slope === 'front' ? bottom - top : 0;
    g += dimLine(tx0 * s, 0, (tx0 + top) * s, 0, -14, L(top), pal, id);
  } else {
    g += `<rect x="0" y="0" width="${a * s}" height="${b * s}" fill="${pal.mdf}" stroke="${pal.ink}" stroke-width="1.2"/>`;
    g += dimLine(0, b * s, a * s, b * s, 16, L(a), pal, id);
    g += dimLine(a * s, 0, a * s, b * s, -16, L(b), pal, id, true);
  }
  (p.cut || []).forEach((c) => {
    const x = c.x * s, y = (b - c.y) * s;
    if (c.kind === 'driver') {
      const r = ((c.cutout || 11) / 2) * s;
      g += c.square
        ? `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${pal.paper}" stroke="${pal.accent}" stroke-width="1.2" stroke-dasharray="5 3"/>`
        : `<circle cx="${x}" cy="${y}" r="${r}" fill="${pal.paper}" stroke="${pal.accent}" stroke-width="1.2" stroke-dasharray="5 3"/>`;
      g += `<line x1="${x - 6}" y1="${y}" x2="${x + 6}" y2="${y}" stroke="${pal.ink}" stroke-width="0.8"/><line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke="${pal.ink}" stroke-width="0.8"/>`;
    } else if (c.kind === 'port') g += `<circle cx="${x}" cy="${y}" r="${(c.d / 2) * s}" fill="${pal.paper}" stroke="${pal.ink}"/>`;
    else if (c.kind === 'slot') g += `<rect x="${(c.x - c.w / 2) * s}" y="${(b - c.y - c.h / 2) * s}" width="${c.w * s}" height="${c.h * s}" fill="${pal.paper}" stroke="${pal.ink}"/>`;
  });
  return `<svg viewBox="0 0 ${cw.toFixed(0)} ${ch.toFixed(0)}" width="${cw.toFixed(0)}" height="${ch.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, system-ui, sans-serif">${arrowDefs(id, pal)}<rect width="100%" height="100%" fill="${pal.paper}"/><g transform="translate(${pad} ${pad})">${g}</g></svg>`;
}
export function panelHoles(p, sub) {
  const od = sub.overallDia || (sub.cutout || 11) + 1.4;
  return (p.cut || []).map((c) => ({ ...c, cutout: c.kind === 'driver' ? sub.cutout || od - 1.4 : null, square: sub.shape === 'square' }));
}

/** One 4×8 sheet with nested parts. */
export function sheetSvg(sheetData, sheet, pal = SCREEN_PAL, px = 640, idx = 0) {
  const s = (px - 20) / sheet.w;
  const cw = sheet.w * s + 20, ch = sheet.h * s + 20;
  let g = `<rect x="0" y="0" width="${sheet.w * s}" height="${sheet.h * s}" fill="${pal.paper}" stroke="${pal.ink}" stroke-width="1.2" stroke-dasharray="${sheetData.oversize ? '6 4' : ''}"/>`;
  sheetData.parts.forEach((p, i) => {
    const x = p.x * s, y = p.y * s, w = Math.min(p.w, sheet.w) * s, hh = Math.min(p.h, sheet.h) * s;
    g += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${pal.mdf}" stroke="${pal.mdfEdge}" stroke-width="1"/>`;
    if (w > 46 && hh > 22) {
      g += `<text x="${x + 5}" y="${y + 14}" font-size="10" fill="${pal.ink}" font-weight="600">${esc(shortName(p.name))}</text>`;
      g += `<text x="${x + 5}" y="${y + 26}" font-size="9.5" fill="${pal.ink2}" font-family="IBM Plex Mono, monospace">${esc(L(p.w))} × ${esc(L(p.h))}</text>`;
    }
  });
  return `<svg viewBox="0 0 ${cw.toFixed(0)} ${ch.toFixed(0)}" width="${cw.toFixed(0)}" height="${ch.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Sans, system-ui, sans-serif"><rect width="100%" height="100%" fill="${pal.paper}"/><g transform="translate(10 10)">${g}</g></svg>`;
}
const shortName = (n) => n.replace(/\s*\(.*\)$/, '').replace('Extra baffle layer', 'Baffle layer');

// =====================================================================
// Box-type icons (schematic cross-sections)
// =====================================================================
export function typeIcon(type) {
  const drv = (x, y, dir = 1) => `<path d="M${x} ${y - 7} L${x + 4 * dir} ${y - 4} L${x + 4 * dir} ${y + 4} L${x} ${y + 7} Z" fill="currentColor" opacity="0.85"/>`;
  const box = (x, y, w, hh) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="none" stroke="currentColor" stroke-width="2"/>`;
  const gap = (x, y, hh) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + hh}" stroke="var(--surface)" stroke-width="3.2"/>`;
  const tube = (x1, y, x2) => `<line x1="${x1}" y1="${y - 3}" x2="${x2}" y2="${y - 3}" stroke="currentColor" stroke-width="1.4"/><line x1="${x1}" y1="${y + 3}" x2="${x2}" y2="${y + 3}" stroke="currentColor" stroke-width="1.4"/>`;
  const div = (x, y, hh) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + hh}" stroke="currentColor" stroke-width="2"/>`;
  let b = '';
  switch (type) {
    case 'sealed': b = box(14, 6, 36, 28) + gap(14, 13, 14) + drv(14, 20, 1); break;
    case 'ported': b = box(14, 6, 36, 28) + gap(14, 12, 12) + drv(14, 18, 1) + gap(14, 27, 5) + tube(14, 29.5, 30); break;
    case 'bp4': b = box(8, 6, 48, 28) + div(26, 6, 28) + gap(26, 13, 14) + drv(26, 20, 1) + gap(56, 17, 6) + tube(44, 20, 56); break;
    case 'bp6p': b = box(8, 6, 48, 28) + div(30, 6, 28) + gap(30, 13, 14) + drv(30, 20, 1) + gap(56, 17, 6) + tube(46, 20, 56) + gap(8, 17, 6) + tube(8, 20, 18); break;
    case 'bp6s': b = box(8, 6, 48, 28) + div(28, 6, 28) + gap(28, 8, 12) + drv(28, 14, 1) + gap(28, 26, 6) + tube(18, 29, 28) + gap(56, 17, 6) + tube(46, 20, 56); break;
    case 'bp6q': b = box(4, 6, 56, 28) + div(20, 6, 28) + div(42, 6, 28) + gap(20, 13, 14) + drv(20, 20, 1) + gap(42, 17, 6) + tube(36, 20, 42) + gap(60, 17, 6) + tube(52, 20, 60); break;
    case 'bp8s': b = box(4, 6, 56, 28) + div(22, 6, 28) + div(42, 6, 28) + gap(22, 8, 12) + drv(22, 14, 1) + gap(22, 26, 6) + tube(14, 29, 22) + gap(42, 17, 6) + tube(36, 20, 42) + gap(60, 17, 6) + tube(52, 20, 60); break;
    case 'ib': b = `<line x1="32" y1="4" x2="32" y2="36" stroke="currentColor" stroke-width="3"/>` + drv(32, 20, -1) + `<path d="M36 10 q10 10 0 20" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>`; break;
    default: b = box(14, 6, 36, 28);
  }
  return `<svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true">${b}</svg>`;
}
export function shapeIcon(shape, slope) {
  if (shape === 'wedge') return slope === 'front'
    ? `<svg viewBox="0 0 40 30" width="40" height="30" aria-hidden="true"><polygon points="4,26 36,26 36,4 18,4" fill="none" stroke="currentColor" stroke-width="2"/></svg>`
    : `<svg viewBox="0 0 40 30" width="40" height="30" aria-hidden="true"><polygon points="4,26 36,26 22,4 4,4" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  return `<svg viewBox="0 0 40 30" width="40" height="30" aria-hidden="true"><rect x="4" y="4" width="32" height="22" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}
export const svgEl = (str) => { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstChild; };
