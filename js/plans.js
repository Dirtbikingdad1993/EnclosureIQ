// Build plans: title block, drawings, cut list, panel details, sheet layouts, port & wiring details, materials, steps.
import { h, clear, units, fracIn, n1, toast } from './ui.js';
import * as G from './geometry.js';
import { orthoViews, sheetSvg, panelSvg, panelHoles, orbitView, svgEl } from './draw.js';
import { cutListText, downloadCsv, downloadPdf, downloadDesign } from './export.js';

export function buildExtras(r) {
  const { ds, box, sub } = r;
  const nest = G.nestSheets(box.panels);
  const od = sub.overallDia || (sub.cutout || 11) + 1.4;
  const cut = sub.cutout || od - 1.4;
  const edgeLen = box.panels.filter((p) => p.material !== 'tube').reduce((s, p) => s + p.qty * 2 * (p.a + p.b), 0) / 2;
  const screws = Math.ceil(edgeLen / 6 / 10) * 10;
  const seams = box.panels.filter((p) => p.material !== 'tube').reduce((s, p) => s + p.qty * (p.a + p.b), 0) / 12;
  const carpetSqFt = box.surface * 1.15;
  const units_ = ds.n * (ds.isobaric ? 2 : 1);
  const tubeTotal = box.ports.filter((p) => p.kind !== 'slot').reduce((s, p) => s + p.length * p.count, 0);
  const speakerGauge = (r.ampAt?.power || r.powerPerUnit * ds.n) > 1500 ? '8 AWG' : (r.ampAt?.power || r.powerPerUnit * ds.n) > 700 ? '10 AWG' : '12 AWG';
  const materials = [
    box.shape === 'board' ? `${fracIn(ds.t)}" MDF or plywood: enough for 2 × ${fracIn(box.ext.w)}" × ${fracIn(box.ext.h)}" baffle layers` : `${nest.sheets.length} sheet${nest.sheets.length > 1 ? 's' : ''} of ${fracIn(ds.t)}" MDF (4' × 8'), ${Math.round(nest.efficiency * 100)}% used${nest.sheets.some((s) => s.oversize) ? ' (one panel is larger than a sheet: buy a 5×5 or join two pieces)' : ''}`,
    `Wood glue (PVA, e.g. Titebond II): ${Math.max(1, nest.sheets.length)} × 16 oz bottle`,
    `${screws} coarse-thread wood screws, 1-5/8" (pre-drill and countersink every ~6")`,
    `${Math.max(1, Math.ceil(seams / 25))} tube${seams > 25 ? 's' : ''} of silicone or polyurethane sealant for the inside seams`,
    tubeTotal > 0 ? `Port tube: ${fracIn(tubeTotal + 2)}" total of ${box.ports.find((p) => p.kind !== 'slot').dia}" ID PVC or aero port (${box.ports.filter((p) => p.kind !== 'slot').map((p) => `${p.count} × ${fracIn(p.length)}"`).join(', ')})` : null,
    `${units_ * 8} T-nuts or threaded inserts with machine screws (8 per sub)`,
    `Foam gasket tape: ${Math.ceil((units_ * Math.PI * cut) / 12 + 1)} ft (under each sub's flange)`,
    `Terminal cup${ds.type.startsWith('bp') ? ' (on the chamber that holds the sub)' : ''} and ${Math.ceil(units_ * 3 + 3)} ft of 12 AWG internal speaker wire`,
    `${speakerGauge} speaker wire from amp to box`,
    box.shape !== 'board' ? `Carpet (or vinyl): about ${Math.ceil(carpetSqFt)} sq ft (${(carpetSqFt / 9).toFixed(1)} sq yd), plus 1–2 cans of high-temp spray adhesive` : null,
    ds.type === 'sealed' ? `Optional polyfill: about ${n1(box.net * 0.75, 1)} lb, loosely packed (adds a little effective volume)` : null,
    `${r.elec.gauge} OFC power and ground kit, ${r.elec.fuse} A fuse within 18" of the battery`,
    'Straps, brackets or bolts to secure the box to the vehicle',
  ].filter(Boolean);

  const wiring = [];
  const w = r.wiring.find((x) => Math.abs(x.z - r.finalZ) < 1e-6);
  wiring.push(`Final load: ${+r.finalZ.toFixed(2)} Ω (${w?.ways.join('; or ') || ''}).`);
  if ((sub.coils || 1) > 1) wiring.push(`Each sub has ${sub.coils} × ${sub.coilOhms} Ω voice coils. Wire every sub the same way; never leave one coil disconnected.`);
  if (r.amp) {
    wiring.push(r.ampAt?.power ? `${r.amp.brand} ${r.amp.model}: about ${r.ampAt.power.toFixed(0)} W at ${+r.finalZ.toFixed(2)} Ω${r.ampAt.interpolated ? ' (interpolated between rated loads)' : ''}, ${(r.ampAt.power / ds.n).toFixed(0)} W per ${ds.isobaric ? 'pair' : 'sub'} vs ${sub.rms} W rated.` : `${r.amp.brand} ${r.amp.model} is NOT stable at ${r.finalZ} Ω. Use a load of ${r.amp.minOhms} Ω or higher.`);
    if (r.amp.subsonic) wiring.push(`Amp subsonic filter (${r.amp.subsonic}): set to about ${ds.type === 'ported' ? Math.max(15, Math.round(box.ports[0]?.fb - 5)) : 20} Hz.`);
  }
  wiring.push(`Low-pass filter: ${ds.lp.order ? `${ds.lp.fc} Hz` : 'about 80 Hz'} to blend with the door speakers. Bass boost: 0 dB to start.`);
  wiring.push('Set the gain with a 40–50 Hz test tone and a meter or oscilloscope (see the gain-setting guide), never by ear at full volume.');
  wiring.push(`Power: ~${r.elec.current.toFixed(0)} A at full output. ${r.elec.gauge} copper over a ${r.elec.runFt} ft run drops about ${r.elec.drop.toFixed(2)} V. Ground to bare chassis metal within 18".`);

  const steps = [];
  const S = (title, text) => steps.push({ title, text });
  S('Measure twice', `Confirm the space (${r.loc ? `${fracIn(r.loc.w)}" × ${fracIn(r.loc.h)}" × ${fracIn(r.loc.d)}"` : 'your install area'}) and the opening the box passes through. Check the sub's actual cutout (${fracIn(cut)}") and mounting depth (${fracIn(sub.mountDepth)}") against the sub in hand or its template.`);
  S('Cut the panels', `Cut every panel on the cut list. Account for the saw kerf (about 1/8") between parts and keep panels square; ${box.shape === 'wedge' ? `set the blade to ${(Math.atan((box.ext.d - box.ext.dTop) / box.ext.h) * 180 / Math.PI).toFixed(1)}° for the beveled edges and cut the side panels as trapezoids.` : 'label each panel as you go.'}`);
  S('Cut the driver and port holes', `Use a circle jig on a router (or a jigsaw) to cut ${units_} × ${sub.shape === 'square' ? `${fracIn(cut)}" square` : `${fracIn(cut)}" diameter`} hole${units_ > 1 ? 's' : ''}${box.ports.some((p) => p.kind !== 'slot') ? ` and the ${box.ports.filter((p) => p.kind !== 'slot').map((p) => `${p.dia}" port hole${p.count > 1 ? 's' : ''}`).join(', ')}` : ''}. Test-fit the sub before assembly.`);
  if ((ds.baffleLayers || 1) > 1) S('Laminate the baffle', `Glue and screw the ${ds.baffleLayers} baffle layers together, then flush-trim the holes with a pattern bit so they match.`);
  if (ds.type.startsWith('bp')) S('Build the divider(s)', 'Cut the sub hole in divider 1 and any internal port holes. The sub mounts on this divider, firing into the front chamber; plan the wiring path to the terminal cup before closing up.');
  S('Assemble the shell', `Glue and screw the bottom to one side panel, then add the ${box.shape === 'wedge' ? 'front, sloped back' : 'front baffle, back'} and ${ds.type.startsWith('bp') ? 'dividers' : 'port walls'}. Clamp, check for square, and pre-drill every screw so the MDF doesn't split.`);
  if (box.ports.some((p) => p.kind === 'slot')) S('Build the slot port', box.ports.filter((p) => p.kind === 'slot').map((p) => `Set the port wall ${fracIn(p.w)}" from the ${ds.type.startsWith('bp') ? 'chamber wall' : 'side panel'}; the port is ${fracIn(p.length)}" long${p.layout?.legs === 2 ? ' and turns once along the back wall, leaving at least a slot-width gap at the end' : ''}. Round over the port mouth edges with a 1/2" roundover bit to cut noise.`).join(' '));
  if (box.ports.some((p) => p.kind !== 'slot')) S('Install the port tubes', `Cut the tubes to ${box.ports.filter((p) => p.kind !== 'slot').map((p) => `${fracIn(p.length)}"`).join(' / ')} and glue them in flush with the outside face. Keep at least one port diameter between the inner end and any wall.`);
  S('Brace it', 'Add a window brace or a couple of 1" dowels between the largest opposite panels (anything over about 12" unsupported). Count their volume in the bracing displacement field.');
  S('Seal every seam', `Run sealant along every inside joint. ${ds.type === 'sealed' ? 'A sealed box must be airtight: any leak lowers Qtc and output.' : 'Leaks in a ported box change the tuning and whistle.'}`);
  if (ds.type.startsWith('bp')) S('Make an access panel', 'Make one panel removable (screws into threaded inserts with foam gasket) so the sub inside can be serviced.');
  S('Install the terminal cup', 'Drill for the terminal cup, seal it in, and run the internal wire to the sub with enough slack to remove the sub later.');
  S('Close and finish', 'Glue on the last panel, let the glue cure overnight, then sand the edges, round the corners slightly and wrap in carpet or paint.');
  if (ds.blowThrough) S('Build the blow-through wall', 'Frame the wall with cleats, cut holes that line up with the subs and port, and seal the box face to the wall with foam gasket so no air leaks around it.');
  S('Mount the subs', `Lay gasket tape on the flange, wire the coils for a final ${+r.finalZ.toFixed(2)} Ω, then tighten the mounting screws in a star pattern. Don't over-tighten.`);
  S('Secure it in the vehicle', 'Bolt or strap the box to the vehicle structure. An unsecured box becomes a projectile in a crash.');
  S('Set up and check', `Set the subsonic${ds.type === 'ported' ? ` to ~${Math.max(15, Math.round((box.ports[0]?.fb || 30) - 5))} Hz` : ''}, low-pass and gain. Optional: sweep the impedance with a DATS or similar meter: the dip between the two peaks is the real tuning (target ${box.ports[0]?.fb ? box.ports[0].fb + ' Hz' : 'n/a'}).`);
  const keyValues = [
    ['External (W × H × D)', box.shape === 'board' ? `${fracIn(box.ext.w)} × ${fracIn(box.ext.h)}"` : `${fracIn(box.ext.w)} × ${fracIn(box.ext.h)} × ${fracIn(box.ext.d)}"`],
    ['Net volume', `${box.net.toFixed(2)} cu ft`],
    ['Gross volume', `${box.gross.toFixed(2)} cu ft`],
    ['Tuning', box.ports.length ? box.ports.map((p) => `${p.fb} Hz`).join(' / ') : 'sealed'],
    ['Port', box.ports[0] ? `${box.ports[0].kind} ${fracIn(box.ports[0].length)}" long` : 'none'],
    ['F3 (anechoic)', r.anRaw?.f3 ? `${r.anRaw.f3.toFixed(1)} Hz` : '—'],
    ['Subwoofers', `${ds.n} × ${sub.model}`],
    ['Final load', `${+r.finalZ.toFixed(2)} ohm`],
    ['Amplifier', r.amp ? `${r.amp.model}${r.ampAt?.power ? ` (${r.ampAt.power.toFixed(0)} W)` : ''}` : 'not chosen'],
    ['Material', `${fracIn(ds.t)}" MDF, ${ds.baffleLayers}-layer baffle`],
    ['Weight (est.)', `${Math.round(box.weight)} lb empty`],
    ['Sheets', `${nest.sheets.length} × 4' × 8'`],
  ];
  return { nest, materials, wiring, steps, keyValues };
}

export function renderPlans(r) {
  const { ds, box, sub } = r;
  const root = h('div', { class: 'plans' });
  if (!box.ext) { root.append(h('div', { class: 'card' }, h('p', null, 'Finish the design first.'))); return root; }
  const ex = buildExtras(r);
  const busy = (btn, fn) => async () => { btn.disabled = true; const t = btn.textContent; btn.textContent = 'Preparing…'; try { const ok = await fn(); if (ok) toast('File ready.', 'good'); } catch (e) { toast('Could not create the file. Try again.', 'bad'); console.error(e); } finally { btn.disabled = false; btn.textContent = t; } };
  const pdfBtn = h('button', { class: 'btn primary' }, 'Download PDF build sheet');
  pdfBtn.onclick = busy(pdfBtn, () => downloadPdf(r, ex));
  const csvBtn = h('button', { class: 'btn' }, 'Cut list (CSV)');
  csvBtn.onclick = busy(csvBtn, () => downloadCsv(r));
  const jsonBtn = h('button', { class: 'btn' }, 'Design file');
  jsonBtn.onclick = busy(jsonBtn, () => downloadDesign(r));
  const copyBtn = h('button', { class: 'btn ghost', onclick: async () => { const txt = cutListText(box); try { await navigator.clipboard.writeText(txt); toast('Cut list copied.', 'good'); } catch { const ta = h('textarea', { class: 'copy-fallback', readonly: true }, txt); copyBtn.after(ta); ta.select(); toast('Select and copy the text below.'); } } }, 'Copy cut list');

  root.append(h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'Build plans'), h('h1', null, ds.name || 'Enclosure')), h('div', { class: 'btn-row' }, pdfBtn, csvBtn, jsonBtn, copyBtn)));

  // title block
  root.append(h('section', { class: 'card title-block' },
    h('div', { class: 'tb-grid' }, ex.keyValues.map(([k, v]) => h('div', null, h('span', null, k), h('b', null, k.startsWith('External') ? (units.metric ? units.dims(box.ext.w, box.ext.h, box.ext.d) : v) : v)))),
    box.warnings.length ? h('div', { class: 'issues' }, box.warnings.map((w) => h('p', { class: 'note bad' }, w))) : null));

  // drawings
  const v = orthoViews(box, ds, sub);
  const ov = orbitView(box, ds, sub, { finish: 'mdf' });
  root.append(h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Drawings'), h('span', { class: 'muted small' }, 'Blue = dimensions, orange dashed = cutout')),
    h('div', { class: 'draw-grid' },
      h('figure', { class: 'drawing drawing-3d' }, ov, h('figcaption', null, '360° view: drag to rotate')),
      v.front ? h('figure', { class: 'drawing' }, svgEl(v.front)) : null,
      v.side ? h('figure', { class: 'drawing' }, svgEl(v.side)) : null,
      v.top ? h('figure', { class: 'drawing' }, svgEl(v.top)) : null)));

  // cut list
  root.append(h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, 'Cut list'), h('span', { class: 'muted small' }, `${fracIn(ds.t)}" material · sizes to the nearest 1/16"`)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'cut-table' },
      h('thead', null, h('tr', null, ['#', 'Panel', 'Qty', 'Length', 'Width', 'Notes'].map((t) => h('th', null, t)))),
      h('tbody', null, box.panels.map((p, i) => h('tr', null, h('td', null, i + 1), h('td', null, h('b', null, p.name)), h('td', { class: 'num' }, p.qty), h('td', { class: 'num' }, units.fmtLen(p.a)), h('td', { class: 'num' }, units.fmtLen(p.b)), h('td', { class: 'muted small' }, p.note || '')))))),
    h('h3', { class: 'sub-head' }, 'Panels with cutouts'),
    h('div', { class: 'panel-grid' }, box.panels.filter((p) => (p.cut || []).length || p.shape === 'trap').map((p) => {
      const holes = panelHoles(p, sub);
      return h('figure', { class: 'drawing' }, svgEl(panelSvg({ ...p, cut: holes })), h('figcaption', null, h('b', null, p.name),
        holes.length ? h('ul', { class: 'hole-list' }, holes.map((c) => h('li', null, c.kind === 'driver' ? `Sub hole ${sub.shape === 'square' ? '□' : 'Ø'}${units.fmtLen(c.cutout)} centered ${units.fmtLen(c.x)} from left, ${units.fmtLen(c.y)} from bottom` : c.kind === 'slot' ? `Port slot ${units.fmtLen(c.w)} × ${units.fmtLen(c.h)}` : `Port hole Ø${units.fmtLen(c.d)} at ${units.fmtLen(c.x)}, ${units.fmtLen(c.y)}`))) : null));
    }))));

  // sheets
  root.append(h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, `Sheet layout: ${ex.nest.sheets.length} × 4' × 8'`), h('span', { class: 'muted small' }, `${Math.round(ex.nest.efficiency * 100)}% of the material used · 1/8" kerf allowed`)),
    h('div', { class: 'sheet-list' }, ex.nest.sheets.map((s, i) => h('figure', { class: 'drawing' }, svgEl(sheetSvg(s, ex.nest.sheet, undefined, 760, i)), h('figcaption', null, `Sheet ${i + 1}${s.oversize ? ': part larger than a full sheet' : ''}`))))));

  // ports
  if (box.ports.length) root.append(h('section', { class: 'card' }, h('h2', null, 'Port details'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'cut-table' },
      h('thead', null, h('tr', null, ['Chamber', 'Type', 'Size', 'Area', 'Length', 'Tuning', 'Exits'].map((t) => h('th', null, t)))),
      h('tbody', null, box.ports.map((p) => h('tr', null, h('td', null, box.chambers[p.chamber]?.role || 'Main'), h('td', null, p.kind), h('td', { class: 'num' }, p.kind === 'slot' ? `${units.fmtLen(p.w)} × ${units.fmtLen(p.h)}` : `${p.count} × Ø${units.fmtLen(p.dia)}`), h('td', { class: 'num' }, units.fmtArea(p.totalArea)), h('td', { class: 'num' }, units.fmtLen(p.length)), h('td', { class: 'num' }, `${p.fb} Hz`), h('td', null, p.to === 'out' ? 'outside' : `chamber ${p.to + 1}`))))))));

  // wiring, materials, steps
  root.append(h('div', { class: 'two-col' },
    h('section', { class: 'card' }, h('h2', null, 'Wiring & amp setup'), h('ul', { class: 'check-list' }, ex.wiring.map((w) => h('li', null, w)))),
    h('section', { class: 'card' }, h('h2', null, 'Materials & shopping list'), h('ul', { class: 'check-list' }, ex.materials.map((m) => h('li', null, m))))));
  root.append(h('section', { class: 'card' }, h('h2', null, 'Step-by-step build'), h('ol', { class: 'steps' }, ex.steps.map((s) => h('li', null, h('b', null, s.title), h('p', null, s.text))))));
  return root;
}
