// Small SVG chart for frequency plots: log-frequency x axis, hover readout, threshold lines.
import { h, clear } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); return e; };

function niceStep(range, target = 6) {
  const raw = range / target, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
}

/**
 * series: [{ name, color, values:number[], dash?, width?, fill? }], freqs: number[]
 * hLines: [{ y, label, color, dash }], vLines: [{ x, label, color }]
 */
export function freqChart({ freqs, series, xMin = 10, xMax = 250, yMin, yMax, yUnit = '', yFmt = (v) => v.toFixed(1), hLines = [], vLines = [], yFloor, yCeil, height = 300, caption }) {
  const wrap = h('div', { class: 'chart' });
  const readout = h('div', { class: 'chart-readout', 'aria-live': 'off' });
  const legend = h('div', { class: 'chart-legend' }, series.filter((s) => s.name).map((s) => h('span', { class: 'lg' }, h('i', { style: { background: s.color, opacity: s.dash ? 0.7 : 1 } }), s.name)));
  const host = h('div', { class: 'chart-svg' });
  wrap.append(legend, host, readout);
  if (caption) wrap.append(h('p', { class: 'chart-caption' }, caption));

  const draw = () => {
    const W = Math.max(300, host.clientWidth || 640);
    const H = height;
    const m = { l: 46, r: 12, t: 22, b: 30 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const idx = freqs.map((f, i) => i).filter((i) => freqs[i] >= xMin && freqs[i] <= xMax);
    let lo = Infinity, hi = -Infinity;
    series.forEach((s) => idx.forEach((i) => { const v = s.values[i]; if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    hLines.forEach((l) => { if (isFinite(l.y)) { lo = Math.min(lo, l.y); hi = Math.max(hi, l.y); } });
    if (yMin != null) lo = yMin; if (yMax != null) hi = yMax;
    if (yFloor != null) lo = Math.max(lo, yFloor);
    if (yCeil != null) hi = Math.min(hi, yCeil);
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    const step = niceStep(hi - lo);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const X = (f) => m.l + (Math.log(f / xMin) / Math.log(xMax / xMin)) * pw;
    const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ph;
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': series.map((s) => s.name).join(', ') });
    // grid
    const g = S('g', { class: 'grid' });
    for (let v = lo; v <= hi + 1e-9; v += step) {
      g.append(S('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
      const t = S('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'tick' }); t.textContent = yFmt(v); g.append(t);
    }
    const majors = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 500].filter((f) => f >= xMin && f <= xMax);
    for (let f = xMin; f <= xMax; f += f < 100 ? 5 : 10) g.append(S('line', { x1: X(f), x2: X(f), y1: m.t, y2: H - m.b, class: 'minor' }));
    majors.forEach((f) => {
      g.append(S('line', { x1: X(f), x2: X(f), y1: m.t, y2: H - m.b }));
      const t = S('text', { x: X(f), y: H - m.b + 16, 'text-anchor': 'middle', class: 'tick' }); t.textContent = f; g.append(t);
    });
    const ax = S('text', { x: W - m.r, y: H - 4, 'text-anchor': 'end', class: 'axis' }); ax.textContent = 'Hz'; g.append(ax);
    const ay = S('text', { x: 4, y: 12, class: 'axis' }); ay.textContent = yUnit; g.append(ay);
    svg.append(g);
    // reference lines
    hLines.forEach((l) => {
      if (!(l.y >= lo && l.y <= hi)) return;
      svg.append(S('line', { x1: m.l, x2: W - m.r, y1: Y(l.y), y2: Y(l.y), stroke: l.color, 'stroke-width': 1.5, 'stroke-dasharray': l.dash || '6 4' }));
      const t = S('text', { x: W - m.r - 4, y: Y(l.y) - 5, 'text-anchor': 'end', fill: l.color, class: 'ref' }); t.textContent = l.label; svg.append(t);
    });
    vLines.forEach((l, k) => {
      if (!(l.x >= xMin && l.x <= xMax)) return;
      svg.append(S('line', { x1: X(l.x), x2: X(l.x), y1: m.t, y2: H - m.b, stroke: l.color, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      const t = S('text', { x: X(l.x) + 4, y: m.t + 12 + k * 14, fill: l.color, class: 'ref' }); t.textContent = l.label; svg.append(t);
    });
    // series
    const clip = Math.random().toString(36).slice(2);
    const defs = S('defs', {}); const cp = S('clipPath', { id: `c${clip}` }); cp.append(S('rect', { x: m.l, y: m.t, width: pw, height: ph })); defs.append(cp); svg.append(defs);
    const plot = S('g', { 'clip-path': `url(#c${clip})` });
    series.forEach((s) => {
      const pts = idx.filter((i) => isFinite(s.values[i])).map((i) => `${X(freqs[i]).toFixed(1)},${Y(Math.max(lo - step, Math.min(hi + step, s.values[i]))).toFixed(1)}`);
      if (!pts.length) return;
      if (s.fill) {
        plot.append(S('polygon', { points: `${X(freqs[idx[0]])},${Y(lo)} ${pts.join(' ')} ${X(freqs[idx[idx.length - 1]])},${Y(lo)}`, fill: s.color, opacity: 0.1 }));
      }
      plot.append(S('polyline', { points: pts.join(' '), fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.25, 'stroke-dasharray': s.dash || null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });
    svg.append(plot);
    // hover
    const cursor = S('line', { y1: m.t, y2: H - m.b, class: 'cursor', visibility: 'hidden' });
    const dots = series.map((s) => S('circle', { r: 3.5, fill: s.color, visibility: 'hidden' }));
    svg.append(cursor, ...dots);
    const setAt = (i) => {
      cursor.setAttribute('x1', X(freqs[i])); cursor.setAttribute('x2', X(freqs[i])); cursor.setAttribute('visibility', 'visible');
      clear(readout);
      readout.append(h('b', null, `${freqs[i].toFixed(freqs[i] < 100 ? 1 : 0)} Hz`));
      series.forEach((s, k) => {
        const v = s.values[i];
        if (!isFinite(v)) { dots[k].setAttribute('visibility', 'hidden'); return; }
        dots[k].setAttribute('cx', X(freqs[i])); dots[k].setAttribute('cy', Y(Math.max(lo, Math.min(hi, v)))); dots[k].setAttribute('visibility', 'visible');
        if (s.name) readout.append(h('span', null, h('i', { style: { background: s.color } }), `${s.name}: ${yFmt(v)} ${yUnit}`));
      });
    };
    const near = (clientX) => {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      const f = xMin * Math.pow(xMax / xMin, (x - m.l) / pw);
      let best = idx[0];
      for (const i of idx) if (Math.abs(Math.log(freqs[i] / f)) < Math.abs(Math.log(freqs[best] / f))) best = i;
      return best;
    };
    svg.addEventListener('pointermove', (e) => setAt(near(e.clientX)));
    svg.addEventListener('pointerdown', (e) => setAt(near(e.clientX)));
    svg.addEventListener('pointerleave', () => { cursor.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); });
    clear(host).append(svg);
    // default readout at ~40 Hz
    const i40 = idx.reduce((b, i) => (Math.abs(freqs[i] - 40) < Math.abs(freqs[b] - 40) ? i : b), idx[0]);
    setAt(i40); cursor.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
  };
  let lastW = 0;
  const ro = new ResizeObserver(() => { const w = host.clientWidth; if (Math.abs(w - lastW) > 2) { lastW = w; draw(); } });
  ro.observe(host);
  requestAnimationFrame(draw);
  wrap._dispose = () => ro.disconnect();
  return wrap;
}
