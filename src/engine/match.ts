// Match raw history titles ("Dark: Season 1: Secrets") to catalog items.
import type { Catalog, TitleType } from '../shared/types';
import { normalizeTitle } from './text';

export interface TitleIndex {
  byName: Map<string, number[]>; // normalised title -> item indexes
}

export function buildTitleIndex(cat: Catalog): TitleIndex {
  const byName = new Map<string, number[]>();
  cat.items.forEach((it, i) => {
    for (const name of [it.title, ...(it.aliases ?? [])]) {
      const k = normalizeTitle(name);
      if (!k) continue;
      const list = byName.get(k) ?? [];
      list.push(i);
      byName.set(k, list);
    }
  });
  return { byName };
}

const EPISODE_PART =
  /^(season|series|part|volume|vol\.?|chapter|book|limited series|miniseries|collection|episode|staffel|temporada|saison)\b/i;

export interface MatchResult {
  index: number;
  isEpisode: boolean;
}

function pick(cat: Catalog, idxs: number[], hint: TitleType | null): number {
  if (idxs.length === 1) return idxs[0];
  const typed = hint ? idxs.filter((i) => cat.items[i].type === hint) : idxs;
  const pool = typed.length ? typed : idxs;
  return pool.reduce((best, i) => (cat.items[i].popularity > cat.items[best].popularity ? i : best), pool[0]);
}

/**
 * Try the full title first, then shorter ": "-separated prefixes. If a prefix matched,
 * the entry was an episode of a series.
 */
export function matchTitle(
  cat: Catalog,
  index: TitleIndex,
  rawTitle: string,
  seriesTitle?: string | null,
): MatchResult | null {
  if (seriesTitle) {
    const hit = index.byName.get(normalizeTitle(seriesTitle));
    if (hit) return { index: pick(cat, hit, 'tv'), isEpisode: true };
  }
  const parts = rawTitle.split(/:\s+/);
  const looksEpisodic = parts.length >= 3 || parts.slice(1).some((p) => EPISODE_PART.test(p) || /\s\d+$/.test(p));
  for (let n = parts.length; n >= 1; n--) {
    const name = parts.slice(0, n).join(': ');
    const hit = index.byName.get(normalizeTitle(name));
    if (hit) {
      const isEpisode = n < parts.length;
      const hint: TitleType | null = isEpisode || looksEpisodic ? 'tv' : n === parts.length ? 'movie' : null;
      return { index: pick(cat, hit, hint), isEpisode };
    }
  }
  return null;
}
