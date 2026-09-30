import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCatalog } from '../src/engine/catalog';
import { buildTitleIndex, matchTitle } from '../src/engine/match';
import { buildProfile } from '../src/engine/profile';
import { recommend, genreSections, languageSections, langQuota, surprise } from '../src/engine/recommend';
import { parseVibe, searchVibe } from '../src/engine/vibe';
import { hashEmbedQuery } from '../src/engine/embed-hash';
import { parsePicks, llmRerank } from '../src/engine/llm';
import { parseNetflixCsv, parseLooseDate } from '../src/platforms/netflix-csv';
import { cleanPageTitle } from '../src/platforms/page-title';
import { platformFromTmdbName } from '../src/shared/platforms';
import { demoEvents } from '../src/shared/demo';
import type { Filters } from '../src/shared/types';

const file = JSON.parse(readFileSync('static/catalog/catalog.json', 'utf8'));
const buf = readFileSync('static/catalog/vectors.i8');
const cat = parseCatalog(file, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const all: Filters = { type: 'any', maxMinutes: null, genre: null, platforms: [] };

describe('title matching', () => {
  const idx = buildTitleIndex(cat);
  const t = (raw: string, s?: string) => { const m = matchTitle(cat, idx, raw, s); return m && cat.items[m.index].title; };
  it('matches Netflix episode strings to the series', () => {
    expect(t('Dark: Season 1: Secrets')).toBe('Dark');
    expect(t("The Queen's Gambit: Limited Series: Openings")).toBe("The Queen's Gambit");
    expect(t('Star Trek: Strange New Worlds: Season 1: Strange New Worlds')).toBe('Star Trek: Strange New Worlds');
    expect(t('Episode 3', 'Mindhunter')).toBe('Mindhunter');
  });
  it('matches movies, aliases and ignores unknown titles', () => {
    expect(t('Whiplash')).toBe('Whiplash');
    expect(t('Shogun: Episode 1')).toBe('Shōgun');
    expect(t('Totally Unknown Show: Season 2: Pilot')).toBeNull();
  });
});

describe('taste profile + recommendations', () => {
  const p = buildProfile(cat, demoEvents(), []);
  it('detects binges and genre shares', () => {
    const dark = p.signals.find((s) => cat.items[s.index].title === 'Dark')!;
    expect(dark.reason).toBe('binge');
    expect(dark.bingeCount).toBeGreaterThanOrEqual(4);
    expect(p.genreShare.get('drama')!).toBeGreaterThan(0.3);
  });
  it('never recommends watched or rejected titles, and respects filters', () => {
    const recs = recommend(cat, p, all, 20);
    const watched = new Set([...p.seen].map((i) => cat.items[i].id));
    expect(recs.some((r) => watched.has(r.item.id))).toBe(false);
    const nf = recommend(cat, p, { ...all, platforms: ['netflix'], type: 'tv', maxMinutes: 40 }, 10);
    for (const r of nf) {
      expect(r.item.providers).toContain('netflix');
      expect(r.item.type).toBe('tv');
      expect(r.item.runtime!).toBeLessThanOrEqual(40);
    }
  });
  it('explains with real evidence (same creators as a watched title)', () => {
    const recs = recommend(cat, p, all, 10);
    const r1899 = recs.find((r) => r.item.title === '1899');
    expect(r1899?.why).toMatch(/Dark/);
    expect(r1899?.why).toMatch(/Same creators/);
  });
  it('a "nope" pushes a title out', () => {
    const top = recommend(cat, p, all, 1)[0];
    const p2 = buildProfile(cat, demoEvents(), [{ itemId: top.item.id, kind: 'nope', at: Date.now() }]);
    expect(recommend(cat, p2, all, 30).some((r) => r.item.id === top.item.id)).toBe(false);
  });
  it('genre sections have no duplicates; surprise returns the right type', () => {
    const secs = genreSections(cat, p, all, 3, 4);
    const ids = secs.flatMap((s) => s.recs.map((r) => r.item.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(surprise(cat, p, all, 'movie', () => 0.5)?.item.type).toBe('movie');
    expect(surprise(cat, p, all, 'tv', () => 0.5)?.item.type).toBe('tv');
  });
  it('shows every genre in the catalog, not just the top few', () => {
    const secs = genreSections(cat, p, all, 3, 50);
    expect(secs.length).toBeGreaterThan(8);
    expect(new Set(secs.map((s) => s.genre)).size).toBe(secs.length);
    expect(genreSections(cat, p, all, 3, 6)).toHaveLength(6);
  });
  it('cold start still gives picks', () => {
    const empty = buildProfile(cat, [], []);
    expect(recommend(cat, empty, all, 5)).toHaveLength(5);
  });
});

describe('mood search', () => {
  const p = buildProfile(cat, demoEvents(), []);
  it('parses type and time from free text', () => {
    expect(parseVibe('a movie under 2 hours')).toMatchObject({ type: 'movie', maxMinutes: 120 });
    expect(parseVibe('short funny series')).toMatchObject({ type: 'tv', short: true });
    expect(parseVibe('something for 30 minutes')).toMatchObject({ maxMinutes: 30 });
  });
  it('finds the job-search motivational movie', () => {
    const q = 'movie on life difficulties from job search, motivational';
    const r = searchVibe(cat, p, q, hashEmbedQuery(q), all, 3);
    expect(r[0].item.title).toBe('The Pursuit of Happyness');
    expect(r[0].why).toMatch(/job search/);
  });
});

describe('LLM guardrails', () => {
  it('parses picks from messy replies', () => {
    expect(parsePicks('```json\n{"picks":[{"id":"a","why":"x"}]}\n```')).toEqual([{ id: 'a', why: 'x' }]);
    expect(parsePicks('nope')).toEqual([]);
  });
  it('drops invented titles and keeps real candidates', async () => {
    const p = buildProfile(cat, demoEvents(), []);
    const recs = recommend(cat, p, all, 5);
    const fake = { enabled: true, provider: 'openai' as const, apiKey: 'k', model: 'm' };
    const reply = JSON.stringify({ picks: [{ id: 'movie:made-up', why: 'fake' }, { id: recs[2].item.id, why: 'LLM reason' }] });
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }))) as typeof fetch;
    try {
      const out = await llmRerank(fake, cat, p, recs, { purpose: 'deck' });
      expect(out[0].item.id).toBe(recs[2].item.id);
      expect(out[0].why).toBe('LLM reason');
      expect(out).toHaveLength(recs.length);
      expect(out.some((r) => r.item.id === 'movie:made-up')).toBe(false);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe('importers', () => {
  it('parses Netflix CSV (US and day-first dates, quoted commas)', () => {
    const ev = parseNetflixCsv('Title,Date\n"Dark: Season 1: Secrets","9/14/26"\n"Squid Game: Season 1: Red Light, Green Light","9/15/26"\n', 'netflix:x');
    expect(ev).toHaveLength(2);
    expect(ev[1].rawTitle).toBe('Squid Game: Season 1: Red Light, Green Light');
    expect(new Date(ev[0].date).getUTCMonth()).toBe(8);
    const eu = parseNetflixCsv('Title,Date\nWhiplash,25/12/2025\nArrival,03/01/2025\n', 'netflix:x');
    expect(new Date(eu[1].date).getUTCMonth()).toBe(0);
    expect(parseLooseDate('2026-02-03')).toBe(Date.UTC(2026, 1, 3, 12));
  });
  it('cleans streaming page titles', () => {
    expect(cleanPageTitle('Watch Abbott Elementary | Hulu')).toBe('Abbott Elementary');
    expect(cleanPageTitle('Andor - S1 E3 - Reckoning | Disney+')).toBe('Andor');
    expect(cleanPageTitle('Home | Max')).toBeNull();
  });
  it('maps TMDB provider names', () => {
    expect(platformFromTmdbName('Amazon Prime Video')).toBe('prime');
    expect(platformFromTmdbName('Max')).toBe('max');
    expect(platformFromTmdbName('Paramount+ Amazon Channel')).toBe('paramount');
    expect(platformFromTmdbName('Mubi')).toBeNull();
  });
});

describe('language taste and "Like X" chips', () => {
  const DAY = 24 * 3600 * 1000;
  const ev = (title: string, n: number, ago: number) =>
    Array.from({ length: n }, (_, i) => ({ platform: 'netflix' as const, profileKey: 'netflix:k', rawTitle: `${title}: Season 1: Episode ${i + 1}`, date: Date.now() - (ago - Math.floor(i / 4)) * DAY, source: 'history' as const }));
  const events = [
    ...ev('True Beauty', 10, 20), ...ev('Crash Landing on You', 12, 40), ...ev('Business Proposal', 8, 60), ...ev('The Glory', 8, 80),
    ...ev('Dark', 8, 15), ...ev('Mindhunter', 6, 30), ...ev('Ozark', 8, 50),
    { platform: 'netflix' as const, profileKey: 'netflix:k', rawTitle: 'Prisoners', date: Date.now() - 5 * DAY, source: 'history' as const },
  ];
  const p = buildProfile(cat, events, []);
  it('reads language share from history', () => {
    expect((p.langShare.get('ko') ?? 0)).toBeGreaterThan(0.3);
  });
  it('gives a Korean shelf and Korean picks inside genre shelves', () => {
    const langs = languageSections(cat, p, all, 3);
    expect(langs[0]?.lang).toBe('ko');
    expect(langs[0].recs.every((r) => r.item.lang === 'ko')).toBe(true);
    const secs = genreSections(cat, p, all, 3, 6, langs.flatMap((s) => s.recs.map((r) => r.item.id)));
    const withKo = secs.filter((s) => s.recs.some((r) => r.item.lang === 'ko')).length;
    expect(withKo).toBeGreaterThanOrEqual(2);
  });
  it('the "Like X" chip shares a genre with the shelf and varies across shelves', () => {
    const secs = genreSections(cat, p, all, 3, 8);
    const anchors = new Set<string>();
    for (const s of secs) {
      for (const r of s.recs) {
        if (!r.anchorId) continue;
        const a = cat.items[cat.byId.get(r.anchorId)!];
        expect(a.genres.some((g) => r.item.genres.includes(g))).toBe(true);
        if (!s.stretch) expect(a.genres).toContain(s.genre);
        anchors.add(r.anchorId);
      }
    }
    expect(anchors.size).toBeGreaterThanOrEqual(4);
  });
});

describe('LLM model recovery', () => {
  it('picks a current chat model when the default is retired', async () => {
    const { pickModel } = await import('../src/engine/llm');
    const groq = ['whisper-large-v3', 'meta-llama/llama-prompt-guard-2-86m', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'playai-tts'];
    expect(pickModel('groq', groq, 'llama-3.3-70b-versatile')).toBe('openai/gpt-oss-120b');
    expect(pickModel('groq', ['whisper-large-v3', 'llama-3.1-8b-instant'])).toBe('llama-3.1-8b-instant');
    expect(pickModel('groq', ['whisper-large-v3'])).toBeNull();
  });
});

describe('LLM retry on retired model', () => {
  it('lists models, switches, and succeeds', async () => {
    const { testLlm, lastModelUsed } = await import('../src/engine/llm');
    const { vi } = await import('vitest');
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
      if (String(url).endsWith('/models')) return { ok: true, json: async () => ({ data: [{ id: 'whisper-large-v3' }, { id: 'openai/gpt-oss-120b' }] }) };
      const model = JSON.parse(init!.body!).model;
      calls.push(model);
      if (model === 'llama-3.3-70b-versatile') return { ok: false, status: 404, text: async () => '{"error":{"code":"model_not_found"}}' };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"picks":[{"id":"ok","why":"ready"}]}' } }] }) };
    });
    const msg = await testLlm({ enabled: true, provider: 'groq', apiKey: 'k', model: '' });
    vi.unstubAllGlobals();
    expect(calls).toEqual(['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']);
    expect(msg).toContain('openai/gpt-oss-120b');
    expect(lastModelUsed('groq')).toBe('openai/gpt-oss-120b');
  });
});

describe('mood search without the language model', () => {
  it('still finds titles by the words in the request', () => {
    const p = buildProfile(cat, demoEvents(), []);
    const r = searchVibe(cat, p, 'korean revenge thriller', null, all, 5);
    expect(r.length).toBe(5);
    expect(r[0].why).toMatch(/Matches/);
  });
});

describe('multi-signal ranking', () => {
  const DAY = 24 * 3600 * 1000;
  const ev = (title: string, n: number, ago: number, progress?: number) =>
    Array.from({ length: n }, (_, i) => ({ platform: 'netflix' as const, profileKey: 'netflix:m', rawTitle: n === 1 && !title.includes(':') ? title : `${title}: Season 1: Episode ${i + 1}`, date: Date.now() - (ago - Math.floor(i / 4)) * DAY, progress: progress ?? null, source: 'history' as const }));
  const korean = [...ev('True Beauty', 12, 20), ...ev('Crash Landing on You', 12, 40), ...ev('Business Proposal', 8, 60), ...ev('Hometown Cha-Cha-Cha', 6, 90)];
  const p = buildProfile(cat, [...korean, ...ev('Mindhunter', 6, 30), ...ev('Ozark', 8, 50)], []);

  it('a Korean-heavy taste gets Korean picks at the top, in the same lane', () => {
    const top = recommend(cat, p, all, 6);
    expect(top.filter((r) => r.item.lang === 'ko').length).toBeGreaterThanOrEqual(3);
    const first = top[0];
    expect(first.item.lang).toBe('ko');
    if (first.anchorId) expect(cat.items[cat.byId.get(first.anchorId)!].lang).toBe('ko');
  });
  it('uses neighbour lists: a listed neighbour of what you binged is ranked well', () => {
    const cf = buildProfile(cat, ev('Ted Lasso', 10, 20), []);
    const names = recommend(cat, cf, all, 8).map((r) => r.item.title);
    expect(names.some((n) => ["Schitt's Creek", 'Abbott Elementary', 'The Good Place', 'Brooklyn Nine-Nine'].includes(n))).toBe(true);
  });
  it('the language mix is read per genre, so English crime does not get a Korean quota', () => {
    expect((langQuota(p, 5, 'romance').get('ko') ?? 0)).toBeGreaterThanOrEqual(2);
    expect((langQuota(p, 5, 'crime').get('ko') ?? 0)).toBeLessThanOrEqual(1);
  });
  it('a movie you stopped early counts against it', () => {
    const q = buildProfile(cat, [...korean, ...ev('Whiplash', 1, 10, 0.08)], []);
    const s = q.signals.find((x) => cat.items[x.index].title === 'Whiplash')!;
    expect(s.weight).toBeLessThan(0);
    expect(s.reason).toBe('dropped');
    expect(q.positives.some((x) => cat.items[x.index].title === 'Whiplash')).toBe(false);
    expect(q.seen.has(s.index)).toBe(true);
  });
  it('one episode and then nothing, weeks ago, reads as dropped', () => {
    const q = buildProfile(cat, [...korean, ...ev('Bodies', 1, 40).map((e) => ({ ...e, rawTitle: 'Bodies: Season 1: Episode 1' }))], []);
    expect(q.signals.find((x) => cat.items[x.index].title === 'Bodies')?.reason).toBe('dropped');
  });
});

import { classifyLlmError } from '../src/engine/llm';
describe('LLM failure classification', () => {
  it('tells out-of-credit, rate limits and bad keys apart', () => {
    expect(classifyLlmError(new Error('OpenAI 429: You exceeded your current quota, please check your plan and billing'))).toBe('quota');
    expect(classifyLlmError(new Error('Gemini 429: RESOURCE_EXHAUSTED'))).toBe('quota');
    expect(classifyLlmError(new Error('Groq 429: Rate limit reached for model'))).toBe('rate');
    expect(classifyLlmError(new Error('Anthropic 401: invalid x-api-key'))).toBe('auth');
    expect(classifyLlmError(new Error('Failed to fetch'))).toBe('other');
  });
});

import { themesIn } from '../src/engine/themes';
describe('mood search understands story themes', () => {
  it('reads "next life" as reincarnation, not just "romance"', () => {
    expect(themesIn('next life romance').map((t) => t.theme.id)).toContain('reincarnation');
    const p = buildProfile(cat, demoEvents(), []);
    const romances = cat.items.map((it, i) => ({ it, i })).filter(({ it, i }) => it.genres.includes('romance') && !p.seen.has(i));
    const target = romances[romances.length - 1];
    const items = cat.items.slice();
    items[target.i] = { ...target.it, keywords: [...target.it.keywords, 'reincarnation', 'past life'] };
    const cat2 = { ...cat, items };
    for (const vec of [null, hashEmbedQuery('next life romance')]) {
      const r = searchVibe(cat2, p, 'next life romance', vec, all, 5);
      expect(r[0].item.id).toBe(target.it.id);
      expect(r[0].why).toMatch(/next life/);
      expect(r[1].why).not.toMatch(/Matches “romance”\.$/);
    }
  });
});

import { getProfiles, upsertProfile, deleteProfile, addEvents, getMyEvents } from '../src/shared/store';
describe('profiles never merge', () => {
  it('keeps a second profile separate, even if Netflix reports the same id', async () => {
    const mem = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) };
    (globalThis as any).window = { dispatchEvent: () => true };
    (globalThis as any).CustomEvent = class { constructor(public type: string, public init?: unknown) {} };
    const me = await upsertProfile('netflix', 'ACCT', 'buvi');
    const bro = await upsertProfile('netflix', 'ACCT', 'brother');
    expect(bro.key).not.toBe(me.key);
    expect(me.isMe).toBe(true);
    expect(bro.isMe).toBe(false);
    const names = (await getProfiles()).map((p) => p.name);
    expect(names).toEqual(['buvi', 'brother']);
    await addEvents(bro.key, [{ platform: 'netflix', profileKey: bro.key, rawTitle: 'X', date: 1, source: 'history' }]);
    expect(await getMyEvents()).toHaveLength(0);
    await deleteProfile(bro.key);
    expect((await getProfiles()).map((p) => p.name)).toEqual(['buvi']);
  });
});
