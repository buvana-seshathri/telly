import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Filters, PlatformId, Rec } from '../shared/types';
import { PLATFORM_BY_ID } from '../shared/platforms';
import { APP_NAME } from '../shared/brand';
import { addFeedback, enabledPlatforms, setProfileIsMe } from '../shared/store';
import { kvGet, kvSet, openUrl } from '../shared/env';
import { recommend, surprise } from '../engine/recommend';
import { genreLabel } from '../engine/text';
import type { EngineState } from '../ui/useEngine';
import { Telly } from '../ui/Telly';
import { Poster } from '../ui/Poster';
import { appUrl, metaLine, watchPlatform, watchUrl } from '../ui/format';
import { useLlmRerank } from '../ui/useLlm';

const TIMES: { label: string; value: number | null }[] = [
  { label: 'Any length', value: null },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: 'Movie length', value: 180 },
];

type DeckCard = Rec & { tag?: string };

interface Props {
  engine: EngineState;
  embed: boolean;
  currentPlatform: PlatformId | null;
}

const Icon = {
  sliders: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
  ),
  expand: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6" /><path d="M20 4l-7 7" /><path d="M10 20H4v-6" /><path d="M4 20l7-7" /></svg>
  ),
  x: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
  ),
  eye: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
  ),
  dice: (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></svg>
  ),
};

export function Deck({ engine, embed, currentPlatform }: Props) {
  const { catalog, profile, settings, profiles } = engine;
  const enabled = enabledPlatforms(settings);
  const defaultScope = currentPlatform && enabled.includes(currentPlatform) ? [currentPlatform] : enabled;
  const [scope, setScope] = useState<PlatformId[]>(defaultScope);
  const [type, setType] = useState<Filters['type']>('any');
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [showWhy, setShowWhy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    kvGet<boolean>('swipedOnce', false).then((v) => setHint(!v));
  }, []);

  const filters: Filters = { type, maxMinutes, genre, platforms: scope.length ? scope : enabled };
  const filtered = type !== 'any' || maxMinutes != null || genre != null || scope.join() !== defaultScope.join();
  const base = useMemo(
    () => (catalog && profile ? recommend(catalog, profile, filters, 15) : []),
    [catalog, type, maxMinutes, genre, scope.join(','), profile?.signals.length],
  );
  const ranked = useLlmRerank(engine, base, { purpose: 'deck', filters });

  useEffect(() => {
    setCards(ranked.filter((r) => !gone.has(r.item.id)));
    setShowWhy(false);
  }, [ranked]);

  const genres = useMemo(() => {
    if (!profile) return [];
    const mine = [...profile.genreShare.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
    const rest = ['comedy', 'drama', 'thriller', 'sci-fi', 'documentary', 'romance', 'horror', 'animation', 'action', 'crime'];
    return [...new Set([...mine, ...rest])].slice(0, 12);
  }, [profile]);

  const top = cards[0];
  const newProfile = profiles.find((p) => p.confirmed === false);

  function commit(dir: 'right' | 'left', card: DeckCard) {
    addFeedback(card.item.id, dir === 'right' ? 'like' : 'nope');
    setGone((g) => new Set(g).add(card.item.id));
    setCards((c) => c.slice(1));
    setShowWhy(false);
    if (hint) {
      setHint(false);
      kvSet('swipedOnce', true);
    }
  }

  function watch(card: DeckCard) {
    const url = watchUrl(card.item, watchPlatform(card.item, settings, currentPlatform));
    addFeedback(card.item.id, 'watch');
    if (!url) return;
    if (embed) window.parent.postMessage({ tonight: 'navigate', url }, '*');
    else openUrl(url);
  }

  function doSurprise() {
    if (!catalog || !profile) return;
    const m = surprise(catalog, profile, { ...filters, type: 'any' }, 'movie');
    const s = surprise(catalog, profile, { ...filters, type: 'any' }, 'tv');
    const extra: DeckCard[] = [];
    if (m) extra.push({ ...m, tag: 'Random movie' });
    if (s) extra.push({ ...s, tag: 'Random series' });
    setCards((c) => [...extra, ...c.filter((x) => !extra.some((e) => e.item.id === x.item.id))]);
    setShowWhy(false);
  }

  function markSeen(card: DeckCard) {
    addFeedback(card.item.id, 'seen');
    setGone((g) => new Set(g).add(card.item.id));
    setCards((c) => c.slice(1));
    setShowWhy(false);
  }

  const topRef = useRef(top);
  topRef.current = top;
  const swipeRef = useRef<(dir: 'left' | 'right') => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = topRef.current;
      if ((e.target as HTMLElement)?.closest('select,input,textarea')) return;
      if (e.key === 'ArrowRight' && t) swipeRef.current('right');
      else if (e.key === 'ArrowLeft' && t) swipeRef.current('left');
      else if (e.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openFull(hash = '') {
    if (embed) window.parent.postMessage({ tonight: 'open-app', hash }, '*');
    else openUrl(appUrl(hash));
  }

  return (
    <div class="deck-root">
      <header class="deck-head">
        <div class="brand">
          <Telly size={30} />
          <h1>{APP_NAME}</h1>
        </div>
        <div class="head-actions">
          <button class="icon-btn" aria-label="Filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
            {Icon.sliders}
            {filtered && <span class="pip" />}
          </button>
          <button class="icon-btn" aria-label="Open full page" onClick={() => openFull('')}>
            {Icon.expand}
          </button>
        </div>
      </header>

      {filtersOpen && (
        <div class="sheet" role="dialog" aria-label="Filters">
          <div class="seg" role="group" aria-label="Type">
            {(['any', 'movie', 'tv'] as const).map((t) => (
              <button aria-pressed={type === t} onClick={() => setType(t)}>
                {t === 'any' ? 'All' : t === 'movie' ? 'Movies' : 'Series'}
              </button>
            ))}
          </div>
          <div class="sheet-row">
            <label class="sr-only" for="time">Time you have</label>
            <select id="time" class="select" value={String(maxMinutes)} onChange={(e) => setMaxMinutes(e.currentTarget.value === 'null' ? null : +e.currentTarget.value)}>
              {TIMES.map((t) => <option value={String(t.value)}>{t.label}</option>)}
            </select>
            <label class="sr-only" for="genre">Genre</label>
            <select id="genre" class="select" value={genre ?? ''} onChange={(e) => setGenre(e.currentTarget.value || null)}>
              <option value="">Any genre</option>
              {genres.map((g) => <option value={g}>{genreLabel(g)}</option>)}
            </select>
          </div>
          {enabled.length > 1 && (
            <div class="sheet-row wrap" role="group" aria-label="Platforms">
              {enabled.map((p) => (
                <button class="chip" aria-pressed={scope.includes(p)} onClick={() => setScope((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))}>
                  <span class="dot" style={{ background: PLATFORM_BY_ID[p].dot }} />
                  {PLATFORM_BY_ID[p].short}
                </button>
              ))}
            </div>
          )}
          <button class="btn btn-sm btn-primary done" onClick={() => setFiltersOpen(false)}>Done</button>
        </div>
      )}

      {newProfile && (
        <div class="banner">
          <span>
            New {PLATFORM_BY_ID[newProfile.platform].short} profile <b>{newProfile.name}</b>. You?
          </span>
          <span class="banner-actions">
            <button class="btn btn-sm btn-primary" onClick={() => setProfileIsMe(newProfile.key, true)}>Yes</button>
            <button class="btn btn-sm" onClick={() => setProfileIsMe(newProfile.key, false)}>No</button>
          </span>
        </div>
      )}
      {!newProfile && profile && !profile.hasSignal && (
        <div class="banner">
          <span>Popular picks for now.</span>
          <button class="btn btn-sm" onClick={() => openFull('/welcome')}>Personalize</button>
        </div>
      )}

      <div class="stack">
        {!engine.ready && <div class="empty"><Telly size={64} mood="sleepy" /></div>}
        {engine.ready && !top && (
          <div class="empty">
            <Telly size={64} mood="wow" />
            <p>That's all for these filters.</p>
            <button class="btn btn-sm" onClick={() => { setGenre(null); setMaxMinutes(null); setType('any'); setScope(defaultScope); setGone(new Set()); }}>Reset</button>
          </div>
        )}
        {cards.slice(0, 3).reverse().map((c, i, arr) => {
          const depth = arr.length - 1 - i;
          return depth === 0 ? (
            <SwipeCard
              key={c.item.id}
              card={c}
              showWhy={showWhy}
              onToggleWhy={() => setShowWhy((v) => !v)}
              onCommit={(dir) => commit(dir, c)}
              onSeen={() => markSeen(c)}
              bindSwipe={(fn) => (swipeRef.current = fn)}
              settings={engine.settings}
            />
          ) : (
            <div key={c.item.id} class="card card-back" style={{ transform: `translateY(${-depth * 8}px) scale(${1 - depth * 0.04})` }} />
          );
        })}
      </div>

      {hint && top && <p class="hint">Swipe right to save · left to skip</p>}

      <div class="deck-actions">
        <button class="btn round" aria-label="Skip" title="Skip" disabled={!top} onClick={() => swipeRef.current('left')}>{Icon.x}</button>
        <button class="btn round" aria-label="Already watched" title="Already watched" disabled={!top} onClick={() => top && markSeen(top)}>{Icon.eye}</button>
        <button class="btn btn-primary watch" disabled={!top} onClick={() => top && watch(top)}>Watch</button>
        <button class="btn round" aria-label="Random movie and series" title="Random" onClick={doSurprise}>{Icon.dice}</button>
      </div>
    </div>
  );
}

interface CardProps {
  card: DeckCard;
  showWhy: boolean;
  onToggleWhy: () => void;
  onCommit: (dir: 'left' | 'right') => void;
  onSeen: () => void;
  bindSwipe: (fn: (dir: 'left' | 'right') => void) => void;
  settings: EngineState['settings'];
}

function SwipeCard({ card, showWhy, onToggleWhy, onCommit, onSeen, bindSwipe, settings }: CardProps) {
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<'left' | 'right' | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const fly = (dir: 'left' | 'right') => {
    if (flying) return;
    setFlying(dir);
    setTimeout(() => onCommit(dir), 230);
  };
  bindSwipe(fly);

  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!start.current) return;
    setDx(e.clientX - start.current.x);
    setDy(e.clientY - start.current.y);
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(dx) > 90) fly(dx > 0 ? 'right' : 'left');
    else {
      setDx(0);
      setDy(0);
    }
  };

  const x = flying ? (flying === 'right' ? 520 : -520) : dx;
  const rot = flying ? (flying === 'right' ? 22 : -22) : dx / 18;
  const like = flying === 'right' ? 1 : Math.max(0, Math.min(1, dx / 90));
  const nope = flying === 'left' ? 1 : Math.max(0, Math.min(1, -dx / 90));
  const where = card.item.providers.filter((p) => settings.platforms[p]);

  return (
    <article
      class={'card card-top' + (dragging ? ' dragging' : '')}
      style={{ transform: `translate(${x}px, ${flying ? dy : dy * 0.2}px) rotate(${rot}deg)` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      aria-label={card.item.title}
    >
      <div class="poster-wrap">
        <Poster item={card.item} height="100%" showTitle={false} />
        <div class="stamp stamp-like" style={{ opacity: like }}>SAVE</div>
        <div class="stamp stamp-nope" style={{ opacity: nope }}>SKIP</div>
        {card.tag && <div class="tag">{card.tag}</div>}
        {showWhy && (
          <div class="why-panel">
            <p class="why-main">{card.why}</p>
            <ul class="evidence">
              {card.evidence.slice(0, 3).map((e) => <li>{e.text}</li>)}
            </ul>
            <button class="linkish" onClick={onSeen}>Already watched</button>
          </div>
        )}
      </div>
      <div class="card-foot">
        <div class="card-text">
          <h2>{card.item.title}</h2>
          <div class="meta">
            {metaLine(card.item)}
            {where[0] && (
              <span class="badge"><span class="dot" style={{ background: PLATFORM_BY_ID[where[0]].dot }} />{PLATFORM_BY_ID[where[0]].short}</span>
            )}
          </div>
        </div>
        <button class={'why-btn' + (showWhy ? ' on' : '')} aria-expanded={showWhy} onClick={onToggleWhy}>
          Why?
        </button>
      </div>
    </article>
  );
}
