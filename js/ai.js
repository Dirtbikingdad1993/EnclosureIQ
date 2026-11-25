// AI features: spec lookup, manual/spec-sheet extraction, vehicle space estimates, design Q&A.
// Uses the viewer's Claude through the artifact `sample` capability. Claude cannot browse from here,
// so lookups come from its own knowledge and are marked for verification; manuals the person
// uploads are read directly.

let samplePromise = null;
export function getSample() {
  if (!samplePromise) samplePromise = window.claude?.use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
  return samplePromise;
}
let disabled = false;
export const aiDisabled = () => disabled;

export function errorText(e) {
  const code = e?.code;
  if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled') { disabled = true; return 'Claude is turned off for this page, so AI features are hidden.'; }
  if (code === 'rate_limited') return 'Too many AI requests right now. Wait a minute and try again.';
  if (code === 'invalid_json') return 'The answer came back in an unexpected format. Try again.';
  if (code === 'refused') return 'Claude declined that request. Rephrase it and try again.';
  if (code === 'cancelled') return 'Stopped.';
  if (code === 'prompt_too_large') return 'That document is too long. Upload fewer pages or paste only the spec tables.';
  if (code === 'image_rejected') return 'That image could not be used. Try a JPEG or PNG under 20 MB.';
  return 'The AI request failed. Check your connection and try again.';
}

const SUB_SCHEMA = `{
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
  "manual": string (where the official owner's manual or spec sheet lives: site and document name),
  "notes": string,
  "uncertain": [field names you are not sure about]
}`;

export async function lookupSub({ brand, model, extra }, { signal, onText } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const prompt = `You are filling a car-audio subwoofer database used to build real enclosures, so wrong numbers cost people money.
Give the manufacturer-published specifications for this subwoofer from your own knowledge (you cannot browse):
Brand: ${brand}
Model: ${model}
${extra ? `Extra context from the user: ${extra}\n` : ''}
Rules:
- Use the manufacturer's owner's manual / spec sheet values, including its recommended sealed, ported and bandpass enclosures.
- Use null for anything you do not reliably know. Never invent or estimate a number; null is better than a guess.
- If you are not sure this exact model exists, set "found": false and explain in "notes".
- Units exactly as listed.
Reply with only one JSON object of this shape:
{ "found": boolean, "confidence": "high"|"medium"|"low", ...fields }
Fields: ${SUB_SCHEMA}`;
  return sample.json(prompt, { signal, onText, modelTier: 'complex' });
}

export async function extractFromManual({ text, images, hint }, { signal, onText } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const prompt = `Below is ${images?.length ? 'one or more photos of' : 'text extracted from'} a subwoofer owner's manual or spec sheet.
Extract every specification it states for each subwoofer model it covers. ${hint ? `The user is interested in: ${hint}.` : ''}
Many manuals cover several impedance versions (for example -2, -4, -8 or D2/D4) in one table: return one object per version.
Read the recommended enclosure tables carefully (net volume, external dimensions, port dimensions, tuning, F3).
Only report values the document states or that follow directly from it (for example converting liters to cu ft). Use null otherwise.
Reply with only JSON: { "models": [ object, ... ], "documentTitle": string|null }
Each object has these fields: ${SUB_SCHEMA}
${text ? `\n--- DOCUMENT TEXT ---\n${text.slice(0, 120000)}\n--- END ---` : ''}`;
  return sample.json(prompt, { signal, onText, images: images?.length ? images : undefined, modelTier: 'default' });
}

export async function estimateVehicle({ year, make, model, body }, { signal, onText } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const prompt = `Estimate the subwoofer install spaces for this vehicle, as a car-audio installer would measure them:
Vehicle: ${[year, make, model, body].filter(Boolean).join(' ')}
Give inches. For trunks/cargo areas: usable width (between wheel wells), height (floor to the lowest point of the lid/cover), depth, and the opening size the box must pass through.
For truck behind-seat spaces use shape "wedge" with depth at the floor ("d") and at the top ("dTop").
These are estimates from general knowledge; say so and keep confidence honest.
Reply with only JSON:
{ "category": "Car"|"Truck"|"SUV"|"Van", "body": string, "doors": number, "make": string, "model": string, "years": string,
  "cabinLength": inches (front windshield base to rear glass/tailgate interior),
  "locations": [ { "name": string, "shape": "rect"|"wedge", "w": number, "h": number, "d": number, "dTop": number|null, "openingW": number|null, "openingH": number|null, "notes": string } ],
  "confidence": "high"|"medium"|"low", "notes": string }`;
  return sample.json(prompt, { signal, onText, modelTier: 'default' });
}

export async function askDesign(question, summary, { signal, onText } = {}) {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  const prompt = `You are an experienced car-audio enclosure builder helping someone with a design made in a box-design tool.
Answer plainly and practically in under 200 words. Use the numbers from the design. If something in the design looks risky (port noise, over-excursion, wrong wiring), say so.

DESIGN
${summary}

QUESTION
${question}`;
  return sample(prompt, { signal, onText, cache: false });
}

// ---------- PDF text extraction (pdf.js from cdnjs, run on the main thread) ----------
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed'));
    document.head.append(s);
  });
}
export async function pdfToText(file, maxPages = 12) {
  await loadScript(PDFJS + 'pdf.min.js');
  await loadScript(PDFJS + 'pdf.worker.min.js'); // defines globalThis.pdfjsWorker → no Worker needed
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: buf, isEvalSupported: false }).promise;
  const pages = Math.min(doc.numPages, maxPages);
  let text = '';
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    // keep rough line structure so tables survive
    let lastY = null, line = [];
    const lines = [];
    for (const it of c.items) {
      const y = Math.round(it.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line.join(' ')); line = []; }
      line.push(it.str); lastY = y;
    }
    lines.push(line.join(' '));
    text += `\n[Page ${i}]\n` + lines.join('\n');
  }
  return { text, pages, total: doc.numPages };
}
