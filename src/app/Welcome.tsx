import { useMemo, useState } from 'preact/hooks';
import { PLATFORMS } from '../shared/platforms';
import { APP_NAME } from '../shared/brand';
import { addFeedback, removeFeedback, saveSettings } from '../shared/store';
import { openUrl } from '../shared/env';
import { normalizeTitle } from '../engine/text';
import { rankAll } from '../engine/recommend';
import { enabledPlatforms } from '../shared/store';
import type { EngineState } from '../ui/useEngine';
import { Telly } from '../ui/Telly';
import { Poster } from '../ui/Poster';
import { InfoTip } from '../ui/InfoTip';

export function Welcome({ engine }: { engine: EngineState }) {
  const [step, setStep] = useState(1);
  const s = engine.settings;
  const favs = new Set(engine.feedback.filter((f) => f.kind === 'favorite').map((f) => f.itemId));
  const [q, setQ] = useState('');

  const [shuffle, setShuffle] = useState(0);
  const platformsKey = enabledPlatforms(s).join(',');

  // A fresh, varied handful each time: drawn from popular titles on the platforms you picked
  // (or, once history is in, from what suits it), skipping anything already watched.
  const pickable = useMemo(() => {
    if (!engine.catalog) return [];
    const items = engine.catalog.items;
    const needle = normalizeTitle(q);
    if (needle) return items.filter((i) => normalizeTitle(i.title).includes(needle)).slice(0, 12);
    const platforms = enabledPlatforms(s);
    const filters = { type: 'any' as const, maxMinutes: null, genre: null, platforms };
    let pool: number[];
    if (engine.profile?.hasSignal) {
      pool = rankAll(engine.catalog, engine.profile, filters).slice(0, 80).map((x) => x.index);
    } else {
      pool = items
        .map((it, i) => ({ it, i }))
        .filter(({ it }) => !platforms.length || it.providers.some((p) => platforms.includes(p)))
        .sort((a, b) => b.it.popularity - a.it.popularity)
        .slice(0, 80)
        .map(({ i }) => i);
    }
    // seeded shuffle, so a re-render does not reshuffle but "Show different ones" does
    let seed = 1234567 + shuffle * 7919;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const mixed = pool.map((i) => ({ i, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.i);
    // keep the row varied: at most 3 of any one genre, and always keep what you already tapped
    const chosen: number[] = [];
    const seenGenre = new Map<string, number>();
    for (const i of items.map((it, idx) => (favs.has(it.id) ? idx : -1)).filter((i) => i >= 0).slice(0, 12)) chosen.push(i);
    for (const i of mixed) {
      if (chosen.length >= 12) break;
      if (chosen.includes(i)) continue;
      const g = items[i].genres[0] ?? '';
      if ((seenGenre.get(g) ?? 0) >= 3) continue;
      seenGenre.set(g, (seenGenre.get(g) ?? 0) + 1);
      chosen.push(i);
    }
    return chosen.map((i) => items[i]);
  }, [engine.catalog, engine.profile, q, shuffle, platformsKey]);

  async function finish() {
    await saveSettings({ onboarded: true });
    location.hash = '/';
  }

  return (
    <div class="welcome">
      <div class="steps" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((n) => <span class={'step-dot' + (n <= step ? ' on' : '')} />)}
      </div>

      {step === 1 && (
        <section class="wstep">
          <Telly size={110} mood="wow" />
          <h1>Hi, I'm {APP_NAME}</h1>
          <p class="lead">Which of these do you watch on?</p>
          <p class="lead small">
            Pick the ones you want Telly to work with. For anything you leave off, I won't read history or suggest titles.
          </p>
          <div class="platform-pick">
            {PLATFORMS.map((p) => (
              <button class="pick-tile" aria-pressed={s.platforms[p.id]} onClick={() => saveSettings({ platforms: { ...s.platforms, [p.id]: !s.platforms[p.id] } })}>
                <span class="dot" style={{ background: p.dot }} />
                {p.name}
              </button>
            ))}
          </div>
          <p class="disclaimer">
            <b>Good to know:</b> Telly is a free, independent extension. It isn't made by or connected to Netflix, Prime Video or any streaming service, and it only works as well as the history it can see. You can change any of this later in Settings.
          </p>
          <button class="btn btn-primary big" onClick={() => setStep(2)}>Next</button>
        </section>
      )}

      {step === 2 && (
        <section class="wstep">
          <Telly size={96} />
          <h1>
            Let me read what you've watched{' '}
            <InfoTip label="How history works">I read it right here in your browser and keep it on this computer. It's never sent to a Telly server, because there isn't one.</InfoTip>
          </h1>
          <p class="lead small">
            Your streaming site keeps a watch-history page. Open it below while you're signed in, and Telly will read the titles and dates on that page and save them here. Leave the tab open until you see a "synced" message, then come back.
          </p>
          <div class="row-actions center">
            {s.platforms.netflix && <button class="btn btn-primary" onClick={() => openUrl('https://www.netflix.com/viewingactivity?tonight-sync=1')}>Sync Netflix history</button>}
            {s.platforms.prime && <button class="btn btn-primary" onClick={() => openUrl('https://www.primevideo.com/settings/watch-history?tonight-sync=1')}>Sync Prime history</button>}
          </div>
          {!s.platforms.netflix && !s.platforms.prime && (
            <p class="note">Netflix and Prime are the two with a history page I can read. On the others I learn as you watch, or from titles you tell me you've seen.</p>
          )}
          <ul class="what-list">
            <li>Reads: titles, dates and (on Netflix) how far you watched</li>
            <li>Stays: saved in this browser only, per profile</li>
            <li class="no">Never: your password, payment details or anything else on the page</li>
          </ul>
          {engine.events.length > 0 && <p class="note">Got {engine.events.length} views ✓</p>}
          <p class="disclaimer">
            <b>Heads up:</b> this works by reading the page as you see it, so if a streaming site changes its layout, syncing can stop working until Telly is updated. You can skip this step and sync later in Settings. Only sync from a profile that's yours: I count every synced profile toward your taste unless you turn it off in Settings.
          </p>
          <div class="row-actions center">
            <button class="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button class="btn btn-primary big" onClick={() => setStep(3)}>Next</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section class="wstep wide">
          <h1>Tap a few you loved</h1>
          <p class="lead small">A few taps sharpen your picks, especially if you skipped syncing. Not seeing yours? Search, or shuffle for a new set.</p>
          <label class="sr-only" for="fav-q">Search titles</label>
          <input id="fav-q" class="input search" placeholder="Search" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
          <div class="fav-grid">
            {pickable.map((it) => {
              const on = favs.has(it.id);
              return (
                <button class={'fav' + (on ? ' on' : '')} aria-pressed={on} aria-label={it.title} onClick={() => (on ? removeFeedback(it.id, 'favorite') : addFeedback(it.id, 'favorite'))}>
                  <Poster item={it} height={150} />
                  <span class="fav-check" aria-hidden="true">{on ? '♥' : '+'}</span>
                </button>
              );
            })}
          </div>
          {!q && <button class="btn btn-sm btn-ghost" onClick={() => setShuffle((n) => n + 1)}>Show different ones</button>}
          <div class="row-actions center">
            <button class="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button class="btn btn-primary big" onClick={finish}>{favs.size || engine.events.length ? 'Done' : 'Skip'}</button>
          </div>
        </section>
      )}
    </div>
  );
}
