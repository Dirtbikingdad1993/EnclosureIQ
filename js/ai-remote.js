// Website AI: talks to the EnclosureIQ AI server (api/ai.js on Vercel) with the person's sign-in token.
// Inside the claude.ai page this stays off and the page uses the viewer's Claude instead (js/ai.js).
import { SUPABASE } from './config.js';
import { cloud } from './auth.js';

/** True on the standalone website when an AI server is configured. */
export const remoteAI = () => cloud.enabled && !!SUPABASE.ai;

/**
 * Run one AI task on the server. Resolves with { text, json?, messages? }.
 * Rejects with { code, message?, text? } using the same codes as the claude.ai path where they overlap.
 */
export async function callAI(task, input, { signal, onText, onStatus, onTool } = {}) {
  let token = null;
  try { const sb = await cloud.client(); const { data } = await sb.auth.getSession(); token = data.session?.access_token || null; } catch { /* treated as signed out */ }
  if (!token) throw { code: 'signin' };
  let res;
  try {
    res = await fetch(SUPABASE.ai, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ task, input }), signal });
  } catch (e) { throw { code: e?.name === 'AbortError' ? 'cancelled' : 'network' }; }
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw { code: j?.error?.code || (res.status === 413 ? 'prompt_too_large' : 'failed'), message: j?.error?.message };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.t === 'text') { text += ev.d; onText?.({ text }); }
        else if (ev.t === 'status') onStatus?.(ev.d);
        else if (ev.t === 'tool') onTool?.(ev);
        else if (ev.t === 'error') throw { code: ev.code || 'failed', text };
        else if (ev.t === 'done') return ev;
      }
    }
  } catch (e) {
    if (e?.code) throw e;
    throw { code: e?.name === 'AbortError' || signal?.aborted ? 'cancelled' : 'network', text };
  }
  throw { code: 'failed', text };
}

/** Shrink a photo to a JPEG data URL the server accepts (longest side ≤ 1600 px, under ~1 MB). */
export async function imageToDataUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('image')); i.src = url; });
    let scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    for (let attempt = 0; attempt < 6; attempt++, scale *= 0.7) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.85, 0.7, 0.55]) {
        const data = c.toDataURL('image/jpeg', q);
        if (data.length < 1_350_000) return data;
      }
    }
  } catch { /* fall through */ } finally { URL.revokeObjectURL(url); }
  throw { code: 'image_rejected' };
}
