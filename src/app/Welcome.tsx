import { useMemo, useState } from 'preact/hooks';
import { PLATFORMS } from '../shared/platforms';
import { APP_NAME } from '../shared/brand';
import { addFeedback, removeFeedback, saveSettings } from '../shared/store';
import { openUrl } from '../shared/env';
import { normalizeTitle } from '../engine/text';
import type { EngineState } from '../ui/useEngine';
import { Telly } from '../ui/Telly';
import { Poster } from '../ui/Poster';
import { InfoTip } from '../ui/InfoTip';

export function Welcome({ engine }: { engine: EngineState }) {
  const [step, setStep] = useState(1);
  const s = engine.settings;
  const favs = new Set(engine.feedback.filter((f) => f.kind === 'favorite').map((f) => f.itemId));
  const [q, setQ] = useState('');

  const pickable = useMemo(() => {
    if (!engine.catalog) return [];
    const items = engine.catalog.items;
    const needle = normalizeTitle(q);
    const list = needle ? items.filter((i) => normalizeTitle(i.title).includes(needle)) : [...items].sort((a, b) => b.popularity - a.popularity);
    return list.slice(0, 12);
  }, [engine.catalog, q]);

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
          <p class="lead">Where do you watch?</p>
          <div class="platform-pick">
            {PLATFORMS.map((p) => (
              <button class="pick-tile" aria-pressed={s.platforms[p.id]} onClick={() => saveSettings({ platforms: { ...s.platforms, [p.id]: !s.platforms[p.id] } })}>
                <span class="dot" style={{ background: p.dot }} />
                {p.name}
              </button>
            ))}
          </div>
          <button class="btn btn-primary big" onClick={() => setStep(2)}>Next</button>
        </section>
      )}

      {step === 2 && (
        <section class="wstep">
          <Telly size={96} />
          <h1>
            Show me what you've watched{' '}
            <InfoTip label="How history works">I read it right here in your browser. It never leaves your computer.</InfoTip>
          </h1>
          <div class="row-actions center">
            <button class="btn" onClick={() => openUrl('https://www.netflix.com/viewingactivity?tonight-sync=1')}>Open Netflix history</button>
            <button class="btn" onClick={() => openUrl('https://www.primevideo.com/settings/watch-history?tonight-sync=1')}>Open Prime history</button>
          </div>
          {engine.events.length > 0 && <p class="note">Got {engine.events.length} views ✓</p>}
          <div class="row-actions center">
            <button class="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button class="btn btn-primary big" onClick={() => setStep(3)}>Next</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section class="wstep wide">
          <h1>Tap a few you loved</h1>
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
          <div class="row-actions center">
            <button class="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button class="btn btn-primary big" onClick={finish}>{favs.size || engine.events.length ? 'Done' : 'Skip'}</button>
          </div>
        </section>
      )}
    </div>
  );
}
