import { useEffect, useState } from 'preact/hooks';
import type { Rec } from '../shared/types';
import { surprise } from '../engine/recommend';
import { enabledPlatforms } from '../shared/store';
import { kvGet, kvSet } from '../shared/env';
import type { EngineState } from '../ui/useEngine';
import { Telly, type TellyMood } from '../ui/Telly';
import { DetailModal } from './RecCard';

/** Telly floats gently in the corner. One hello per day; click for a surprise pick. */
export function FloatingTelly({ engine, show = true }: { engine: EngineState; show?: boolean }) {
  const [tip, setTip] = useState(false);
  const [mood, setMood] = useState<TellyMood>('happy');
  const [pick, setPick] = useState<Rec | null>(null);

  // one small hello per day, the first time Telly floats into view
  useEffect(() => {
    if (!show) return;
    const today = new Date().toDateString();
    let t: ReturnType<typeof setTimeout> | undefined;
    kvGet<string>('tellyHello', '').then((d) => {
      if (d === today) return;
      kvSet('tellyHello', today);
      setTip(true);
      t = setTimeout(() => setTip(false), 4500);
    });
    return () => t && clearTimeout(t);
  }, [show]);

  function roll() {
    if (!engine.catalog || !engine.profile) return;
    const type = Math.random() < 0.5 ? 'movie' : 'tv';
    setPick(surprise(engine.catalog, engine.profile, { type: 'any', maxMinutes: null, genre: null, platforms: enabledPlatforms(engine.settings) }, type));
    setTip(false);
    setMood('wow');
    setTimeout(() => setMood('happy'), 900);
  }

  return (
    <>
      <div class={'floaty' + (show ? '' : ' away')} aria-hidden={!show}>
        <div class="floaty-bob">
          {tip && <div class="bubble" role="status">Stuck? Ask Telly.</div>}
          <button class="telly-btn" onClick={roll} onMouseEnter={() => setMood('wink')} onMouseLeave={() => setMood('happy')} aria-label="Surprise me" title="Surprise me">
            <Telly size={72} mood={mood} />
          </button>
        </div>
      </div>
      {pick && (
        <DetailModal
          rec={pick}
          engine={engine}
          onClose={() => setPick(null)}
          extra={<button class="linkish" onClick={roll}>Another one</button>}
        />
      )}
    </>
  );
}
