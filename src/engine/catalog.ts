import type { Catalog, CatalogFile } from '../shared/types';
import { assetUrl, idbGet, idbSet } from '../shared/env';
import { dequantize } from './vector';

const STALE_MS = 6 * 24 * 3600 * 1000;

export function parseCatalog(file: CatalogFile, vectors: ArrayBuffer): Catalog {
  const { items, ...meta } = file;
  const q = new Int8Array(vectors);
  if (q.length !== items.length * meta.dims) {
    throw new Error(`Catalog vectors do not match items (${q.length} vs ${items.length}×${meta.dims})`);
  }
  const vecs = items.map((_, i) => dequantize(q, i * meta.dims, meta.dims));
  const byId = new Map(items.map((it, i) => [it.id, i]));
  return { meta, items, vectors: vecs, byId };
}

async function fetchCatalog(base: string): Promise<{ file: CatalogFile; vectors: ArrayBuffer }> {
  const root = base.endsWith('/') ? base : base + '/';
  const [a, b] = await Promise.all([fetch(root + 'catalog.json'), fetch(root + 'vectors.i8')]);
  if (!a.ok || !b.ok) throw new Error(`Catalog download failed (${a.status}/${b.status})`);
  return { file: (await a.json()) as CatalogFile, vectors: await b.arrayBuffer() };
}

interface CachedCatalog {
  url: string;
  fetchedAt: number;
  file: CatalogFile;
  vectors: ArrayBuffer;
}

let current: Promise<Catalog> | null = null;
let currentUrl: string | null = null;

/**
 * Load the catalog: the weekly hosted one when a URL is configured (cached in IndexedDB),
 * otherwise the sample catalog bundled with the extension.
 */
export function loadCatalog(url: string): Promise<Catalog> {
  if (current && currentUrl === url) return current;
  currentUrl = url;
  current = (async () => {
    if (url) {
      const cached = await idbGet<CachedCatalog>('catalog').catch(() => undefined);
      const fresh = cached && cached.url === url && Date.now() - cached.fetchedAt < STALE_MS;
      if (fresh) return parseCatalog(cached.file, cached.vectors);
      try {
        const got = await fetchCatalog(url);
        await idbSet('catalog', { url, fetchedAt: Date.now(), ...got } satisfies CachedCatalog).catch(() => {});
        return parseCatalog(got.file, got.vectors);
      } catch (err) {
        console.warn('[telly] catalog download failed, using fallback', err);
        if (cached) return parseCatalog(cached.file, cached.vectors);
      }
    }
    const got = await fetchCatalog(assetUrl('catalog/'));
    return parseCatalog(got.file, got.vectors);
  })();
  return current;
}
