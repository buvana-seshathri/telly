import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Catalog, Feedback, Profile, Settings, WatchEvent } from '../shared/types';
import { IS_EXTENSION, onKvChange } from '../shared/env';
import { addEvents, getFeedback, getMyEvents, getProfiles, getSettings, saveSettings, upsertProfile } from '../shared/store';
import { loadCatalog } from '../engine/catalog';
import { buildProfile, type TasteProfile } from '../engine/profile';
import { demoEvents } from '../shared/demo';

export interface EngineState {
  ready: boolean;
  error: string | null;
  settings: Settings;
  catalog: Catalog | null;
  profile: TasteProfile | null;
  profiles: Profile[];
  feedback: Feedback[];
  events: WatchEvent[];
}

/** Preview mode (outside the extension): ?demo=1 seeds a demo history so pages have content. */
async function seedDemoIfAsked() {
  if (IS_EXTENSION) return;
  const params = new URLSearchParams(location.search);
  if (params.get('demo') !== '1') return;
  if ((await getProfiles()).length) return;
  await upsertProfile('netflix', 'demo', 'You');
  await upsertProfile('prime', 'demo', 'You');
  const ev = demoEvents();
  await addEvents('netflix:demo', ev.filter((e) => e.platform === 'netflix'), true);
  await addEvents('prime:demo', ev.filter((e) => e.platform === 'prime'), true);
  await saveSettings({ onboarded: true });
}

export function useEngine(): EngineState {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [events, setEvents] = useState<WatchEvent[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => onKvChange(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (tick === 0) await seedDemoIfAsked();
        const s = await getSettings();
        const [ev, fb, pr] = await Promise.all([getMyEvents(), getFeedback(), getProfiles()]);
        if (!alive) return;
        setSettings(s);
        setEvents(ev);
        setFeedback(fb);
        setProfiles(pr);
        const cat = await loadCatalog(s.catalogUrl);
        if (alive) setCatalog(cat);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tick]);

  const profile = useMemo(
    () => (catalog ? buildProfile(catalog, events, feedback) : null),
    [catalog, events, feedback],
  );

  return {
    ready: !!(settings && catalog && profile),
    error,
    settings: settings ?? (null as unknown as Settings),
    catalog,
    profile,
    profiles,
    feedback,
    events,
  };
}
