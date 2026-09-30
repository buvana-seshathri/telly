// v1 recommender: content similarity + genre/creator affinity + quality prior, with
// diversity (MMR). Everything runs locally over the catalog vectors.
import type { Catalog, CatalogItem, Filters, Rec } from '../shared/types';
import { explain } from './explain';
import { catalogFacets, facetScore } from './facets';
import { linked } from './neighbors';
import type { TasteProfile, TitleSignal } from './profile';
import { dot } from './vector';

export interface Scored {
  index: number;
  score: number;
  anchor: TitleSignal | null;
}

export function passesFilters(item: CatalogItem, f: Filters): boolean {
  if (f.type !== 'any' && item.type !== f.type) return false;
  if (f.genre && !item.genres.includes(f.genre)) return false;
  if (f.lang && item.lang !== f.lang) return false;
  if (f.platforms.length && !item.providers.some((p) => f.platforms.includes(p))) return false;
  if (f.maxMinutes != null && item.runtime != null) {
    if (item.runtime > f.maxMinutes) return false;
  }
  return true;
}

/** How the signals are blended. `LEGACY` is the original embeddings-only formula (kept for comparison). */
export interface Weights {
  emb: number; // text-embedding similarity to what you watched
  facet: number; // language / country / network / genre / creator lift
  cf: number; // "people who liked X also liked this" (TMDB neighbours)
  quality: number;
  pop: number;
  neg: number; // pushed down when close to what you dropped or skipped
  creator: number;
  cast: number;
  genreFit: number;
}
export const V2: Weights = { emb: 1, facet: 1.6, cf: 0.5, quality: 0.08, pop: 0.03, neg: 0.3, creator: 0.06, cast: 0.03, genreFit: 0 };
export const LEGACY: Weights = { emb: 1, facet: 0, cf: 0, quality: 0.07, pop: 0.03, neg: 0.3, creator: 0.1, cast: 0.04, genreFit: 0.14 };

/** Taste score for one catalog item (no filters applied). */
export function tasteScore(cat: Catalog, p: TasteProfile, i: number, w: Weights = V2): Scored {
  const item = cat.items[i];
  const v = cat.vectors[i];
  const quality = item.rating ? Math.max(0, Math.min(1, (item.rating - 6) / 3)) : 0.3;
  if (!p.hasSignal || !p.pos) {
    return { index: i, score: 0.6 * item.popularity + 0.4 * quality, anchor: null };
  }
  const meanSim = dot(p.pos, v);
  // strongest single anchor (supports several separate interests)
  let anchorSim = 0;
  let anchor: TitleSignal | null = null;
  const maxW = p.positives[0]?.weight || 1;
  for (const s of p.positives.slice(0, 40)) {
    const wt = 0.6 + 0.4 * Math.min(1, s.weight / maxW);
    const sim = dot(cat.vectors[s.index], v) * wt;
    if (sim > anchorSim) {
      anchorSim = sim;
      anchor = s;
    }
  }
  const emb = 0.4 * meanSim + 0.5 * anchorSim;
  let genreFit = 0;
  if (w.genreFit) {
    for (const g of item.genres) genreFit += p.genreShare.get(g) ?? 0;
    genreFit /= Math.sqrt(item.genres.length || 1);
  }
  const creatorHit = item.creators.some((c) => (p.creatorWeight.get(c) ?? 0) > 0.3) ? 1 : 0;
  const castHit = item.cast.some((c) => c !== 'Various' && (p.castWeight.get(c) ?? 0) > 0.3) ? 1 : 0;
  const facets = w.facet ? catalogFacets(cat).facets[i] : null;
  const facet = facets ? facetScore(facets, p.facetLift) : 0;
  const facetNeg = facets && p.facetPenalty.size ? facetScore(facets, p.facetPenalty) : 0;
  const cf = w.cf && p.cf ? p.cf[i] : 0;
  const negSim = p.neg ? Math.max(0, dot(p.neg, v)) : 0;
  const score =
    w.emb * emb +
    w.facet * facet +
    w.cf * cf +
    w.genreFit * genreFit +
    w.creator * creatorHit +
    w.cast * castHit +
    w.quality * quality +
    w.pop * item.popularity -
    w.neg * negSim -
    w.facet * 0.5 * facetNeg;
  return { index: i, score, anchor };
}

export function rankAll(cat: Catalog, p: TasteProfile, f: Filters, exclude: Set<string> = new Set(), w: Weights = V2): Scored[] {
  const out: Scored[] = [];
  for (let i = 0; i < cat.items.length; i++) {
    const item = cat.items[i];
    if (p.seen.has(i) || p.rejected.has(i) || exclude.has(item.id)) continue;
    if (!passesFilters(item, f)) continue;
    out.push(tasteScore(cat, p, i, w));
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Greedy maximal-marginal-relevance selection so picks are not near-duplicates.
 * `quota` guarantees a minimum number of picks in a language (when the pool has them),
 * so a strong taste for, say, Korean shows up in every shelf instead of being outvoted.
 */
export function diversify(cat: Catalog, ranked: Scored[], k: number, lambda = 0.8, quota?: Map<string, number>): Scored[] {
  const pool = ranked.slice(0, Math.max(k * 6, 30));
  if (quota?.size) {
    const inPool = new Set(pool.map((x) => x.index));
    for (const lang of quota.keys()) {
      let n = 0;
      for (const s of ranked) {
        if (n >= 12) break;
        if (cat.items[s.index].lang !== lang) continue;
        n++;
        if (!inPool.has(s.index)) {
          pool.push(s);
          inPool.add(s.index);
        }
      }
    }
  }
  const chosen: Scored[] = [];
  const take = (ok: (s: Scored) => boolean): boolean => {
    let bestJ = -1;
    let best = -Infinity;
    for (let j = 0; j < pool.length; j++) {
      const c = pool[j];
      if (!ok(c)) continue;
      let maxSim = 0;
      for (const s of chosen) maxSim = Math.max(maxSim, dot(cat.vectors[c.index], cat.vectors[s.index]));
      const m = lambda * c.score - (1 - lambda) * maxSim * 0.5;
      if (m > best) {
        best = m;
        bestJ = j;
      }
    }
    if (bestJ < 0) return false;
    chosen.push(pool.splice(bestJ, 1)[0]);
    return true;
  };
  for (const [lang, n] of quota ?? []) {
    for (let i = 0; i < n && chosen.length < k; i++) if (!take((c) => cat.items[c.index].lang === lang)) break;
  }
  while (chosen.length < k && take(() => true)) {}
  return chosen.sort((a, b) => b.score - a.score);
}

/**
 * How many picks (of k) should be in each language you watch a lot. English is the default, so it needs none.
 * Inside a genre shelf the language mix of *that genre* in your history is used when there is enough of it
 * (you may watch Korean reality but English dramas).
 */
export function langQuota(p: TasteProfile, k: number, genre?: string | null): Map<string, number> {
  const q = new Map<string, number>();
  if (k < 3) return q;
  const g = genre ? p.langByGenre.get(genre) : undefined;
  const mix = g && g.total >= 2 ? g.share : p.langShare;
  let left = k - 1; // always leave room for the best overall pick
  for (const [lang, share] of [...mix.entries()].sort((a, b) => b[1] - a[1])) {
    if (lang === 'en' || share < 0.12 || left <= 0) continue;
    const n = Math.min(left, Math.max(1, Math.round(share * k)));
    q.set(lang, n);
    left -= n;
  }
  return q;
}

/**
 * The watched title to show as "Like X". It must share a genre with the pick (and with the shelf's
 * genre, when there is one), and titles already used as a chip elsewhere on the page are passed over
 * so every shelf isn't "Like" the same five things.
 */
export function pickAnchor(
  cat: Catalog,
  p: TasteProfile,
  i: number,
  ctx: { genre?: string | null; used?: Map<number, number> } = {},
): TitleSignal | null {
  if (!p.hasSignal) return null;
  const item = cat.items[i];
  const v = cat.vectors[i];
  const maxW = p.positives[0]?.weight || 1;
  let best: TitleSignal | null = null;
  let bestScore = -Infinity;
  for (const s of p.positives.slice(0, 80)) {
    if (s.index === i) continue;
    const a = cat.items[s.index];
    if (ctx.genre && !a.genres.includes(ctx.genre)) continue;
    if (a.lang && item.lang && a.lang !== item.lang) continue; // "Like X" stays in the same language lane
    const isLinked = linked(cat, s.index, i);
    const common = a.genres.filter((g) => item.genres.includes(g)).length;
    if (!common) continue;
    const sim = dot(cat.vectors[s.index], v);
    if (sim < 0.15 && !isLinked) continue;
    let score = sim * (0.7 + 0.3 * Math.min(1, s.weight / maxW)) + 0.08 * (common / Math.max(1, item.genres.length));
    if (a.lang && a.lang === item.lang) score += 0.06;
    if (isLinked) score += 0.25;
    score -= 0.08 * (ctx.used?.get(s.index) ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (best && ctx.used) ctx.used.set(best.index, (ctx.used.get(best.index) ?? 0) + 1);
  return best;
}

export function toRec(cat: Catalog, p: TasteProfile, s: Scored, f: Filters, stretch = false, used?: Map<number, number>): Rec {
  const item = cat.items[s.index];
  const anchor = pickAnchor(cat, p, s.index, { genre: stretch ? null : f.genre, used });
  const { why, evidence } = explain(cat, p, item, anchor, { maxMinutes: f.maxMinutes, stretch, linked: !!anchor && linked(cat, anchor.index, s.index) });
  return { item, score: s.score, why, evidence, anchorId: anchor ? cat.items[anchor.index].id : undefined };
}

export function recommend(cat: Catalog, p: TasteProfile, f: Filters, k = 10, exclude?: Set<string>, used?: Map<number, number>): Rec[] {
  const ranked = rankAll(cat, p, f, exclude);
  const quota = f.lang ? undefined : langQuota(p, k, f.genre);
  return diversify(cat, ranked, k, 0.8, quota).map((s) => toRec(cat, p, s, f, false, used));
}

export interface GenreSection {
  genre: string;
  lang?: string; // set for a language shelf ("ko"); genre is then the language code
  share: number;
  stretch: boolean;
  recs: Rec[];
}

/**
 * Top picks per genre. Order: the genres you watch most, one "stretch" genre next to your
 * taste, then every other genre in the catalog (best match first). Stops at `maxGenres`.
 */
export function genreSections(cat: Catalog, p: TasteProfile, f: Filters, perGenre = 3, maxGenres = 6, exclude: Iterable<string> = []): GenreSection[] {
  const used = new Set<string>(exclude);
  const anchors = new Map<number, number>();
  const all = rankAll(cat, p, f, used);
  const best = new Map<string, number>(); // genre -> best score available to this person
  for (const s of all) for (const g of cat.items[s.index].genres) if ((best.get(g) ?? -Infinity) < s.score) best.set(g, s.score);

  let mine = [...p.genreShare.entries()].filter(([g, s]) => s >= 0.08 && best.has(g)).sort((a, b) => b[1] - a[1]);
  if (!mine.length) mine = ['drama', 'comedy', 'thriller', 'sci-fi', 'documentary'].filter((g) => best.has(g)).map((g) => [g, 0] as [string, number]);
  mine = mine.slice(0, 4);
  const mineSet = new Set(mine.map(([g]) => g));

  // stretch: a genre you rarely watch whose items sit closest to your taste
  let stretch: string | null = null;
  if (p.pos) {
    const cand = new Map<string, number>();
    for (const s of all.slice(0, 80)) {
      for (const g of cat.items[s.index].genres) {
        if (mineSet.has(g) || (p.genreShare.get(g) ?? 0) >= 0.05) continue;
        cand.set(g, Math.max(cand.get(g) ?? 0, s.score));
      }
    }
    stretch = [...cand.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  const rest = [...best.entries()]
    .filter(([g]) => !mineSet.has(g) && g !== stretch)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);

  const order: { genre: string; stretch: boolean }[] = [
    ...mine.map(([genre]) => ({ genre, stretch: false })),
    ...(stretch ? [{ genre: stretch, stretch: true }] : []),
    ...rest.map((genre) => ({ genre, stretch: false })),
  ];

  const sections: GenreSection[] = [];
  for (const { genre, stretch: isStretch } of order) {
    if (sections.length >= maxGenres) break;
    const gf = { ...f, genre };
    const recs = isStretch
      ? diversify(cat, rankAll(cat, p, gf, used), perGenre, 0.8, langQuota(p, perGenre, null)).map((s) => toRec(cat, p, s, f, true, anchors))
      : recommend(cat, p, gf, perGenre, used, anchors);
    if (!recs.length) continue;
    recs.forEach((r) => used.add(r.item.id));
    sections.push({ genre, share: p.genreShare.get(genre) ?? 0, stretch: isStretch, recs });
  }
  return sections;
}

/** One shelf per non-English language you watch a lot (e.g. Korean), so it is never buried. */
export function languageSections(cat: Catalog, p: TasteProfile, f: Filters, perShelf = 3, exclude: Iterable<string> = []): GenreSection[] {
  const used = new Set<string>(exclude);
  const anchors = new Map<number, number>();
  const out: GenreSection[] = [];
  for (const [lang, share] of [...p.langShare.entries()].sort((a, b) => b[1] - a[1])) {
    if (lang === 'en' || share < 0.15 || out.length >= 2) continue;
    const recs = recommend(cat, p, { ...f, lang }, perShelf, used, anchors);
    if (recs.length < 2) continue;
    recs.forEach((r) => used.add(r.item.id));
    out.push({ genre: lang, lang, share, stretch: false, recs });
  }
  return out;
}

/** Titles already shown by "surprise me" this session, so rolling again gives something new. */
const seenSurprise = new Set<string>();

/**
 * Smart random: a draw from your top 60, never the whole catalog. Weights are gentle (so #1 does not
 * win every time) and anything already rolled this session is skipped until the pool runs dry.
 */
export function surprise(cat: Catalog, p: TasteProfile, f: Filters, type: 'movie' | 'tv', rand = Math.random): Rec | null {
  const all = rankAll(cat, p, { ...f, type }).slice(0, 60);
  if (!all.length) return null;
  let ranked = all.filter((s) => !seenSurprise.has(cat.items[s.index].id));
  if (ranked.length < 5) {
    for (const s of all) seenSurprise.delete(cat.items[s.index].id);
    ranked = all;
  }
  const min = ranked[ranked.length - 1].score;
  const weights = ranked.map((s) => s.score - min + 0.15);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  let pick = ranked[0];
  for (let i = 0; i < ranked.length; i++) {
    r -= weights[i];
    if (r <= 0) { pick = ranked[i]; break; }
  }
  seenSurprise.add(cat.items[pick.index].id);
  return toRec(cat, p, pick, f);
}
