// How-to guides and FAQ: detailed, practical car-audio know-how with photos and diagrams.
import { h, clear, safeUrl } from './ui.js';
import { openAssistant } from './assistant.js';
import { ILLUSTRATIONS } from './illustrations.js';
import { svgEl } from './draw.js';

// Photos from Wikimedia Commons, used under their stated licenses (resized only).
const PHOTOS = {
  ib18: { src: 'img/infinite-baffle-18in.jpg', alt: 'An 18-inch subwoofer mounted in a plywood wall as an infinite baffle', author: 'Daniel Christensen', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/', source: 'https://commons.wikimedia.org/wiki/File:Large_infinite_baffle_subwoofer_with_18_inch_woofer_driver.JPG' },
  box15: { src: 'img/homemade-15in-box.jpg', alt: 'A home-made MDF box for two 15-inch subwoofers, one sub installed and one cutout open', author: 'Daniel Christensen', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://commons.wikimedia.org/wiki/File:Loudspeaker_enclosure.jpg' },
  bracing: { src: 'img/internal-bracing.jpg', alt: 'Looking through a sub cutout at wooden braces running across the inside of an enclosure', author: 'B137', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://commons.wikimedia.org/wiki/File:Subwoofer_cab_internal_bracing.jpg' },
  carpeted: { src: 'img/sub-and-enclosure.jpg', alt: 'A carpeted subwoofer enclosure with a flared round port and the subwoofer sitting above its cutout', author: 'B137', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', source: 'https://commons.wikimedia.org/wiki/File:Subwoofer_driver_and_enclosure.jpg' },
};

const GUIDES = [
  {
    id: 'measure', title: 'Measure your vehicle for a sub box', tags: 'measure space trunk truck seat opening tape', time: '15 min', level: 'Beginner',
    summary: 'Get the three numbers that decide everything else (width, height, depth) plus the opening the box must pass through.',
    tools: ['Tape measure', 'Notepad or phone', 'A straight board or level (for sloped spaces)', 'Flashlight'],
    figures: [{ illus: 'measureTrunk', caption: 'Trunks: measure width between the wheel wells, not wall to wall, and height to the lowest point of the closed lid.' }, { illus: 'measureWedge', caption: 'Trucks: measure depth at the floor and at the top, with the seat in your driving position.' }],
    sections: [
      { h: 'Trunks and cargo areas', steps: [
        'Clear the space and leave the carpet and trim in place. You measure the space the box will actually sit in.',
        'Width: measure between the wheel wells at floor level and again 6" up. Use the smaller number.',
        'Height: close the lid gently on a soft object, or measure from the floor to the lowest part of the lid, latch, hinge arm or cargo cover.',
        'Depth: measure from the back of the rear seat to the trunk lip or tailgate. If the seat back slopes, measure at the floor and at the top.',
        'Opening: measure the narrowest width and height of the trunk opening. The box (or its smallest side) has to fit through it.',
      ] },
      { h: 'Truck cabs', steps: [
        'Regular cab: slide the seat to where you drive. Measure the gap behind the seat at the floor, halfway up and at the top. Expect only 3–6".',
        'Extended and crew cabs: fold the rear seat up and measure under it (height to the seat frame, not the cushion), or measure behind it as a wedge.',
        'Look under the seat for jacks, tool kits, brackets and floor humps. Note anything that must stay accessible.',
      ] },
      { h: 'Enter it in EnclosureIQ', steps: [
        'Vehicles → Add vehicle. Pick the type, doors and year range, then add each location with its shape (box or wedge) and sizes.',
        'Set the cabin length (windshield base to rear glass or tailgate, inside). The cabin-gain graphs use it.',
        'On the Design tab, choose your vehicle and press "Fit box to this space". It leaves 1/2" clearance on every side.',
      ] },
    ],
    tips: ['Measure twice, in two different places for each dimension, and keep the smaller number.', 'Photograph your tape measure in place; it helps when you rebuild the design later.'],
    mistakes: ['Measuring wall to wall instead of between the wheel wells.', 'Forgetting the trunk opening: the box fits the trunk but can\'t get in.', 'Measuring a truck with the seat all the way forward.'],
  },
  {
    id: 'choose', title: 'Sealed, ported or bandpass?', tags: 'sealed ported bandpass choose type ebp sound', time: '10 min read', level: 'Beginner',
    summary: 'Pick the box type that matches your space, your power and the music you listen to.',
    figures: [{ illus: 'boxTypes', caption: 'Same sub, three boxes: sealed rolls off gently, ported gains output near its tuning, bandpass is loudest in a narrow band.' }, { photo: 'box15', caption: 'A large home-built box for two 15" subs. Ported boxes need roughly twice the space of sealed ones.' }],
    sections: [
      { h: 'Sealed', steps: [
        'The smallest box for a given sub. The air inside acts as a spring that controls the cone.',
        'Response rolls off at about 12 dB per octave, which car cabin gain largely fills back in. Very accurate, quick bass.',
        'Handles power well at all frequencies; a subsonic filter is optional.',
        'Choose it for sound quality, tight spaces and most trucks.',
      ] },
      { h: 'Ported (vented)', steps: [
        'A port tuned to a frequency (Fb) adds output around that frequency. Expect about 3 dB more there, which is like doubling amplifier power.',
        'Needs about twice the volume of a sealed box. Below tuning the cone is unloaded, so a subsonic filter is required.',
        'Tune 30–34 Hz for deep, smooth bass, 36–40 Hz for punch and loudness.',
      ] },
      { h: 'Bandpass', steps: [
        '4th order: a sealed rear chamber plus a ported front chamber. Loud in its band and fairly forgiving.',
        '6th order (parallel, series, quasi) and 8th order: two or three ported chambers. Very loud in a narrow band, unforgiving of build errors, mostly SPL builds.',
        'The sub is inside, so make a removable panel for service. Use the Auto-tune button to find chamber sizes.',
      ] },
      { h: 'Quick rules of thumb', steps: [
        'Efficiency Bandwidth Product (EBP = Fs ÷ Qes, shown in each sub\'s details): under ~50 favors sealed, over ~90 favors ported.',
        'Qts around 0.3–0.4 suits ported, 0.4–0.6 suits sealed, above ~0.7 suits free air.',
        'Start from the factory recommendation, then compare designs with "Pin this curve".',
      ] },
    ],
    tips: ['Pin the factory sealed and factory ported curves, then compare them in "In your vehicle" before you decide.'],
    mistakes: ['Building ported in a space that only fits a sealed box, then shrinking the port until it chuffs.', 'Running a ported box without a subsonic filter.'],
  },
  {
    id: 'specs', title: 'Read a subwoofer spec sheet (T/S parameters)', tags: 'thiele small fs qts vas xmax sd re specs manual', time: '10 min read', level: 'Intermediate',
    summary: 'What each number on the spec sheet means and which ones matter for the box.',
    figures: [{ illus: 'subAnatomy', caption: 'The parts behind the numbers: cone area (Sd), linear travel (Xmax), and the motor and suspension that set Fs, Qts and Vas.' }],
    sections: [
      { h: 'The numbers that size the box', steps: [
        'Fs (free-air resonance, Hz): the frequency the cone naturally bounces at. Lower usually means deeper potential.',
        'Qts (total Q): how well controlled the driver is at resonance. It decides which box type suits the sub.',
        'Vas (equivalent volume, liters or cu ft): how stiff the suspension is, expressed as a volume of air. Bigger Vas generally needs a bigger box.',
      ] },
      { h: 'The numbers that set output', steps: [
        'Sd (cone area) × Xmax (one-way linear travel) = Vd, the air the cone can push. More Vd = more output potential.',
        'RMS power: the continuous power the coil can take. Peak power is marketing.',
        'Sensitivity (dB at 1 W/1 m): output per watt. Some brands rate at 2.83 V, which flatters low-impedance subs.',
      ] },
      { h: 'The electrical side', steps: [
        'Re: DC resistance of the voice coil(s). Nominal impedance is a bit higher (Re 3.5 Ω ≈ 4 Ω nominal).',
        'Le: coil inductance; high values roll off the top end slightly.',
        'Dual voice coil (DVC) subs: check whether Re and BL were measured with coils in series or parallel, and set "Specs measured with coils" to match when adding the sub.',
      ] },
      { h: 'Checking the data', steps: [
        'EnclosureIQ cross-checks the values against each other: Qts against Qes and Qms, Vas against Cms and Sd, Fs against Mms and Cms.',
        'A "Spec conflict" badge usually means a typo in the source. Compare with the owner\'s manual or a measured source before building.',
        'Use "Read specs from a manual" to pull values straight from the PDF or a photo of the spec page.',
      ] },
    ],
    tips: ['Manufacturers measure a few samples. Your sub may differ by 10–15%, which is why exact-to-the-decimal box volumes don\'t matter much.'],
    mistakes: ['Comparing peak power ratings.', 'Mixing series and parallel parameter sets for a DVC sub.'],
  },
  {
    id: 'volume', title: 'Net vs gross volume', tags: 'net gross displacement volume brace', time: '5 min read', level: 'Beginner',
    summary: 'Why the inside of your box must be bigger than the number on the spec sheet.',
    figures: [{ illus: 'netGross', caption: 'Everything inside the box that is not air (the sub\'s motor and basket, the port and its walls, braces) takes volume away from the sub.' }],
    sections: [
      { h: 'The idea', steps: [
        'Manufacturers recommend NET volume: the air the sub actually works against.',
        'Gross volume is the empty inside of the box. Net = gross − sub displacement − port displacement (including its walls) − bracing.',
        'A typical 12" sub displaces 0.05–0.15 cu ft; a long slot port can take 0.3 cu ft or more.',
      ] },
      { h: 'How EnclosureIQ handles it', steps: [
        'Enter the net volume you want; the box grows to cover every displacement automatically.',
        'Turn on "Set width myself" to work the other way: fix the outside size and see what net volume you get.',
        'Material thickness matters. On a 30" box, 3/4" walls eat almost 0.4 cu ft more than 1/2" walls, and each extra baffle layer takes more.',
      ] },
    ],
    tips: ['If the sub\'s displacement isn\'t published, EnclosureIQ estimates it and tells you so in the notes.'],
    mistakes: ['Building to the net volume as outside dimensions.', 'Forgetting that a double baffle eats internal volume.'],
  },
  {
    id: 'ports', title: 'Ports: area, length, tuning and noise', tags: 'port tuning slot aero chuff noise velocity length area', time: '10 min read', level: 'Intermediate',
    summary: 'How to size a port that tunes where you want and stays quiet at full power.',
    figures: [{ illus: 'slotPort', caption: 'A slot port uses the box wall as one side. Its length is measured along the channel\'s center line.' }, { photo: 'carpeted', caption: 'A finished box with a flared (aero) round port. Flares lower air noise at the mouth.' }],
    sections: [
      { h: 'Tuning', steps: [
        'The tuning frequency (Fb) comes from the net volume, the port area and the port length together.',
        'For the same tuning: more area needs a longer port; more volume needs a shorter port.',
        'Daily listening: 30–34 Hz. Punchy or SPL: 36–40 Hz and up.',
      ] },
      { h: 'Area and noise', steps: [
        'Air speed in the port peaks near tuning. Keep it under about 17 m/s for quiet daily use (see "Port air speed").',
        'Starting point: 12–16 sq in of port per cu ft of net volume. High-excursion subs on big power need more.',
        'Round over the mouth edges (1/2" roundover bit) or use flared ports.',
      ] },
      { h: 'Fitting it in', steps: [
        'Slot ports can fold once along the back wall. Leave at least one slot width of open space at the inside end.',
        'Round ports need at least half a diameter (1" minimum) between the inside end and any wall. Use a 90° elbow if the box is too shallow.',
        'Choose an end correction that matches your build: flush on the baffle (0.732), both ends flared (0.85) or both free (0.613).',
      ] },
      { h: 'After you build', steps: [
        'Check the real tuning with an impedance sweep (see "Check your real tuning").',
        'Longer port = lower tuning; shorter port = higher tuning. A slot port can be trimmed with a filler strip.',
      ] },
    ],
    tips: ['If the port is impossibly long, the box is probably too small for the tuning you want. Add volume before you shrink the port area.'],
    mistakes: ['Shrinking port area to make it fit, then fighting port noise.', 'Blocking the port mouth against a seat or trunk wall: keep 3" or more of clearance.'],
  },
  {
    id: 'wiring', title: 'Wire your subs for the right impedance', tags: 'wiring dvc svc ohm series parallel impedance load', time: '10 min', level: 'Beginner',
    summary: 'Series, parallel and dual voice coils, and how to land on a load your amp likes.',
    tools: ['12 AWG speaker wire (10 AWG above ~1000 W)', 'Wire strippers', 'Multimeter (to confirm the final load)'],
    figures: [{ illus: 'dvcWiring', caption: 'A dual-4-ohm sub can be wired to 8 Ω or 2 Ω. Two of them can make 1 Ω, 4 Ω or 16 Ω.' }],
    sections: [
      { h: 'The two rules', steps: [
        'Series adds: 4 Ω + 4 Ω = 8 Ω. Connect + of one to − of the next.',
        'Parallel divides: two 4 Ω in parallel = 2 Ω. Connect all + together and all − together.',
      ] },
      { h: 'Pick your load', steps: [
        'On the Design tab, the wiring list shows every possible final load and the amp\'s power at each one.',
        'Pick the lowest load your amp is rated stable at; that is usually where it makes the most power.',
        'Confirm with a multimeter across the wires going to the amp: it reads DC resistance, a bit below the nominal value (about 3.5 Ω for a 4 Ω load).',
      ] },
      { h: 'Rules you should never break', steps: [
        'Wire every sub in a box the same way.',
        'Never leave a voice coil disconnected; it upsets the sub\'s motor and can damage it.',
        'Don\'t mix different subs on one amp channel without checking with the manufacturer.',
      ] },
    ],
    tips: ['Label the coil terminals before mounting the subs; it is hard to see them once they are in the box.'],
    mistakes: ['Wiring a 1 Ω load to an amp that is only 2 Ω stable.', 'Reversing polarity on one sub in a multi-sub box, which cancels the bass.'],
  },
  {
    id: 'amp', title: 'Match an amplifier to your subs', tags: 'amp amplifier match rms power cea headroom', time: '5 min read', level: 'Beginner',
    summary: 'Read amp power ratings honestly and size the amp to the subs.',
    sections: [
      { h: 'Read the ratings', steps: [
        'Compare RMS (continuous) power at a specific load, not peak or "max". CEA/CTA-2006 ratings are measured to a standard.',
        'Ratings are usually at 14.4 V (engine running). Expect less at 12.5 V.',
        'If an amp\'s power at 1 Ω equals its power at 2 Ω, run it at 2 Ω: same output, less heat and current.',
      ] },
      { h: 'Size it', steps: [
        'Aim for 75–125% of the subs\' combined RMS rating at your final load.',
        'More power than the subs\' rating is fine if you set the gain properly; too little power driven into clipping is what kills subs.',
        'Add amps to the library with their power at each load; EnclosureIQ interpolates between rated loads.',
      ] },
      { h: 'Check the electrical side', steps: [
        'The Power wiring stat estimates full-power current, wire gauge and fuse size.',
        'If it warns about current, plan for the Big 3 upgrade or a high-output alternator (see the power wiring guide).',
      ] },
    ],
    mistakes: ['Buying by the biggest number on the box.', 'Running a 2 Ω-stable amp into 1 Ω because "it was louder for a while".'],
  },
  {
    id: 'gain', title: 'Set your amp gain the safe way', tags: 'gain set tune multimeter clipping voltage', time: '20 min', level: 'Intermediate',
    summary: 'Match the gain to the amp\'s rated output so it never clips.',
    tools: ['Digital multimeter (AC volts)', 'Test tones: 40 Hz or 50 Hz at 0 dB', 'Small screwdriver'],
    figures: [{ illus: 'gainMeter', caption: 'With the subs disconnected, measure AC volts at the speaker terminals while a test tone plays.' }],
    gainTable: true,
    sections: [
      { h: 'Prepare', steps: [
        'Turn the amp gain all the way down. Bass boost off. Head unit EQ flat, loudness off.',
        'Set the low-pass to about 80 Hz and the subsonic as the Design page suggests.',
        'Disconnect the subs from the amp.',
      ] },
      { h: 'Set it', steps: [
        'Work out the target voltage: V = √(power × final load). See the table below.',
        'Play a 0 dB test tone (40–50 Hz). Turn the head unit to about 3/4 of maximum, the loudest level it plays cleanly.',
        'Put the meter on AC volts across the amp\'s speaker + and −. Raise the gain slowly until you reach the target. Stop there.',
        'Turn the head unit down, reconnect the subs, and play music at a sensible level.',
      ] },
    ],
    tips: ['An oscilloscope or a gain-setting tool (DD-1 style) is more precise because it sees clipping directly.', 'Write the target voltage on a piece of tape on the amp for next time.'],
    mistakes: ['Setting gain by ear at full volume.', 'Using bass boost to "fix" a weak low end; it adds clipping and heat.'],
  },
  {
    id: 'build', title: 'Build the box: tools and technique', tags: 'build mdf glue screw seal brace tools router jig', time: '4–8 hours', level: 'Intermediate',
    summary: 'From the cut list to a sealed, braced box ready for carpet.',
    tools: ['Circular saw with a straight-edge guide, or a table saw', 'Router with a circle jig (or a jigsaw)', 'Drill/driver, countersink bit', 'Clamps and a framing square', 'Wood glue, 1-5/8" screws, caulk gun and sealant', 'Safety glasses and a dust mask (MDF dust is fine and nasty)'],
    figures: [{ photo: 'box15', caption: 'A dual-15" box mid-build: one sub test-fitted, the other cutout open. Raw MDF is fine; it gets carpeted later.' }, { illus: 'assembly', caption: 'A reliable assembly order. The top goes on last, after you seal the inside seams.' }, { photo: 'bracing', caption: 'Bracing seen through a cutout: wooden braces tie opposite walls together so they don\'t flex.' }],
    sections: [
      { h: 'Cut', steps: [
        'Use 3/4" MDF for most boxes. 5/8" is OK for small boxes; use 1" or a double baffle for big, high-power subs.',
        'Cut the biggest parts first, following the sheet layout in Build plans. Account for the 1/8" saw kerf.',
        'Label each panel as you cut it. For angled boxes, set the blade bevel shown in the cut list.',
      ] },
      { h: 'Holes', steps: [
        'Mark the hole centers from the panel drawings. Cut sub holes with a router circle jig for clean edges.',
        'Test-fit each sub before assembly. Square subs (like the Kicker L7S) need a square cutout.',
        'For multi-layer baffles, glue and screw the layers, then flush-trim the holes with a pattern bit.',
      ] },
      { h: 'Assemble', steps: [
        'Glue every joint. Pre-drill and countersink a screw every 6", at least 3/8" in from the edge.',
        'Follow the assembly order: bottom, sides, back, port walls and braces, front, then the top last.',
        'Check square before the glue sets.',
      ] },
      { h: 'Brace and seal', steps: [
        'Brace any panel longer than about 12" unsupported: window braces or 1" dowels between opposite walls. Count them in "Bracing displacement".',
        'Run sealant along every inside seam before the top goes on. A sealed box must be airtight.',
        'Test a sealed box: press the cone in gently. It should come back slowly, not spring back instantly.',
      ] },
    ],
    tips: ['Let the glue cure overnight before carpeting or mounting subs.', 'Round the outer edges slightly; carpet wraps them more easily.'],
    mistakes: ['Screwing MDF without pilot holes (it splits).', 'Skipping sealant ("the glue will seal it").', 'Forgetting to cut the terminal cup hole before closing the box.'],
  },
  {
    id: 'truck', title: 'Build an angled box for a truck', tags: 'truck wedge angled bevel behind seat regular cab', time: '4–6 hours', level: 'Advanced',
    summary: 'Wedge boxes that follow the seat-back angle and still fit the sub\'s mounting depth.',
    figures: [{ illus: 'measureWedge', caption: 'The box side panels copy this profile: depth at the floor, depth at the top, and the height.' }],
    sections: [
      { h: 'Design', steps: [
        'Choose your truck in Vehicles (or add it), select the behind-seat location, and press "Fit box to this space".',
        'Pick "Angled back" (the back follows the seat) or "Angled baffle" (the sub faces up toward the seat back).',
        'Watch the mounting-depth warning: the sub\'s motor must clear the sloped back at its top edge. Shallow-mount subs help in regular cabs.',
        'Up-firing or down-firing can fit subs that are too deep for a forward-firing wedge.',
      ] },
      { h: 'Cut the angles', steps: [
        'The side panels are trapezoids; the cut list gives the bottom, top and height.',
        'Set the saw blade to the bevel angle shown for the top, bottom and sloped panel edges.',
        'Cut a test piece from scrap and check the angle against the side panel before cutting the real parts.',
      ] },
    ],
    tips: ['Make a cardboard mock-up of the side profile and test-fit it behind the seat first.'],
    mistakes: ['Measuring with the seat moved forward.', 'Forgetting the seat-back recline when the seat is occupied.'],
  },
  {
    id: 'finish', title: 'Carpet and finish the box', tags: 'carpet finish vinyl adhesive paint terminal cup', time: '1–2 hours', level: 'Beginner',
    summary: 'A clean, durable finish that matches the vehicle.',
    tools: ['Automotive or speaker-box carpet', 'High-temp spray adhesive', 'Utility knife with fresh blades', 'Staple gun (optional)'],
    figures: [{ photo: 'carpeted', caption: 'Carpet wrapped around the edges and into the port mouth. Trim it at the sub\'s cutout so the flange seals on the wood or carpet evenly.' }],
    sections: [
      { h: 'Steps', steps: [
        'Sand the edges smooth and vacuum the dust. Fill gaps with wood filler.',
        'Spray adhesive on the box and the carpet back, wait until tacky, then lay the carpet from the center outward.',
        'Wrap the bottom and sides first and the front last, so the seams are hidden.',
        'Cut an X over each hole, fold the flaps inside and trim. Staple inside the cutouts if needed.',
        'Install the terminal cup with sealant and screws.',
      ] },
    ],
    tips: ['Carpet adds about 1/8" to each outside dimension; allow for it in tight spaces.'],
    mistakes: ['Carpeting over the cutout edge so the sub\'s flange can\'t seal.'],
  },
  {
    id: 'mount', title: 'Secure the box in the vehicle', tags: 'mount secure strap bolt bracket safety', time: '30 min', level: 'Beginner',
    summary: 'Keep a heavy box from becoming a projectile in a crash or hard stop.',
    figures: [{ illus: 'mounting', caption: 'L-brackets and straps to tie-down points hold the box without drilling through anything important.' }],
    sections: [
      { h: 'Options', steps: [
        'Bolt through the floor with large fender washers underneath, after checking for fuel lines, brake lines and wiring.',
        'Use the vehicle\'s factory cargo tie-downs with a ratchet strap.',
        'Screw L-brackets into the box and bolt them to existing seat-belt or seat-bracket bolts where appropriate.',
      ] },
    ],
    tips: ['A 3 cu ft box with two subs can weigh 80 lb or more. Secure it like you would a toolbox.'],
    mistakes: ['Relying on Velcro or carpet friction.'],
  },
  {
    id: 'power', title: 'Power wiring, fusing and the Big 3', tags: 'power wire fuse ground big 3 alternator battery current', time: '1–3 hours', level: 'Intermediate',
    summary: 'Get clean current to the amp safely.',
    tools: ['Amp wiring kit in the gauge EnclosureIQ suggests (OFC copper)', 'Fuse holder and fuse', 'Crimper, ring terminals, heat shrink', 'Sandpaper or a grinder for the ground point'],
    figures: [{ illus: 'powerWiring', caption: 'Fuse within 18" of the battery, power to the amp, and a short ground to bare chassis metal.' }],
    sections: [
      { h: 'Run the wire', steps: [
        'Disconnect the battery negative before you start.',
        'Mount the fuse within 18" of the battery positive. The fuse protects the wire, so size it for the wire and the amp.',
        'Route the power wire away from factory wiring and through a grommet where it passes the firewall.',
        'Ground to bare, sanded chassis metal within 18" of the amp, using the same gauge as the power wire.',
      ] },
      { h: 'Gauge and upgrades', steps: [
        'Use oxygen-free copper (OFC). Copper-clad aluminum (CCA) needs to be one or two sizes bigger.',
        'EnclosureIQ picks the gauge that keeps the voltage drop under 0.5 V at full power over your run length.',
        'Big 3: upgrade the alternator-to-battery positive, battery-to-chassis ground and engine-to-chassis ground wires to at least the amp wire\'s gauge.',
      ] },
    ],
    mistakes: ['Grounding to a painted surface or a seat bolt with thread locker.', 'Putting the main fuse at the amp end only.'],
  },
  {
    id: 'filters', title: 'Subsonic and low-pass filter setup', tags: 'subsonic infrasonic low pass crossover phase filter', time: '15 min', level: 'Intermediate',
    summary: 'Protect the subs and blend them with the rest of the system.',
    sections: [
      { h: 'Subsonic (high-pass)', steps: [
        'Ported and bandpass: set it 3–5 Hz below the port tuning. Below tuning the cone moves freely and can bottom out.',
        'Sealed: 20–25 Hz is a safe default; it is optional but protects the sub from content you can\'t hear.',
        'Use 24 dB/oct if the amp or processor offers it. Check the "Cone excursion" and "Power handling" graphs with the filter on.',
      ] },
      { h: 'Low-pass and blending', steps: [
        'Start around 80 Hz, matched to the high-pass on your door speakers.',
        'Flip the phase switch (or swap the speaker leads on all subs) and keep whichever sounds louder at the listening position.',
        'Lower the low-pass if you can hear voices from the sub, or if the bass seems to come from the trunk.',
      ] },
    ],
    mistakes: ['Setting the subsonic above the port tuning, which throws away the deepest bass the box makes.'],
  },
  {
    id: 'damping', title: 'Polyfill and damping material', tags: 'polyfill damping stuffing deadening sound', time: '10 min', level: 'Beginner',
    summary: 'When stuffing helps, when it hurts, and how much to use.',
    sections: [
      { h: 'Sealed boxes', steps: [
        'Loosely packed polyfill can make the box act 5–15% larger and smooth the response.',
        'Start with about 0.5–1 lb per cu ft, fluffed, not packed. Keep it off the back of the cone.',
      ] },
      { h: 'Ported and bandpass boxes', steps: [
        'Usually leave them empty. Stuffing adds losses that lower output near tuning.',
        'If you use any, keep it light and well away from the port opening.',
      ] },
      { h: 'Vehicle deadening', steps: [
        'Sound deadener on the trunk lid, license plate and rear deck stops rattles that sound like distortion.',
      ] },
    ],
  },
  {
    id: 'verify', title: 'Check your real tuning', tags: 'verify impedance sweep dats tuning measure', time: '20 min', level: 'Advanced',
    summary: 'Measure what you built and compare it with the design.',
    tools: ['DATS (Dayton Audio Test System), or REW with an impedance jig', 'Alternatively: multimeter on AC volts plus test tones'],
    figures: [{ illus: 'impedanceCurve', caption: 'A ported box shows two impedance peaks. The dip between them is the real tuning frequency.' }],
    sections: [
      { h: 'Measure', steps: [
        'Disconnect the sub from the amp and connect it to your measuring tool.',
        'Sweep 10–200 Hz. Find the dip between the two peaks; that frequency is your box\'s actual Fb.',
        'Compare with "Impedance & phase" on the Design tab, which shows the predicted curve.',
      ] },
      { h: 'Adjust', steps: [
        'Tuned too high? Lengthen the port, or reduce its area.',
        'Tuned too low? Shorten the port, or add area.',
        'A few Hz either way is normal; real subs vary and break in over the first hours of use.',
      ] },
    ],
  },
  {
    id: 'freeair', title: 'Free air (infinite baffle) builds', tags: 'free air infinite baffle ib trunk rear deck wall', time: '2–4 hours', level: 'Intermediate',
    summary: 'Use the trunk itself as the enclosure with a sealed baffle board.',
    figures: [{ photo: 'ib18', caption: 'An 18" sub mounted in a wall as an infinite baffle. In a car, the board seals the trunk off from the cabin.' }],
    sections: [
      { h: 'When it works', steps: [
        'Best with high-Qts subs (around 0.7 and up) designed for free air.',
        'Saves all the cargo space a box would take.',
        'The trunk must be sealed from the cabin everywhere except through the baffle: pass-through, deck vents and gaps.',
      ] },
      { h: 'Build', steps: [
        'Choose "Free air / infinite baffle" and enter the trunk\'s air volume.',
        'Build a two-layer baffle board, seal its edges to the vehicle with foam weatherstrip, and bolt it to solid structure.',
        'Use a subsonic filter: with no box spring, excursion rises quickly at low frequencies.',
      ] },
    ],
  },
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
  ['How thick should the walls be?', '3/4" MDF for most boxes. 5/8" works for small single-sub boxes. Use 1" or a double front baffle for large, high-excursion subs so the baffle doesn\'t flex.'],
  ['What is an isobaric (clamshell) setup?', 'Two subs work as one, face-to-face or front-to-back, sharing one cone\'s worth of air. It needs half the box volume of a single sub, at the cost of a second sub and about half the efficiency. Turn on "Isobaric" in the subwoofer step to model it.'],
  ['What is a blow-through or trunk-wall build?', 'The box (or a wall) is built so the subs fire into the cabin through an opening, such as the rear seat pass-through or a wall built behind the seats. It keeps the trunk from soaking up bass. Turn on "Blow-through" to add a wall panel to the build plans.'],
  ['Why does my bass rattle the trunk lid or license plate?', 'That is the vehicle panels resonating, not the subs distorting. Sound deadening mat on the trunk lid and plate area, and foam tape behind the plate, usually fixes it.'],
  ['How accurate are these graphs?', 'They are standard Thiele/Small small-signal simulations, the same kind WinISD and BassBox run. They are good for comparing designs and catching mistakes. Real results vary with build quality, driver tolerances, power compression and how your vehicle\'s cabin actually behaves.'],
  ['How do the AI features work, and can I trust them?', 'The assistant and lookups use Claude. Spec lookup and vehicle estimates come from what Claude learned in training; it cannot browse the web from here, so treat those numbers as a draft and check the manual. Uploading a manual is more reliable: Claude reads the document you give it.'],
  ['Who sees what I add to the libraries?', 'When this page is opened on claude.ai, the subwoofer, amplifier and vehicle libraries are shared with everyone who has access to it. Saved designs are private to you. Opened anywhere else, everything is saved in your browser only.'],
  ['Prefab box or custom?', 'Prefab boxes are made for "average" subs and often run too big or tuned too high for a specific driver. A custom box built to your sub\'s specs (or the factory recommendation) almost always sounds and fits better.'],
  ['How do I break in new subs?', 'Play them at moderate volume for several hours of normal music before pushing hard. The suspension loosens slightly and Fs drops a little. Don\'t retune a box based on measurements taken before break-in.'],
];

function figure(f) {
  if (f.illus) return h('figure', { class: 'g-fig' }, svgEl(ILLUSTRATIONS[f.illus]()), h('figcaption', null, f.caption));
  const p = PHOTOS[f.photo];
  if (!p) return null;
  const link = (href, text) => (safeUrl(href) ? h('a', { href: safeUrl(href), target: '_blank', rel: 'noopener' }, text) : text);
  return h('figure', { class: 'g-fig g-photo' },
    h('img', { src: p.src, alt: p.alt, loading: 'lazy', width: 960, height: 720 }),
    h('figcaption', null, f.caption, h('span', { class: 'credit' }, 'Photo: ', link(p.source, p.author), ', ', link(p.licenseUrl, p.license), ', via Wikimedia Commons.')));
}
function gainTable() {
  const loads = [1, 2, 4], powers = [250, 500, 750, 1000, 1500, 2000];
  return h('div', { class: 'table-wrap' }, h('table', { class: 'cut-table gain-table' },
    h('caption', null, 'Target AC voltage at the speaker terminals'),
    h('thead', null, h('tr', null, h('th', null, 'Amp power'), loads.map((z) => h('th', null, `${z} Ω load`)))),
    h('tbody', null, powers.map((p) => h('tr', null, h('td', null, `${p} W`), loads.map((z) => h('td', { class: 'num' }, `${Math.sqrt(p * z).toFixed(1)} V`)))))));
}
function guideCard(g) {
  return h('details', { class: 'card guide', id: `g-${g.id}` },
    h('summary', null, h('span', { class: 'g-title' }, g.title), h('span', { class: 'g-meta' }, [g.level, g.time].filter(Boolean).join(' · '))),
    h('div', { class: 'g-body' },
      h('p', { class: 'g-summary' }, g.summary),
      g.tools?.length ? h('div', { class: 'g-tools' }, h('b', null, 'You\'ll need'), h('ul', null, g.tools.map((t) => h('li', null, t)))) : null,
      g.figures?.length ? h('div', { class: 'g-figs' }, g.figures.map(figure)) : null,
      ...g.sections.map((s) => h('section', { class: 'g-sec' }, h('h4', null, s.h), h('ol', null, s.steps.map((st) => h('li', null, st))))),
      g.gainTable ? gainTable() : null,
      g.tips?.length ? h('div', { class: 'g-callout tip' }, h('b', null, 'Tips'), h('ul', null, g.tips.map((t) => h('li', null, t)))) : null,
      g.mistakes?.length ? h('div', { class: 'g-callout warn' }, h('b', null, 'Common mistakes'), h('ul', null, g.mistakes.map((t) => h('li', null, t)))) : null,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-sm', onclick: () => openAssistant(`I have a question about "${g.title}": `) }, 'Ask the AI about this'))));
}

export function renderGuides() {
  const root = h('div', { class: 'guides' });
  const q = { v: '' };
  const list = h('div');
  const draw = () => {
    clear(list);
    const term = q.v.trim().toLowerCase();
    const text = (g) => [g.title, g.tags, g.summary, ...(g.tools || []), ...g.sections.flatMap((s) => [s.h, ...s.steps]), ...(g.tips || []), ...(g.mistakes || [])].join(' ').toLowerCase();
    const gs = GUIDES.filter((g) => !term || text(g).includes(term));
    const fs = FAQ.filter(([a, b]) => !term || (a + b).toLowerCase().includes(term));
    list.append(
      h('nav', { class: 'g-index', 'aria-label': 'Guides' }, gs.map((g) => h('a', { href: `#guides`, onclick: (e) => { e.preventDefault(); const el = document.getElementById(`g-${g.id}`); if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }, g.title))),
      h('h2', { class: 'group-title' }, `How-to guides (${gs.length})`),
      gs.length ? h('div', { class: 'guide-list' }, gs.map(guideCard)) : h('p', { class: 'muted' }, 'No guides match.'),
      h('h2', { class: 'group-title' }, 'Frequently asked questions'),
      fs.length ? h('div', { class: 'faq' }, fs.map(([qq, a]) => h('details', { class: 'faq-item' }, h('summary', null, qq), h('p', null, a)))) : h('p', { class: 'muted' }, 'No questions match.'),
      h('div', { class: 'card ask-card' }, h('div', null, h('h3', null, 'Still stuck?'), h('p', { class: 'muted' }, 'Ask the AI assistant. It can see your current design and change it for you.')),
        h('button', { class: 'btn primary', onclick: () => openAssistant(term ? `I have a question about: ${term}` : '') }, 'Ask the assistant')));
    if (term) list.querySelectorAll('details.guide').forEach((d) => { d.open = true; });
  };
  root.append(
    h('div', { class: 'page-head' }, h('div', null, h('p', { class: 'eyebrow' }, 'Learn'), h('h1', null, 'Guides & FAQ'))),
    h('div', { class: 'filter-bar' }, h('input', { type: 'search', id: 'guide-q', placeholder: 'Search guides and questions (port noise, wiring, gain…)', 'aria-label': 'Search guides', oninput: (e) => { q.v = e.target.value; draw(); } })),
    list);
  draw();
  return root;
}
