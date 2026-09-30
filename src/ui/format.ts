import type { CatalogItem, PlatformId, Settings } from '../shared/types';
import { PLATFORM_BY_ID } from '../shared/platforms';
import { langLabel } from '../engine/text';

export function metaLine(item: CatalogItem): string {
  const parts: string[] = [item.type === 'tv' ? 'Series' : 'Movie'];
  if (item.year) parts.push(String(item.year));
  if (item.lang && item.lang !== 'en') parts.push(langLabel(item.lang));
  if (item.runtime) parts.push(item.type === 'tv' ? `${item.runtime} min eps` : `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m`);
  return parts.join(' · ');
}

/** Where to watch it: the current platform if it has it, else the first enabled one. */
export function watchPlatform(item: CatalogItem, settings: Settings, prefer?: PlatformId | null): PlatformId | null {
  if (prefer && item.providers.includes(prefer)) return prefer;
  return item.providers.find((p) => settings.platforms[p]) ?? item.providers[0] ?? null;
}

export function watchUrl(item: CatalogItem, platform: PlatformId | null): string | null {
  if (!platform) return null;
  return item.links?.[platform] ?? PLATFORM_BY_ID[platform].search(item.title);
}

export function appUrl(hash = ''): string {
  const base = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.getURL('app.html') : 'app.html';
  return base + (hash ? '#' + hash : '');
}
