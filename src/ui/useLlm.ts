import { useEffect, useState } from 'preact/hooks';
import type { Filters, Rec } from '../shared/types';
import { llmRerank, type LlmRequest } from '../engine/llm';
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

/**
 * With an API key configured, re-rank the engine's picks with the LLM; otherwise (or on any
 * error) return the engine's picks unchanged.
 */
export function useLlmRerank(engine: EngineState, recs: Rec[], opts: { purpose: LlmRequest['purpose']; filters: Filters; vibe?: string }): Rec[] {
  const [out, setOut] = useState<Rec[]>(recs);
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
    llmRerank(llm!, engine.catalog!, engine.profile!, recs, { purpose: opts.purpose, vibe: opts.vibe, constraints: describe(opts.filters) }, ctrl.signal)
      .then((r) => {
        cache.set(key, r);
        setOut(r);
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') console.warn('[tonight] LLM unavailable, using local picks:', (e as Error).message);
      });
    return () => ctrl.abort();
  }, [key, recs]);

  return out;
}
