// Everything the extension remembers, stored locally per browser. Nothing is sent anywhere.
import type { Feedback, FeedbackKind, PlatformId, Profile, Settings, WatchEvent } from './types';
import { idbClear, kvAll, kvGet, kvRemoveAll, kvSet } from './env';

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  platforms: {
    netflix: true,
    prime: true,
    hulu: false,
    disney: false,
    max: false,
    appletv: false,
    peacock: false,
    paramount: false,
  },
  region: 'US',
  refresh: 'every-visit',
  passiveLogging: true,
  cornerButton: true,
  catalogUrl: 'https://buvana-seshathri.github.io/telly/',
  llm: { enabled: false, provider: 'gemini', apiKey: '', model: '' },
};

export async function getSettings(): Promise<Settings> {
  const s = await kvGet<Partial<Settings>>('settings', {});
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    platforms: { ...DEFAULT_SETTINGS.platforms, ...(s.platforms ?? {}) },
    llm: { ...DEFAULT_SETTINGS.llm, ...(s.llm ?? {}) },
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await kvSet('settings', next);
  return next;
}

export function enabledPlatforms(s: Settings): PlatformId[] {
  return (Object.keys(s.platforms) as PlatformId[]).filter((p) => s.platforms[p]);
}

// ---- profiles ----

export async function getProfiles(): Promise<Profile[]> {
  return kvGet<Profile[]>('profiles', []);
}

/** Register a profile seen on a platform. The first profile per platform counts as "me". */
export async function upsertProfile(platform: PlatformId, id: string, name: string): Promise<Profile> {
  const all = await getProfiles();
  const key = `${platform}:${id}`;
  let p = all.find((x) => x.key === key);
  if (!p) {
    const firstOnPlatform = !all.some((x) => x.platform === platform);
    p = { key, platform, id, name, isMe: firstOnPlatform, confirmed: firstOnPlatform, lastSynced: null, eventCount: 0 };
    all.push(p);
  } else if (name && p.name !== name) {
    p.name = name;
  }
  await kvSet('profiles', all);
  return p;
}

export async function setProfileIsMe(key: string, isMe: boolean) {
  const all = await getProfiles();
  for (const p of all) if (p.key === key) Object.assign(p, { isMe, confirmed: true });
  await kvSet('profiles', all);
}

// ---- viewing events ----

const evKey = (profileKey: string) => `events:${profileKey}`;

export async function getEvents(profileKey: string): Promise<WatchEvent[]> {
  return kvGet<WatchEvent[]>(evKey(profileKey), []);
}

/** Events from every profile marked "me", across platforms (the cross-platform taste). */
export async function getMyEvents(): Promise<WatchEvent[]> {
  const profiles = (await getProfiles()).filter((p) => p.isMe);
  const lists = await Promise.all(profiles.map((p) => getEvents(p.key)));
  return lists.flat();
}

export async function addEvents(profileKey: string, events: WatchEvent[], markSynced = false): Promise<number> {
  const existing = await getEvents(profileKey);
  const seen = new Set(existing.map((e) => `${e.rawTitle}|${Math.floor(e.date / 86400000)}`));
  let added = 0;
  for (const e of events) {
    const k = `${e.rawTitle}|${Math.floor(e.date / 86400000)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    existing.push(e);
    added++;
  }
  await kvSet(evKey(profileKey), existing);
  const all = await getProfiles();
  for (const p of all) {
    if (p.key === profileKey) {
      p.eventCount = existing.length;
      if (markSynced) p.lastSynced = Date.now();
    }
  }
  await kvSet('profiles', all);
  return added;
}

// ---- feedback (swipes, saves, "seen it", "not me") ----

export async function getFeedback(): Promise<Feedback[]> {
  return kvGet<Feedback[]>('feedback', []);
}

export async function addFeedback(itemId: string, kind: FeedbackKind): Promise<void> {
  const all = await getFeedback();
  all.push({ itemId, kind, at: Date.now() });
  await kvSet('feedback', all.slice(-2000));
}

export async function removeFeedback(itemId: string, kind: FeedbackKind): Promise<void> {
  const all = await getFeedback();
  await kvSet('feedback', all.filter((f) => !(f.itemId === itemId && f.kind === kind)));
}

/** Titles you swiped right on (latest reaction wins), newest first. */
export function savedIds(feedback: Feedback[]): string[] {
  const latest = new Map<string, Feedback>();
  for (const f of feedback) if (['like', 'nope', 'watch', 'seen'].includes(f.kind)) latest.set(f.itemId, f);
  return [...latest.values()]
    .filter((f) => f.kind === 'like')
    .sort((a, b) => b.at - a.at)
    .map((f) => f.itemId);
}

// ---- export / delete ----

export async function exportAll(): Promise<string> {
  const all = await kvAll();
  const s = all.settings as Settings | undefined;
  if (s?.llm?.apiKey) s.llm = { ...s.llm, apiKey: '(removed from export)' };
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...all }, null, 2);
}

export async function deleteAll(): Promise<void> {
  await kvRemoveAll();
  await idbClear().catch(() => {});
}
