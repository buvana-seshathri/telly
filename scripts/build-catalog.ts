/**
 * Builds the catalog the extension downloads: catalog.json (titles) + vectors.i8 (int8 embeddings).
 *
 *   npx tsx scripts/build-catalog.ts --sample                 # hand-written sample -> static/catalog
 *   TMDB_TOKEN=... npx tsx scripts/build-catalog.ts           # live TMDB data  -> catalog-dist
 *       [--region US] [--pages 25] [--embedder minilm|hash] [--out catalog-dist]
 *
 * The TMDB token only ever lives here (GitHub Actions secret), never in the extension.
 * Uses TMDB (https://www.themoviedb.org) — "This product uses the TMDB API but is not endorsed
 * or certified by TMDB." Streaming availability in TMDB comes from JustWatch.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CatalogFile, CatalogItem, PlatformId } from '../src/shared/types';
import { platformFromTmdbName } from '../src/shared/platforms';
import { HASH_DIMS, HASH_EMBEDDER, hashEmbedItem } from '../src/engine/embed-hash';
import { quantize } from '../src/engine/vector';

const args = process.argv.slice(2);
const flag = (name: string, def?: string) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] ?? 'true' : def;
};
const SAMPLE = args.includes('--sample');
const REGION = flag('region', 'US')!;
const PAGES = parseInt(flag('pages', '25')!, 10);
const EMBEDDER = flag('embedder', SAMPLE ? 'hash' : 'minilm')!;
const OUT = flag('out', SAMPLE ? 'static/catalog' : 'catalog-dist')!;
// Extra discovery in these original languages, so K-dramas, anime, telenovelas etc. are well covered
// (a plain popularity sort is dominated by English-language titles).
const LANGS = flag('langs', 'ko,ja,es,hi,fr,de,it,tr,zh,pt,th')!.split(',').filter(Boolean);
const LANG_PAGES = parseInt(flag('lang-pages', '10')!, 10);

// TMDB watch-provider ids (US). Verify with /watch/providers/movie?watch_region=US if a platform looks empty.
const PROVIDER_IDS: Partial<Record<PlatformId, number[]>> = {
  netflix: [8],
  prime: [9],
  hulu: [15],
  disney: [337],
  max: [1899],
  appletv: [350],
  peacock: [386],
  paramount: [531],
};

const GENRE_MAP: Record<string, string[]> = {
  'action': ['action'], 'adventure': ['adventure'], 'action & adventure': ['action', 'adventure'],
  'animation': ['animation'], 'comedy': ['comedy'], 'crime': ['crime'], 'documentary': ['documentary'],
  'drama': ['drama'], 'family': ['family'], 'fantasy': ['fantasy'], 'history': ['history'], 'horror': ['horror'],
  'music': ['music'], 'mystery': ['mystery'], 'romance': ['romance'], 'science fiction': ['sci-fi'],
  'sci-fi & fantasy': ['sci-fi', 'fantasy'], 'thriller': ['thriller'], 'war': ['war'], 'war & politics': ['war'],
  'western': ['western'], 'reality': ['reality'], 'kids': ['kids'], 'talk': ['talk'], 'soap': ['drama'], 'news': ['news'],
};

async function main() {
  const items = SAMPLE ? loadSample() : await loadTmdb();
  console.log(`items: ${items.length}`);
  const vectors = await embedAll(items);
  const file: CatalogFile = {
    version: 1,
    embedder: EMBEDDER === 'minilm' ? 'minilm-l6-v2' : HASH_EMBEDDER,
    dims: vectors[0]?.length ?? HASH_DIMS,
    region: REGION,
    generatedAt: new Date().toISOString(),
    sample: SAMPLE || undefined,
    hasRecs: items.some((i) => i.recs?.length) || undefined,
    items,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(file));
  const q = new Int8Array(items.length * file.dims);
  vectors.forEach((v, i) => q.set(quantize(v), i * file.dims));
  writeFileSync(join(OUT, 'vectors.i8'), Buffer.from(q.buffer));
  console.log(`wrote ${OUT}/catalog.json and vectors.i8 (${file.embedder}, ${file.dims}d)`);
}

function loadSample(): CatalogItem[] {
  const raw = JSON.parse(readFileSync('data/sample-titles.json', 'utf8')) as { items: any[] };
  const at = new Map<string, number>(raw.items.map((r, i) => [r.title, i]));
  return raw.items.map((r, i) => ({
    recs: ((r.related ?? []) as string[]).map((t) => at.get(t)).filter((j): j is number => j != null),
    id: `${r.type}:sample${i + 1}`,
    tmdbId: 0,
    type: r.type,
    title: r.title,
    year: r.year ?? null,
    genres: r.genres,
    overview: r.overview,
    keywords: r.keywords ?? [],
    creators: r.creators ?? [],
    cast: r.cast ?? [],
    runtime: r.runtime ?? null,
    seasons: r.seasons ?? null,
    rating: r.rating ?? null,
    popularity: r.popularity ?? 0.3,
    providers: r.providers ?? [],
    poster: null,
    aliases: r.aliases,
    lang: r.lang ?? 'en',
  }));
}

// ---------------- live TMDB ----------------

const TOKEN = process.env.TMDB_TOKEN;
async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL('https://api.themoviedb.org/3' + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url.pathname}`);
    return (await res.json()) as T;
  }
  throw new Error('rate limited: ' + url.pathname);
}

async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await fn(xs[i]);
      }
    }),
  );
  return out;
}

async function loadTmdb(): Promise<CatalogItem[]> {
  if (!TOKEN) throw new Error('Set TMDB_TOKEN (a TMDB v4 read access token) or use --sample');
  const ids = new Set<string>();
  for (const [platform, providerIds] of Object.entries(PROVIDER_IDS)) {
    for (const type of ['movie', 'tv'] as const) {
      for (let page = 1; page <= PAGES; page++) {
        const r = await tmdb<{ results: { id: number }[]; total_pages: number }>(`/discover/${type}`, {
          watch_region: REGION,
          with_watch_providers: providerIds!.join('|'),
          with_watch_monetization_types: 'flatrate',
          sort_by: 'popularity.desc',
          'vote_count.gte': type === 'movie' ? 50 : 20,
          page,
        });
        r.results.forEach((x) => ids.add(`${type}:${x.id}`));
        if (page >= r.total_pages) break;
      }
      console.log(`discovered ${platform}/${type}: total ${ids.size}`);
    }
  }
  // language passes: every platform at once, sorted by popularity within the language
  const allProviders = Object.values(PROVIDER_IDS).flat().join('|');
  for (const lang of LANGS) {
    for (const type of ['movie', 'tv'] as const) {
      for (let page = 1; page <= LANG_PAGES; page++) {
        const r = await tmdb<{ results: { id: number }[]; total_pages: number }>(`/discover/${type}`, {
          watch_region: REGION,
          with_watch_providers: allProviders,
          with_watch_monetization_types: 'flatrate',
          with_original_language: lang,
          sort_by: 'popularity.desc',
          'vote_count.gte': type === 'movie' ? 30 : 10,
          page,
        });
        r.results.forEach((x) => ids.add(`${type}:${x.id}`));
        if (page >= r.total_pages) break;
      }
    }
    console.log(`discovered ${lang}: total ${ids.size}`);
  }
  const list = [...ids];
  const details = await pool(list, 8, async (key) => {
    const [type, id] = key.split(':');
    try {
      return await detail(type as 'movie' | 'tv', parseInt(id, 10));
    } catch (e) {
      console.warn('skip', key, (e as Error).message);
      return null;
    }
  });
  type Raw = CatalogItem & { _pop: number; _recs: string[] };
  const items = details.filter((x): x is Raw => !!x && x.providers.length > 0);
  // popularity -> 0..1 by rank
  const sorted = [...items].sort((a, b) => a._pop - b._pop);
  sorted.forEach((it, i) => (it.popularity = +(i / Math.max(1, sorted.length - 1)).toFixed(3)));
  // neighbour lists: keep only neighbours that are in the catalog, as indexes (best first)
  const at = new Map(items.map((it, i) => [it.id, i]));
  let withRecs = 0;
  const out = items.map(({ _pop, _recs, ...it }, i) => {
    const recs = _recs.map((id) => at.get(id)).filter((j): j is number => j != null && j !== i).slice(0, 12);
    if (recs.length) withRecs++;
    return recs.length ? { ...it, recs } : it;
  });
  console.log(`neighbour lists: ${withRecs}/${out.length} titles`);
  return out;
}

/** Other names a title goes by (original language, romanised, regional), so history titles still match. */
function aliasesOf(title: string, original: string | undefined, d: any): string[] | undefined {
  const names = new Set<string>();
  if (original && original !== title) names.add(original);
  const alt = d.alternative_titles?.titles ?? d.alternative_titles?.results ?? [];
  for (const a of alt.slice(0, 12)) if (a.title && a.title !== title) names.add(a.title);
  return names.size ? [...names].slice(0, 8) : undefined;
}

async function detail(type: 'movie' | 'tv', id: number): Promise<(CatalogItem & { _pop: number; _recs: string[] }) | null> {
  const d = await tmdb<any>(`/${type}/${id}`, { append_to_response: 'keywords,credits,watch/providers,recommendations,alternative_titles' });
  const providers = new Set<PlatformId>();
  for (const p of d['watch/providers']?.results?.[REGION]?.flatrate ?? []) {
    const pid = platformFromTmdbName(p.provider_name);
    if (pid) providers.add(pid);
  }
  const genres = [...new Set((d.genres ?? []).flatMap((g: any) => GENRE_MAP[g.name.toLowerCase()] ?? []))] as string[];
  const kw = (type === 'movie' ? d.keywords?.keywords : d.keywords?.results) ?? [];
  const creators =
    type === 'movie'
      ? (d.credits?.crew ?? []).filter((c: any) => c.job === 'Director').map((c: any) => c.name)
      : (d.created_by ?? []).map((c: any) => c.name);
  const title = type === 'movie' ? d.title : d.name;
  const original = type === 'movie' ? d.original_title : d.original_name;
  const date = type === 'movie' ? d.release_date : d.first_air_date;
  const runtime = type === 'movie' ? d.runtime || null : d.episode_run_time?.[0] ?? d.last_episode_to_air?.runtime ?? null;
  if (!d.overview) return null;
  return {
    id: `${type}:${id}`,
    tmdbId: id,
    type,
    title,
    year: date ? parseInt(date.slice(0, 4), 10) : null,
    genres,
    overview: d.overview,
    keywords: kw.slice(0, 15).map((k: any) => k.name.toLowerCase()),
    creators: creators.slice(0, 4),
    cast: (d.credits?.cast ?? []).slice(0, 4).map((c: any) => c.name),
    runtime,
    seasons: type === 'tv' ? d.number_of_seasons ?? null : undefined,
    rating: d.vote_count >= 50 ? Math.round(d.vote_average * 10) / 10 : null,
    popularity: 0,
    providers: [...providers],
    poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : null,
    aliases: aliasesOf(title, original, d),
    lang: d.original_language || undefined,
    countries: (type === 'tv' ? d.origin_country : (d.production_countries ?? []).map((c: any) => c.iso_3166_1))?.slice(0, 3),
    studios: (type === 'tv' ? d.networks : d.production_companies)?.slice(0, 3).map((n: any) => n.name),
    _recs: (d.recommendations?.results ?? []).map((r: any) => `${type}:${r.id}`),
    _pop: d.popularity ?? 0,
  };
}

// ---------------- embeddings ----------------

async function embedAll(items: CatalogItem[]): Promise<Float32Array[]> {
  if (EMBEDDER !== 'minilm') return items.map(hashEmbedItem);
  const { pipeline } = await import('@huggingface/transformers');
  const extract = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
  const out: Float32Array[] = [];
  const texts = items.map(
    (it) => `${it.title}. ${it.genres.join(', ')}. ${it.keywords.slice(0, 10).join(', ')}. ${it.overview}`,
  );
  for (let i = 0; i < texts.length; i += 32) {
    const batch = texts.slice(i, i + 32);
    const t = await extract(batch, { pooling: 'mean', normalize: true });
    const data = t.data as Float32Array;
    const dims = data.length / batch.length;
    for (let j = 0; j < batch.length; j++) out.push(data.slice(j * dims, (j + 1) * dims));
    if (i % 640 === 0) console.log(`embedded ${i}/${texts.length}`);
  }
  return out;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
