// Enclosure geometry, sizing, port layout, cut list and sheet nesting.
// Units in this module: inches and cubic feet unless a name says otherwise.
import * as P from './physics.js';

export const IN3_PER_FT3 = 1728;
const toM3 = (ft3) => ft3 * P.FT3;
const sqIn2m = (a) => a * P.IN * P.IN;

export const BOX_TYPES = {
  sealed: { label: 'Sealed', group: 'Direct radiating', shapes: ['rect', 'wedge'] },
  ported: { label: 'Ported (vented)', group: 'Direct radiating', shapes: ['rect', 'wedge'] },
  bp4: { label: '4th order bandpass', group: 'Bandpass', shapes: ['rect'], desc: 'Sealed rear chamber, ported front chamber. Single reflex.' },
  bp6p: { label: '6th order bandpass, parallel (dual reflex)', group: 'Bandpass', shapes: ['rect'], desc: 'Both chambers ported to the outside, each with its own tuning.' },
  bp6s: { label: '6th order bandpass, series tuned', group: 'Bandpass', shapes: ['rect'], desc: 'Rear chamber ports into the front chamber; the front chamber ports out.' },
  bp6q: { label: 'Quasi 6th order (sealed rear, two front chambers)', group: 'Bandpass', shapes: ['rect'], desc: 'Sealed rear; the front chamber ports into a third chamber, which ports out.' },
  bp8s: { label: '8th order bandpass, series', group: 'Bandpass', shapes: ['rect'], desc: 'Three ported chambers in series: rear → front → third → outside.' },
  ib: { label: 'Free air / infinite baffle (trunk as box)', group: 'Other', shapes: ['board'], desc: 'Subs mount on a sealed baffle board; the trunk is the enclosure.' },
};

/** Chamber layout (left to right in the box) for each bandpass type. `to`: 'out' | index of the chamber the port feeds. */
export function bandpassTemplate(type) {
  switch (type) {
    case 'bp4': return [{ role: 'Rear (sealed)', port: null }, { role: 'Front (ported)', port: { to: 'out' } }];
    case 'bp6p': return [{ role: 'Rear (ported out)', port: { to: 'out' } }, { role: 'Front (ported out)', port: { to: 'out' } }];
    case 'bp6s': return [{ role: 'Rear (ports into front)', port: { to: 1 } }, { role: 'Front (ported out)', port: { to: 'out' } }];
    case 'bp6q': return [{ role: 'Rear (sealed)', port: null }, { role: 'Front (ports into 3rd)', port: { to: 2 } }, { role: 'Third (ported out)', port: { to: 'out' } }];
    case 'bp8s': return [{ role: 'Rear (ports into front)', port: { to: 1 } }, { role: 'Front (ports into 3rd)', port: { to: 2 } }, { role: 'Third (ported out)', port: { to: 'out' } }];
    default: return [];
  }
}

/** Reasonable starting chamber volumes (per sub, ft³) and tunings for a driver. */
export function bandpassDefaults(type, drv, sub) {
  const vasFt = drv.vas / P.FT3;
  const f = sub?.factory?.bp4;
  const rearSealed = f?.rear || Math.max(0.4, Math.min(3, P.sealedVolumeForQtc(drv, 0.75) / P.FT3 || vasFt * 0.5));
  const tpl = bandpassTemplate(type);
  const base = {
    bp4: [{ vol: rearSealed }, { vol: f?.front || rearSealed * 2.2, fb: 48 }],
    bp6p: [{ vol: rearSealed * 1.6, fb: 34 }, { vol: rearSealed * 1.4, fb: 62 }],
    bp6s: [{ vol: rearSealed * 1.5, fb: 38 }, { vol: rearSealed * 1.5, fb: 58 }],
    bp6q: [{ vol: rearSealed }, { vol: rearSealed * 1.8, fb: 48 }, { vol: rearSealed * 1.2, fb: 62 }],
    bp8s: [{ vol: rearSealed * 1.5, fb: 36 }, { vol: rearSealed * 1.4, fb: 50 }, { vol: rearSealed * 1.1, fb: 66 }],
  }[type];
  return tpl.map((c, i) => ({
    role: c.role,
    vol: +base[i].vol.toFixed(2),
    port: c.port ? { to: c.port.to, kind: 'round', dia: c.port.to === 'out' ? 4 : 3, w: 2, count: 1, k: 0.732, fb: base[i].fb } : null,
  }));
}

// ---------- 2D polygon helpers (profile plane: z = depth from front, y = height) ----------
function lineIntersect(p1, d1, p2, d2) {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}
/** Inset a CCW convex polygon; offsets[i] applies to edge i (vertex i → i+1). */
export function insetPolygon(pts, offsets) {
  const n = pts.length;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const d = [q[0] - p[0], q[1] - p[1]];
    const len = Math.hypot(d[0], d[1]);
    const nrm = [-d[1] / len, d[0] / len];
    return { p: [p[0] + nrm[0] * offsets[i], p[1] + nrm[1] * offsets[i]], d };
  });
  return pts.map((_, i) => {
    const a = lines[(i - 1 + n) % n], b = lines[i];
    return lineIntersect(a.p, a.d, b.p, b.d);
  });
}
export const polyArea = (pts) => Math.abs(pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
/** Horizontal span [zFront, zBack] of a convex polygon at height y. */
export function spanAt(pts, y) {
  const xs = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    else if (a[1] === y) xs.push(a[0]);
  }
  if (!xs.length) return null;
  return [Math.min(...xs), Math.max(...xs)];
}

/** Outer side profile. Edge order: bottom, back, top, front. */
export function outerProfile(ds) {
  const H = ds.h, D = ds.d, Dt = ds.shape === 'wedge' ? Math.min(ds.dTop ?? D, D) : D;
  if (ds.shape === 'wedge' && ds.slope === 'front') return [[0, 0], [D, 0], [D, H], [D - Dt, H]];
  return [[0, 0], [D, 0], [Dt, H], [0, H]];
}

const portTube = 0.125; // wall thickness assumed for round/aero port tubes, in

// ---------- port sizing ----------
function portGeom(port, intH) {
  if (port.kind === 'slot') {
    const h = port.h || intH;
    const area = port.w * h;
    return { area, deq: 2 * Math.sqrt(area / Math.PI), h, count: 1 };
  }
  const area = Math.PI * port.dia * port.dia / 4;
  return { area, deq: port.dia, h: null, count: port.count || 1 };
}
function portLengthIn(vnetFt3, fb, pg, k) {
  const L = P.portPhysicalLength(toM3(vnetFt3), fb, sqIn2m(pg.area), pg.count, pg.deq * P.IN, k);
  return L / P.IN;
}
/** Displacement (ft³) a port of physical length L takes from the box. */
function portDisplacement(port, pg, L, t, layout) {
  if (L <= 0) return 0;
  if (port.kind === 'slot') {
    const wallLen = layout ? layout.wallA + layout.wallB : L;
    return (port.w * pg.h * L + t * pg.h * wallLen) / IN3_PER_FT3;
  }
  const od = port.dia + 2 * portTube;
  return (Math.PI * od * od / 4) * L * pg.count / IN3_PER_FT3;
}
/** Slot port along the side wall, folding once along the back wall if needed. */
function slotLayout(L, w, intD, intW) {
  const straightMax = intD - w;
  if (L <= straightMax) return { legs: 1, wallA: L, wallB: 0, zEnd: null, fits: true };
  const zEnd = L - intD + w;                 // centerline method
  const fits = zEnd + w <= intW;
  return { legs: 2, wallA: intD - w, wallB: Math.max(0, zEnd - w), zEnd, fits };
}

// ---------- main sizing ----------
/**
 * ds = design state; sub = library entry; drv = deriveDriver(sub) (possibly isobaric).
 * Returns the full geometric model: dims, volumes, ports, driver positions, panels, warnings.
 */
export function computeBox(ds, sub, drv) {
  const t = +ds.t || 0.75;
  const tb = t * Math.max(1, ds.baffleLayers || 1);
  const n = Math.max(1, ds.n || 1);
  const perSubCount = ds.isobaric ? 2 : 1;
  const warnings = [], notes = [];
  const dispEach = (sub.displacement ?? estimateDisplacement(sub)) * perSubCount;
  if (sub.displacement == null) notes.push(`Driver displacement not published; estimated at ${dispEach.toFixed(3)} cu ft per ${ds.isobaric ? 'isobaric pair' : 'sub'}.`);
  const driverDisp = dispEach * n;
  const braceDisp = +ds.braceVol || 0;
  const out = { t, tb, n, warnings, notes, driverDisp, braceDisp, ports: [], chambers: [] };

  if (ds.type === 'ib') return computeIB(ds, sub, drv, out);

  const shape = BOX_TYPES[ds.type].shapes.includes(ds.shape) ? ds.shape : 'rect';
  const dsx = { ...ds, shape };
  const outer = outerProfile(dsx);
  // offsets per edge: bottom, back, top, front (the baffle, possibly several layers)
  const prof = insetPolygon(outer, [t, t, t, tb]);
  const areaIn = polyArea(prof); // in²
  const intH = ds.h - 2 * t;
  const botSpan = spanAt(prof, t + 0.001);
  const intD = botSpan ? botSpan[1] - botSpan[0] : ds.d - t - tb; // at the bottom
  const topSpan = spanAt(prof, ds.h - t - 0.001);
  const intDTop = topSpan ? topSpan[1] - topSpan[0] : intD;
  Object.assign(out, { shape, outer, inner: prof, areaIn, intH, intD, intDTop });
  if (areaIn <= 0 || intH <= 0 || intD <= 0) { warnings.push('Dimensions are too small for the material thickness.'); return finalize(out, ds, sub); }

  if (ds.type === 'sealed' || ds.type === 'ported') {
    const vnetTarget = (+ds.vnet || 1) * n;
    let port = null, pg = null, k = ds.port?.k ?? 0.732;
    if (ds.type === 'ported') {
      port = { ...ds.port };
      if (shape === 'wedge' && ds.slope === 'front' && port.kind === 'slot') port.kind = 'round';
      pg = portGeom(port, intH);
    }
    const portFor = (vnet) => {
      if (!port) return { L: 0, disp: 0, layout: null };
      const L = portLengthIn(vnet, +ds.fb, pg, k);
      const layout = port.kind === 'slot' ? slotLayout(L, port.w, Math.min(intD, intDTop), 1e9) : null;
      return { L, disp: portDisplacement(port, pg, L, t, layout), layout };
    };
    let intW, gross, vnet, pr;
    if (ds.lockWidth) {
      intW = ds.w - 2 * t;
      gross = areaIn * intW / IN3_PER_FT3;
      vnet = gross - driverDisp - braceDisp;
      for (let i = 0; i < 40; i++) { pr = portFor(Math.max(vnet, 0.01)); vnet = gross - driverDisp - braceDisp - pr.disp; }
      vnet = Math.max(vnet, 0.001);
    } else {
      vnet = vnetTarget;
      pr = portFor(vnet);
      gross = vnet + driverDisp + braceDisp + pr.disp;
      intW = gross * IN3_PER_FT3 / areaIn;
    }
    const W = intW + 2 * t;
    out.ext = { w: W, h: ds.h, d: ds.d, dTop: shape === 'wedge' ? Math.min(ds.dTop, ds.d) : ds.d };
    out.intW = intW; out.gross = gross; out.net = vnet; out.portDisp = pr.disp;
    out.chambers = [{ role: 'Main chamber', z0: t, z1: W - t, net: vnet, gross }];
    if (port) {
      const layout = port.kind === 'slot' ? slotLayout(pr.L, port.w, Math.min(intD, intDTop), intW - (port.w + t)) : null;
      const fbActual = pr.L > 0 ? P.tuningFromLength(toM3(vnet), pr.L * P.IN, sqIn2m(pg.area), pg.count, pg.deq * P.IN, k) : null;
      const p = { chamber: 0, to: 'out', kind: port.kind, w: port.w, h: pg.h, dia: port.dia, count: pg.count, area: pg.area, totalArea: pg.area * pg.count, deq: pg.deq, k, fb: +ds.fb, fbActual, length: pr.L, leffM: P.portEffectiveLength(toM3(vnet), +ds.fb, sqIn2m(pg.area * pg.count)), layout };
      out.ports.push(p);
      if (pr.L <= 0.25) warnings.push('Port is shorter than the baffle is thick. Use a smaller port area or tune lower.');
      if (port.kind === 'slot' && layout && !layout.fits) warnings.push(`The ${pr.L.toFixed(1)}" slot port does not fit even with one bend. Make the box wider or deeper, use a narrower slot, or tune higher.`);
      if (port.kind !== 'slot') {
        const clear = Math.max(port.dia / 2, 1);
        if (pr.L > Math.min(intD, intDTop) - clear) warnings.push(`Round port length ${pr.L.toFixed(1)}" is longer than the box depth allows (${(Math.min(intD, intDTop) - clear).toFixed(1)}"). Use a 90° elbow, a slot port, or a deeper box.`);
      }
      const ratio = p.totalArea / vnet;
      if (ratio < 8) notes.push(`Port area is ${ratio.toFixed(1)} sq in per cu ft. Under about 12 risks port noise at high power; check the port air speed graph.`);
    }
  } else if (ds.type.startsWith('bp')) {
    computeBandpass(ds, sub, drv, out, n, driverDisp, braceDisp);
  }
  return finalize(out, ds, sub);
}

function computeBandpass(ds, sub, drv, out, n, driverDisp, braceDisp) {
  const { t, intH, intD, areaIn } = out;
  const tpl = ds.chambers && ds.chambers.length === bandpassTemplate(ds.type).length ? ds.chambers : bandpassDefaults(ds.type, drv, sub);
  let z = t;
  tpl.forEach((ch, i) => {
    const net = (+ch.vol || 0.5) * n;
    let disp = i === 0 ? driverDisp : 0;
    if (i === 0) disp += braceDisp;
    out.chambers.push({ role: ch.role, net, disp, port: ch.port });
  });
  // ports
  tpl.forEach((ch, i) => {
    if (!ch.port) return;
    const port = { ...ch.port };
    if (port.to !== 'out' && port.kind === 'slot') port.kind = 'round';
    const pg = portGeom(port, intH);
    const k = port.k ?? 0.732;
    const vnet = out.chambers[i].net;
    const L = portLengthIn(vnet, +port.fb, pg, k);
    const layout = port.kind === 'slot' ? slotLayout(L, port.w, intD, 1e9) : null;
    const disp = portDisplacement(port, pg, L, t, layout);
    out.chambers[i].disp += disp;
    const fbActual = L > 0 ? P.tuningFromLength(toM3(vnet), L * P.IN, sqIn2m(pg.area), pg.count, pg.deq * P.IN, k) : null;
    out.ports.push({ chamber: i, to: port.to, kind: port.kind, w: port.w, h: pg.h, dia: port.dia, count: pg.count, area: pg.area, totalArea: pg.area * pg.count, deq: pg.deq, k, fb: +port.fb, fbActual, length: L, leffM: P.portEffectiveLength(toM3(vnet), +port.fb, sqIn2m(pg.area * pg.count)), layout, disp });
    if (L <= 0.25) out.warnings.push(`Port in the ${out.chambers[i].role.toLowerCase()} is too short for its area. Reduce the port area or tune lower.`);
  });
  out.chambers.forEach((ch) => {
    ch.gross = ch.net + ch.disp;
    ch.intW = ch.gross * IN3_PER_FT3 / areaIn;
    ch.z0 = z; ch.z1 = z + ch.intW; z = ch.z1 + t;
  });
  const W = z; // last chamber end + outer wall
  out.ext = { w: W, h: ds.h, d: ds.d, dTop: ds.d };
  out.intW = W - 2 * t;
  out.gross = out.chambers.reduce((s, c) => s + c.gross, 0);
  out.net = out.chambers.reduce((s, c) => s + c.net, 0);
  out.portDisp = out.ports.reduce((s, p) => s + (p.disp || 0), 0);
  // port fit checks
  out.ports.forEach((p) => {
    const ch = out.chambers[p.chamber];
    if (p.to === 'out') {
      if (p.kind === 'slot') { if (p.layout && !p.layout.fits) out.warnings.push(`Slot port in the ${ch.role.toLowerCase()} is too long for the chamber.`); }
      else if (p.length > intD - Math.max(p.dia / 2, 1)) out.warnings.push(`Port in the ${ch.role.toLowerCase()} (${p.length.toFixed(1)}") is longer than the box is deep. Use an elbow, a smaller port, or tune higher.`);
    } else if (p.length > ch.intW - Math.max(p.dia / 2, 1)) out.warnings.push(`Internal port from the ${ch.role.toLowerCase()} (${p.length.toFixed(1)}") is longer than that chamber is wide (${ch.intW.toFixed(1)}").`);
  });
  // driver on divider 0|1
  const rear = out.chambers[0];
  const need = (sub.mountDepth || 6) + (sub.ventClearance || 0.5);
  if (rear.intW < need) out.warnings.push(`Rear chamber is only ${rear.intW.toFixed(1)}" wide but the sub needs ${need.toFixed(1)}" of mounting depth. Increase the rear chamber volume or reduce box height/depth.`);
  const od = sub.overallDia || sub.cutout + 1.2 || 12.5;
  if (od > Math.min(intH, intD)) out.warnings.push(`The divider is ${Math.min(intH, intD).toFixed(1)}" but the sub's frame is ${od.toFixed(2)}" across. Make the box taller and deeper.`);
  if (n > 1) out.notes.push(`${n} subs share each chamber; the divider gets ${n} cutouts.`);
}

function computeIB(ds, sub, drv, out) {
  const t = out.t;
  const od = sub.overallDia || (sub.cutout || 11) + 1.4;
  const W = ds.lockWidth ? ds.w : Math.max(ds.w || 0, out.n * (od + 2) + 4);
  out.shape = 'board';
  out.ext = { w: W, h: ds.h, d: t * 2, dTop: t * 2 };
  out.intW = W; out.intH = ds.h; out.intD = 0;
  out.net = (+ds.ibVol || 10);
  out.gross = out.net;
  out.chambers = [{ role: 'Trunk (rear air space)', net: out.net, gross: out.net }];
  out.notes.push('The trunk must be sealed from the cabin everywhere except through the baffle. Seal the pass-through, deck lid and any vents.');
  if (od > ds.h - 1) out.warnings.push(`Baffle height ${ds.h}" is too short for a ${od.toFixed(2)}" frame.`);
  return finalize(out, ds, sub);
}

function estimateDisplacement(sub) {
  // frame + motor estimate: cone-basket frustum + motor cylinder
  const size = sub.size || 12;
  const depth = sub.mountDepth || size * 0.55;
  const r1 = (sub.cutout || size * 0.92) / 2, r2 = (sub.motorDia || size * 0.5) / 2;
  const v = (Math.PI * depth * 0.55 / 3) * (r1 * r1 + r1 * r2 * 0.6 + r2 * r2 * 0.4) * 0.45 + Math.PI * r2 * r2 * depth * 0.45;
  return Math.max(0.02, v / IN3_PER_FT3);
}

// ---------- driver + port placement on the baffle ----------
function layoutFace(out, ds, sub) {
  const { t } = out;
  const W = out.ext.w, H = out.ext.h;
  const od = sub.overallDia || (sub.cutout || 11) + 1.4;
  const items = [];
  if (out.shape === 'board') {
    const s = W / out.n;
    for (let i = 0; i < out.n; i++) items.push({ kind: 'driver', x: s * (i + 0.5), y: H / 2 });
    return { items, faceW: W, faceH: H };
  }
  if (ds.type.startsWith('bp')) {
    // drivers on the divider (face = divider plane, x measured along depth)
    const faceW = out.intD, faceH = out.intH;
    const s = faceW / out.n;
    for (let i = 0; i < out.n; i++) items.push({ kind: 'driver', x: s * (i + 0.5), y: faceH / 2, onDivider: true });
    // ports on the front face
    out.ports.forEach((p, idx) => {
      if (p.to !== 'out') return;
      const ch = out.chambers[p.chamber];
      const cx = (ch.z0 + ch.z1) / 2;
      if (p.kind === 'slot') items.push({ kind: 'slot', x: ch.z1 - p.w / 2, y: H / 2, w: p.w, h: p.h, port: idx });
      else for (let c = 0; c < p.count; c++) items.push({ kind: 'port', x: cx, y: H / 2 + (c - (p.count - 1) / 2) * (p.dia + 1.5), d: p.dia, port: idx });
    });
    return { items, faceW: W, faceH: H, dividerFace: { w: faceW, h: faceH } };
  }
  let x0 = t, x1 = W - t;
  const p = out.ports[0];
  if (p && p.kind === 'slot') {
    items.push({ kind: 'slot', x: t + p.w / 2, y: H / 2, w: p.w, h: p.h, port: 0 });
    x0 = t + p.w + t;
  } else if (p) {
    const stripW = p.dia + 2;
    const perCol = Math.max(1, Math.floor((H - 2 * t) / (p.dia + 1.5)));
    const cols = Math.ceil(p.count / perCol);
    for (let c = 0; c < p.count; c++) {
      const col = Math.floor(c / perCol), row = c % perCol;
      const inCol = Math.min(perCol, p.count - col * perCol);
      items.push({ kind: 'port', x: t + stripW * (col + 0.5), y: H / 2 + (row - (inCol - 1) / 2) * (p.dia + 1.5), d: p.dia, port: 0 });
    }
    x0 = t + stripW * cols;
  }
  const faceH = out.shape === 'wedge' && ds.slope === 'front' ? Math.hypot(H, out.ext.d - out.ext.dTop) : H;
  const s = (x1 - x0) / out.n;
  for (let i = 0; i < out.n; i++) items.push({ kind: 'driver', x: x0 + s * (i + 0.5), y: faceH / 2 });
  if (s < od + 0.25) out.warnings.push(`Not enough baffle width: each sub needs about ${(od + 0.5).toFixed(1)}" but gets ${s.toFixed(1)}". Make the box wider (raise volume or reduce height/depth) or use fewer subs.`);
  return { items, faceW: W, faceH };
}

function finalize(out, ds, sub) {
  if (!out.ext) return out;
  const od = sub.overallDia || (sub.cutout || 11) + 1.4;
  const cut = sub.cutout || od - 1.4;
  out.face = layoutFace(out, ds, sub);
  if (out.shape !== 'board' && !ds.type.startsWith('bp')) {
    const faceH = out.face.faceH;
    if (od > faceH + 0.01) out.warnings.push(`Box face is ${faceH.toFixed(2)}" tall but the sub's frame is ${od.toFixed(2)}" across.`);
    else if (cut > out.intH) out.warnings.push(`Cutout (${cut}") is larger than the inside height (${out.intH.toFixed(2)}").`);
    // mounting depth at the top of the motor
    const yTop = Math.min(out.ext.h - out.t - 0.01, out.ext.h / 2 + (sub.motorDia || 6) / 2);
    const span = spanAt(out.inner, yTop);
    let avail = span ? span[1] - span[0] : out.intD;
    if (out.shape === 'wedge' && ds.slope === 'front') avail *= Math.cos(Math.atan((out.ext.d - out.ext.dTop) / out.ext.h));
    const need = (sub.mountDepth || 6) + (sub.ventClearance || 0);
    out.depthAvail = avail; out.depthNeed = need;
    if (need > avail) out.warnings.push(`Not enough depth behind the baffle: the sub needs ${need.toFixed(2)}" but the box gives ${avail.toFixed(2)}" at the motor. Increase depth or choose a shallow-mount sub.`);
  }
  out.panels = buildPanels(out, ds, sub);
  out.weight = out.panels.reduce((s, p) => s + p.qty * p.area * p.t, 0) / IN3_PER_FT3 * 47; // MDF ≈ 47 lb/ft³
  out.surface = surfaceArea(out);
  return out;
}

function surfaceArea(out) {
  const { w, h, d, dTop } = out.ext;
  if (out.shape === 'board') return w * h / 144;
  const sides = 2 * polyArea(out.outer);
  const perim = out.outer.reduce((s, p, i) => { const q = out.outer[(i + 1) % out.outer.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
  return (sides + perim * w) / 144; // ft²
}

// ---------- panels (cut list) ----------
function buildPanels(out, ds, sub) {
  const { t, tb } = out;
  const { w: W, h: H, d: D, dTop: Dt } = out.ext;
  const P2 = [];
  const add = (p) => P2.push({ qty: 1, t, cut: [], ...p, area: p.area ?? p.a * p.b });
  const iw = W - 2 * t;
  const cutouts = (kinds) => out.face.items.filter((it) => kinds.includes(it.kind)).map((it) => ({ ...it }));
  const extraLayers = Math.max(0, (ds.baffleLayers || 1) - 1);

  if (out.shape === 'board') {
    add({ name: 'Baffle board (2 layers glued)', a: W, b: H, qty: 2, cut: cutouts(['driver']), note: 'Glue and screw both layers, then cut the holes. Seal it to the vehicle with foam weatherstrip.' });
    add({ name: 'Mounting cleats', a: W, b: 1.5, qty: 2, note: 'Screw to the vehicle structure; bolt the baffle to the cleats.' });
    add({ name: 'Mounting cleats (sides)', a: H - 3, b: 1.5, qty: 2, note: '' });
    return P2;
  }

  const slot = out.ports.find((p) => p.kind === 'slot' && p.chamber === 0 && !ds.type.startsWith('bp'));
  const frontW = slot ? iw - slot.w - t : iw;
  const theta = Math.atan((D - Dt) / H);
  const bevel = (theta * 180) / Math.PI;

  // sides
  if (out.shape === 'wedge') {
    add({ name: 'Side panel (trapezoid)', a: D, b: H, qty: 2, shape: 'trap', trap: { bottom: D, top: Dt, height: H, slope: ds.slope }, area: polyArea(out.outer), note: `Bottom ${fmt(D)}", top ${fmt(Dt)}", height ${fmt(H)}". ${ds.slope === 'front' ? 'Front' : 'Back'} edge slopes ${bevel.toFixed(1)}° from vertical.` });
  } else add({ name: 'Side panel', a: D, b: H, qty: 2, note: 'Full height and depth. All other panels fit between the sides.' });

  const driverCut = ds.type.startsWith('bp') ? cutouts(['port', 'slot']) : cutouts(['driver', 'port']);
  if (out.shape === 'wedge' && ds.slope === 'front') {
    const len = (H - 2 * t) / Math.cos(theta);
    add({ name: 'Back panel', a: iw, b: H, note: 'Full height.' });
    add({ name: 'Front baffle (sloped)', a: iw, b: len, cut: driverCut, bevel, note: `Long-point length. Bevel top and bottom edges ${bevel.toFixed(1)}°.` });
    for (let i = 0; i < extraLayers; i++) add({ name: `Extra baffle layer ${i + 2}`, a: iw, b: len - 2 * t * Math.tan(theta), cut: driverCut, note: 'Glue to the inside of the baffle. Match the cutouts.' });
    add({ name: 'Bottom panel', a: iw, b: D - t, bevel, note: `Long point at the bottom face; front edge bevel ${bevel.toFixed(1)}°.` });
    add({ name: 'Top panel', a: iw, b: Dt - t + (D - Dt) * t / H, bevel, note: `Long point at the bottom face; front edge bevel ${bevel.toFixed(1)}°.` });
  } else {
    add({ name: slot ? 'Front baffle (beside the port)' : 'Front baffle', a: frontW, b: H, cut: driverCut.map((c) => ({ ...c, x: c.x - (slot ? slot.w + 2 * t : t) })), note: slot ? 'Port mouth is the open slot between this panel and the side.' : '' });
    for (let i = 0; i < extraLayers; i++) add({ name: `Extra baffle layer ${i + 2}`, a: frontW, b: H - 2 * t, cut: driverCut.map((c) => ({ ...c, x: c.x - (slot ? slot.w + 2 * t : t), y: c.y - t })), note: 'Glue behind the front baffle, between top and bottom.' });
    if (out.shape === 'wedge') {
      const len = (H - 2 * t) / Math.cos(theta);
      add({ name: 'Back panel (sloped)', a: iw, b: len, bevel, note: `Long-point length. Bevel top and bottom edges ${bevel.toFixed(1)}°.` });
      add({ name: 'Bottom panel', a: iw, b: D - t, bevel, note: `Back edge bevel ${bevel.toFixed(1)}°; long point at the bottom face.` });
      add({ name: 'Top panel', a: iw, b: Dt - t + (D - Dt) * t / H, bevel, note: `Back edge bevel ${bevel.toFixed(1)}°; long point at the bottom face.` });
    } else {
      add({ name: 'Back panel', a: iw, b: H - 2 * t, note: 'Fits between top and bottom.' });
      add({ name: 'Top panel', a: iw, b: D - t, note: 'Runs from behind the baffle to the back.' });
      add({ name: 'Bottom panel', a: iw, b: D - t, note: 'Runs from behind the baffle to the back.' });
    }
  }

  // slot port walls
  if (slot && slot.layout) {
    const ph = slot.h;
    add({ name: 'Port wall A (along the side)', a: slot.layout.wallA + tb, b: ph, note: `Set ${fmt(slot.w)}" from the side panel. Runs from the front face back.` });
    if (slot.layout.legs === 2) add({ name: 'Port wall B (along the back)', a: Math.max(1, slot.layout.wallB), b: ph, note: `Set ${fmt(slot.w)}" from the back panel, joined to wall A. Leaves an opening of at least ${fmt(slot.w)}".` });
  }
  // bandpass slot ports run along the chamber's right-hand wall
  if (ds.type.startsWith('bp')) out.ports.filter((p) => p.kind === 'slot' && p.layout).forEach((p) => {
    add({ name: `Port wall (${out.chambers[p.chamber].role.split(' ')[0].toLowerCase()} chamber)`, a: p.layout.wallA + tb, b: p.h, note: `Set ${fmt(p.w)}" from the chamber's right-hand wall.` });
  });
  // round ports
  out.ports.filter((p) => p.kind !== 'slot').forEach((p) => {
    add({ name: `${p.kind === 'aero' ? 'Aero port' : 'Port tube'} ${fmt(p.dia)}" ID`, a: p.length, b: p.dia + 2 * portTube, qty: p.count, material: 'tube', area: 0, note: `${p.to === 'out' ? 'Through the front panel' : 'Through the divider'}; cut each tube to ${fmt(p.length)}" (physical length${p.kind === 'aero' ? ', including flares' : ''}).` });
  });

  // bandpass dividers
  if (ds.type.startsWith('bp')) {
    out.chambers.slice(0, -1).forEach((ch, i) => {
      const cut = [];
      if (i === 0) out.face.items.filter((it) => it.onDivider).forEach((it) => cut.push(it));
      out.ports.filter((p) => p.to === i + 1 && p.chamber === i).forEach((p) => cut.push({ kind: 'port', x: (out.intD) * 0.85, y: out.intH / 2, d: p.dia }));
      add({ name: `Divider ${i + 1} (${ch.role.split(' ')[0]} | ${out.chambers[i + 1].role.split(' ')[0]})`, a: out.intD, b: out.intH, cut, note: i === 0 ? 'The sub mounts here, firing into the front chamber.' : 'Port passes through this divider.' });
    });
    out.notes.push('Make one top panel section removable (screws + foam gasket) so you can reach the sub inside a bandpass box.');
  }

  // blow-through wall
  if (ds.blowThrough && !ds.type.startsWith('bp')) {
    const ww = ds.wallW || W + 6, wh = ds.wallH || H + 6;
    add({ name: 'Blow-through wall', a: ww, b: wh, cut: cutouts(['driver', 'port', 'slot']).map((c) => ({ ...c, x: c.x + (ww - W) / 2, y: c.y + (wh - H) / 2 })), note: 'Box face seals against this wall with foam gasket. Cutouts line up with the subs and port.' });
    add({ name: 'Wall framing cleats', a: ww, b: 1.5, qty: 2, note: '' });
    add({ name: 'Wall framing cleats (sides)', a: wh - 3, b: 1.5, qty: 2, note: '' });
  }
  return P2;
}

export const fmt = (v, dp = 3) => {
  if (v == null || !isFinite(v)) return '—';
  const r = Math.round(v * 16) / 16; // nearest 1/16"
  const whole = Math.floor(r + 1e-9), frac = Math.round((r - whole) * 16);
  if (!frac) return String(whole);
  const g = frac % 8 === 0 ? 8 : frac % 4 === 0 ? 4 : frac % 2 === 0 ? 2 : 1;
  return `${whole ? whole + ' ' : ''}${frac / g}/${16 / g}`;
};

// ---------- sheet nesting (first-fit decreasing height shelves) ----------
export function nestSheets(panels, sheet = { w: 96, h: 48 }, kerf = 0.125) {
  const parts = [];
  panels.filter((p) => p.material !== 'tube').forEach((p) => {
    for (let i = 0; i < p.qty; i++) {
      let a = p.a, b = p.b;
      if (b > a) [a, b] = [b, a];              // long side along the sheet's long side
      parts.push({ name: p.name, w: a, h: b, src: p, oversize: a > sheet.w || b > sheet.h });
    }
  });
  parts.sort((x, y) => y.h - x.h || y.w - x.w);
  const sheets = [];
  for (const part of parts) {
    if (part.oversize) { sheets.push({ shelves: [], parts: [{ ...part, x: 0, y: 0 }], oversize: true }); continue; }
    let placed = false;
    for (const sh of sheets) {
      if (sh.oversize) continue;
      for (const shelf of sh.shelves) {
        if (part.h <= shelf.h && shelf.x + part.w <= sheet.w) {
          sh.parts.push({ ...part, x: shelf.x, y: shelf.y }); shelf.x += part.w + kerf; placed = true; break;
        }
      }
      if (placed) break;
      const used = sh.shelves.reduce((s, x) => s + x.h + kerf, 0);
      if (used + part.h <= sheet.h) {
        const shelf = { y: used, h: part.h, x: part.w + kerf };
        sh.shelves.push(shelf); sh.parts.push({ ...part, x: 0, y: shelf.y }); placed = true; break;
      }
    }
    if (!placed) sheets.push({ shelves: [{ y: 0, h: part.h, x: part.w + kerf }], parts: [{ ...part, x: 0, y: 0 }] });
  }
  const usedArea = parts.reduce((s, p) => s + p.w * p.h, 0);
  return { sheets, sheet, efficiency: sheets.length ? usedArea / (sheets.length * sheet.w * sheet.h) : 0 };
}

// ---------- vehicle fit ----------
export function fitCheck(box, ds, loc) {
  if (!loc || !box.ext) return null;
  const { w, h, d, dTop } = box.ext;
  const up = ds.mount === 'up' || ds.mount === 'down';
  const standoff = ds.mount === 'down' ? 2 : 0;
  const boxH = (up ? d : h) + standoff, boxD = up ? h : d;
  const res = [];
  const ok = (cond, label, have, need) => res.push({ ok: cond, label, have, need });
  ok(w <= loc.w, 'Width', w, loc.w);
  ok(boxH <= loc.h, 'Height', boxH, loc.h);
  if (loc.shape === 'wedge') {
    // available depth at a given height in the location
    const avail = (y) => loc.d + ((loc.dTop ?? loc.d) - loc.d) * (y / loc.h);
    const prof = up ? [[0, 0], [h, 0], [h, d], [0, d]] : box.outer;
    const worst = prof.reduce((m, [z, y]) => Math.max(m, z - avail(Math.min(y + standoff, loc.h))), -Infinity);
    ok(worst <= 0.001, 'Depth under the slope', boxD, `${fmt(loc.d)}" floor / ${fmt(loc.dTop)}" top`);
  } else ok(boxD <= loc.d, 'Depth', boxD, loc.d);
  const dims = [w, h, d].sort((a, b) => a - b);
  const oW = loc.openingW || loc.w, oH = loc.openingH || loc.h;
  const through = (dims[0] <= oH && dims[1] <= oW) || (dims[0] <= oW && dims[1] <= oH);
  ok(through, 'Fits through the opening', `${fmt(dims[0])}" × ${fmt(dims[1])}"`, `${fmt(oW)}" × ${fmt(oH)}"`);
  return { checks: res, fits: res.every((r) => r.ok) };
}

// ---------- wiring ----------
export function wiringOptions(n, coils, coilOhms) {
  const opts = [];
  const push = (z, desc) => {
    const hit = opts.find((o) => Math.abs(o.z - z) < 1e-6);
    if (hit) { if (!hit.ways.includes(desc)) hit.ways.push(desc); } else opts.push({ z, ways: [desc] });
  };
  const per = coils === 1 ? [{ z: coilOhms, desc: 'single coil' }] : [
    { z: coilOhms * coils, desc: 'coils in series' },
    { z: coilOhms / coils, desc: 'coils in parallel' },
    ...(coils === 4 ? [{ z: coilOhms, desc: 'coils series-parallel' }] : []),
  ];
  per.forEach((p) => {
    if (n === 1) { push(p.z, p.desc); return; }
    push(p.z / n, `${p.desc}, subs in parallel`);
    push(p.z * n, `${p.desc}, subs in series`);
    if (n === 4) push(p.z, `${p.desc}, subs in series-parallel (2 + 2)`);
    if (n === 6) { push(p.z * 2 / 3, `${p.desc}, 3 parallel pairs of 2 in series`); push(p.z * 3 / 2, `${p.desc}, 2 parallel sets of 3 in series`); }
  });
  return opts.sort((a, b) => a.z - b.z);
}
