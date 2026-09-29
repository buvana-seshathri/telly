// Optional "bring your own API key" mode. The LLM only re-orders and re-explains candidates
// the local engine already picked (real titles on your platforms). It never sees your full
// history: just a short taste summary plus ~20 candidates.
import type { Catalog, LlmProvider, LlmSettings, Rec } from '../shared/types';
import type { TasteProfile } from './profile';
import { genreLabel } from './text';

export const LLM_PROVIDERS: Record<
  LlmProvider,
  { name: string; defaultModel: string; keyUrl: string; host: string; note: string }
> = {
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-flash-latest',
    keyUrl: 'https://aistudio.google.com/apikey',
    host: 'https://generativelanguage.googleapis.com/*',
    note: 'Has a free tier — no credit card needed.',
  },
  groq: {
    name: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    host: 'https://api.groq.com/*',
    note: 'Has a free tier with rate limits.',
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4.1-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    host: 'https://api.openai.com/*',
    note: 'Pay as you go.',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    defaultModel: 'claude-haiku-4-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    host: 'https://api.anthropic.com/*',
    note: 'Pay as you go.',
  },
  openrouter: {
    name: 'OpenRouter',
    defaultModel: 'openrouter/auto',
    keyUrl: 'https://openrouter.ai/keys',
    host: 'https://openrouter.ai/*',
    note: 'Some free models available.',
  },
};

export interface LlmRequest {
  purpose: 'deck' | 'vibe' | 'tonight';
  vibe?: string;
  constraints?: string;
}

/** The exact text sent to the provider (also shown in Settings → "What gets sent"). */
export function buildPrompt(cat: Catalog, p: TasteProfile, recs: Rec[], req: LlmRequest): { system: string; user: string } {
  const genres = [...p.genreShare.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g, s]) => `${genreLabel(g)} ${Math.round(s * 100)}%`)
    .join(', ');
  const loved = p.positives.slice(0, 8).map((s) => {
    const it = cat.items[s.index];
    const how =
      s.reason === 'binge' ? `binged ${s.bingeCount} eps in ${s.bingeDays}d` : s.reason === 'favorite' ? 'favorite' : it.type === 'tv' ? `${s.count} eps` : 'watched';
    return `${it.title} (${it.type === 'tv' ? 'series' : 'movie'}, ${how})`;
  });
  const disliked = p.signals.filter((s) => s.weight < 0).slice(0, 5).map((s) => cat.items[s.index].title);
  const cands = recs.map((r) => {
    const it = r.item;
    const len = it.runtime ? (it.type === 'tv' ? `${it.runtime}m eps` : `${it.runtime}m`) : '';
    return `- id=${it.id} | ${it.title} (${it.year ?? ''}) | ${it.type === 'tv' ? 'series' : 'movie'} ${len} | ${it.genres.join('/')} | ${it.overview.slice(0, 160)} | engine note: ${r.why}`;
  });
  const system =
    'You help one person pick what to watch right now. Choose ONLY from the candidate list. ' +
    'Rank the best fits first. For each pick write "why": one friendly sentence (max 24 words) that cites concrete evidence ' +
    'from the viewer data or request below (a title they watched, how they watched it, or words from the request). ' +
    'Never invent facts about titles or the viewer. Reply with JSON only: {"picks":[{"id":"...","why":"..."}]}';
  const user = [
    `Viewer taste — top genres: ${genres || 'unknown yet'}.`,
    loved.length ? `Recently loved: ${loved.join('; ')}.` : 'No history yet.',
    disliked.length ? `Swiped away: ${disliked.join(', ')}.` : '',
    req.vibe ? `Request: "${req.vibe}".` : 'No specific request: pick the best overall fits.',
    req.constraints ? `Constraints: ${req.constraints}.` : '',
    `Candidates:\n${cands.join('\n')}`,
    `Return up to ${Math.min(recs.length, 10)} picks.`,
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

async function callOnce(s: LlmSettings, model: string, system: string, user: string, signal?: AbortSignal): Promise<string> {
  if (s.provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': s.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    return j.candidates?.[0]?.content?.parts?.map((x: { text?: string }) => x.text ?? '').join('') ?? '';
  }
  if (s.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: 1200, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    return j.content?.map((c: { text?: string }) => c.text ?? '').join('') ?? '';
  }
  const url =
    s.provider === 'groq'
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : s.provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${LLM_PROVIDERS[s.provider].name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
}

// Providers retire models often, so a hard-coded default goes stale. If the model is gone,
// look at what the provider offers today, pick a good chat model, and remember it.
const swapped: Partial<Record<LlmProvider, { from: string; to: string }>> = {};
export const lastModelUsed = (provider: LlmProvider) => swapped[provider]?.to;

const NOT_CHAT = /whisper|tts|guard|embed|moderation|image|vision-preview|dall|speech|transcri|rerank|compound|safeguard|orpheus|playai|realtime|audio/i;
const PREFERRED: Record<LlmProvider, RegExp[]> = {
  groq: [/gpt-oss-120b/, /llama-3\.3-70b/, /llama-4-maverick/, /llama-4-scout/, /gpt-oss-20b/, /qwen.*(32b|3)/, /llama-3\.1-8b/],
  gemini: [/^gemini-flash-latest$/, /gemini-2\.5-flash$/, /gemini-.*flash(?!.*(lite|image|tts|live|preview))/],
  openai: [/^gpt-4\.1-mini$/, /^gpt-4o-mini$/, /^gpt-5.*mini/, /^gpt-4\.1$/],
  anthropic: [/haiku/, /sonnet/],
  openrouter: [/^openrouter\/auto$/],
};

export function pickModel(provider: LlmProvider, ids: string[], avoid?: string): string | null {
  const ok = ids.filter((m) => m !== avoid && !NOT_CHAT.test(m));
  for (const re of PREFERRED[provider]) {
    const hit = ok.find((m) => re.test(m));
    if (hit) return hit;
  }
  return ok[0] ?? null;
}

const modelGone = (e: unknown) => /\b(404|400)\b/.test((e as Error).message) && /model/i.test((e as Error).message);

async function call(s: LlmSettings, system: string, user: string, signal?: AbortSignal): Promise<string> {
  const wanted = s.model || LLM_PROVIDERS[s.provider].defaultModel;
  const known = swapped[s.provider];
  const model = known && known.from === wanted ? known.to : wanted;
  try {
    return await callOnce(s, model, system, user, signal);
  } catch (e) {
    if (!modelGone(e)) throw e;
    const next = pickModel(s.provider, await listModels(s), model);
    if (!next) throw e;
    const out = await callOnce(s, next, system, user, signal);
    swapped[s.provider] = { from: wanted, to: next };
    return out;
  }
}

/** Pull {"picks":[...]} out of a reply, tolerating code fences or extra prose. */
export function parsePicks(text: string): { id: string; why: string }[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const j = JSON.parse(m[0]);
    const picks = Array.isArray(j.picks) ? j.picks : [];
    return picks
      .filter((x: unknown): x is { id: string; why: string } => !!x && typeof (x as any).id === 'string')
      .map((x: { id: string; why?: string }) => ({ id: x.id, why: typeof x.why === 'string' ? x.why.slice(0, 240) : '' }));
  } catch {
    return [];
  }
}

/**
 * Re-rank with the LLM. Anything it returns that is not a real candidate is dropped, and
 * candidates it skipped keep their engine order after its picks.
 */
export async function llmRerank(
  s: LlmSettings,
  cat: Catalog,
  p: TasteProfile,
  recs: Rec[],
  req: LlmRequest,
  signal?: AbortSignal,
): Promise<Rec[]> {
  const pool = recs.slice(0, 20);
  const { system, user } = buildPrompt(cat, p, pool, req);
  const picks = parsePicks(await call(s, system, user, signal));
  const byId = new Map(pool.map((r) => [r.item.id, r]));
  const out: Rec[] = [];
  const used = new Set<string>();
  for (const pick of picks) {
    const r = byId.get(pick.id);
    if (!r || used.has(pick.id)) continue;
    used.add(pick.id);
    out.push(pick.why ? { ...r, why: pick.why, evidence: [{ kind: 'similar-to', text: r.why }, ...r.evidence] } : r);
  }
  for (const r of recs) if (!used.has(r.item.id)) out.push(r);
  return out;
}

export async function testLlm(s: LlmSettings): Promise<string> {
  const text = await call(s, 'Reply with JSON only.', 'Return {"picks":[{"id":"ok","why":"ready"}]}');
  const picks = parsePicks(text);
  if (!picks.length) throw new Error('Connected, but the reply was not the expected JSON. Try another model.');
  return `Connected (${swapped[s.provider]?.to ?? (s.model || LLM_PROVIDERS[s.provider].defaultModel)}). Smarter picks are on.`;
}

export async function listModels(s: LlmSettings): Promise<string[]> {
  if (s.provider === 'gemini') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': s.apiKey } });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const j = await res.json();
    return (j.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => String(m.name).replace(/^models\//, ''));
  }
  if (s.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    return ((await res.json()).data ?? []).map((m: any) => m.id);
  }
  const url =
    s.provider === 'groq' ? 'https://api.groq.com/openai/v1/models' : s.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/models' : 'https://api.openai.com/v1/models';
  const res = await fetch(url, { headers: { authorization: `Bearer ${s.apiKey}` } });
  if (!res.ok) throw new Error(`${res.status}`);
  return ((await res.json()).data ?? []).map((m: any) => m.id).sort();
}
