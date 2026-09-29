/**
 * Offline check: "if I hide what you watched most recently, does the engine bring it back?"
 *
 *   npx tsx scripts/eval.ts --catalog path/to/catalog-dir --csv NetflixViewingActivity.csv
 *   npx tsx scripts/eval.ts --demo                      # built-in demo history on the sample catalog
 *
 * The catalog dir holds catalog.json + vectors.i8 (download them from your catalog URL).
 * The most recent ~20% of titles you started are hidden; the profile is built from everything
 * before them; each hidden title is then ranked against the rest of the catalog.
 * Higher hit-rate and MRR = the engine finds what you actually went on to watch.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCatalog } from '../src/engine/catalog';
import { buildTitleIndex, matchTitle } from '../src/engine/match';
import { buildProfile } from '../src/engine/profile';
import { rankAll, LEGACY, V2, type Weights } from '../src/engine/recommend';
import { parseNetflixCsv } from '../src/platforms/netflix-csv';
import { demoEvents } from '../src/shared/demo';
import type { Filters, WatchEvent } from '../src/shared/types';

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : d;
};
const dir = flag('catalog', 'static/catalog')!;
const file = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'));
const buf = readFileSync(join(dir, 'vectors.i8'));
const cat = parseCatalog(file, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const csv = flag('csv');
const events: WatchEvent[] = csv ? parseNetflixCsv(readFileSync(csv, 'utf8'), 'netflix:eval') : demoEvents();
const all: Filters = { type: 'any', maxMinutes: null, genre: null, platforms: [] };

const index = buildTitleIndex(cat);
const firstSeen = new Map<number, number>();
let unmatched = 0;
for (const e of events) {
  const m = matchTitle(cat, index, e.rawTitle, e.seriesTitle);
  if (!m) {
    unmatched++;
    continue;
  }
  firstSeen.set(m.index, Math.min(firstSeen.get(m.index) ?? Infinity, e.date));
}
console.log(`catalog: ${cat.items.length} titles (${file.embedder}${file.hasRecs ? ', with neighbour lists' : ', no neighbour lists'}${file.sample ? ', SAMPLE' : ''})`);
console.log(`history: ${events.length} events -> ${firstSeen.size} titles matched, ${unmatched} events not in catalog\n`);

type Variant = { name: string; run: (p: ReturnType<typeof buildProfile>) => number[] }; // ranked catalog indexes
const byWeights = (w: Weights) => (p: ReturnType<typeof buildProfile>) => rankAll(cat, p, all, new Set(), w).map((s) => s.index);
const variants: Variant[] = [
  { name: 'popularity only', run: () => cat.items.map((_, i) => i).sort((a, b) => cat.items[b].popularity * 0.6 + (cat.items[b].rating ?? 6) / 25 - (cat.items[a].popularity * 0.6 + (cat.items[a].rating ?? 6) / 25)) },
  { name: 'embeddings only (old)', run: byWeights(LEGACY) },
  { name: 'v2 without neighbours', run: byWeights({ ...V2, cf: 0 }) },
  { name: 'v2 without facets', run: byWeights({ ...V2, facet: 0 }) },
  { name: 'v2 (all signals)', run: byWeights(V2) },
];

const firsts = [...firstSeen.values()].sort((a, b) => a - b);
const rows: Record<string, { hr10: number; hr20: number; mrr: number; ndcg: number; lang: number; n: number }> = {};
for (const holdout of [0.15, 0.25, 0.35]) {
  const cutoff = firsts[Math.floor(firsts.length * (1 - holdout))];
  const test = [...firstSeen].filter(([, d]) => d >= cutoff).map(([i]) => i);
  const train = events.filter((e) => e.date < cutoff);
  if (test.length < 3 || train.length < 5) continue;
  const p = buildProfile(cat, train, [], cutoff);
  const seen = new Set(p.seen);
  const topLangs = new Set([...p.langShare].filter(([, s]) => s >= 0.12).map(([l]) => l));
  for (const v of variants) {
    const order = v.run(p).filter((i) => !seen.has(i));
    const pos = new Map(order.map((i, r) => [i, r + 1]));
    const r = (rows[v.name] ??= { hr10: 0, hr20: 0, mrr: 0, ndcg: 0, lang: 0, n: 0 });
    for (const t of test) {
      const rank = pos.get(t);
      if (!rank) continue;
      r.n++;
      if (rank <= 10) r.hr10++;
      if (rank <= 20) r.hr20++;
      r.mrr += 1 / rank;
      if (rank <= 20) r.ndcg += 1 / Math.log2(rank + 1);
    }
    const top = order.slice(0, 10);
    r.lang += top.filter((i) => !cat.items[i].lang || topLangs.has(cat.items[i].lang!)).length / Math.max(1, top.length);
  }
}
const pct = (x: number, n: number) => (n ? ((100 * x) / n).toFixed(1) + '%' : '-');
console.log('variant'.padEnd(26), 'hit@10'.padStart(8), 'hit@20'.padStart(8), 'MRR'.padStart(8), 'NDCG@20'.padStart(9), 'top-10 in your languages'.padStart(26));
for (const [name, r] of Object.entries(rows)) {
  console.log(name.padEnd(26), pct(r.hr10, r.n).padStart(8), pct(r.hr20, r.n).padStart(8), (r.mrr / (r.n || 1)).toFixed(3).padStart(8), (r.ndcg / (r.n || 1)).toFixed(3).padStart(9), (r.lang / 3 * 100).toFixed(0).padStart(24) + '%');
}
if (!Object.keys(rows).length) console.log('Not enough history to hold anything out (need a few titles across a range of dates).');
