// "Describe what you feel like watching" search.
import type { Catalog, CatalogItem, Filters, Rec } from '../shared/types';
import { explain } from './explain';
import type { TasteProfile } from './profile';
import { passesFilters, tasteScore } from './recommend';
import { conceptOf, contentWords, genresInText, GENRES, stem } from './text';
import { langsIn, themesIn, themeTermsIn } from './themes';

const GENRE_WORD_SET = new Set(['romance', 'romantic', 'romcom', 'comedy', 'comedies', 'funny', 'drama', 'dramas', 'thriller', 'thrillers', 'horror', 'scary', 'mystery', 'action', 'fantasy', 'crime', 'documentary', 'documentaries', 'animated', 'animation', 'scifi', 'sci', 'war', 'western', 'reality', 'kids', 'family', 'music', 'musical', 'history', 'historical', 'adventure', ...GENRES]);
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

const quote = (t: string) => `“${t}”`;
function joinList(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
}

/**
 * Mood search. A request is broken into story themes ("next life" = reincarnation), genres
 * ("romance"), languages ("kdrama") and leftover words. Themes are what the person is really
 * asking for, so a title has to speak to them to rank high; the genre word only narrows;
 * the language model's similarity and your taste break ties.
 */
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
  const themes = themesIn(query);
  const genres = genresInText(query);
  const langs = langsIn(query);
  // words not already explained by a theme, genre or language
  const covered = new Set([...themes.flatMap((t) => contentWords(t.said)), ...contentWords(genres.join(' '))]);
  const extraQuery = contentWords(query).filter((w) => !covered.has(w) && !GENRE_WORD_SET.has(w) && !/^(korean|kdramas?|japanese|chinese|anime|hindi|bollywood|spanish|thai|turkish)$/.test(w)).join(' ');

  type Hit = { i: number; score: number; themeHits: { said: string; terms: string[] }[]; genreHit: boolean; terms: string[] };
  const scored: Hit[] = [];
  for (let i = 0; i < cat.items.length; i++) {
    const item = cat.items[i];
    if (p.seen.has(i) || p.rejected.has(i) || !passesFilters(item, f)) continue;
    if (parsed.short && item.runtime != null && item.runtime > (item.type === 'movie' ? 105 : 35)) continue;
    const themeHits = themes.map((t) => ({ said: t.said, terms: themeTermsIn(t.theme, item) })).filter((h) => h.terms.length);
    const genreHit = genres.some((g) => item.genres.includes(g));
    const terms = extraQuery ? matchedTerms(extraQuery, item) : [];
    let score = 0;
    if (queryVec) score += 0.55 * dot(queryVec, cat.vectors[i]);
    if (p.hasSignal) score += 0.1 * tasteScore(cat, p, i).score;
    if (themes.length) score += themeHits.length ? 0.5 * (themeHits.length / themes.length) + 0.04 * Math.min(3, themeHits.reduce((a, h) => a + h.terms.length, 0)) : -0.3;
    if (genres.length) score += genreHit ? 0.1 : -0.25;
    if (langs.length) score += item.lang && langs.includes(item.lang) ? 0.2 : -0.3;
    score += (themes.length ? 0.04 : queryVec ? 0.07 : 0.25) * Math.min(3, terms.length);
    scored.push({ i, score, themeHits, genreHit, terms });
  }
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, k);
  const anyThemeHit = top.some((h) => h.themeHits.length);
  return top.map(({ i, score, themeHits, genreHit, terms }) => {
    const item = cat.items[i];
    const base = explain(cat, p, item, null, { maxMinutes: f.maxMinutes });
    const bits: string[] = [];
    for (const h of themeHits) bits.push(h.terms.some((t) => t === h.said) ? quote(h.said) : `${quote(h.said)} (${h.terms.slice(0, 2).join(', ')})`);
    for (const t of terms) bits.push(quote(t));
    if (genreHit) bits.push(...genres.filter((g) => item.genres.includes(g)).map(quote));
    let vibeWhy: string;
    if (themes.length && !themeHits.length) {
      const asked = joinList(themes.map((t) => quote(t.said)));
      const g = genres.filter((x) => item.genres.includes(x));
      vibeWhy = anyThemeHit
        ? `Not clearly about ${asked}, but ${g.length ? `a close ${joinList(g.map(quote))} pick` : 'close in feel'}.`
        : `Nothing on your platforms is clearly about ${asked}; this is the closest I found.`;
    } else if (bits.length) {
      vibeWhy = `Matches ${joinList(bits.slice(0, 3))}.`;
    } else {
      vibeWhy = 'Closest match to your description.';
    }
    // only mention your history when that title also fits the request itself
    const s = tasteScore(cat, p, i);
    const anchor = s.anchor && p.hasSignal ? cat.items[s.anchor.index] : null;
    const anchorFits =
      !!anchor &&
      (themes.length ? themes.some((t) => themeTermsIn(t.theme, anchor).length) : genres.length ? genres.some((g) => anchor.genres.includes(g)) : true) &&
      dot(cat.vectors[s.anchor!.index], cat.vectors[i]) > 0.35;
    const tasteBit = anchorFits ? ` Also close to ${anchor!.title}, which you watched.` : '';
    return {
      item,
      score,
      why: vibeWhy + tasteBit,
      anchorId: anchorFits ? anchor!.id : undefined,
      evidence: [{ kind: 'vibe-match' as const, text: vibeWhy }, ...base.evidence],
    };
  });
}
