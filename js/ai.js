// AI features: spec lookup, manual/spec-sheet extraction, vehicle space estimates, design Q&A.
// Two paths, same prompts (js/ai-prompts.js):
// - claude.ai page: the viewer's Claude through the artifact `sample` capability. It cannot browse, so
//   lookups come from its own knowledge and are marked for verification.
// - standalone website: the EnclosureIQ AI server (api/ai.js), for signed-in people. Lookups search the web.
// Manuals the person uploads are read directly on both.
import { lookupPrompt, manualPrompt, vehiclePrompt, askPrompt } from './ai-prompts.js';
import { remoteAI, callAI, imageToDataUrl } from './ai-remote.js';

export { remoteAI };
let samplePromise = null;
export function getSample() {
  if (!samplePromise) samplePromise = window.claude?.use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
  return samplePromise;
}
let disabled = false;
export const aiDisabled = () => disabled;

/** True when some AI path can be offered here (the website may still ask the person to sign in first). */
export async function aiAvailable() {
  if (remoteAI()) return true;
  return !!(await getSample()) && !disabled;
}
/** What the current path accepts: { images: { maxCount } | null, tools: boolean }. */
export async function aiLimits() {
  if (remoteAI()) return { images: { maxCount: 4 }, tools: true };
  const s = await getSample();
  return s ? s.limits().catch(() => null) : null;
}

export function errorText(e) {
  const code = e?.code;
  if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled') { disabled = true; return 'Claude is turned off for this page, so AI features are hidden.'; }
  if (code === 'signin') return 'Sign in to use the AI features.';
  if ((code === 'daily_limit' || code === 'site_limit') && e?.message) return e.message;
  if (code === 'rate_limited') return 'Too many AI requests right now. Wait a minute and try again.';
  if (code === 'invalid_json') return 'The answer came back in an unexpected format. Try again.';
  if (code === 'refused') return 'Claude declined that request. Rephrase it and try again.';
  if (code === 'cancelled') return 'Stopped.';
  if (code === 'prompt_too_large') return 'That document is too long. Upload fewer pages or paste only the spec tables.';
  if (code === 'image_rejected') return 'That image could not be used. Try a JPEG or PNG under 20 MB.';
  if (code === 'unavailable') return 'The AI service is unavailable right now. Try again shortly.';
  if (code === 'bad_request' && e?.message) return `The AI request was not accepted: ${e.message}.`;
  return 'The AI request failed. Check your connection and try again.';
}

async function needSample() {
  const sample = await getSample();
  if (!sample) throw { code: 'not_granted' };
  return sample;
}

export async function lookupSub({ brand, model, extra }, { signal, onText, onStatus } = {}) {
  if (remoteAI()) return (await callAI('lookup', { brand, model, extra }, { signal, onText, onStatus })).json;
  const sample = await needSample();
  return sample.json(lookupPrompt({ brand, model, extra }), { signal, onText, modelTier: 'complex' });
}

export async function extractFromManual({ text, images, hint }, { signal, onText } = {}) {
  if (remoteAI()) {
    const data = [];
    for (const f of (images || []).slice(0, 4)) data.push(await imageToDataUrl(f));
    return (await callAI('manual', { text: text || '', images: data, hint: hint || '' }, { signal, onText })).json;
  }
  const sample = await needSample();
  return sample.json(manualPrompt({ text, hint, hasImages: !!images?.length }), { signal, onText, images: images?.length ? images : undefined, modelTier: 'default' });
}

export async function estimateVehicle({ year, make, model, body }, { signal, onText } = {}) {
  if (remoteAI()) return (await callAI('vehicle', { year, make, model, body }, { signal, onText })).json;
  const sample = await needSample();
  return sample.json(vehiclePrompt({ year, make, model, body }), { signal, onText, modelTier: 'default' });
}

export async function askDesign(question, summary, { signal, onText } = {}) {
  if (remoteAI()) { const r = await callAI('ask', { question, summary }, { signal, onText }); return { text: r.text }; }
  const sample = await needSample();
  return sample(askPrompt({ question, summary }), { signal, onText, cache: false });
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
