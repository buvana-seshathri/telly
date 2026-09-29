// "hash-384-v1": a dependency-free embedder based on feature hashing.
// Used for the sample catalog and as an offline fallback. The live catalog can use
// MiniLM instead (see embed-model.ts); the catalog file says which one it was built with.
import type { CatalogItem } from '../shared/types';
import { conceptOf, contentWords, genresInText, stem, words } from './text';
import { normalize } from './vector';

export const HASH_EMBEDDER = 'hash-384-v1';
export const HASH_DIMS = 384;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function addFeature(v: Float32Array, feature: string, weight: number) {
  const h = fnv1a(feature);
  const idx = h % v.length;
  const sign = (fnv1a(feature + '#') & 1) === 0 ? 1 : -1;
  v[idx] += sign * weight;
}

function addText(v: Float32Array, text: string, weight: number, conceptWeight: number) {
  for (const w of contentWords(text)) {
    addFeature(v, 'w:' + stem(w), weight);
    const c = conceptOf(w);
    if (c) addFeature(v, 'c:' + c, conceptWeight);
  }
}

export function hashEmbedItem(item: Pick<CatalogItem, 'genres' | 'keywords' | 'overview' | 'creators' | 'type'>): Float32Array {
  const v = new Float32Array(HASH_DIMS);
  for (const g of item.genres) addFeature(v, 'g:' + g, 2.2);
  for (const k of item.keywords) {
    addFeature(v, 'k:' + k.toLowerCase(), 1.4);
    addText(v, k, 1.1, 1.0);
  }
  addText(v, item.overview, 0.7, 0.6);
  for (const c of item.creators) addFeature(v, 'p:' + c.toLowerCase(), 1.6);
  addFeature(v, 't:' + item.type, 0.6);
  return normalize(v);
}

export function hashEmbedQuery(query: string): Float32Array {
  const v = new Float32Array(HASH_DIMS);
  for (const g of genresInText(query)) addFeature(v, 'g:' + g, 2.2);
  const ws = words(query);
  // keyword phrases like "time travel" / "job search"
  for (let i = 0; i < ws.length - 1; i++) addFeature(v, 'k:' + ws[i] + ' ' + ws[i + 1], 1.4);
  addText(v, query, 1.1, 1.6);
  return normalize(v);
}
