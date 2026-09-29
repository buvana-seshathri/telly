// Demo viewing history used for previews/screenshots (?demo=1) and tests.
import type { WatchEvent } from './types';

const DAY = 24 * 3600 * 1000;

function series(title: string, eps: number, startDaysAgo: number, perDay: number, platform: WatchEvent['platform'] = 'netflix', now = Date.now()): WatchEvent[] {
  const out: WatchEvent[] = [];
  for (let e = 0; e < eps; e++) {
    const day = startDaysAgo - Math.floor(e / perDay);
    out.push({
      platform,
      profileKey: `${platform}:demo`,
      rawTitle: `${title}: Season 1: Episode ${e + 1}`,
      date: now - day * DAY + e * 3600 * 1000,
      source: 'history',
    });
  }
  return out;
}

function movie(title: string, daysAgo: number, platform: WatchEvent['platform'] = 'netflix', now = Date.now()): WatchEvent {
  return { platform, profileKey: `${platform}:demo`, rawTitle: title, date: now - daysAgo * DAY, source: 'history' };
}

export function demoEvents(now = Date.now()): WatchEvent[] {
  return [
    ...series('Dark', 8, 12, 4, 'netflix', now),
    ...series('Mindhunter', 6, 30, 2, 'netflix', now),
    ...series('Stranger Things', 10, 160, 3, 'netflix', now),
    ...series("The Queen's Gambit", 7, 90, 3, 'netflix', now),
    ...series('BoJack Horseman', 3, 60, 1, 'netflix', now),
    ...series('The Boys', 5, 20, 2, 'prime', now),
    movie('Whiplash', 40, 'netflix', now),
    movie('The Social Network', 70, 'netflix', now),
    movie('Knives Out', 25, 'prime', now),
    movie('Arrival', 120, 'prime', now),
    ...series("Chef's Table", 2, 45, 1, 'netflix', now),
  ];
}
