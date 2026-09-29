// "Describe what you feel like watching" search.
import type { Catalog, CatalogItem, Filters, Rec } from '../shared/types';
import { explain } from './explain';
import type { TasteProfile } from './profile';
import { passesFilters, tasteScore } from './recommend';
import { conceptOf, contentWords, stem } from './text';
import { dot } from './vector';

export interface ParsedVibe {
  type: Filters['type'] | null;
  maxMinutes: number | null;
  short: boolean; // "short/quick" without a number: short movies or short episodes
}

export function parseVibe(q: string): ParsedVibe {
  const s = q.toLowerCase();
  let type: ParsedVibe['type'] = null;
  if (/\b(movie|movies|film|films)\b/.test(s)) type = 'movie';
  else if (/\b(series|show|shows|episodes?|binge|season)\b/.test(s)) type = 'tv';
  let maxMinutes: number | null = null;
  const mins = s.match(/(\d{2,3})\s*(?:min|mins|minutes)\b/);
  const hrs = s.match(/(?:under|less than|max|within)?\s*(\d(?:\.\d)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (mins) maxMinutes = parseInt(mins[1], 10);
  else if (hrs) maxMinutes = Math.round(parseFloat(hrs[1]) * 60);
  const short = maxMinutes == null && /\b(short|quick|bite[- ]sized)\b/.test(s);
  return { type, maxMinutes, short };
}

/** Which words of the request does this title actually speak to? (for the explanation) */
export function matchedTerms(query: string, item: CatalogItem): string[] {
  const text = [item.keywords.join(' '), item.overview, item.genres.join(' ')].join(' ').toLowerCase();
  const textWords = contentWords(text);
  const textStems = new Set(textWords.map(stem));
  const textConcepts = new Set(textWords.map((w) => conceptOf(w)).filter(Boolean) as string[]);
  const qWords = contentWords(query);
  const hits: string[] = [];
  // two-word phrases first ("job search", "time travel")
  for (let i = 0; i < qWords.length - 1; i++) {
    const phrase = qWords[i] + ' ' + qWords[i + 1];
    if (text.includes(phrase)) hits.push(phrase);
  }
  for (const w of qWords) {
    if (hits.some((h) => h.includes(w))) continue;
    const c = conceptOf(w);
    if (textStems.has(stem(w)) || (c && textConcepts.has(c))) hits.push(w);
  }
  return hits.slice(0, 3);
}

export function searchVibe(
  cat: Catalog,
  p: TasteProfile,
  query: string,
  queryVec: Float32Array | null, // null = the language model could not load; match on words only
  base: Filters,
  k = 6,
): Rec[] {
  const parsed = parseVibe(query);
  const f: Filters = {
    ...base,
    type: parsed.type ?? base.type,
    maxMinutes: parsed.maxMinutes ?? base.maxMinutes,
  };
  const scored: { i: number; score: number; vibe: number }[] = [];
  for (let i = 0; i < cat.items.length; i++) {
    const item = cat.items[i];
    if (p.seen.has(i) || p.rejected.has(i) || !passesFilters(item, f)) continue;
    if (parsed.short && item.runtime != null && item.runtime > (item.type === 'movie' ? 105 : 35)) continue;
    const vibe = queryVec ? dot(queryVec, cat.vectors[i]) : 0;
    const taste = p.hasSignal ? tasteScore(cat, p, i).score : 0;
    scored.push({ i, vibe, score: queryVec ? 0.78 * vibe + 0.22 * taste : 0.3 * taste });
  }
  scored.sort((a, b) => b.score - a.score);
  // Re-score the head with explicit term matches, so titles that actually speak to the
  // words in the request beat ones that are only loosely similar.
  const head = (queryVec ? scored.slice(0, 60) : scored).map((x) => {
    const terms = matchedTerms(query, cat.items[x.i]);
    return { ...x, terms, score: x.score + (queryVec ? 0.07 : 0.25) * Math.min(3, terms.length) - (terms.length ? 0 : 0.05) };
  });
  head.sort((a, b) => b.score - a.score);
  return head.slice(0, k).map(({ i, score, terms }) => {
    const item = cat.items[i];
    const base = explain(cat, p, item, null, { maxMinutes: f.maxMinutes });
    const vibeWhy = terms.length
      ? `Matches ${terms.map((t) => `“${t}”`).join(' and ').replace(/ and (“[^”]+”) and /, ', $1 and ')}.`
      : 'Closest match to your description.';
    const s = tasteScore(cat, p, i);
    const close = s.anchor && p.hasSignal && dot(cat.vectors[s.anchor.index], cat.vectors[i]) > 0.35;
    const tasteBit = close ? ` Also close to ${cat.items[s.anchor!.index].title}, which you watched.` : '';
    return {
      item,
      score,
      why: vibeWhy + tasteBit,
      anchorId: close ? cat.items[s.anchor!.index].id : undefined,
      evidence: [{ kind: 'vibe-match' as const, text: vibeWhy }, ...base.evidence],
    };
  });
}
