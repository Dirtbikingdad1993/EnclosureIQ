// Whole-system math: amplifier power at the wired load, current draw, wire and fuse sizing.

/** RMS power the amp makes into `ohms` (interpolated in 1/Z between rated points). null when below its minimum load. */
export function ampPowerAt(amp, ohms, at12v = false) {
  if (!amp || !ohms) return null;
  const table = (at12v && amp.power12) || amp.power || {};
  const pts = Object.entries(table).map(([z, p]) => [+z, +p]).filter(([z, p]) => z > 0 && p > 0).sort((a, b) => a[0] - b[0]);
  if (!pts.length) return null;
  const minZ = amp.minOhms || pts[0][0];
  if (ohms < minZ - 1e-6) return { power: null, belowMin: true };
  const exact = pts.find(([z]) => Math.abs(z - ohms) < 1e-6);
  if (exact) return { power: exact[1] };
  if (ohms > pts[pts.length - 1][0]) { const [z, p] = pts[pts.length - 1]; return { power: p * z / ohms, extrapolated: true }; }
  if (ohms < pts[0][0]) { const [z, p] = pts[0]; return { power: p, extrapolated: true }; }
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, p0] = pts[i], [z1, p1] = pts[i + 1];
    if (ohms >= z0 && ohms <= z1) {
      const t = (1 / ohms - 1 / z0) / (1 / z1 - 1 / z0);
      return { power: p0 + t * (p1 - p0), interpolated: true };
    }
  }
  return null;
}
export const maxRated = (amp) => Math.max(0, ...Object.values(amp?.power || {}).map(Number));

// copper resistance, ohms per foot
const AWG = [
  { g: '8 AWG', r: 0.000628, amp: 60 }, { g: '4 AWG', r: 0.000249, amp: 150 },
  { g: '2 AWG', r: 0.000156, amp: 190 }, { g: '1/0 AWG', r: 0.0000983, amp: 260 },
  { g: '2/0 AWG', r: 0.0000779, amp: 300 },
];
/** Current draw at full output and the smallest OFC copper gauge that keeps the drop under 0.5 V. */
export function electrical({ totalPower, amp, runFt = 17, alternator = 130 }) {
  const eff = (amp?.efficiency ? amp.efficiency / 100 : null) || (amp?.class === 'AB' ? 0.55 : 0.8);
  const current = totalPower / (eff * 13.8);
  const loop = runFt + 3; // power run plus a short ground
  let pick = AWG[AWG.length - 1];
  for (const w of AWG) if (current * w.r * loop <= 0.5 && current <= w.amp) { pick = w; break; }
  const drop = current * pick.r * loop;
  const fuse = amp?.fuse || Math.ceil((current * 1.2) / 10) * 10;
  return {
    current, efficiency: eff, gauge: pick.g, drop, fuse, runFt,
    alternatorWarn: current > alternator * 0.55,
    musicCurrent: current * 0.45, // typical music duty
  };
}
