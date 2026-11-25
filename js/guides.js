// How-to guides and FAQ. Plain, practical car-audio know-how.
import { h, clear } from './ui.js';
import { openAssistant } from './assistant.js';

const GUIDES = [
  { id: 'measure', title: 'Measure your vehicle for a sub box', tags: 'measure space trunk truck seat opening', body: [
    'Measure the space the box will actually sit in, with the seats, carpet and trim in place. Write down three numbers: usable width, usable height and usable depth.',
    'Trunks: measure width between the wheel wells (not wall to wall), height from the floor to the lowest point of the closed lid or the latch, and depth from the seat back to the trunk lip. Then measure the trunk opening: the box has to fit through it.',
    'Truck behind-seat spaces are wedges. Put the seat in your normal driving position, then measure depth at the floor and depth at the top of the space. EnclosureIQ uses both to check an angled box.',
    'Crew-cab under-seat spaces: fold the seat up and measure height to the seat frame, not the cushion. Check the floor for humps and brackets.',
    'Leave about 1/2" of clearance on every side for carpet and wiggle room. The "Fit box to this space" button does that for you.',
    'Add your measurements as a new vehicle in the Vehicles tab so the fit check and cabin gain use your real numbers.',
  ] },
  { id: 'choose', title: 'Sealed, ported or bandpass?', tags: 'sealed ported bandpass choose type ebp', body: [
    'Sealed boxes are the smallest and the most forgiving. Bass is tight and accurate, rolls off gently, and the cabin gain in a car fills in the lows. Choose sealed for sound quality, tight spaces and most trucks.',
    'Ported boxes are about twice the size but give roughly 3 dB more output (it takes twice the amplifier power to get the same from a sealed box) around the tuning frequency. Choose ported for output on a budget of watts.',
    'Bandpass boxes put the sub inside and let only the port play. A 4th order (sealed rear, ported front) is loud in a narrow band and still fairly forgiving. 6th and 8th order designs are louder still but very sensitive to build errors; they are mostly SPL builds.',
    'A quick check is the Efficiency Bandwidth Product (EBP = Fs ÷ Qes), shown in each sub\'s details. Under about 50 leans sealed, over about 90 leans ported, and in between works either way.',
    'Factory recommendations in the library are a safe starting point. Load one with the "Factory sealed" or "Factory ported" button, then adjust.',
  ] },
  { id: 'specs', title: 'Read a subwoofer spec sheet (T/S parameters)', tags: 'thiele small fs qts vas xmax sd re specs', body: [
    'Fs (free-air resonance): the frequency the cone naturally bounces at. Lower Fs generally means deeper bass potential.',
    'Qts (total Q): how controlled the driver is at resonance. About 0.3–0.4 suits ported boxes; 0.4–0.6 suits sealed; above about 0.7 suits free-air (infinite baffle).',
    'Vas (equivalent volume): the volume of air as stiff as the suspension. Bigger Vas usually needs a bigger box.',
    'Xmax (one-way linear excursion): how far the cone moves before distortion rises sharply. EnclosureIQ\'s excursion graph shows how close your design gets.',
    'Sd (cone area) and Xmax together set how much air the sub can move (Vd). Re and Le describe the voice coil.',
    'Dual voice coil (DVC) subs: check whether the manufacturer measured Re and Bl with coils in series or parallel. Set "Specs measured with coils" accordingly when adding a sub.',
    'EnclosureIQ cross-checks published values against each other and flags specs that disagree, which is usually a typo in the source.',
  ] },
  { id: 'volume', title: 'Net vs gross volume', tags: 'net gross displacement volume brace', body: [
    'Manufacturers recommend net internal volume: the air the sub actually works against.',
    'Gross volume is the empty inside of the box. Net = gross − sub displacement − port displacement (the whole port including its walls) − bracing.',
    'EnclosureIQ starts from the net volume you want and grows the box to cover every displacement. Turn on "Set width myself" to work the other way: fix the outside size and see the net volume you get.',
    'Material thickness matters: 3/4" walls on a 30" box eat almost 0.4 cu ft compared with 1/2" walls.',
  ] },
  { id: 'ports', title: 'Ports: area, length, tuning and noise', tags: 'port tuning slot aero chuff noise velocity length area', body: [
    'Tuning (Fb) is set by the net volume and by the port\'s area and length together. More area needs a longer port for the same tuning.',
    'Port area controls air speed. Keep the peak under about 17 m/s for quiet daily use (see the "Port air speed" graph). A common starting point is 12–16 sq in of port per cubic foot of net volume.',
    'Slot ports use the box wall as one side and are easy to build long. Round and aero ports are simpler to install; flared ends reduce noise.',
    'Tuning lower (28–32 Hz) gives deeper, smoother bass; higher (36–40 Hz) gives more punch and a louder peak. Most daily builds land at 30–36 Hz.',
    'Always use a subsonic filter a few Hz below the tuning on a ported box. Below tuning the cone is unloaded and excursion climbs fast.',
  ] },
  { id: 'wiring', title: 'Wire your subs for the right impedance', tags: 'wiring dvc svc ohm series parallel impedance load', body: [
    'Series adds impedances (4 Ω + 4 Ω = 8 Ω). Parallel divides them (two 4 Ω coils in parallel = 2 Ω).',
    'A DVC 4 Ω sub can be 8 Ω (coils in series) or 2 Ω (coils in parallel). Two of them can make 1 Ω, 4 Ω or 16 Ω.',
    'Pick the final load your amp is stable at that gives the most usable power. EnclosureIQ lists every possible load and shows the amp\'s power at each one.',
    'Wire every sub in a box the same way and never leave a voice coil disconnected.',
    'Never mix different subs (or the same sub in different boxes) on one amp channel without checking with the manufacturer.',
  ] },
  { id: 'amp', title: 'Match an amplifier to your subs', tags: 'amp amplifier match rms power cea headroom', body: [
    'Compare RMS (continuous) power, not peak. CEA/CTA-2006 ratings are measured to a standard and are the most trustworthy.',
    'Aim for amp power at your final load within about 75–125% of the subs\' combined RMS rating. More is fine if you set the gain carefully; less is fine if you don\'t clip the amp.',
    'Amps make less power at lower battery voltage. Ratings are usually at 14.4 V with the engine running.',
    'Check the Power wiring numbers on the design page: current draw sets the wire gauge, fuse and whether you need electrical upgrades.',
  ] },
  { id: 'gain', title: 'Set your amp gain the safe way', tags: 'gain set tune multimeter clipping', body: [
    'Turn the amp gain all the way down, bass boost off, and set the low-pass to about 80 Hz and the subsonic as the design page suggests.',
    'Disconnect the subs. Play a 0 dB test tone at 40–50 Hz with the head unit at about 3/4 of its maximum volume (where it stops being clean).',
    'Calculate the target voltage: V = √(power × final load). For 1000 W into 2 Ω that is √2000 ≈ 44.7 V AC.',
    'Measure AC volts at the amp\'s speaker terminals and slowly raise the gain until you reach the target. Reconnect the subs.',
    'An oscilloscope or a gain-setting tool is more accurate. Never set gain by ear at full volume.',
  ] },
  { id: 'build', title: 'Build the box: tools and technique', tags: 'build mdf glue screw seal brace tools router', body: [
    'Tools: circular saw with a straight-edge guide or table saw, drill/driver, router with a circle jig (or jigsaw), clamps, a square, sealant gun.',
    'Use 3/4" MDF for most boxes. It is dense, flat and seals well. Use 5/8" only for small boxes, and 1" or a double baffle for big, high-power subs.',
    'Glue every joint and pre-drill every screw. MDF splits if you screw near an edge without a pilot hole.',
    'Brace panels longer than about 12" unsupported: window braces or dowels between opposite walls. Count their volume.',
    'Seal all inside seams with silicone or polyurethane. A leaky sealed box loses its tight bass; a leaky ported box whistles and detunes.',
    'Use the cut list and sheet layout from Build plans. Cut the biggest parts first.',
  ] },
  { id: 'power', title: 'Power wiring, fusing and the Big 3', tags: 'power wire fuse ground big 3 alternator battery', body: [
    'Run the power wire from the battery with a fuse within 18" of the battery terminal. The fuse protects the wire, so size it to the wire and the amp.',
    'Ground to bare, sanded chassis metal within 18" of the amp, using the same gauge as the power wire.',
    'Use oxygen-free copper (OFC). Copper-clad aluminum (CCA) needs to be one or two sizes bigger.',
    'If the design page warns about current draw, consider the "Big 3": upgrading the alternator-to-battery positive, battery-to-chassis ground and engine-to-chassis ground wires.',
  ] },
  { id: 'verify', title: 'Check your real tuning', tags: 'verify impedance sweep dats tuning measure', body: [
    'A ported box\'s impedance curve has two peaks with a dip between them; the dip is the real tuning frequency.',
    'Measure it with a DATS (Dayton Audio Test System), a REW impedance jig, or a multimeter and test tones (find the lowest AC resistance reading between the peaks).',
    'Compare with the Impedance graph on the design page. If the dip is a few Hz off, adjust port length: longer tunes lower, shorter tunes higher.',
  ] },
];

const FAQ = [
  ['Is a bigger box always better?', 'No. A bigger sealed box lowers Qtc and F3 but gives less punch and less power handling at the bottom. A ported box that is too big for the sub gets peaky near tuning and unloads the cone sooner. Stay near the factory or calculated volume unless the graphs show a clear gain.'],
  ['Why does my ported box sound boomy or make a chuffing noise?', 'Boom usually comes from tuning too high or a box too big for the sub, which leaves a peak in the response. Chuffing is port noise from air moving too fast: check the Port air speed graph and add port area (keeping the tuning the same means a longer port).'],
  ['Should I use polyfill?', 'In sealed boxes, loosely packed polyfill can make the box act slightly bigger (often 5–15%) and smooth the response. In ported boxes it is usually left out or used very lightly away from the port, because it adds losses and can lower output.'],
  ['What is cabin gain?', 'A car cabin is small compared with bass wavelengths, so below a certain frequency it pressurizes and boosts bass, often 9–12 dB per octave. EnclosureIQ estimates it from the cabin length; the "In your vehicle" graph includes it. Leaky cabins (soft tops, open windows, hatchbacks with an open cargo area) gain less.'],
  ['Can I put two different subwoofers in the same box?', 'Not in a shared chamber. Different subs need different volumes and move differently, so one ends up fighting the other. Use identical subs, or give each its own chamber.'],
  ['What fits behind the seat of a regular-cab truck?', 'Often only 3–6 inches of depth. Use a shallow-mount sub, an angled (wedge) box that follows the seat back, or a down-firing design. Measure depth at the floor and at the top; the wedge fit check uses both.'],
  ['Down-firing, up-firing or forward-firing?', 'In most cars the difference is small compared with box choice. Down-firing needs 2 inches or more of clearance under the cone. In trunks, firing toward the back of the car often gives the most in-cabin bass; try both if you can.'],
  ['Do I need a subsonic filter?', 'On a ported or bandpass box, yes. Below the tuning frequency the cone moves freely and can bottom out on content you cannot even hear. Set it a few Hz below Fb. On sealed boxes it is optional but still protects the sub.'],
  ['Can I run two dual-4-ohm subs at 1 ohm?', 'Yes, wire each sub\'s coils in parallel (2 Ω) and the two subs in parallel (1 Ω), but only if the amp is rated stable at 1 Ω. Check the wiring options list on the design page; it shows every load and the amp\'s power at each.'],
  ['MDF or plywood?', 'MDF is dense, flat, cheap and seals easily, which makes it the usual choice. Good birch plywood is lighter and stronger against moisture and impacts but costs more. Avoid particle board.'],
  ['What is an isobaric (clamshell) setup?', 'Two subs work as one, face-to-face or front-to-back, sharing one cone\'s worth of air. It needs half the box volume of a single sub, at the cost of a second sub and about half the efficiency. Turn on "Isobaric" in the subwoofer step to model it.'],
  ['What is a blow-through or trunk-wall build?', 'The box (or a wall) is built so the subs fire into the cabin through an opening, such as the rear seat pass-through or a wall built behind the seats. It keeps the trunk from soaking up bass. Turn on "Blow-through" to add a wall panel to the build plans.'],
  ['How accurate are these graphs?', 'They are standard Thiele/Small small-signal simulations, the same kind WinISD and BassBox run. They are good for comparing designs and catching mistakes. Real results vary with build quality, driver tolerances, power compression and how your vehicle\'s cabin actually behaves.'],
  ['How do the AI features work, and can I trust them?', 'The assistant and lookups use Claude. Spec lookup and vehicle estimates come from what Claude learned in training; it cannot browse the web from here, so treat those numbers as a draft and check the manual. Uploading a manual is more reliable: Claude reads the document you give it.'],
  ['Who sees what I add to the libraries?', 'When this page is opened on claude.ai, the subwoofer, amplifier and vehicle libraries are shared with everyone who has access to it. Saved designs are private to you. Opened anywhere else, everything is saved in your browser only.'],
  ['Prefab box or custom?', 'Prefab boxes are made for "average" subs and often run too big or tuned too high for a specific driver. A custom box built to your sub\'s specs (or the factory recommendation) almost always sounds and fits better.'],
  ['How do I break in new subs?', 'Play them at moderate volume for several hours of normal music before pushing hard. The suspension loosens slightly and Fs drops a little. Don\'t retune a box based on measurements taken before break-in.'],
];

export function renderGuides() {
  const root = h('div', { class: 'guides' });
  const q = { v: '' };
  const list = h('div');
  const draw = () => {
    clear(list);
    const term = q.v.trim().toLowerCase();
    const gs = GUIDES.filter((g) => !term || (g.title + g.tags + g.body.join(' ')).toLowerCase().includes(term));
    const fs = FAQ.filter(([a, b]) => !term || (a + b).toLowerCase().includes(term));
    list.append(
      h('h2', { class: 'group-title' }, 'How-to guides'),
      gs.length ? h('div', { class: 'guide-grid' }, gs.map((g) => h('details', { class: 'card guide', id: `g-${g.id}` },
        h('summary', null, h('span', null, g.title)),
        h('ol', null, g.body.map((p) => h('li', null, p)))))) : h('p', { class: 'muted' }, 'No guides match.'),
      h('h2', { class: 'group-title' }, 'Frequently asked questions'),
      fs.length ? h('div', { class: 'faq' }, fs.map(([qq, a]) => h('details', { class: 'faq-item' }, h('summary', null, qq), h('p', null, a)))) : h('p', { class: 'muted' }, 'No questions match.'),
      h('div', { class: 'card ask-card' }, h('div', null, h('h3', null, 'Still stuck?'), h('p', { class: 'muted' }, 'Ask the AI assistant. It can see your current design and change it for you.')),
        h('button', { class: 'btn primary', onclick: () => openAssistant(term ? `I have a question about: ${term}` : '') }, 'Ask the assistant')));
  };
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'Learn'), h('h1', null, 'Guides & FAQ'))),
    h('div', { class: 'filter-bar' }, h('input', { type: 'search', id: 'guide-q', placeholder: 'Search guides and questions (port noise, wiring, gain…)', 'aria-label': 'Search guides', oninput: (e) => { q.v = e.target.value; draw(); } })),
    list);
  draw();
  return root;
}
