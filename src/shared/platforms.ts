import type { PlatformId } from './types';

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  short: string;
  hosts: string[]; // hostnames the corner button runs on
  dot: string; // tiny brand-dot color used only in badges
  search: (title: string) => string; // deep link used for "Watch this"
  tmdbNames: string[]; // provider names in TMDB watch-provider data (lowercased, "includes" match)
  historySupport: 'full' | 'passive';
}

const q = encodeURIComponent;

export const PLATFORMS: PlatformInfo[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    short: 'Netflix',
    hosts: ['www.netflix.com'],
    dot: '#E50914',
    search: (t) => `https://www.netflix.com/search?q=${q(t)}`,
    tmdbNames: ['netflix'],
    historySupport: 'full',
  },
  {
    id: 'prime',
    name: 'Prime Video',
    short: 'Prime',
    hosts: ['www.primevideo.com', 'www.amazon.com'],
    dot: '#00A8E1',
    search: (t) => `https://www.primevideo.com/search/?phrase=${q(t)}`,
    tmdbNames: ['amazon prime video', 'prime video'],
    historySupport: 'full',
  },
  {
    id: 'hulu',
    name: 'Hulu',
    short: 'Hulu',
    hosts: ['www.hulu.com'],
    dot: '#1CE783',
    search: (t) => `https://www.hulu.com/search?q=${q(t)}`,
    tmdbNames: ['hulu'],
    historySupport: 'passive',
  },
  {
    id: 'disney',
    name: 'Disney+',
    short: 'Disney+',
    hosts: ['www.disneyplus.com'],
    dot: '#3D63F0',
    search: (t) => `https://www.disneyplus.com/search?q=${q(t)}`,
    tmdbNames: ['disney plus', 'disney+'],
    historySupport: 'passive',
  },
  {
    id: 'max',
    name: 'HBO Max',
    short: 'Max',
    hosts: ['play.max.com', 'play.hbomax.com', 'www.hbomax.com'],
    dot: '#5A7BFF',
    search: (t) => `https://play.hbomax.com/search/result?q=${q(t)}`,
    tmdbNames: ['max', 'hbo max'],
    historySupport: 'passive',
  },
  {
    id: 'appletv',
    name: 'Apple TV+',
    short: 'Apple TV+',
    hosts: ['tv.apple.com'],
    dot: '#D6D6D6',
    search: (t) => `https://tv.apple.com/search?term=${q(t)}`,
    tmdbNames: ['apple tv plus', 'apple tv+'],
    historySupport: 'passive',
  },
  {
    id: 'peacock',
    name: 'Peacock',
    short: 'Peacock',
    hosts: ['www.peacocktv.com'],
    dot: '#F5C518',
    search: (t) => `https://www.peacocktv.com/search?q=${q(t)}`,
    tmdbNames: ['peacock'],
    historySupport: 'passive',
  },
  {
    id: 'paramount',
    name: 'Paramount+',
    short: 'Paramount+',
    hosts: ['www.paramountplus.com'],
    dot: '#2C6BFF',
    search: (t) => `https://www.paramountplus.com/search/?q=${q(t)}`,
    tmdbNames: ['paramount plus', 'paramount+'],
    historySupport: 'passive',
  },
];

export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as Record<
  PlatformId,
  PlatformInfo
>;

export function platformForHost(host: string): PlatformInfo | null {
  return PLATFORMS.find((p) => p.hosts.includes(host)) ?? null;
}

/** Map a TMDB provider name ("Amazon Prime Video") to our platform id. */
export function platformFromTmdbName(name: string): PlatformId | null {
  const n = name.toLowerCase();
  // "Max" is too short for a substring match, so it only matches exact names.
  // Channels ("Paramount+ Amazon Channel") and ad tiers count for their parent service.
  for (const p of PLATFORMS) {
    if (p.id === 'max') {
      if (n === 'max' || n === 'hbo max' || n === 'max amazon channel') return 'max';
      continue;
    }
    if (p.tmdbNames.some((t) => n.includes(t))) return p.id;
  }
  return null;
}
