// File exports: PDF build sheet (jsPDF), CSV cut list, design JSON.
import { fracIn, units } from './ui.js';
import { orthoViews, sheetSvg, isoSnapshot, PRINT_PAL } from './draw.js';
import * as G from './geometry.js';
import { summaryText } from './model.js';

let dlPromise = null;
async function saveFile(filename, data, mime) {
  if (!dlPromise) dlPromise = window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  const dl = await dlPromise;
  if (dl) {
    try { await dl.save({ filename, data }); return true; }
    catch (e) { if (e?.code === 'cancelled' || e?.code === 'declined') return false; if (e?.code !== 'unavailable') throw e; }
  }
  // outside the Claude viewer: an ordinary download link works
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
const slug = (s) => (s || 'enclosure').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'enclosure';

export function cutListRows(box) {
  return box.panels.map((p, i) => ({ n: i + 1, name: p.name, qty: p.qty, a: p.a, b: p.b, t: p.material === 'tube' ? null : p.t, note: p.note || '' }));
}
export function cutListText(box) {
  return cutListRows(box).map((r) => `${r.n}. ${r.name} ×${r.qty}: ${fracIn(r.a)}" × ${fracIn(r.b)}"${r.t ? ` (${fracIn(r.t)}" thick)` : ''}${r.note ? ` · ${r.note}` : ''}`).join('\n');
}
export async function downloadCsv(res) {
  const rows = [['#', 'Panel', 'Qty', 'Length (in)', 'Width (in)', 'Thickness (in)', 'Length (fraction)', 'Width (fraction)', 'Notes']];
  cutListRows(res.box).forEach((r) => rows.push([r.n, r.name, r.qty, r.a.toFixed(3), r.b.toFixed(3), r.t ?? '', fracIn(r.a), fracIn(r.b), r.note]));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  return saveFile(`${slug(res.ds.name)}-cut-list.csv`, csv, 'text/csv');
}
export async function downloadDesign(res) {
  const data = JSON.stringify({ app: 'EnclosureIQ', version: 1, design: res.ds, sub: res.sub, amp: res.amp, vehicle: res.vehicle }, null, 2);
  return saveFile(`${slug(res.ds.name)}.enclosureiq.json`, data, 'application/json');
}

// ---------------------------------------------------------------- PDF
function loadScript(src) {
  return new Promise((ok, bad) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('load')); document.head.append(s);
  });
}
function svgToPng(svg, scale = 2) {
  return new Promise((ok, bad) => {
    const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
    const w = m ? +m[1] : 800, h = m ? +m[2] : 600;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok({ data: c.toDataURL('image/jpeg', 0.86), w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error('svg')); };
    img.src = url;
  });
}
const pdfSafe = (s) => String(s ?? '').replace(/Ω/g, ' ohm').replace(/≈/g, '~').replace(/−/g, '-').replace(/→/g, '->').replace(/✓/g, 'OK').replace(/✗/g, 'X').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/³/g, '3').replace(/²/g, '2').replace(/[^\x00-\xFF—·°×•]/g, '');

export async function downloadPdf(res, extras) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PW = 612, PH = 792, M = 40;
  const ink = [28, 30, 33], mute = [91, 95, 102], acc = [217, 72, 15];
  let y = M;
  const head = (title, sub) => {
    doc.setFillColor(28, 30, 33); doc.rect(0, 0, PW, 54, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('EnclosureIQ', M, 34);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(pdfSafe(title), PW - M, 26, { align: 'right' });
    doc.setTextColor(255, 160, 120); doc.text(pdfSafe(sub), PW - M, 40, { align: 'right' });
    doc.setTextColor(...ink); y = 78;
  };
  const h2 = (t) => { if (y > PH - 80) newPage(); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...acc); doc.text(pdfSafe(t.toUpperCase()), M, y); doc.setTextColor(...ink); y += 16; };
  const para = (t, size = 9.5, color = ink) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfSafe(t), PW - 2 * M);
    lines.forEach((l) => { if (y > PH - M) newPage(); doc.text(l, M, y); y += size * 1.35; });
    doc.setTextColor(...ink);
  };
  const newPage = () => { doc.addPage(); head(res.ds.name || 'Enclosure', 'Build sheet (continued)'); };
  const image = async (svg, maxW, maxH, x = M) => {
    const png = await svgToPng(svg);
    const s = Math.min(maxW / png.w, maxH / png.h);
    if (y + png.h * s > PH - M) newPage();
    doc.addImage(png.data, 'JPEG', x, y, png.w * s, png.h * s, undefined, 'FAST');
    return png.h * s;
  };
  const { ds, box, sub } = res;
  const date = new Date().toLocaleDateString();
  head(ds.name || 'Enclosure', `${G.BOX_TYPES[ds.type].label} · ${date}`);

  // summary key/value grid
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(pdfSafe(ds.name || 'Enclosure build sheet'), M, y); y += 20;
  para(`${ds.n} × ${sub.brand} ${sub.model} in a ${G.BOX_TYPES[ds.type].label.toLowerCase()} enclosure${res.vehicle ? ` for a ${res.vehicle.years || ''} ${res.vehicle.make || ''} ${res.vehicle.model}`.replace(/\s+/g, ' ') : ''}.`, 10, mute);
  y += 4;
  const kv = extras.keyValues;
  const colW = (PW - 2 * M) / 3;
  kv.forEach(([k, v], i) => {
    const cx = M + (i % 3) * colW, cy = y + Math.floor(i / 3) * 34;
    doc.setFontSize(7.5); doc.setTextColor(...mute); doc.setFont('helvetica', 'normal'); doc.text(pdfSafe(k.toUpperCase()), cx, cy);
    doc.setFontSize(11); doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.text(pdfSafe(v), cx, cy + 14);
  });
  y += Math.ceil(kv.length / 3) * 34 + 6;
  y += await image(isoSnapshot(box, ds, sub, {}, 900, 520), PW - 2 * M, 300) + 10;
  if (box.warnings.length) { h2('Check before building'); box.warnings.forEach((w) => para(`• ${w}`, 9, [180, 30, 30])); }

  // drawings
  doc.addPage(); head(ds.name || 'Enclosure', 'Drawings');
  const v = orthoViews(box, ds, sub, PRINT_PAL, 520);
  h2('Front view');
  y += await image(v.front, PW - 2 * M, 250) + 12;
  if (v.side) {
    const half = (PW - 2 * M - 16) / 2;
    h2('Side view and top section');
    const y0 = y;
    const hs = await image(v.side, half, 250, M);
    y = y0;
    const ht = await image(v.top, half, 250, M + half + 16);
    y = y0 + Math.max(hs, ht) + 12;
  }

  // cut list
  doc.addPage(); head(ds.name || 'Enclosure', 'Cut list');
  h2(`Cut list (${fracIn(ds.t)}" material unless noted)`);
  const cols = [[M, '#'], [M + 20, 'Panel'], [M + 250, 'Qty'], [M + 280, 'Length × Width'], [M + 390, 'Notes']];
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); cols.forEach(([x, t]) => doc.text(pdfSafe(t), x, y)); y += 6;
  doc.setDrawColor(200); doc.line(M, y, PW - M, y); y += 11;
  doc.setFont('helvetica', 'normal');
  cutListRows(box).forEach((r) => {
    const note = doc.splitTextToSize(pdfSafe(r.note), PW - M - (M + 390));
    const rowH = Math.max(1, note.length) * 10 + 4;
    if (y + rowH > PH - M) { newPage(); }
    doc.text(String(r.n), M, y); doc.text(doc.splitTextToSize(pdfSafe(r.name), 225)[0], M + 20, y); doc.text(String(r.qty), M + 250, y);
    doc.setFont('courier', 'normal'); doc.text(`${fracIn(r.a)}" × ${fracIn(r.b)}"`.replace('×', 'x'), M + 280, y); doc.setFont('helvetica', 'normal');
    doc.setTextColor(...mute); note.forEach((l, i) => doc.text(l, M + 390, y + i * 10)); doc.setTextColor(...ink);
    y += rowH;
  });
  y += 8;
  h2(`Sheet layout (${extras.nest.sheets.length} sheet${extras.nest.sheets.length > 1 ? 's' : ''} of 4' × 8')`);
  for (let i = 0; i < extras.nest.sheets.length; i++) { y += await image(sheetSvg(extras.nest.sheets[i], extras.nest.sheet, PRINT_PAL, 640, i), PW - 2 * M, 220) + 10; }

  // instructions
  doc.addPage(); head(ds.name || 'Enclosure', 'Build steps, wiring and materials');
  h2('Materials');
  extras.materials.forEach((m) => para(`• ${m}`, 9.5));
  y += 6; h2('Wiring and amplifier');
  extras.wiring.forEach((m) => para(`• ${m}`, 9.5));
  y += 6; h2('Build steps');
  extras.steps.forEach((s, i) => para(`${i + 1}. ${s.title}: ${s.text}`, 9.5));
  y += 6; h2('Design summary');
  para(summaryText(res), 8.5, mute);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(...mute); doc.text(`Page ${i} of ${pages} · Simulated with Thiele/Small models. Verify driver specs against the manual before cutting.`, M, PH - 18); }
  const blob = doc.output('blob');
  return saveFile(`${slug(ds.name)}-build-sheet.pdf`, blob, 'application/pdf');
}
