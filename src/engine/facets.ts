// Structured "facets" of a title (language, country, network, genres, creators, ...).
// The taste profile measures how over-represented each facet is in what you watch compared with
// the whole catalog ("lift"), so a lane that is 30% of your viewing but 3% of the catalog counts a lot.
import type { Catalog, CatalogItem } from '../shared/types';

export type FacetType = 'lang' | 'country' | 'studio' | 'genre' | 'pair' | 'creator' | 'cast' | 'kw' | 'type' | 'era' | 'len';

/** How much each kind of facet matters, and how many of an item's best facets of that kind we average. */
export const FACET_RULES: Record<FacetType, { weight: number; top: number }> = {
  lang: { weight: 1.0, top: 1 },
  country: { weight: 0.3, top: 1 },
  studio: { weight: 0.5, top: 2 },
  genre: { weight: 0.45, top: 3 },
  pair: { weight: 0.55, top: 2 },
  creator: { weight: 0.7, top: 2 },
  cast: { weight: 0.3, top: 3 },
  kw: { weight: 0.35, top: 4 },
  type: { weight: 0.25, top: 1 },
  era: { weight: 0.12, top: 1 },
  len: { weight: 0.25, top: 1 },
};
const TOTAL_WEIGHT = Object.values(FACET_RULES).reduce((a, r) => a + r.weight, 0);

export const facetType = (f: string) => f.slice(0, f.indexOf(':')) as FacetType;

export function facetsOf(item: CatalogItem): string[] {
  const out: string[] = ['type:' + item.type];
  if (item.lang) out.push('lang:' + item.lang);
  for (const c of item.countries ?? []) out.push('country:' + c);
  for (const s of item.studios ?? []) out.push('studio:' + s.toLowerCase());
  const g = item.genres;
  for (const x of g) out.push('genre:' + x);
  const gs = [...g].sort().slice(0, 3);
  for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) out.push(`pair:${gs[i]}+${gs[j]}`);
  for (const c of item.creators) out.push('creator:' + c.toLowerCase());
  for (const c of item.cast) if (c !== 'Various') out.push('cast:' + c.toLowerCase());
  for (const k of item.keywords) out.push('kw:' + k.toLowerCase());
  if (item.year) out.push('era:' + Math.floor(item.year / 10) * 10);
  if (item.runtime) {
    const bucket = item.type === 'tv' ? (item.runtime <= 32 ? 'short' : item.runtime <= 52 ? 'std' : 'long') : item.runtime < 100 ? 'short' : item.runtime <= 140 ? 'std' : 'long';
    out.push('len:' + item.type + '-' + bucket);
  }
  return out;
}

const cache = new WeakMap<Catalog, { p: Map<string, number>; facets: string[][] }>();

/** Facets of every item + how common each facet is across the catalog. */
export function catalogFacets(cat: Catalog): { p: Map<string, number>; facets: string[][] } {
  let c = cache.get(cat);
  if (c) return c;
  const counts = new Map<string, number>();
  const facets = cat.items.map((it) => facetsOf(it));
  for (const fs of facets) for (const f of fs) counts.set(f, (counts.get(f) ?? 0) + 1);
  const n = Math.max(1, cat.items.length);
  const p = new Map<string, number>();
  for (const [f, k] of counts) p.set(f, k / n);
  c = { p, facets };
  cache.set(cat, c);
  return c;
}

const sat = (z: number) => (z <= 0 ? 0 : z / (z + 6));

/** Over-representation of each facet in `weights` (facet -> summed title weight) against the catalog. */
export function liftOf(cat: Catalog, weights: Map<string, number>, total: number): Map<string, number> {
  const { p } = catalogFacets(cat);
  const out = new Map<string, number>();
  if (total <= 0) return out;
  for (const [f, w] of weights) {
    const expected = total * (p.get(f) ?? 1 / cat.items.length);
    const z = (w - expected) / Math.sqrt(expected + 1);
    const v = sat(z);
    if (v > 0.02) out.set(f, v);
  }
  return out;
}

/** 0..1: how well an item's facets line up with a lift table. */
export function facetScore(facets: string[], lift: Map<string, number>): number {
  if (!lift.size) return 0;
  const byType = new Map<FacetType, number[]>();
  for (const f of facets) {
    const v = lift.get(f);
    if (!v) continue;
    const t = facetType(f);
    const list = byType.get(t) ?? [];
    list.push(v);
    byType.set(t, list);
  }
  let sum = 0;
  for (const [t, vals] of byType) {
    const { weight, top } = FACET_RULES[t];
    vals.sort((a, b) => b - a);
    let acc = 0;
    for (let i = 0; i < top && i < vals.length; i++) acc += vals[i];
    sum += weight * (acc / top);
  }
  return sum / TOTAL_WEIGHT;
}
