// Turn raw viewing events + feedback into a taste profile.
import type { Catalog, Feedback, WatchEvent } from '../shared/types';
import { buildTitleIndex, matchTitle } from './match';
import { addScaled, isZero, normalize } from './vector';

const DAY = 24 * 3600 * 1000;

export interface TitleSignal {
  index: number; // catalog index
  count: number; // episodes (tv) or plays (movie)
  first: number;
  last: number;
  bingeCount: number; // most episodes inside any 3-day window
  bingeDays: number; // span of that window in days (1–3)
  progress: number | null;
  weight: number; // how much this title says about taste (can be negative)
  reason: 'binge' | 'watched' | 'tried' | 'favorite' | 'liked' | 'disliked';
}

export interface TasteProfile {
  hasSignal: boolean;
  signals: TitleSignal[]; // positives and negatives, strongest first
  positives: TitleSignal[];
  pos: Float32Array | null;
  neg: Float32Array | null;
  genreShare: Map<string, number>; // 0–1 share of positive weight
  creatorWeight: Map<string, number>;
  castWeight: Map<string, number>;
  typeShare: { movie: number; tv: number };
  seen: Set<number>; // catalog indexes already watched / marked seen
  rejected: Set<number>;
  unmatched: string[]; // history titles we could not find in the catalog
}

function binge(dates: number[]): { count: number; days: number } {
  const d = [...dates].sort((a, b) => a - b);
  let best = { count: 0, days: 1 };
  let j = 0;
  for (let i = 0; i < d.length; i++) {
    while (d[i] - d[j] > 3 * DAY) j++;
    const count = i - j + 1;
    if (count > best.count) {
      const span = Math.max(1, Math.ceil((d[i] - d[j]) / DAY) || 1);
      best = { count, days: Math.min(3, span) };
    }
  }
  return best;
}

export function buildProfile(
  cat: Catalog,
  events: WatchEvent[],
  feedback: Feedback[],
  now = Date.now(),
): TasteProfile {
  const index = buildTitleIndex(cat);
  const groups = new Map<number, { dates: number[]; progress: number[] }>();
  const unmatched = new Set<string>();
  const notMe = new Set(feedback.filter((f) => f.kind === 'notme').map((f) => f.itemId));

  for (const e of events) {
    const m = matchTitle(cat, index, e.rawTitle, e.seriesTitle);
    if (!m) {
      unmatched.add(e.seriesTitle || e.rawTitle.split(':')[0]);
      continue;
    }
    if (notMe.has(cat.items[m.index].id)) continue;
    const g = groups.get(m.index) ?? { dates: [], progress: [] };
    g.dates.push(e.date);
    if (e.progress != null) g.progress.push(e.progress);
    groups.set(m.index, g);
  }

  const signals: TitleSignal[] = [];
  for (const [idx, g] of groups) {
    const item = cat.items[idx];
    const count = g.dates.length;
    const first = Math.min(...g.dates);
    const last = Math.max(...g.dates);
    const b = binge(g.dates);
    const progress = g.progress.length ? g.progress.reduce((a, c) => a + c, 0) / g.progress.length : null;
    const ageDays = (now - last) / DAY;
    const recency = 0.5 + 0.5 * Math.exp(-ageDays / 120);
    let base: number;
    let reason: TitleSignal['reason'] = 'watched';
    if (item.type === 'tv') {
      base = Math.min(1.4, 0.3 + 0.25 * Math.log2(1 + count));
      if (b.count >= 4) {
        base += 0.25;
        reason = 'binge';
      }
      if (count === 1 && ageDays > 30) {
        base = 0.12;
        reason = 'tried';
      }
    } else {
      base = progress != null && progress < 0.3 ? 0.15 : 1;
      if (progress != null && progress < 0.3) reason = 'tried';
      if (count > 1) base += 0.2; // rewatched
    }
    signals.push({ index: idx, count, first, last, bingeCount: b.count, bingeDays: b.days, progress, weight: base * recency, reason });
  }

  // Feedback: favorites/likes add taste, nopes subtract, "seen" hides without much weight.
  const seen = new Set<number>(groups.keys());
  const rejected = new Set<number>();
  const latest = new Map<string, Feedback>();
  for (const f of [...feedback].sort((a, b) => a.at - b.at)) latest.set(f.itemId + ':' + (f.kind === 'seen' ? 's' : 'r'), f);
  for (const f of latest.values()) {
    const idx = cat.byId.get(f.itemId);
    if (idx == null) continue;
    const existing = signals.find((s) => s.index === idx);
    const add = (w: number, reason: TitleSignal['reason']) => {
      if (existing) {
        existing.weight += w;
        if (w > 0 && reason === 'favorite') existing.reason = 'favorite';
      } else signals.push({ index: idx, count: 0, first: f.at, last: f.at, bingeCount: 0, bingeDays: 1, progress: null, weight: w, reason });
    };
    if (f.kind === 'favorite') { add(1.5, 'favorite'); seen.add(idx); }
    else if (f.kind === 'like') add(0.6, 'liked');
    else if (f.kind === 'watch') add(0.8, 'liked');
    else if (f.kind === 'nope') { add(-1, 'disliked'); rejected.add(idx); }
    else if (f.kind === 'seen') { add(0.3, 'watched'); seen.add(idx); }
  }

  signals.sort((a, b) => b.weight - a.weight);
  const positives = signals.filter((s) => s.weight > 0.2);
  const dims = cat.meta.dims;
  const pos = new Float32Array(dims);
  const neg = new Float32Array(dims);
  const genreW = new Map<string, number>();
  const creatorWeight = new Map<string, number>();
  const castWeight = new Map<string, number>();
  let total = 0;
  const typeW = { movie: 0, tv: 0 };
  for (const s of signals) {
    const item = cat.items[s.index];
    if (s.weight > 0) {
      addScaled(pos, cat.vectors[s.index], s.weight);
      total += s.weight;
      typeW[item.type] += s.weight;
      for (const g of item.genres) genreW.set(g, (genreW.get(g) ?? 0) + s.weight);
      for (const c of item.creators) creatorWeight.set(c, (creatorWeight.get(c) ?? 0) + s.weight);
      for (const c of item.cast) castWeight.set(c, (castWeight.get(c) ?? 0) + s.weight);
    } else {
      addScaled(neg, cat.vectors[s.index], -s.weight);
    }
  }
  const genreShare = new Map<string, number>();
  if (total > 0) for (const [g, w] of genreW) genreShare.set(g, w / total);
  const typeTotal = typeW.movie + typeW.tv || 1;

  return {
    hasSignal: positives.length > 0,
    signals,
    positives,
    pos: isZero(pos) ? null : normalize(pos),
    neg: isZero(neg) ? null : normalize(neg),
    genreShare,
    creatorWeight,
    castWeight,
    typeShare: { movie: typeW.movie / typeTotal, tv: typeW.tv / typeTotal },
    seen,
    rejected,
    unmatched: [...unmatched],
  };
}
