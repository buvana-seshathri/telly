import { useEffect, useState } from 'preact/hooks';
import type { Filters, LlmSettings, Rec } from '../shared/types';
import { classifyLlmError, llmRerank, LLM_PROVIDERS, type LlmFailureKind, type LlmRequest } from '../engine/llm';
import { kvGet, kvSet, onKvChange } from '../shared/env';
import type { EngineState } from './useEngine';

// Session cache so re-opening the popup doesn't spend another API call.
const cache = new Map<string, Rec[]>();

function describe(f: Filters): string {
  const bits: string[] = [];
  if (f.type !== 'any') bits.push(f.type === 'tv' ? 'series only' : 'movies only');
  if (f.maxMinutes) bits.push(`at most ${f.maxMinutes} minutes (per episode for series)`);
  if (f.genre) bits.push(`genre: ${f.genre}`);
  return bits.join(', ');
}

// ---- when the key stops working (out of credit, rate-limited, rejected) ----
// The failure is remembered, so Telly stops calling a key that will only fail again, says so in the
// app, and keeps working on its own picks. Different problems heal on different clocks.

export interface LlmHealth {
  kind: Exclude<LlmFailureKind, 'other'>;
  fingerprint: string; // provider + end of the key, so a new key clears the problem
  until: number; // stop trying until this time (ms since epoch)
}

const COOLDOWN: Record<LlmHealth['kind'], number> = {
  rate: 2 * 60 * 1000, // a burst limit: try again shortly
  quota: 3 * 3600 * 1000, // out of credit / daily allowance: try again in a few hours
  auth: 30 * 24 * 3600 * 1000, // wrong or revoked key: only a new key fixes it
};

export const llmFingerprint = (s: LlmSettings) => `${s.provider}:${s.apiKey.slice(-6)}`;

export async function getLlmHealth(s: LlmSettings): Promise<LlmHealth | null> {
  const h = await kvGet<LlmHealth | null>('llmHealth', null);
  if (!h || h.fingerprint !== llmFingerprint(s) || h.until < Date.now()) return null;
  return h;
}

export const clearLlmHealth = () => kvSet('llmHealth', null);

export function llmHealthMessage(h: LlmHealth, provider: string): string {
  if (h.kind === 'quota') return `Your ${provider} key has used up its credit or free allowance. Telly is using its own picks and will try again in a few hours.`;
  if (h.kind === 'rate') return `${provider} is limiting how fast your key can be used. Telly is using its own picks for a couple of minutes.`;
  return `${provider} didn't accept your key (wrong, expired or removed). Telly is using its own picks. Paste a new key in Settings to fix it.`;
}

/** The current problem with the user's key, or null. Updates live across pages. */
export function useLlmHealth(engine: EngineState): { health: LlmHealth | null; message: string } {
  const llm = engine.settings?.llm;
  const [health, setHealth] = useState<LlmHealth | null>(null);
  const on = !!(llm?.enabled && llm.apiKey);
  useEffect(() => {
    if (!on) return setHealth(null);
    let alive = true;
    const read = () => getLlmHealth(llm!).then((h) => alive && setHealth(h));
    read();
    const off = onKvChange((keys) => keys.includes('llmHealth') && read());
    return () => {
      alive = false;
      off();
    };
  }, [on, llm?.provider, llm?.apiKey]);
  return { health, message: health && llm ? llmHealthMessage(health, LLM_PROVIDERS[llm.provider].name) : '' };
}

/**
 * With an API key configured, re-rank the engine's picks with the LLM; otherwise (or on any
 * error) return the engine's picks unchanged.
 */
export function useLlmRerank(engine: EngineState, recs: Rec[], opts: { purpose: LlmRequest['purpose']; filters: Filters; vibe?: string }): Rec[] {
  // remember which engine picks each reranked list belongs to, so a stale list is never shown for new picks
  const [res, setRes] = useState<{ src: Rec[]; list: Rec[] }>({ src: recs, list: recs });
  const setOut = (list: Rec[]) => setRes({ src: recs, list });
  const llm = engine.settings?.llm;
  const on = !!(llm?.enabled && llm.apiKey && engine.catalog && engine.profile && recs.length > 1);
  const key = on ? `${opts.purpose}|${opts.vibe ?? ''}|${recs.map((r) => r.item.id).join(',')}` : '';

  useEffect(() => {
    setOut(recs);
    if (!on) return;
    const hit = cache.get(key);
    if (hit) {
      setOut(hit);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      if (await getLlmHealth(llm!)) return; // key is known to be failing: don't spend another call
      try {
        const r = await llmRerank(llm!, engine.catalog!, engine.profile!, recs, { purpose: opts.purpose, vibe: opts.vibe, constraints: describe(opts.filters) }, ctrl.signal);
        cache.set(key, r);
        setOut(r);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        const kind = classifyLlmError(e);
        console.warn('[telly] LLM unavailable, using local picks:', (e as Error).message);
        if (kind !== 'other') await kvSet('llmHealth', { kind, fingerprint: llmFingerprint(llm!), until: Date.now() + COOLDOWN[kind] } satisfies LlmHealth);
      }
    })();
    return () => ctrl.abort();
  }, [key, recs]);

  return res.src === recs ? res.list : recs;
}
