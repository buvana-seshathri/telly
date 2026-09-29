// v1 recommender: content similarity + genre/creator affinity + quality prior, with
// diversity (MMR). Everything runs locally over the catalog vectors.
import type { Catalog, CatalogItem, Filters, Rec } from '../shared/types';
import { explain } from './explain';
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
  if (f.platforms.length && !item.providers.some((p) => f.platforms.includes(p))) return false;
  if (f.maxMinutes != null && item.runtime != null) {
    if (item.runtime > f.maxMinutes) return false;
  }
  return true;
}

/** Taste score for one catalog item (no filters applied). */
export function tasteScore(cat: Catalog, p: TasteProfile, i: number): Scored {
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
    const w = 0.6 + 0.4 * Math.min(1, s.weight / maxW);
    const sim = dot(cat.vectors[s.index], v) * w;
    if (sim > anchorSim) {
      anchorSim = sim;
      anchor = s;
    }
  }
  let genreFit = 0;
  for (const g of item.genres) genreFit += p.genreShare.get(g) ?? 0;
  genreFit /= Math.sqrt(item.genres.length || 1);
  const creatorHit = item.creators.some((c) => (p.creatorWeight.get(c) ?? 0) > 0.3) ? 1 : 0;
  const castHit = item.cast.some((c) => c !== 'Various' && (p.castWeight.get(c) ?? 0) > 0.3) ? 1 : 0;
  const negSim = p.neg ? Math.max(0, dot(p.neg, v)) : 0;
  const score =
    0.4 * meanSim +
    0.5 * anchorSim +
    0.14 * genreFit +
    0.1 * creatorHit +
    0.04 * castHit +
    0.07 * quality +
    0.03 * item.popularity -
    0.3 * negSim;
  return { index: i, score, anchor };
}

export function rankAll(cat: Catalog, p: TasteProfile, f: Filters, exclude: Set<string> = new Set()): Scored[] {
  const out: Scored[] = [];
  for (let i = 0; i < cat.items.length; i++) {
    const item = cat.items[i];
    if (p.seen.has(i) || p.rejected.has(i) || exclude.has(item.id)) continue;
    if (!passesFilters(item, f)) continue;
    out.push(tasteScore(cat, p, i));
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Greedy maximal-marginal-relevance selection so picks are not near-duplicates. */
export function diversify(cat: Catalog, ranked: Scored[], k: number, lambda = 0.8): Scored[] {
  const pool = ranked.slice(0, Math.max(k * 6, 30));
  const chosen: Scored[] = [];
  while (chosen.length < k && pool.length) {
    let bestI = 0;
    let best = -Infinity;
    for (let j = 0; j < pool.length; j++) {
      const c = pool[j];
      let maxSim = 0;
      for (const s of chosen) maxSim = Math.max(maxSim, dot(cat.vectors[c.index], cat.vectors[s.index]));
      const m = lambda * c.score - (1 - lambda) * maxSim * 0.5;
      if (m > best) {
        best = m;
        bestI = j;
      }
    }
    chosen.push(pool.splice(bestI, 1)[0]);
  }
  return chosen;
}

export function toRec(cat: Catalog, p: TasteProfile, s: Scored, f: Filters, stretch = false): Rec {
  const item = cat.items[s.index];
  const { why, evidence } = explain(cat, p, item, s.anchor, { maxMinutes: f.maxMinutes, stretch });
  return { item, score: s.score, why, evidence, anchorId: s.anchor ? cat.items[s.anchor.index].id : undefined };
}

export function recommend(cat: Catalog, p: TasteProfile, f: Filters, k = 10, exclude?: Set<string>): Rec[] {
  const ranked = rankAll(cat, p, f, exclude);
  return diversify(cat, ranked, k).map((s) => toRec(cat, p, s, f));
}

export interface GenreSection {
  genre: string;
  share: number;
  stretch: boolean;
  recs: Rec[];
}

/** Top picks for the genres you actually watch, plus one "stretch" genre next to your taste. */
export function genreSections(cat: Catalog, p: TasteProfile, f: Filters, perGenre = 3, maxGenres = 5, exclude: Iterable<string> = []): GenreSection[] {
  const used = new Set<string>(exclude);
  const sections: GenreSection[] = [];
  let genres = [...p.genreShare.entries()].filter(([, s]) => s >= 0.08).sort((a, b) => b[1] - a[1]);
  if (!genres.length) genres = ['drama', 'comedy', 'thriller', 'sci-fi', 'documentary'].map((g) => [g, 0] as [string, number]);
  for (const [genre, share] of genres.slice(0, maxGenres)) {
    const recs = recommend(cat, p, { ...f, genre }, perGenre, used);
    recs.forEach((r) => used.add(r.item.id));
    if (recs.length) sections.push({ genre, share, stretch: false, recs });
  }
  // stretch: a genre you rarely watch whose items sit closest to your taste
  if (p.pos) {
    const present = new Set(genres.map(([g]) => g));
    const candidates = new Map<string, number>();
    const all = rankAll(cat, p, f, used);
    for (const s of all.slice(0, 80)) {
      for (const g of cat.items[s.index].genres) {
        if (present.has(g) || (p.genreShare.get(g) ?? 0) >= 0.05) continue;
        candidates.set(g, Math.max(candidates.get(g) ?? 0, s.score));
      }
    }
    const best = [...candidates.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) {
      const ranked = rankAll(cat, p, { ...f, genre: best[0] }, used);
      const recs = diversify(cat, ranked, perGenre).map((s) => toRec(cat, p, s, f, true));
      if (recs.length) sections.push({ genre: best[0], share: p.genreShare.get(best[0]) ?? 0, stretch: true, recs });
    }
  }
  return sections;
}

/** Smart random: a weighted draw from your top 40, never from the whole catalog. */
export function surprise(cat: Catalog, p: TasteProfile, f: Filters, type: 'movie' | 'tv', rand = Math.random): Rec | null {
  const ranked = rankAll(cat, p, { ...f, type }).slice(0, 40);
  if (!ranked.length) return null;
  const min = ranked[ranked.length - 1].score;
  const weights = ranked.map((s) => Math.pow(s.score - min + 0.05, 2));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < ranked.length; i++) {
    r -= weights[i];
    if (r <= 0) return toRec(cat, p, ranked[i], f);
  }
  return toRec(cat, p, ranked[0], f);
}
