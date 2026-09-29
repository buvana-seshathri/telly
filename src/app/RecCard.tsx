import { useEffect, useRef, useState } from 'preact/hooks';
import type { PlatformId, Rec } from '../shared/types';
import { PLATFORM_BY_ID } from '../shared/platforms';
import { addFeedback } from '../shared/store';
import { openUrl } from '../shared/env';
import type { EngineState } from '../ui/useEngine';
import { Poster } from '../ui/Poster';
import { metaLine, watchPlatform, watchUrl } from '../ui/format';

export function PlatformBadges({ providers, engine, max = 2 }: { providers: PlatformId[]; engine: EngineState; max?: number }) {
  const mine = providers.filter((p) => engine.settings.platforms[p]);
  return (
    <>
      {mine.slice(0, max).map((p) => (
        <span class="badge">
          <span class="dot" style={{ background: PLATFORM_BY_ID[p].dot }} />
          {PLATFORM_BY_ID[p].short}
        </span>
      ))}
    </>
  );
}

export function useActions(engine: EngineState) {
  return {
    watch(rec: Rec) {
      const url = watchUrl(rec.item, watchPlatform(rec.item, engine.settings));
      addFeedback(rec.item.id, 'watch');
      if (url) openUrl(url);
    },
    save: (rec: Rec) => addFeedback(rec.item.id, 'like'),
    nope: (rec: Rec) => addFeedback(rec.item.id, 'nope'),
    seen: (rec: Rec) => addFeedback(rec.item.id, 'seen'),
  };
}

/** Quiet tile: poster, title, one meta line. Everything else lives behind a click. */
export function Tile({ rec, onOpen }: { rec: Rec; onOpen: (r: Rec) => void }) {
  return (
    <button class="tile" onClick={() => onOpen(rec)} aria-label={`${rec.item.title}, details and why`}>
      <Poster item={rec.item} height="100%" showTitle={false} />
      <span class="tile-text">
        <span class="tile-title">{rec.item.title}</span>
        <span class="tile-meta">{metaLine(rec.item)}</span>
      </span>
    </button>
  );
}

/** Details + the "why", only when asked for. */
export function DetailModal({ rec, engine, onClose, extra }: { rec: Rec; engine: EngineState; onClose: () => void; extra?: preact.ComponentChildren }) {
  const act = useActions(engine);
  const [done, setDone] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  const after = (label: string, fn: () => void) => () => {
    fn();
    setDone(label);
    setTimeout(onClose, 500);
  };
  return (
    <div class="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal detail" role="dialog" aria-modal="true" aria-label={rec.item.title} tabIndex={-1} ref={ref}>
        <button class="icon-btn close" aria-label="Close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
        </button>
        <div class="detail-top">
          <div class="detail-poster"><Poster item={rec.item} height="100%" showTitle={false} /></div>
          <div class="detail-info">
            <h2>{rec.item.title}</h2>
            <div class="meta-row">
              <span>{metaLine(rec.item)}</span>
              <PlatformBadges providers={rec.item.providers} engine={engine} />
            </div>
            <p class="overview">{rec.item.overview}</p>
          </div>
        </div>
        <div class="why-box">
          <span class="why-label">Why</span>
          <p>{rec.why}</p>
          {rec.evidence.length > 0 && (
            <ul class="evidence">
              {rec.evidence.slice(0, 3).map((e) => <li>{e.text}</li>)}
            </ul>
          )}
        </div>
        {extra}
        <div class="detail-actions">
          <button class="btn btn-primary" onClick={() => act.watch(rec)}>Watch</button>
          <button class="btn" onClick={after('Saved', () => act.save(rec))}>{done === 'Saved' ? 'Saved ✓' : 'Save'}</button>
          <span class="grow" />
          <button class="btn btn-ghost btn-sm" onClick={after('Seen', () => act.seen(rec))}>Already watched</button>
          <button class="btn btn-ghost btn-sm" onClick={after('Skip', () => act.nope(rec))}>Not for me</button>
        </div>
      </div>
    </div>
  );
}
