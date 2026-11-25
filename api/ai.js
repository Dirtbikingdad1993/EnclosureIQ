// EnclosureIQ AI endpoint (a Vercel Function at /api/ai).
// Only signed-in people may use it: the browser sends its Supabase session token, and the database
// function ai_take_call() both checks that token and counts the request against daily limits.
// The prompts are built here from structured inputs; the browser cannot send its own instructions.
// The reply is newline-delimited JSON: {t:'text',d} {t:'status',d} {t:'tool',id,name,input} {t:'done',...} {t:'error',code}.
import { streamText, jsonSchema, gateway, isStepCount, modelMessageSchema } from 'ai';
import { SUPABASE } from '../js/config.js';
import { lookupPrompt, manualPrompt, vehiclePrompt, askPrompt, ASSISTANT_RULES, TOOL_SPECS, parseJsonReply } from '../js/ai-prompts.js';

const MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-5.5';
const PER_PERSON_DAILY = Number(process.env.AI_DAILY_LIMIT) || 100;
const SITE_DAILY = Number(process.env.AI_SITE_DAILY_LIMIT) || 3000;
const MAX_BODY_BYTES = 4_000_000; // Vercel accepts request bodies up to 4.5 MB
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 1_400_000; // ~1 MB of JPEG as a data URL

class InputError extends Error { constructor(msg) { super(msg); this.code = 'bad_request'; } }
const str = (v, max, name, { required = false } = {}) => {
  if (v == null || v === '') { if (required) throw new InputError(`${name} is required`); return ''; }
  if (typeof v !== 'string' && typeof v !== 'number') throw new InputError(`${name} must be text`);
  const s = String(v).trim();
  if (s.length > max) throw new InputError(`${name} is too long`);
  return s;
};

// ---------------------------------------------------------------- what each task runs
const clientTools = () => Object.fromEntries(TOOL_SPECS.map((t) => [t.name, { description: t.description, inputSchema: jsonSchema(t.inputSchema) }]));

function checkAssistantMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 80) throw new InputError('messages must be a list of 1 to 80 messages');
  for (const m of messages) {
    if (!modelMessageSchema.safeParse(m).success) throw new InputError('a message is not in the expected format');
    if (!['user', 'assistant', 'tool'].includes(m.role)) throw new InputError('only user, assistant and tool messages are accepted');
    // text, tool calls and tool results only: no files or images, so the server never downloads anything for a chat
    if (Array.isArray(m.content)) for (const p of m.content) if (!['text', 'tool-call', 'tool-result', 'reasoning'].includes(p.type)) throw new InputError(`message part "${p.type}" is not accepted`);
  }
  return messages;
}

function plan(task, input = {}) {
  switch (task) {
    case 'lookup': {
      const args = { brand: str(input.brand, 80, 'brand', { required: true }), model: str(input.model, 80, 'model', { required: true }), extra: str(input.extra, 300, 'extra') };
      return {
        json: true, maxOutputTokens: 6000, stopWhen: isStepCount(5),
        prompt: lookupPrompt(args, { web: true }),
        tools: { web_search: gateway.tools.perplexitySearch({ maxResults: 6, maxTokensPerPage: 1500, maxTokens: 9000 }) },
      };
    }
    case 'manual': {
      const text = str(input.text, 130_000, 'text');
      const images = Array.isArray(input.images) ? input.images : [];
      if (images.length > MAX_IMAGES) throw new InputError(`at most ${MAX_IMAGES} photos`);
      for (const d of images) if (typeof d !== 'string' || d.length > MAX_IMAGE_CHARS || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d)) throw new InputError('photos must be JPEG, PNG or WebP images under 1 MB');
      if (!text && !images.length) throw new InputError('send document text or photos');
      const prompt = manualPrompt({ text, hint: str(input.hint, 200, 'hint'), hasImages: images.length > 0 });
      return {
        json: true, maxOutputTokens: 16000,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map((data) => ({ type: 'file', mediaType: 'image', data }))] }],
      };
    }
    case 'vehicle':
      return { json: true, maxOutputTokens: 3000, prompt: vehiclePrompt({ year: str(input.year, 4, 'year'), make: str(input.make, 60, 'make', { required: true }), model: str(input.model, 80, 'model', { required: true }), body: str(input.body, 80, 'body') }) };
    case 'ask':
      return { maxOutputTokens: 1000, prompt: askPrompt({ question: str(input.question, 2000, 'question', { required: true }), summary: str(input.summary, 12_000, 'summary') }) };
    case 'assistant':
      // one model step; the browser runs the tools (they change the design on the page) and calls again
      return { maxOutputTokens: 2000, instructions: ASSISTANT_RULES, messages: checkAssistantMessages(input.messages), tools: clientTools(), returnMessages: true };
    default:
      throw new InputError('unknown task');
  }
}

// ---------------------------------------------------------------- sign-in and daily limits
async function takeCall(token, fetchImpl) {
  const res = await fetchImpl(`${SUPABASE.url}/rest/v1/rpc/ai_take_call`, {
    method: 'POST',
    headers: { apikey: SUPABASE.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res.status === 401 || res.status === 403) return { error: 'signin' };
  if (!res.ok) return { error: 'unavailable' };
  const n = await res.json().catch(() => null);
  if (n?.mine > PER_PERSON_DAILY) return { error: 'daily_limit' };
  if (n?.total > SITE_DAILY) return { error: 'site_limit' };
  return { mine: n?.mine };
}

const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status, code, message) => reply(status, { error: { code, message } });

function errorCode(e) {
  const s = `${e?.name || ''} ${e?.message || ''} ${e?.statusCode || ''}`;
  if (/abort/i.test(s)) return 'cancelled';
  if (/429|rate.?limit/i.test(s)) return 'rate_limited';
  if (/too long|context|too large|prompt is too/i.test(s)) return 'prompt_too_large';
  if (/image/i.test(s)) return 'image_rejected';
  return 'failed';
}

// ---------------------------------------------------------------- handler
export async function handle(request, { model = MODEL, fetchImpl = fetch } = {}) {
  if (request.method !== 'POST') return fail(405, 'method', 'Use POST.');
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return fail(401, 'signin', 'Sign in to use the AI features.');
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return fail(413, 'prompt_too_large', 'That request is too large.');

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, 'prompt_too_large', 'That request is too large.');
    body = JSON.parse(raw);
  } catch { return fail(400, 'bad_request', 'The request was not valid JSON.'); }

  let p;
  try { p = plan(body?.task, body?.input); } catch (e) {
    if (e instanceof InputError) return fail(400, 'bad_request', e.message);
    throw e;
  }

  const quota = await takeCall(token, fetchImpl).catch(() => ({ error: 'unavailable' }));
  if (quota.error === 'signin') return fail(401, 'signin', 'Your sign-in has expired. Sign in again.');
  if (quota.error === 'daily_limit') return fail(429, 'daily_limit', `You have used today's ${PER_PERSON_DAILY} AI requests. The limit resets at midnight UTC.`);
  if (quota.error === 'site_limit') return fail(429, 'site_limit', 'The AI features have reached their daily limit for the whole site. Try again tomorrow.');
  if (quota.error) return fail(503, 'unavailable', 'The AI service is unavailable right now. Try again shortly.');

  const result = streamText({
    model,
    instructions: p.instructions,
    prompt: p.prompt,
    messages: p.messages,
    tools: p.tools,
    stopWhen: p.stopWhen,
    maxOutputTokens: p.maxOutputTokens,
    abortSignal: request.signal,
    onError: ({ error }) => console.error('ai stream error:', error?.message || error),
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o) => { try { ctrl.enqueue(enc.encode(`${JSON.stringify(o)}\n`)); } catch { /* client went away */ } };
      let failed = null;
      try {
        for await (const part of result.stream) {
          if (part.type === 'text-delta') send({ t: 'text', d: part.text });
          else if (part.type === 'start-step') send({ t: 'step' });
          else if (part.type === 'tool-call') {
            if (p.returnMessages) send({ t: 'tool', id: part.toolCallId, name: part.toolName, input: part.input });
            else if (part.toolName === 'web_search') send({ t: 'status', d: `Searching the web${part.input?.query ? `: ${[].concat(part.input.query).join(', ')}` : ''}` });
          } else if (part.type === 'error') failed = part.error;
        }
        if (failed) throw failed;
        const text = await result.text;
        const done = { t: 'done', text };
        if (p.json) {
          done.json = parseJsonReply(text);
          if (done.json === undefined) { send({ t: 'error', code: 'invalid_json' }); return; }
        }
        if (p.returnMessages) done.messages = await result.responseMessages;
        send(done);
      } catch (e) {
        send({ t: 'error', code: errorCode(e) });
      } finally {
        try { ctrl.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export default {
  async fetch(request) {
    try { return await handle(request); } catch (e) {
      console.error('ai handler error:', e?.message || e);
      return fail(500, 'failed', 'The AI request failed.');
    }
  },
};
