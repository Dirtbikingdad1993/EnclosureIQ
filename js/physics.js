// EnclosureIQ acoustic engine.
// Lumped-parameter (Thiele/Small) model solved as an acoustic nodal network,
// so sealed, vented, every bandpass variant and free-air all share one solver.

export const RHO = 1.204;          // air density, kg/m^3 (20 °C)
export const C = 343.2;            // speed of sound, m/s (20 °C)
export const P_REF = 20e-6;        // 0 dB SPL reference, Pa
export const IN = 0.0254;          // m per inch
export const FT3 = 0.0283168466;   // m^3 per cubic foot
const TAU = Math.PI * 2;

// ---------- complex arithmetic (plain objects for speed) ----------
const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const scale = (a, k) => ({ re: a.re * k, im: a.im * k });
const div = (a, b) => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const inv = (a) => div(cx(1), a);
const abs = (a) => Math.hypot(a.re, a.im);
const arg = (a) => Math.atan2(a.im, a.re);

// Solve complex linear system A x = b (Gaussian elimination, partial pivoting)
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row.map((v) => ({ ...v })), { ...b[i] }]);
  for (let col = 0; col < n; col++) {
    let piv = col, best = abs(M[col][col]);
    for (let r = col + 1; r < n; r++) { const v = abs(M[r][col]); if (v > best) { best = v; piv = r; } }
    if (best === 0) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = div(M[r][col], M[col][col]);
      for (let c2 = col; c2 <= n; c2++) M[r][c2] = sub(M[r][c2], mul(f, M[col][c2]));
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c2 = r + 1; c2 < n; c2++) s = sub(s, mul(M[r][c2], x[c2]));
    x[r] = div(s, M[r][r]);
  }
  return x;
}

// ---------- driver parameters ----------
const num = (v) => (v === null || v === undefined || v === '' || !isFinite(+v) ? null : +v);

/** Nominal impedance that the published parameter set corresponds to. */
export function paramImpedance(s) {
  const z = num(s.coilOhms) || 4, n = num(s.coils) || 1;
  if (n === 1 || s.paramWiring === 'single') return z;
  return s.paramWiring === 'parallel' ? z / n : z * n;
}

/**
 * Turns a library entry into a complete SI parameter set, deriving whatever is
 * missing, and reports which values were derived plus any published values that
 * contradict each other.
 */
export function deriveDriver(s) {
  const derived = new Set();
  const issues = [];
  let fs = num(s.fs), qes = num(s.qes), qms = num(s.qms), qts = num(s.qts);
  let vas = num(s.vas) != null ? num(s.vas) * 1e-3 : null;
  let sd = num(s.sd) != null ? num(s.sd) * 1e-4 : null;
  let re = num(s.re), le = num(s.le) != null ? num(s.le) * 1e-3 : 0;
  let bl = num(s.bl), mms = num(s.mms) != null ? num(s.mms) * 1e-3 : null;
  let cms = num(s.cms) != null ? num(s.cms) * 1e-3 : null;
  let rms = num(s.rmsMech);
  const k = RHO * C * C;

  if (sd == null && num(s.size)) { // rough Sd from nominal size when missing
    const eff = { 6.5: 0.135, 8: 0.165, 10: 0.21, 12: 0.255, 13: 0.27, 15: 0.32, 18: 0.39 }[+s.size] || +s.size * IN * 0.83;
    sd = Math.PI * (eff / 2) ** 2; derived.add('sd');
  }
  if (qts == null && qes && qms) { qts = (qes * qms) / (qes + qms); derived.add('qts'); }
  if (qes == null && qts && qms && qms > qts) { qes = (qts * qms) / (qms - qts); derived.add('qes'); }
  if (qms == null && qts && qes && qes > qts) { qms = (qts * qes) / (qes - qts); derived.add('qms'); }
  if (cms == null && vas && sd) { cms = vas / (k * sd * sd); derived.add('cms'); }
  if (vas == null && cms && sd) { vas = cms * k * sd * sd; derived.add('vas'); }
  if (fs == null && mms && cms) { fs = 1 / (TAU * Math.sqrt(mms * cms)); derived.add('fs'); }
  if (mms == null && fs && cms) { mms = 1 / ((TAU * fs) ** 2 * cms); derived.add('mms'); }
  if (re == null) { re = paramImpedance(s) * 0.85; derived.add('re'); }
  if (bl == null && fs && mms && qes) { bl = Math.sqrt((TAU * fs * mms * re) / qes); derived.add('bl'); }
  if (qes == null && bl && fs && mms) { qes = (TAU * fs * mms * re) / (bl * bl); derived.add('qes'); }
  if (qms == null) { qms = 6; derived.add('qms'); }
  if (qts == null && qes) { qts = (qes * qms) / (qes + qms); derived.add('qts'); }
  if (rms == null && fs && mms) { rms = (TAU * fs * mms) / qms; derived.add('rmsMech'); }
  const xmax = num(s.xmax) != null ? num(s.xmax) * 1e-3 : 0.01;
  if (num(s.xmax) == null) derived.add('xmax');

  // Cross-checks between published values (only when the inputs were published, not derived)
  const pct = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
  if (num(s.vas) && num(s.cms) && num(s.sd)) {
    const v2 = num(s.cms) * 1e-3 * k * (num(s.sd) * 1e-4) ** 2;
    if (pct(v2, num(s.vas) * 1e-3) > 0.12) issues.push(`Published Vas (${(+s.vas).toFixed(1)} L) does not match Cms and Sd, which give ${(v2 * 1e3).toFixed(1)} L. One of Vas, Cms or Sd is probably wrong.`);
  }
  if (num(s.qts) && num(s.qes) && num(s.qms)) {
    const q2 = (s.qes * s.qms) / (+s.qes + +s.qms);
    if (pct(q2, +s.qts) > 0.06) issues.push(`Published Qts (${s.qts}) does not match Qes and Qms, which give ${q2.toFixed(3)}.`);
  }
  if (num(s.fs) && num(s.mms) && num(s.cms)) {
    const f2 = 1 / (TAU * Math.sqrt(s.mms * 1e-3 * s.cms * 1e-3));
    if (pct(f2, +s.fs) > 0.08) issues.push(`Published Fs (${s.fs} Hz) does not match Mms and Cms, which give ${f2.toFixed(1)} Hz.`);
  }
  if (num(s.bl) && num(s.mms) && num(s.fs) && num(s.re) && num(s.qes)) {
    const q2 = (TAU * s.fs * s.mms * 1e-3 * s.re) / (s.bl * s.bl);
    if (pct(q2, +s.qes) > 0.12) issues.push(`Published Qes (${s.qes}) does not match Bl, Mms, Fs and Re, which give ${q2.toFixed(3)}.`);
  }

  const eta0 = fs && vas && qes ? (4 * Math.PI ** 2 / C ** 3) * fs ** 3 * vas / qes : null;
  const spl1w = eta0 ? 112.1 + 10 * Math.log10(eta0) : null;
  if (num(s.sens) && spl1w && Math.abs(spl1w - s.sens) > 3) {
    issues.push(`Published sensitivity (${s.sens} dB) is ${Math.abs(spl1w - s.sens).toFixed(1)} dB away from the ${spl1w.toFixed(1)} dB the T/S parameters predict. Manufacturers sometimes rate at 2.83 V or into the nominal impedance.`);
  }

  return {
    fs, qes, qms, qts, vas, sd, re, le, bl, mms, cms, rms, xmax,
    znom: paramImpedance(s), rmsPower: num(s.rms) || 300,
    eta0, spl1w, ebp: fs && qes ? fs / qes : null,
    vd: sd && xmax ? sd * xmax : null,
    derived, issues,
  };
}

/** Isobaric (compound) loading of two drivers acting as one, coils wired in series. */
export function isobaric(d) {
  return { ...d, vas: d.vas / 2, cms: d.cms / 2, mms: d.mms * 2, rms: d.rms * 2, bl: d.bl * 2, re: d.re * 2, le: d.le * 2, znom: d.znom * 2, rmsPower: d.rmsPower * 2 };
}

// ---------- closed-form alignments ----------
export function sealedAlignment(d, vb /* m^3 */) {
  const a = d.vas / vb;
  const qtc = d.qts * Math.sqrt(1 + a);
  const fc = d.fs * Math.sqrt(1 + a);
  const q2 = 1 / (2 * qtc * qtc) - 1;
  const f3 = fc * Math.sqrt(q2 + Math.sqrt(q2 * q2 + 1));
  return { qtc, fc, f3 };
}
export function sealedVolumeForQtc(d, qtc) {
  const r = (qtc / d.qts) ** 2 - 1;
  return r > 0 ? d.vas / r : null;
}
/** Keele's closed-form vented approximation (QB3-ish). Useful as a starting point. */
export function ventedSuggestion(d) {
  return {
    vb: 15 * Math.pow(d.qts, 2.87) * d.vas,
    fb: 0.42 * d.fs * Math.pow(d.qts, -0.9),
    f3: 0.26 * d.fs * Math.pow(d.qts, -1.4),
  };
}

// ---------- ports ----------
/** Effective acoustic length needed to tune `vb` (m^3) to `fb` with total port area `spTotal` (m^2). */
export function portEffectiveLength(vb, fb, spTotal) {
  return (C * C * spTotal) / (TAU * TAU * fb * fb * vb);
}
/** Physical length (m) of each port. `deq` = equivalent diameter of ONE port (m); k = end-correction factor. */
export function portPhysicalLength(vb, fb, spEach, count, deq, k) {
  return portEffectiveLength(vb, fb, spEach * count) - k * deq;
}
export function tuningFromLength(vb, lengthPhys, spEach, count, deq, k) {
  const leff = lengthPhys + k * deq;
  return (C / TAU) * Math.sqrt((spEach * count) / (vb * leff));
}
export const eqDiameter = (sp) => 2 * Math.sqrt(sp / Math.PI);

// ---------- filters ----------
function butterworth(order, fc, f, type) {
  if (!order || !fc) return cx(1);
  const s = cx(0, f / fc);
  const sl = type === 'hp' ? inv(s) : s; // high-pass: s -> 1/s
  let H = cx(1);
  const n = order;
  for (let k = 0; k < Math.floor(n / 2); k++) {
    const theta = Math.PI * (2 * k + 1) / (2 * n);
    const a = 2 * Math.sin(theta); // s^2 + a s + 1
    const den = add(add(mul(sl, sl), scale(sl, a)), cx(1));
    H = div(H, den);
  }
  if (n % 2 === 1) H = div(H, add(sl, cx(1)));
  return H;
}

/** Cabin transfer function in dB: rises at `slope` dB/oct below the cabin's lowest mode. */
export function cabinGainDb(f, cabinLenM, slope = 12) {
  if (!cabinLenM) return 0;
  const fc = C / (2 * cabinLenM);
  const k = slope / 6.0206;
  return 10 * Math.log10(1 + Math.pow(fc / f, 2 * k));
}
export const cabinCorner = (cabinLenM) => C / (2 * cabinLenM);

// ---------- network simulation ----------
/**
 * net = {
 *   chambers: [{ vol (m^3), ql, fref }],
 *   drivers:  [{ front: idx|-1, rear: idx|-1, n }],   // -1 = outside
 *   ports:    [{ a: idx, b: idx|-1, sp (m^2 per port), count, leff (m per port), qp }],
 * }
 * opts = { power (W per driver), hp:{order,fc}, lp:{order,fc}, fMin, fMax, points, cabinLen (m), cabinSlope }
 */
export function simulate(drv, net, opts = {}) {
  const fMin = opts.fMin || 10, fMax = opts.fMax || 250, N = opts.points || 220;
  const power = opts.power || 1;
  const volts = Math.sqrt(power * drv.znom);
  const freqs = [], out = {
    freqs, spl: [], splCabin: [], splMax: [], excursion: [], portVel: [], impedance: [], phase: [], groupDelay: [],
    volts, power,
  };
  const n = net.chambers.length;
  const ndrv = net.drivers.reduce((s, d) => s + (d.n || 1), 0);
  let prevPhase = null, prevW = null;
  const phases = [];
  for (let i = 0; i < N; i++) {
    const f = fMin * Math.pow(fMax / fMin, i / (N - 1));
    freqs.push(f);
    const w = TAU * f;
    const jw = cx(0, w);
    // driver impedances per single driver (acoustic domain)
    const Ze = add(cx(drv.re), scale(jw, drv.le || 0));
    const Zae = div(cx(drv.bl * drv.bl / (drv.sd * drv.sd)), Ze);
    const Zas = scale(add(add(cx(drv.rms), scale(jw, drv.mms)), inv(scale(jw, drv.cms))), 1 / (drv.sd * drv.sd));
    const Zd = add(Zae, Zas);
    const pg = div(cx(drv.bl / drv.sd), Ze); // per volt (unit drive)

    const Y = Array.from({ length: n }, () => Array.from({ length: n }, () => cx(0)));
    const I = Array.from({ length: n }, () => cx(0));
    const stamp = (a, b, y) => {
      if (a >= 0) Y[a][a] = add(Y[a][a], y);
      if (b >= 0) Y[b][b] = add(Y[b][b], y);
      if (a >= 0 && b >= 0) { Y[a][b] = sub(Y[a][b], y); Y[b][a] = sub(Y[b][a], y); }
    };
    net.chambers.forEach((ch, idx) => {
      const Cab = ch.vol / (RHO * C * C);
      const wr = TAU * (ch.fref || drv.fs);
      const Rl = (ch.ql || 10) / (wr * Cab);
      Y[idx][idx] = add(Y[idx][idx], add(scale(jw, Cab), cx(1 / Rl)));
    });
    const portZ = net.ports.map((p) => {
      const M = RHO * p.leff / p.sp;                 // acoustic mass of one port
      const wr = TAU * (p.fref || 35);
      const R = (wr * M) / (p.qp || 50);
      return scale(add(cx(R), scale(jw, M)), 1 / (p.count || 1)); // parallel ports
    });
    net.ports.forEach((p, k) => stamp(p.a, p.b, inv(portZ[k])));
    net.drivers.forEach((d) => {
      const y = scale(inv(Zd), d.n || 1);
      stamp(d.front, d.rear, y);
      const j = mul(pg, y);
      if (d.front >= 0) I[d.front] = add(I[d.front], j);
      if (d.rear >= 0) I[d.rear] = sub(I[d.rear], j);
    });
    const p = n ? solve(Y, I) : [];
    const P = (idx) => (idx < 0 ? cx(0) : p[idx]);
    let Uout = cx(0), maxX = 0, maxV = 0;
    let Ud0 = null;
    net.drivers.forEach((d) => {
      const dp = sub(P(d.front), P(d.rear));
      const Ud = scale(div(sub(pg, dp), Zd), d.n || 1);
      if (!Ud0) Ud0 = scale(Ud, 1 / (d.n || 1));
      if (d.front < 0) Uout = add(Uout, Ud);
      if (d.rear < 0) Uout = sub(Uout, Ud);
      maxX = Math.max(maxX, abs(Ud) / ((d.n || 1) * drv.sd * w));
    });
    net.ports.forEach((pt, k) => {
      const Up = div(sub(P(pt.a), P(pt.b)), portZ[k]);
      if (pt.b < 0) Uout = add(Uout, Up);
      maxV = Math.max(maxV, abs(Up) / (pt.sp * (pt.count || 1)));
    });
    // electrical input impedance of ONE driver (unit volts): i = (e - Bl*u)/Ze
    const u = scale(Ud0, 1 / drv.sd);
    const iin = div(sub(cx(1), scale(u, drv.bl)), Ze);
    const Zin = inv(iin);

    const H = mul(butterworth(opts.hp?.order, opts.hp?.fc, f, 'hp'), butterworth(opts.lp?.order, opts.lp?.fc, f, 'lp'));
    const Hm = abs(H);
    const pres = (RHO * f * abs(Uout) * volts * Hm) / 1.0; // half-space, 1 m
    const spl = 20 * Math.log10(Math.max(pres, 1e-12) / P_REF);
    const x = maxX * volts * Hm * Math.SQRT2;               // peak excursion, m
    const v = maxV * volts * Hm * Math.SQRT2;               // peak port air speed, m/s
    out.spl.push(spl);
    out.splCabin.push(spl + cabinGainDb(f, opts.cabinLen, opts.cabinSlope));
    out.excursion.push(x * 1000);
    out.portVel.push(v);
    out.impedance.push(abs(Zin));
    // power-limited max SPL: whichever bites first, rated power or Xmax
    const pX = x > 0 ? power * (drv.xmax / x) ** 2 : Infinity;
    const pMax = Math.min(drv.rmsPower, pX);
    out.splMax.push(spl + 10 * Math.log10(pMax / power) + (opts.maxWithCabin ? cabinGainDb(f, opts.cabinLen, opts.cabinSlope) : 0));
    const ph = arg(mul(Uout, H));
    phases.push(ph);
  }
  // unwrap phase and compute group delay (ms)
  const un = [];
  let off = 0;
  for (let i = 0; i < N; i++) {
    if (i > 0) {
      const d = phases[i] - phases[i - 1];
      if (d > Math.PI) off -= TAU;
      else if (d < -Math.PI) off += TAU;
    }
    un.push(phases[i] + off);
  }
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
    const gd = -(un[b] - un[a]) / (TAU * (freqs[b] - freqs[a]));
    out.groupDelay.push(Math.max(-200, Math.min(200, gd * 1000)));
  }
  out.phase = un.map((v) => (v * 180) / Math.PI);
  // passband asymptote (half-space, 1 m): p = rho * Bl * Sd * e * N / (2 pi Re Mms)
  const pAsym = (RHO * drv.bl * drv.sd * volts * ndrv) / (TAU * drv.re * drv.mms);
  out.refAsym = 20 * Math.log10(pAsym / P_REF);
  return out;
}

/** Summary numbers read off a simulation. */
export function analyze(sim, kind) {
  const { freqs, spl } = sim;
  const inBand = freqs.map((f, i) => [f, spl[i]]).filter(([f]) => f >= 15 && f <= 200);
  let peak = -Infinity, fPeak = 0;
  for (const [f, s] of inBand) if (s > peak) { peak = s; fPeak = f; }
  // reference level: mass-controlled passband asymptote for direct radiators, peak for bandpass
  let ref;
  if (kind && kind.startsWith('bp')) ref = peak;
  else ref = sim.refAsym != null ? sim.refAsym : peak;
  const cross = (target, fromLow = true) => {
    const idx = freqs.map((f, i) => i);
    const order = fromLow ? idx : idx.reverse();
    let prev = null;
    for (const i of order) {
      if (freqs[i] < 12 || freqs[i] > 240) continue;
      if (spl[i] >= target) {
        if (prev == null) return freqs[i];
        // interpolate in log f
        const f0 = freqs[prev], f1 = freqs[i], s0 = spl[prev], s1 = spl[i];
        const t = (target - s0) / (s1 - s0);
        return Math.exp(Math.log(f0) + t * (Math.log(f1) - Math.log(f0)));
      }
      prev = i;
    }
    return null;
  };
  const f3 = cross(ref - 3, true), f10 = cross(ref - 10, true);
  const f3hi = kind && kind.startsWith('bp') ? cross(ref - 3, false) : null;
  const maxX = Math.max(...sim.excursion.filter((_, i) => freqs[i] >= 15 && freqs[i] <= 120));
  const maxV = Math.max(...sim.portVel.filter((_, i) => freqs[i] >= 15 && freqs[i] <= 120));
  const zmin = Math.min(...sim.impedance.filter((_, i) => freqs[i] >= 15 && freqs[i] <= 200));
  const at = (target) => {
    let best = 0;
    freqs.forEach((f, i) => { if (Math.abs(Math.log(f / target)) < Math.abs(Math.log(freqs[best] / target))) best = i; });
    return best;
  };
  return { ref, peak, fPeak, f3, f10, f3hi, maxX, maxV, zmin, splAt40: spl[at(40)], at };
}

export const helpers = { cx, add, sub, mul, div, abs, arg, solve };
