// "People who liked X also liked Y": neighbour lists that come with the catalog (from TMDB's
// recommendations, which are driven by real viewing behaviour). This is the collaborative signal.
import type { Catalog } from '../shared/types';

const rev = new WeakMap<Catalog, Map<number, { j: number; rank: number }[]>>();

/** For each title, which titles list it as a neighbour (and at what rank). */
export function reverseLinks(cat: Catalog): Map<number, { j: number; rank: number }[]> {
  let m = rev.get(cat);
  if (m) return m;
  m = new Map();
  cat.items.forEach((it, j) => {
    it.recs?.forEach((s, rank) => {
      const l = m!.get(s) ?? [];
      l.push({ j, rank });
      m!.set(s, l);
    });
  });
  rev.set(cat, m);
  return m;
}

/** True when a and b list each other (or one lists the other) as neighbours. */
export function linked(cat: Catalog, a: number, b: number): boolean {
  return !!(cat.items[a].recs?.includes(b) || cat.items[b].recs?.includes(a));
}

/**
 * Spread each watched title's weight over its neighbours (and over the titles that list it).
 * Returns a 0..1 score per catalog item, plus which watched title contributed most.
 */
export function collabScores(cat: Catalog, signals: { index: number; weight: number }[], top = 80): { score: Float32Array; anchor: Int32Array } {
  const n = cat.items.length;
  const raw = new Float32Array(n);
  const best = new Float32Array(n);
  const anchor = new Int32Array(n).fill(-1);
  const maxW = Math.max(...signals.map((s) => s.weight), 1e-6);
  const links = reverseLinks(cat);
  const add = (j: number, s: number, c: number) => {
    raw[j] += c;
    if (c > best[j]) {
      best[j] = c;
      anchor[j] = s;
    }
  };
  for (const { index: s, weight } of signals.slice(0, top)) {
    const w = weight / maxW;
    cat.items[s].recs?.forEach((j, r) => add(j, s, w / (1 + 0.25 * r)));
    for (const { j, rank } of links.get(s) ?? []) add(j, s, (0.5 * w) / (1 + 0.25 * rank));
  }
  for (let j = 0; j < n; j++) raw[j] = raw[j] > 0 ? 1 - Math.exp(-raw[j]) : 0;
  return { score: raw, anchor };
}
