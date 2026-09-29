import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCatalog } from '../src/engine/catalog';
import { buildTitleIndex, matchTitle } from '../src/engine/match';
import { buildProfile } from '../src/engine/profile';
import { recommend, genreSections, surprise } from '../src/engine/recommend';
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
