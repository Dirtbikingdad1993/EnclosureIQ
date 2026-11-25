// Explanatory diagrams for the guides. Inline SVG using the page's theme tokens.
const W = 520, H = 280;
const svg = (body, label, w = W, h = H) => `<svg class="illus" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">
<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill="var(--blue)"/></marker></defs>${body}</svg>`;
const T = (x, y, t, cls = '', anchor = 'start') => `<text x="${x}" y="${y}" class="il-t ${cls}" text-anchor="${anchor}">${t}</text>`;
const dim = (x1, y1, x2, y2, label, lx, ly, anchor = 'middle') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="il-dim" marker-start="url(#ar)" marker-end="url(#ar)"/>${T(lx ?? (x1 + x2) / 2, ly ?? (y1 + y2) / 2 - 6, label, 'il-dimt', anchor)}`;

export const ILLUSTRATIONS = {
  measureTrunk: () => svg(`
    ${T(20, 22, 'TRUNK, TOP VIEW', 'il-h')}
    <rect x="20" y="40" width="220" height="200" rx="10" class="il-fill2"/>
    <rect x="20" y="95" width="34" height="80" rx="12" class="il-well"/><rect x="206" y="95" width="34" height="80" rx="12" class="il-well"/>
    ${T(37, 190, 'wheel', 'il-small', 'middle')}${T(37, 202, 'well', 'il-small', 'middle')}${T(223, 190, 'wheel', 'il-small', 'middle')}${T(223, 202, 'well', 'il-small', 'middle')}
    ${dim(56, 135, 204, 135, 'Width between wells')}
    ${dim(130, 44, 130, 236, 'Depth', 140, 70, 'start')}
    ${T(130, 258, 'seat back ↑   trunk lip ↓', 'il-small', 'middle')}
    ${T(285, 22, 'TRUNK, SIDE VIEW', 'il-h')}
    <path d="M285 230 L500 230 L500 110 Q470 70 400 75 L285 75 Z" class="il-fill2"/>
    <path d="M400 75 Q470 70 500 110" class="il-line" fill="none" stroke-width="3"/>
    <line x1="430" y1="88" x2="430" y2="104" class="il-acc" stroke-width="3"/>${T(424, 100, 'latch / hinge', 'il-small', 'end')}
    ${dim(300, 228, 300, 92, 'Height to the', 306, 160, 'start')}${T(306, 174, 'lowest point', 'il-dimt')}
    ${dim(500, 228, 500, 112, '', 0, 0)}${T(494, 205, 'opening', 'il-dimt', 'end')}
  `, 'How to measure a trunk: width between the wheel wells, depth, height to the lowest point of the lid, and the opening'),

  measureWedge: () => svg(`
    ${T(20, 22, 'TRUCK BEHIND-SEAT SPACE, SIDE VIEW', 'il-h')}
    <rect x="300" y="40" width="22" height="200" class="il-wall"/>${T(311, 255, 'cab wall', 'il-small', 'middle')}
    <path d="M70 240 L170 240 L240 60 L210 52 Z" class="il-seat"/>${T(150, 150, 'seat back', 'il-small', 'middle')}
    <polygon points="178,238 298,238 298,66 240,66" class="il-space"/>
    ${dim(178, 228, 298, 228, 'Depth at floor')}
    ${dim(240, 86, 298, 86, 'Depth at top')}
    ${dim(340, 238, 340, 66, 'Height', 348, 156, 'start')}
    <line x1="40" y1="240" x2="480" y2="240" class="il-line"/>
    ${T(380, 50, 'Set the seat where you', 'il-small')}${T(380, 66, 'drive, then measure.', 'il-small')}
    ${T(380, 92, 'The box follows the', 'il-small')}${T(380, 108, 'seat-back angle.', 'il-small')}
  `, 'How to measure a truck behind-seat wedge space: depth at the floor, depth at the top and height'),

  boxTypes: () => {
    const curve = (x0, pts) => `<polyline points="${pts.map(([x, y]) => `${x0 + x},${y}`).join(' ')}" class="il-curve" fill="none"/>`;
    return svg(`
    ${T(20, 22, 'SAME SUB, THREE BOXES', 'il-h')}
    <g transform="translate(20 40)"><rect x="10" y="10" width="110" height="80" class="il-box"/><path d="M10 34 L24 42 L24 58 L10 66" class="il-drv"/>${T(65, 112, 'Sealed', 'il-b', 'middle')}${T(65, 128, 'small · tight · gentle roll-off', 'il-small', 'middle')}</g>
    <g transform="translate(190 40)"><rect x="10" y="10" width="140" height="80" class="il-box"/><path d="M10 30 L24 38 L24 54 L10 62" class="il-drv"/><rect x="4" y="72" width="12" height="12" class="il-gap"/><line x1="10" y1="74" x2="70" y2="74" class="il-line"/><line x1="10" y1="84" x2="70" y2="84" class="il-line"/>${T(80, 112, 'Ported', 'il-b', 'middle')}${T(80, 128, '~2× size · +3 dB near tuning', 'il-small', 'middle')}</g>
    <g transform="translate(370 40)"><rect x="10" y="10" width="130" height="80" class="il-box"/><line x1="55" y1="10" x2="55" y2="90" class="il-line" stroke-width="2"/><path d="M55 34 L69 42 L69 58 L55 66" class="il-drv"/><rect x="134" y="44" width="12" height="12" class="il-gap"/><line x1="105" y1="46" x2="140" y2="46" class="il-line"/><line x1="105" y1="54" x2="140" y2="54" class="il-line"/>${T(75, 112, 'Bandpass', 'il-b', 'middle')}${T(75, 128, 'loudest in a narrow band', 'il-small', 'middle')}</g>
    <line x1="30" y1="250" x2="490" y2="250" class="il-axis"/>${T(490, 268, 'frequency →', 'il-small', 'end')}${T(30, 196, 'output', 'il-small')}
    ${curve(30, [[0, 248], [40, 232], [80, 212], [120, 206], [160, 205]])}
    ${curve(200, [[0, 249], [30, 245], [55, 222], [80, 200], [110, 201], [160, 204]])}
    ${curve(360, [[0, 249], [30, 240], [60, 205], [80, 192], [100, 205], [130, 238], [150, 247]])}
  `, 'Comparison of sealed, ported and bandpass enclosures and their typical response');
  },

  subAnatomy: () => svg(`
    ${T(20, 22, 'INSIDE A SUBWOOFER (CUTAWAY)', 'il-h')}
    <path d="M80 60 L200 120 L200 170 L80 230" class="il-cone"/>
    <path d="M70 52 Q60 56 80 60 M70 238 Q60 234 80 230" class="il-acc" fill="none" stroke-width="5"/>
    <rect x="198" y="108" width="40" height="74" class="il-coil"/>
    <rect x="236" y="92" width="70" height="106" class="il-magnet"/><rect x="236" y="138" width="80" height="14" class="il-pole"/>
    <path d="M200 112 Q218 100 236 112 M200 178 Q218 190 236 178" class="il-line" fill="none" stroke-dasharray="4 3"/>
    ${T(40, 44, 'surround', 'il-small')}${T(112, 140, 'cone', 'il-small')}${T(242, 84, 'magnet / motor', 'il-small')}${T(160, 210, 'spider', 'il-small')}${T(188, 102, 'voice coil', 'il-small', 'end')}
    ${dim(336, 120, 336, 170, 'Xmax: how far the', 344, 140, 'start')}${T(344, 156, 'coil moves linearly', 'il-dimt')}
    ${dim(28, 62, 28, 228, 'Sd (cone area)', 36, 250, 'start')}
    ${T(360, 214, 'Fs, Qts, Vas describe how', 'il-small')}${T(360, 230, 'cone mass and suspension', 'il-small')}${T(360, 246, 'behave in a box.', 'il-small')}
  `, 'Cutaway of a subwoofer showing cone, surround, spider, voice coil, magnet, Xmax and Sd'),

  netGross: () => svg(`
    ${T(20, 22, 'GROSS VOLUME − DISPLACEMENT = NET VOLUME', 'il-h')}
    <rect x="40" y="44" width="300" height="200" class="il-box"/>
    <rect x="50" y="54" width="280" height="180" class="il-air"/>
    <path d="M50 110 L95 125 L95 175 L50 190 Z" class="il-disp"/>${T(100, 152, 'sub (motor + basket)', 'il-small')}
    <rect x="50" y="200" width="200" height="24" class="il-disp"/>${T(150, 216, 'port + its walls', 'il-small', 'middle')}
    <rect x="215" y="60" width="12" height="130" class="il-disp"/>${T(232, 80, 'brace', 'il-small')}
    ${T(360, 80, 'Gross = inside of the box', 'il-b')}${T(360, 104, 'Net = air the sub uses', 'il-b')}
    ${T(360, 140, 'Manufacturers quote NET.', 'il-small')}${T(360, 156, 'EnclosureIQ adds every', 'il-small')}${T(360, 172, 'displacement for you.', 'il-small')}
  `, 'Net volume equals gross volume minus sub, port and brace displacement'),

  slotPort: () => svg(`
    ${T(20, 22, 'SLOT PORT, TOP VIEW', 'il-h')}
    <rect x="30" y="40" width="300" height="200" class="il-box"/>
    <rect x="40" y="40" width="26" height="174" class="il-portfill"/><rect x="40" y="214" width="180" height="16" class="il-portfill"/>
    <rect x="66" y="40" width="8" height="166" class="il-wall"/><rect x="66" y="198" width="154" height="8" class="il-wall"/>
    <path d="M53 60 L53 222 L200 222" class="il-flow" fill="none"/>
    ${T(53, 34, 'mouth', 'il-small', 'middle')}${T(150, 120, 'box interior', 'il-small', 'middle')}
    ${dim(40, 250, 66, 250, 'width')}
    ${T(360, 70, 'Length is measured along', 'il-small')}${T(360, 86, 'the center of the channel.', 'il-small')}
    ${T(360, 118, 'Leave at least one slot', 'il-small')}${T(360, 134, 'width open at the end.', 'il-small')}
    ${T(360, 166, 'Round over the mouth', 'il-small')}${T(360, 182, 'edges to cut noise.', 'il-small')}
    ${T(360, 214, 'More area → longer port', 'il-b')}${T(360, 232, 'for the same tuning.', 'il-b')}
  `, 'Top view of a folded slot port with width, center-line length and exit clearance'),

  dvcWiring: () => {
    const coil = (x, y, lbl) => `<rect x="${x}" y="${y}" width="56" height="26" rx="4" class="il-coilbox"/>${T(x + 28, y + 17, lbl, 'il-small', 'middle')}${T(x - 6, y + 17, '+', 'il-acct', 'end')}${T(x + 62, y + 17, '−', 'il-t')}`;
    return svg(`
    ${T(20, 22, 'ONE DUAL-4-OHM SUB', 'il-h')}
    <g transform="translate(30 50)">${T(0, 0, 'Series → 8 Ω', 'il-b')}${coil(10, 16, 'coil 1')}${coil(10, 60, 'coil 2')}
      <path d="M72 29 H96 V51 H-14 V73 H4" class="il-wire" fill="none"/>${T(110, 55, 'jumper: coil 1 − to coil 2 +', 'il-small')}
      ${T(0, 120, 'Amp + → coil 1 +, coil 2 − → Amp −', 'il-small')}</g>
    <g transform="translate(280 50)">${T(0, 0, 'Parallel → 2 Ω', 'il-b')}${coil(10, 16, 'coil 1')}${coil(10, 60, 'coil 2')}
      <path d="M4 29 L-10 29 L-10 73 L4 73" class="il-wire" fill="none"/><path d="M72 29 L100 29 L100 73 L72 73" class="il-wire" fill="none"/>
      ${T(0, 120, 'Both + together, both − together', 'il-small')}</g>
    ${T(20, 214, 'TWO DUAL-4-OHM SUBS', 'il-h')}
    ${T(20, 236, 'Coils parallel (2 Ω each) + subs parallel → 1 Ω', 'il-small')}
    ${T(20, 254, 'Coils series (8 Ω each) + subs parallel → 4 Ω', 'il-small')}
    ${T(20, 272, 'Coils parallel (2 Ω each) + subs series → 4 Ω', 'il-small')}
  `, 'Wiring a dual voice coil subwoofer in series and in parallel', W, 290);
  },

  gainMeter: () => svg(`
    ${T(20, 22, 'SETTING GAIN WITH A MULTIMETER', 'il-h')}
    <rect x="30" y="60" width="180" height="110" rx="8" class="il-amp"/>${T(120, 100, 'AMP', 'il-b', 'middle')}${T(120, 120, 'gain ◐  LPF ◐  sub ◐', 'il-small', 'middle')}
    <rect x="64" y="150" width="20" height="14" class="il-term"/><rect x="156" y="150" width="20" height="14" class="il-term"/>${T(74, 184, 'SPK +', 'il-small', 'middle')}${T(166, 184, 'SPK −', 'il-small', 'middle')}
    <rect x="300" y="50" width="130" height="180" rx="12" class="il-meter"/><rect x="318" y="68" width="94" height="44" rx="4" class="il-screen"/>${T(365, 98, '44.7 V~', 'il-mono', 'middle')}
    ${T(365, 140, 'V AC', 'il-small', 'middle')}
    <path d="M74 164 Q160 250 330 222" class="il-probe-r" fill="none"/><path d="M166 164 Q230 230 400 222" class="il-probe-b" fill="none"/>
    ${T(450, 80, 'V = √(P × R)', 'il-b')}${T(450, 104, '1000 W into 2 Ω', 'il-small')}${T(450, 120, '= √2000 = 44.7 V', 'il-small')}
    ${T(450, 156, 'Subs disconnected,', 'il-small')}${T(450, 172, 'test tone playing,', 'il-small')}${T(450, 188, 'raise gain slowly.', 'il-small')}
  `, 'Measuring AC voltage at the amplifier speaker terminals to set gain'),

  assembly: () => svg(`
    ${T(20, 22, 'ASSEMBLY ORDER', 'il-h')}
    <rect x="40" y="200" width="200" height="24" class="il-panel"/>${T(140, 216, '1  bottom', 'il-small', 'middle')}
    <rect x="40" y="100" width="22" height="96" class="il-panel"/>${T(51, 92, '2', 'il-small', 'middle')}
    <rect x="218" y="100" width="22" height="96" class="il-panel"/>${T(229, 92, '2', 'il-small', 'middle')}
    <rect x="66" y="110" width="148" height="18" class="il-panel"/>${T(140, 123, '3  back', 'il-small', 'middle')}
    <rect x="66" y="140" width="148" height="20" class="il-panel"/>${T(140, 154, '4  port walls / braces', 'il-small', 'middle')}
    <rect x="66" y="170" width="148" height="22" class="il-panel"/>${T(140, 185, '5  front baffle', 'il-small', 'middle')}
    <rect x="40" y="50" width="200" height="24" class="il-panel" stroke-dasharray="5 3"/>${T(140, 66, '6  top (last, after sealing)', 'il-small', 'middle')}
    ${T(280, 70, 'Glue every joint.', 'il-b')}${T(280, 96, 'Pre-drill and countersink', 'il-small')}${T(280, 112, 'a screw every ~6".', 'il-small')}
    ${T(280, 140, 'Check square with a', 'il-small')}${T(280, 156, 'framing square before', 'il-small')}${T(280, 172, 'the glue sets.', 'il-small')}
    ${T(280, 204, 'Seal inside seams before', 'il-small')}${T(280, 220, 'the top goes on.', 'il-small')}
  `, 'Suggested panel assembly order for a box'),

  powerWiring: () => svg(`
    ${T(20, 22, 'POWER WIRING', 'il-h')}
    <rect x="30" y="80" width="90" height="60" rx="6" class="il-battery"/>${T(75, 116, 'BATTERY', 'il-small', 'middle')}
    <rect x="160" y="70" width="44" height="22" rx="4" class="il-fuse"/>${T(182, 64, 'fuse', 'il-small', 'middle')}
    <line x1="120" y1="88" x2="160" y2="81" class="il-red"/>${dim(120, 108, 204, 108, '≤ 18"')}
    <line x1="204" y1="81" x2="380" y2="90" class="il-red"/>${T(290, 76, 'power wire (sized for current + length)', 'il-small', 'middle')}
    <rect x="380" y="70" width="110" height="70" rx="6" class="il-amp"/>${T(435, 110, 'AMP', 'il-b', 'middle')}
    <line x1="435" y1="140" x2="435" y2="200" class="il-black"/><line x1="405" y1="200" x2="465" y2="200" class="il-line" stroke-width="3"/><line x1="415" y1="208" x2="455" y2="208" class="il-line" stroke-width="2"/><line x1="425" y1="216" x2="445" y2="216" class="il-line" stroke-width="2"/>
    ${T(435, 238, 'bare-metal chassis ground,', 'il-small', 'middle')}${T(435, 254, 'same gauge, short', 'il-small', 'middle')}
    ${T(30, 200, 'Big 3 upgrade:', 'il-b')}${T(30, 220, '• alternator + to battery +', 'il-small')}${T(30, 236, '• battery − to chassis', 'il-small')}${T(30, 252, '• engine block to chassis', 'il-small')}
  `, 'Battery to fuse to amplifier power wiring with chassis ground and Big 3 upgrade'),

  impedanceCurve: () => {
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const f = 15 * Math.pow(10, i / 100 * Math.log10(150 / 15));
      const z = 4 + 22 / (1 + ((f - 22) / 3.5) ** 2) + 26 / (1 + ((f - 58) / 9) ** 2) + 0.012 * f;
      const x = 40 + (i / 100) * 440, y = 240 - z * 5.2;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    const fx = (f) => 40 + (Math.log10(f / 15) / Math.log10(10)) * 440;
    return svg(`
    ${T(20, 22, 'PORTED BOX IMPEDANCE SWEEP', 'il-h')}
    <line x1="40" y1="240" x2="480" y2="240" class="il-axis"/><line x1="40" y1="40" x2="40" y2="240" class="il-axis"/>
    <polyline points="${pts.join(' ')}" class="il-curve" fill="none"/>
    <line x1="${fx(34)}" y1="60" x2="${fx(34)}" y2="240" class="il-dim" stroke-dasharray="4 3"/>${T(fx(34) + 6, 200, 'dip = real tuning (Fb)', 'il-dimt')}
    ${T(fx(22), 100, 'peak 1', 'il-small', 'middle')}${T(fx(58), 92, 'peak 2', 'il-small', 'middle')}
    ${T(480, 260, 'frequency →', 'il-small', 'end')}${T(46, 52, 'ohms', 'il-small')}
  `, 'A ported box impedance curve with two peaks; the dip between them is the tuning frequency');
  },

  mounting: () => svg(`
    ${T(20, 22, 'SECURE THE BOX', 'il-h')}
    <rect x="80" y="90" width="260" height="110" class="il-box"/>
    <path d="M60 200 L360 200" class="il-line" stroke-width="3"/>${T(210, 222, 'floor / cargo area', 'il-small', 'middle')}
    <path d="M100 200 L100 175 L80 175" class="il-bracket" fill="none"/><path d="M320 200 L320 175 L340 175" class="il-bracket" fill="none"/>
    ${T(70, 168, 'L-bracket', 'il-small', 'end')}
    <path d="M70 120 Q210 40 350 120" class="il-strap" fill="none"/>${T(210, 62, 'ratchet strap to tie-down points', 'il-small', 'middle')}
    ${T(380, 110, 'Bolt through the floor', 'il-small')}${T(380, 126, 'with large washers, or', 'il-small')}${T(380, 142, 'use factory tie-downs.', 'il-small')}
    ${T(380, 176, 'Check for fuel lines and', 'il-small')}${T(380, 192, 'wiring under the floor.', 'il-small')}
  `, 'Securing a subwoofer box with brackets and straps'),
};
