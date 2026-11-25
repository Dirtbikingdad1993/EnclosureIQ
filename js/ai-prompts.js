// Prompts and tool definitions shared by the claude.ai page (which runs them through the viewer's Claude)
// and the website's AI server (api/ai.js, which builds them on the server from the structured inputs).
// Pure data and string builders: no DOM, no imports, so Node can load it too.

export const SUB_SCHEMA = `{
  "brand": string, "model": string, "series": string|null,
  "size": number (nominal inches), "shape": "round"|"square",
  "coils": number (voice coils per driver), "coilOhms": number (ohms per coil),
  "paramWiring": "single"|"series"|"parallel" (how coils were wired when Re/Bl were measured),
  "rms": number (W), "peak": number|null, "ampMin": number|null, "ampMax": number|null,
  "sens": number (dB 1W/1m),
  "fs": Hz, "qts": number, "qes": number, "qms": number, "vas": liters, "sd": cm², "xmax": mm (one-way), "xmech": mm|null,
  "re": ohms, "le": mH, "bl": T·m, "mms": grams, "cms": mm/N, "rmsMech": kg/s, "vcDia": inches,
  "overallDia": in, "cutout": in, "boltCircle": in, "motorDia": in, "mountDepth": in, "displacement": cu ft, "weight": lb, "ventClearance": in|null,
  "cone": string, "surround": string, "basket": string, "magnet": string,
  "factory": {
    "sealed": { "vol": cu ft, "min": cu ft|null, "max": cu ft|null, "f3": Hz|null, "fc": Hz|null, "qtc": number|null, "ext": {"w":in,"h":in,"d":in}|null } | null,
    "ported": { "vol": cu ft, "min": cu ft|null, "max": cu ft|null, "fb": Hz, "f3": Hz|null, "port": {"type":"slot"|"round","w":in|null,"h":in|null,"len":in|null,"dia":in|null,"count":number|null,"area":sq in|null}|null, "ext": {"w":in,"h":in,"d":in}|null } | null,
    "bp4": { "rear": cu ft, "front": cu ft, "portArea": sq in, "portLen": in } | null
  },
  "manual": string (where the official owner's manual or spec sheet lives: its web address if you have one, else site and document name),
  "notes": string,
  "uncertain": [field names you are not sure about]
}`;

/** Spec lookup. `web` is true when the model has a web search tool (the website), false in the claude.ai page. */
export function lookupPrompt({ brand, model, extra }, { web = false } = {}) {
  const how = web
    ? `Search the web for this exact model's owner's manual or spec sheet, preferring the manufacturer's own website and its PDF manuals over retailers and forums. Search more than once if the first results do not show the spec table. Use the numbers you find there; fill gaps only from values you know reliably.`
    : `Give the manufacturer-published specifications for this subwoofer from your own knowledge (you cannot browse).`;
  return `You are filling a car-audio subwoofer database used to build real enclosures, so wrong numbers cost people money.
${how}
Brand: ${brand}
Model: ${model}
${extra ? `Extra context from the user: ${extra}\n` : ''}
Rules:
- Use the manufacturer's owner's manual / spec sheet values, including its recommended sealed, ported and bandpass enclosures.
- Use null for anything you do not reliably know. Never invent or estimate a number; null is better than a guess.
- If you are not sure this exact model exists, set "found": false and explain in "notes".
- Units exactly as listed.
${web ? '- Put the web address of the manual or spec sheet you used in "manual".\n' : ''}Reply with only one JSON object of this shape, with no text before or after it:
{ "found": boolean, "confidence": "high"|"medium"|"low", ...fields }
Fields: ${SUB_SCHEMA}`;
}

export function manualPrompt({ text, hint, hasImages }) {
  return `Below is ${hasImages ? 'one or more photos of' : 'text extracted from'} a subwoofer owner's manual or spec sheet.
Extract every specification it states for each subwoofer model it covers. ${hint ? `The user is interested in: ${hint}.` : ''}
Many manuals cover several impedance versions (for example -2, -4, -8 or D2/D4) in one table: return one object per version.
Read the recommended enclosure tables carefully (net volume, external dimensions, port dimensions, tuning, F3).
Only report values the document states or that follow directly from it (for example converting liters to cu ft). Use null otherwise.
Reply with only JSON: { "models": [ object, ... ], "documentTitle": string|null }
Each object has these fields: ${SUB_SCHEMA}
${text ? `\n--- DOCUMENT TEXT ---\n${String(text).slice(0, 120000)}\n--- END ---` : ''}`;
}

export function vehiclePrompt({ year, make, model, body }) {
  return `Estimate the subwoofer install spaces for this vehicle, as a car-audio installer would measure them:
Vehicle: ${[year, make, model, body].filter(Boolean).join(' ')}
Give inches. For trunks/cargo areas: usable width (between wheel wells), height (floor to the lowest point of the lid/cover), depth, and the opening size the box must pass through.
For truck behind-seat spaces use shape "wedge" with depth at the floor ("d") and at the top ("dTop").
These are estimates from general knowledge; say so and keep confidence honest.
Reply with only JSON:
{ "category": "Car"|"Truck"|"SUV"|"Van", "body": string, "doors": number, "make": string, "model": string, "years": string,
  "cabinLength": inches (front windshield base to rear glass/tailgate interior),
  "locations": [ { "name": string, "shape": "rect"|"wedge", "w": number, "h": number, "d": number, "dTop": number|null, "openingW": number|null, "openingH": number|null, "notes": string } ],
  "confidence": "high"|"medium"|"low", "notes": string }`;
}

export function askPrompt({ question, summary }) {
  return `You are an experienced car-audio enclosure builder helping someone with a design made in a box-design tool.
Answer plainly and practically in under 200 words. Use the numbers from the design. If something in the design looks risky (port noise, over-excursion, wrong wiring), say so.

DESIGN
${summary}

QUESTION
${question}`;
}

// ---------------------------------------------------------------- design assistant
export const ASSISTANT_RULES = `You are the built-in assistant of EnclosureIQ, a car-audio subwoofer enclosure designer. You talk with someone designing a sub box for their vehicle.
You can read and change their design with the tools. When they describe what they want ("two 12s ported in my crew cab", "make it fit my trunk", "lower the tuning"), do it with update_design and the other tools, then explain the result in plain words using the numbers the tool returns (size, volume, tuning, F3, excursion, port speed, fit, warnings).
Rules:
- Only use subwoofer, amplifier and vehicle ids returned by search_library. If what they want is not in the library, say so and suggest adding it on the Subwoofers / Amplifiers / Vehicles pages (those pages can import a manual or look specs up).
- Volumes are cubic feet per sub, dimensions are inches, tuning in Hz.
- After changes, check the returned warnings and fit; fix problems if you can (for example resize to the space, change port area) and say what you changed.
- Be honest about limits: simulations are estimates; vehicle sizes marked typical must be measured.
- Answer general car-audio questions (wiring, gain setting, amps, building) directly and practically.
- Keep replies short: a few sentences or a short list.`;

export const DESIGN_KEYS = {
  name: 'string', type: 'sealed | ported | bp4 | bp6p | bp6s | bp6q | bp8s | ib', shape: 'rect | wedge', slope: 'back | front (which face is angled on a wedge)',
  mount: 'front | rear | up | down (firing direction)', blowThrough: 'boolean', subId: 'id from search_library(subs)', n: 'number of subs 1-8', isobaric: 'boolean',
  vehicleId: 'id from search_library(vehicles)', locationId: 'location id within the vehicle', ampId: 'id from search_library(amps) or null', useAmpPower: 'boolean (simulate with amp power)',
  power: 'watts RMS per sub when not using amp power', wiringZ: 'final load in ohms (must be one of the wiring options)', vnet: 'net cu ft per sub (sealed/ported)', fb: 'port tuning Hz (ported)',
  h: 'external height in', d: 'external depth in (bottom depth for wedge)', dTop: 'top depth for wedge', w: 'external width in (only used when lockWidth is true)', lockWidth: 'boolean',
  t: 'material thickness in (0.5, 0.625, 0.75, 1)', baffleLayers: '1-3', braceVol: 'cu ft', 'port': '{kind: slot|round|aero, w: slot width in, dia: round port diameter in, count}',
  chambers: 'bandpass only: array (rear first) of {vol: cu ft per sub, port: {fb, kind, dia, w, count} or null for sealed}', ibVol: 'trunk cu ft for free air',
  hp: '{order: 0|2|4, fc: Hz} subsonic filter', lp: '{order: 0|2|4, fc: Hz} low-pass', cabin: 'boolean cabin gain',
};

const NO_INPUT = { type: 'object', properties: {} };
/** Tool names, descriptions and input schemas. The page supplies what each one does (js/assistant.js). */
export const TOOL_SPECS = [
  { name: 'get_design', description: 'Returns the current design: vehicle, subs, enclosure, dimensions, volumes, ports, simulated results, wiring options, vehicle fit and warnings.', inputSchema: NO_INPUT },
  { name: 'search_library', description: 'Search the subwoofer, amplifier or vehicle library. Returns ids and key specs (subs include factory box recommendations; vehicles include install locations with ids and sizes).',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['subs', 'amps', 'vehicles'] }, query: { type: 'string', description: 'brand, model, body style, words' }, size: { type: 'number', description: 'sub size in inches' } }, required: ['kind'] } },
  { name: 'update_design', description: `Change any design fields and re-run the simulation. Returns the updated results. Fields: ${JSON.stringify(DESIGN_KEYS)}`,
    inputSchema: { type: 'object', properties: { patch: { type: 'object', description: 'fields to change' } }, required: ['patch'] } },
  { name: 'apply_factory_box', description: "Load the current sub's manufacturer-recommended box (sealed, ported or 4th order bandpass) if the library has it.",
    inputSchema: { type: 'object', properties: { which: { type: 'string', enum: ['sealed', 'ported', 'bp4'] } }, required: ['which'] } },
  { name: 'fit_box_to_space', description: 'Resize the box height/depth (and wedge angle) to the selected vehicle install location, leaving 1/2 inch clearance. Width then follows the volume.', inputSchema: NO_INPUT },
  { name: 'open_page', description: 'Show a page to the person: design, plans (build plans, cut list, PDF), subwoofers, amplifiers, vehicles, guides.',
    inputSchema: { type: 'object', properties: { page: { type: 'string', enum: ['design', 'plans', 'subwoofers', 'amplifiers', 'vehicles', 'guides'] } }, required: ['page'] } },
];

/** Pull one JSON value out of a model reply (tolerates code fences or a sentence around it). */
export function parseJsonReply(text) {
  const s = String(text || '').trim();
  const tries = [s];
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1].trim());
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(s.slice(a, b + 1));
  for (const t of tries) { try { return JSON.parse(t); } catch { /* next */ } }
  return undefined;
}
