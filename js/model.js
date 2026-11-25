// The design pipeline: design state → driver → box geometry → acoustic network → simulation → system checks.
import * as P from './physics.js';
import * as G from './geometry.js';
import { ampPowerAt, electrical } from './system.js';
import { getSub, getVehicle, getAmp } from './store.js';
import { units, fracIn } from './ui.js';

export function defaultDesign() {
  return {
    name: 'Trunk ported 12', subId: 'jl-12w3v3-4', n: 1, isobaric: false,
    vehicleId: 't-sedan-compact', locationId: 'trunk',
    ampId: 'jl-jx1000-1d', useAmpPower: false, power: 500, wiringZ: null, runFt: null,
    type: 'ported', shape: 'rect', slope: 'back', mount: 'front', blowThrough: false, wallW: null, wallH: null,
    t: 0.75, baffleLayers: 1, h: 14, d: 12.625, dTop: 9, w: 29, lockWidth: false,
    vnet: 1.75, fb: 30, port: { kind: 'slot', w: 1.375, dia: 4, count: 1, k: 0.732 },
    braceVol: 0, chambers: null, ibVol: 12,
    hp: { order: 4, fc: 25 }, lp: { order: 0, fc: 80 }, cabin: true, cabinSlope: 12,
  };
}

/** Apply a sub's factory recommendation for the current box type. */
export function applyFactory(ds, sub, which = ds.type) {
  const f = sub.factory || {};
  const patch = {};
  if (which === 'sealed' && f.sealed?.vol) {
    Object.assign(patch, { type: 'sealed', vnet: f.sealed.vol });
    if (f.sealed.ext) Object.assign(patch, { h: f.sealed.ext.h, d: f.sealed.ext.d, shape: 'rect', lockWidth: false });
  }
  if (which === 'ported' && f.ported?.vol) {
    Object.assign(patch, { type: 'ported', vnet: f.ported.vol });
    if (f.ported.fb) patch.fb = f.ported.fb;
    const p = f.ported.port;
    if (p?.type === 'slot' && (p.w || p.area)) {
      const intH = (f.ported.ext?.h || ds.h) - 2 * (f.ported.t || ds.t);
      patch.port = { ...ds.port, kind: 'slot', w: p.w || +(p.area / (p.h || intH)).toFixed(3) };
    } else if (p?.type === 'round') patch.port = { ...ds.port, kind: 'round', dia: p.dia || 4, count: p.count || 1 };
    if (f.ported.ext) Object.assign(patch, { h: f.ported.ext.h, d: f.ported.ext.d, shape: 'rect', lockWidth: false });
  }
  if (which === 'bp4' && f.bp4) {
    patch.type = 'bp4';
    patch.chambers = [
      { role: 'Rear (sealed)', vol: f.bp4.rear, port: null },
      { role: 'Front (ported)', vol: f.bp4.front, port: { to: 'out', kind: 'slot', w: +(f.bp4.portArea / Math.max(1, ds.h - 2 * ds.t)).toFixed(3), dia: 4, count: 1, k: 0.732, fb: 45 } },
    ];
    // derive the tuning that the factory port length gives
    const sp = f.bp4.portArea * 0.00064516;
    const fb = P.tuningFromLength(f.bp4.front * P.FT3, (f.bp4.portLen || 6) * P.IN, sp, 1, P.eqDiameter(sp), 0.732);
    patch.chambers[1].port.fb = +fb.toFixed(1);
  }
  return patch;
}

/** Make sure a bandpass box is tall and deep enough for the sub to mount on the internal divider. */
export function bandpassDims(ds, sub) {
  const od = sub.overallDia || (sub.cutout || 11) + 1.4;
  const t = ds.t || 0.75;
  return { h: +Math.max(ds.h, od + 2 * t + 1).toFixed(3), d: +Math.max(ds.d, od + t + t * (ds.baffleLayers || 1) + 1).toFixed(3) };
}

export const bandpassGeom = (ds) => ({ intH: ds.h - 2 * (ds.t || 0.75), intD: ds.d - (ds.t || 0.75) * (1 + (ds.baffleLayers || 1)) });
/**
 * Searches chamber volumes and port tunings for the flattest, loudest response across [fLo, fHi]
 * inside a sensible size budget. Coordinate descent on the acoustic model only (fast: a few hundred sims).
 */
export function optimizeBandpass(type, drv, { fLo = 32, fHi = 75, n = 1, budget, geom } = {}) {
  const tpl = G.bandpassTemplate(type);
  const sealedRef = (P.sealedVolumeForQtc(drv, 0.707) || drv.vas * 0.6) / P.FT3;
  const cap = budget || Math.max(1.5, Math.min(8, sealedRef * 3.2));
  let x = tpl.map((c, i) => ({ vol: i === 0 ? sealedRef * (c.port ? 1.3 : 0.9) : sealedRef * 1.4, fb: c.port ? (c.port.to === 'out' && i === tpl.length - 1 ? (fLo + fHi) / 2 : fLo + 6) : null }));
  // physical port length (in) for total area A (in²) in a chamber of vol (ft³, whole box) tuned to fb
  const lenFor = (vol, fb, A) => P.portEffectiveLength(vol * P.FT3, fb, A * 0.00064516) / P.IN - 0.732 * Math.sqrt((4 * A) / Math.PI);
  const room = (i, vol, A) => !geom ? Infinity : (tpl[i].port.to === 'out' ? geom.intD : (vol * 1728) / (geom.intH * geom.intD)) - Math.max(Math.min(6, Math.sqrt((4 * A) / Math.PI)) / 2, 1) - 0.25;
  // biggest port area (up to ~13 in²/ft³) whose length still fits the box
  const portFor = (i, volPer, fb) => {
    const vol = volPer * n, want = Math.max(8, 13 * vol), lo0 = Math.max(4, 5 * vol);
    const fits = (A) => lenFor(vol, fb, A) <= room(i, vol, A);
    if (fits(want)) return { area: want, over: 0 };
    let lo = lo0, hi = want;
    if (!fits(lo)) return { area: lo, over: lenFor(vol, fb, lo) - room(i, vol, lo) };
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    return { area: lo, over: 0 };
  };
  const score = (cand) => {
    let over = 0;
    const ports = [];
    cand.forEach((c, i) => {
      if (!tpl[i].port) return;
      const pf = portFor(i, c.vol, c.fb);
      over += pf.over;
      const sp = (pf.area / n) * 0.00064516; // per-sub equivalent
      ports.push({ a: i, b: tpl[i].port.to === 'out' ? -1 : tpl[i].port.to, sp, count: 1, leff: P.portEffectiveLength(c.vol * P.FT3, c.fb, sp), fref: c.fb, qp: 60 });
    });
    const net = { chambers: cand.map((c) => ({ vol: c.vol * P.FT3, ql: 12, fref: c.fb || drv.fs })), drivers: [{ front: 1, rear: 0, n: 1 }], ports };
    const sim = P.simulate(drv, net, { power: 1, fMin: 15, fMax: 200, points: 70 });
    const band = sim.spl.filter((_, i) => sim.freqs[i] >= fLo && sim.freqs[i] <= fHi);
    const mean = band.reduce((a, b) => a + b, 0) / band.length;
    const sd = Math.sqrt(band.reduce((a, b) => a + (b - mean) ** 2, 0) / band.length);
    const total = cand.reduce((a, c) => a + c.vol, 0);
    return mean - 1.4 * sd - Math.max(0, total - cap) * 3 - over * 0.8;
  };
  let best = score(x), step = 0.35;
  for (let it = 0; it < 45 && step > 0.01; it++) {
    let improved = false;
    for (let i = 0; i < x.length; i++) {
      for (const key of ['vol', 'fb']) {
        if (x[i][key] == null) continue;
        for (const dir of [1, -1]) {
          const cand = x.map((c) => ({ ...c }));
          if (key === 'vol') cand[i].vol = Math.min(6, Math.max(0.2, cand[i].vol * (1 + dir * step)));
          else cand[i].fb = Math.min(110, Math.max(22, cand[i].fb + dir * step * 20));
          const sc = score(cand);
          if (sc > best + 1e-4) { best = sc; x = cand; improved = true; }
        }
      }
    }
    if (!improved) step *= 0.55;
  }
  return tpl.map((c, i) => {
    if (!c.port) return { role: c.role, vol: +x[i].vol.toFixed(2), port: null };
    const area = portFor(i, x[i].vol, x[i].fb).area; // whole-box area
    let dia = Math.sqrt((4 * area) / Math.PI), count = 1;
    if (dia > 6) { count = Math.ceil((dia / 6) ** 2); dia = Math.sqrt((4 * area) / Math.PI / count); }
    return { role: c.role, vol: +x[i].vol.toFixed(2), port: { to: c.port.to, kind: 'round', dia: Math.max(1.5, Math.floor(dia * 4) / 4), w: 2, count, k: 0.732, fb: +x[i].fb.toFixed(1) } };
  });
}

export function buildNetwork(ds, box, drv) {
  const n = box.n;
  const m3 = (ft3) => Math.max(ft3, 0.005) * P.FT3;
  if (ds.type === 'sealed') {
    const al = P.sealedAlignment(drv, m3(box.net) / n);
    return { chambers: [{ vol: m3(box.net), ql: 15, fref: al.fc }], drivers: [{ front: -1, rear: 0, n }], ports: [] };
  }
  if (ds.type === 'ib') return { chambers: [{ vol: m3(box.net), ql: 4, fref: drv.fs }], drivers: [{ front: -1, rear: 0, n }], ports: [] };
  const portOf = (p) => ({
    a: p.chamber, b: p.to === 'out' ? -1 : p.to, sp: p.area * 0.00064516, count: p.count,
    leff: Math.max(0.005, (p.length + p.k * p.deq) * P.IN), fref: p.fb, qp: 60,
  });
  if (ds.type === 'ported') {
    const p = box.ports[0];
    return { chambers: [{ vol: m3(box.net), ql: 10, fref: p?.fb || 35 }], drivers: [{ front: -1, rear: 0, n }], ports: p ? [portOf(p)] : [] };
  }
  // bandpass: driver between chamber 0 (rear) and 1 (front)
  return {
    chambers: box.chambers.map((c, i) => ({ vol: m3(c.net), ql: 12, fref: box.ports.find((p) => p.chamber === i)?.fb || drv.fs })),
    drivers: [{ front: 1, rear: 0, n }],
    ports: box.ports.map(portOf),
  };
}

export function compute(ds) {
  const sub = getSub(ds.subId);
  let drv = P.deriveDriver(sub);
  if (ds.isobaric) drv = P.isobaric(drv);
  const vehicle = getVehicle(ds.vehicleId);
  const loc = vehicle?.locations?.find((l) => l.id === ds.locationId) || vehicle?.locations?.[0] || null;
  if (ds.type.startsWith('bp') && (!ds.chambers || ds.chambers.length !== G.bandpassTemplate(ds.type).length)) {
    const factory = ds.type === 'bp4' && sub.factory?.bp4 ? applyFactory(ds, sub, 'bp4').chambers : null;
    ds.chambers = factory || optimizeBandpass(ds.type, drv, { ...(ds.bpTarget || {}), n: ds.n, geom: bandpassGeom(ds) });
  }
  const box = G.computeBox(ds, sub, drv);
  // wiring and amplifier
  const coilsPerUnit = (sub.coils || 1) * (ds.isobaric ? 2 : 1);
  const wiring = G.wiringOptions(ds.n, coilsPerUnit === 1 ? 1 : coilsPerUnit, sub.coilOhms || 4);
  const amp = ds.ampId ? getAmp(ds.ampId) : null;
  let finalZ = ds.wiringZ && wiring.find((w) => Math.abs(w.z - ds.wiringZ) < 1e-6) ? ds.wiringZ : null;
  if (!finalZ) {
    // best match: the lowest load the amp is stable at, else ~2 ohms
    const minZ = amp?.minOhms || 2;
    const ok = wiring.filter((w) => w.z >= minZ - 1e-6);
    finalZ = (ok[0] || wiring[wiring.length - 1]).z;
  }
  const ampAt = amp ? ampPowerAt(amp, finalZ) : null;
  const ratedTotal = (sub.rms || drv.rmsPower) * ds.n * (ds.isobaric ? 2 : 1);
  const powerPerUnit = ds.useAmpPower && ampAt?.power ? ampAt.power / ds.n : +ds.power || 100;
  const runFt = ds.runFt || Math.round((vehicle?.cabinLength || 100) / 12 + 3);
  const elec = electrical({ totalPower: amp && ampAt?.power ? ampAt.power : powerPerUnit * ds.n, amp, runFt });

  const net = box.ext ? buildNetwork(ds, box, drv) : null;
  const cabinLen = ds.cabin && vehicle?.cabinLength ? vehicle.cabinLength * P.IN : null;
  const sim = net ? P.simulate(drv, net, {
    power: powerPerUnit, hp: ds.hp?.order ? ds.hp : null, lp: ds.lp?.order ? ds.lp : null,
    cabinLen, cabinSlope: ds.cabinSlope || 12, maxWithCabin: !!cabinLen, fMin: 10, fMax: 250, points: 200,
  }) : null;
  const an = sim ? P.analyze(sim, ds.type) : null;
  // unfiltered response for F3 (filters are a choice, not the box)
  const simRaw = net ? P.simulate(drv, net, { power: 1, fMin: 10, fMax: 250, points: 160 }) : null;
  const anRaw = simRaw ? P.analyze(simRaw, ds.type) : null;
  const fit = loc ? G.fitCheck(box, ds, loc) : null;
  const sealed = ds.type === 'sealed' && box.net ? P.sealedAlignment(drv, (box.net / ds.n) * P.FT3) : null;
  const zScale = finalZ / drv.znom * (ds.isobaric ? 1 : 1);
  return { ds, sub, drv, vehicle, loc, box, net, sim, an, anRaw, fit, sealed, amp, ampAt, wiring, finalZ, powerPerUnit, ratedTotal, elec, cabinLen, zScale };
}

/** Plain-text summary used by the AI assistant and the PDF. */
export function summaryText(r) {
  const { ds, sub, box, an, anRaw, amp, ampAt, finalZ, vehicle, loc, fit, elec } = r;
  const T = G.BOX_TYPES[ds.type]?.label || ds.type;
  const lines = [
    `Vehicle: ${vehicle ? `${vehicle.years || ''} ${vehicle.make || ''} ${vehicle.model}`.trim() : 'none'}${loc ? `, location "${loc.name}" (${fracIn(loc.w)} W × ${fracIn(loc.h)} H × ${fracIn(loc.d)}${loc.shape === 'wedge' ? `/${fracIn(loc.dTop)}` : ''} D in)` : ''}`,
    `Subwoofer: ${ds.n} × ${sub.brand} ${sub.model}${ds.isobaric ? ' (isobaric pairs)' : ''}; Fs ${sub.fs} Hz, Qts ${sub.qts}, Vas ${sub.vas} L, Xmax ${sub.xmax} mm, ${sub.rms} W RMS each`,
    `Enclosure: ${T}, ${box.shape}${box.shape === 'wedge' ? ` (slope ${ds.slope})` : ''}, ${ds.mount}-firing${ds.blowThrough ? ', blow-through wall' : ''}`,
    box.ext ? `External: ${fracIn(box.ext.w)} W × ${fracIn(box.ext.h)} H × ${fracIn(box.ext.d)} D in${box.shape === 'wedge' ? ` (top depth ${fracIn(box.ext.dTop)})` : ''}; material ${ds.t} in, baffle layers ${ds.baffleLayers}` : '',
    `Net volume ${box.net?.toFixed(2)} cu ft (gross ${box.gross?.toFixed(2)})`,
    ...box.chambers.length > 1 ? box.chambers.map((c) => `  ${c.role}: ${c.net.toFixed(2)} cu ft net`) : [],
    ...box.ports.map((p) => `Port (${p.kind}${p.kind === 'slot' ? ` ${p.w}" × ${p.h?.toFixed(2)}"` : ` ${p.count} × ${p.dia}"`}): area ${p.totalArea.toFixed(1)} sq in, length ${p.length.toFixed(2)} in, tuned ${p.fb} Hz${p.to !== 'out' ? ` into chamber ${p.to + 1}` : ''}`),
    anRaw ? `Anechoic F3 ${anRaw.f3?.toFixed(1) ?? '—'} Hz${anRaw.f3hi ? `, upper F3 ${anRaw.f3hi.toFixed(1)} Hz` : ''}` : '',
    r.sealed ? `Sealed Qtc ${r.sealed.qtc.toFixed(2)}, Fc ${r.sealed.fc.toFixed(1)} Hz` : '',
    an ? `At ${r.powerPerUnit.toFixed(0)} W per sub: peak cone excursion ${an.maxX.toFixed(1)} mm (Xmax ${sub.xmax} mm), max port air speed ${an.maxV.toFixed(1)} m/s` : '',
    `Wiring: final load ${finalZ} ohm${amp ? `; amp ${amp.brand} ${amp.model} gives ${ampAt?.power ? ampAt.power.toFixed(0) + ' W' : 'NOT STABLE'} at that load` : '; no amp chosen'}`,
    `Subsonic filter: ${ds.hp?.order ? `${ds.hp.fc} Hz ${ds.hp.order * 6} dB/oct` : 'off'}; cabin gain ${ds.cabin ? 'on' : 'off'}`,
    `Electrical: about ${elec.current.toFixed(0)} A at full power, ${elec.gauge} power/ground, ${elec.fuse} A fuse`,
    fit ? `Vehicle fit: ${fit.fits ? 'fits' : 'does NOT fit'} (${fit.checks.filter((c) => !c.ok).map((c) => c.label).join(', ') || 'all checks pass'})` : '',
    box.warnings.length ? `Warnings: ${box.warnings.join(' | ')}` : 'Warnings: none',
  ];
  return lines.filter(Boolean).join('\n');
}
