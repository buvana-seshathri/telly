// Explanations built only from real evidence in the user's history.
import type { Catalog, CatalogItem, Evidence } from '../shared/types';
import { genreLabel, langLabel } from './text';
import type { TasteProfile, TitleSignal } from './profile';

function anchorPhrase(item: CatalogItem, s: TitleSignal): string {
  switch (s.reason) {
    case 'binge':
      return `You binged ${item.title} (${s.bingeCount} eps in ${s.bingeDays} day${s.bingeDays > 1 ? 's' : ''})`;
    case 'favorite':
      return `You loved ${item.title}`;
    case 'liked':
      return `You were into ${item.title}`;
    default:
      if (item.type === 'tv' && s.count >= 3) return `You watched ${s.count} episodes of ${item.title}`;
      return `You watched ${item.title}`;
  }
}

function shared<T>(a: T[], b: T[]): T[] {
  const set = new Set(a);
  return b.filter((x) => set.has(x));
}

export function sharedKeywords(a: CatalogItem, b: CatalogItem): string[] {
  const ka = a.keywords.map((k) => k.toLowerCase());
  return shared(ka, b.keywords.map((k) => k.toLowerCase()));
}

export function explain(
  cat: Catalog,
  profile: TasteProfile,
  item: CatalogItem,
  anchor: TitleSignal | null,
  opts: { maxMinutes: number | null; stretch?: boolean; linked?: boolean },
): { why: string; evidence: Evidence[] } {
  const evidence: Evidence[] = [];
  let why = '';

  if (anchor) {
    const a = cat.items[anchor.index];
    const creators = shared(a.creators, item.creators);
    const cast = shared(a.cast.filter((c) => c !== 'Various'), item.cast);
    const kws = sharedKeywords(a, item);
    const genres = shared(a.genres, item.genres);
    let reason: string;
    if (opts.linked) evidence.push({ kind: 'collab', text: `Often watched by people who liked ${a.title}`, anchorId: a.id });
    if (creators.length) {
      reason = 'Same creators';
      evidence.push({ kind: 'same-creator', text: `Made by ${creators.join(' & ')}, who also made ${a.title}`, anchorId: a.id });
    } else if (cast.length) {
      reason = `Also stars ${cast[0]}`;
      evidence.push({ kind: 'same-cast', text: `${cast.join(', ')} also starred in ${a.title}`, anchorId: a.id });
    } else if (opts.linked) {
      reason = 'People who liked it often watch this too';
    } else if (kws.length >= 2) {
      reason = `Same ${kws[0]} and ${kws[1]} feel`;
    } else if (kws.length === 1) {
      reason = `More ${kws[0]}, similar tone`;
    } else if (genres.length >= 2) {
      reason = `Another ${genres.slice(0, 2).map((g) => genreLabel(g).toLowerCase()).join('–')} pick`;
    } else {
      reason = 'Very close in story and tone';
    }
    why = `${anchorPhrase(a, anchor)}. ${reason}.`;
    if (kws.length) evidence.push({ kind: 'similar-to', text: `Shared themes: ${kws.slice(0, 4).join(', ')}` });
  } else if (!profile.hasSignal) {
    why = item.rating && item.rating >= 8 ? `A crowd favorite, rated ${item.rating.toFixed(1)}/10.` : 'Popular right now, and well liked.';
  }

  if (opts.stretch) {
    evidence.push({ kind: 'stretch', text: `Outside your usual genres, but close to your taste` });
  } else {
    const top = [...item.genres].sort((x, y) => (profile.genreShare.get(y) ?? 0) - (profile.genreShare.get(x) ?? 0))[0];
    const share = top ? profile.genreShare.get(top) ?? 0 : 0;
    if (share >= 0.15) evidence.push({ kind: 'genre-fit', text: `${genreLabel(top)} makes up ${Math.round(share * 100)}% of what you watch` });
  }
  const ls = item.lang && item.lang !== 'en' ? profile.langShare.get(item.lang) ?? 0 : 0;
  if (ls >= 0.12) evidence.push({ kind: 'language', text: `${Math.round(ls * 100)}% of what you watch is in ${langLabel(item.lang!)}` });
  if (item.runtime) {
    const unit = item.type === 'tv' ? `~${item.runtime} min episodes` : `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m`;
    const fits = opts.maxMinutes ? ' — fits your time' : '';
    evidence.push({ kind: 'fits-time', text: unit + fits });
  }
  if (item.rating && item.rating >= 8) evidence.push({ kind: 'well-rated', text: `Rated ${item.rating.toFixed(1)}/10 by viewers` });

  if (!why) why = evidence[0]?.text ? evidence[0].text + '.' : 'Matches your taste.';
  return { why, evidence };
}
