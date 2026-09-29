import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Catalog, Rec } from '../shared/types';
import { Poster } from '../ui/Poster';
import { metaLine } from '../ui/format';

/** "Like Dark" — a tiny poster of the title you watched that this pick comes from. */
export function BecauseChip({ rec, catalog }: { rec: Rec; catalog: Catalog }) {
  const i = rec.anchorId ? catalog.byId.get(rec.anchorId) : undefined;
  if (i == null) return null;
  const a = catalog.items[i];
  return (
    <span class="because" title={`Because you watched ${a.title}`}>
      <span class="because-thumb"><Poster item={a} height="100%" showTitle={false} /></span>
      <span class="sr-only">Because you watched</span>
      <span class="because-text">Like {a.title}</span>
    </span>
  );
}

/** A small fanned stack of 3 picks. Click the front card for details, arrows to flip. */
export function Stack({
  title,
  info,
  recs,
  catalog,
  onOpen,
}: {
  title: ComponentChildren;
  info?: ComponentChildren;
  recs: Rec[];
  catalog: Catalog;
  onOpen: (r: Rec) => void;
}) {
  const [idx, setIdx] = useState(0);
  const n = recs.length;
  if (!n) return null;
  const front = recs[idx % n];
  const step = (d: number) => setIdx((i) => (i + d + n) % n);

  return (
    <section class="stack-block">
      <h2 class="stack-title">
        {title} {info}
      </h2>
      <div class="fan" onKeyDown={(e) => { if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); }}>
        {recs.map((r, i) => {
          const pos = (i - idx + n) % n; // 0 = front
          // A quiet stack: same angle, each card a little lower, narrower and darker than the one above.
          const depth = Math.min(pos, 3);
          const style = {
            transform: pos === 0 ? 'none' : `translate(${depth * 13}px, ${depth * -13}px) scale(${1 - depth * 0.025})`,
            filter: pos === 0 ? 'none' : `brightness(${1 - depth * 0.2})`,
            zIndex: n - pos,
            opacity: pos > 2 ? 0 : 1,
            pointerEvents: pos === 0 ? 'auto' : 'none',
          } as const;
          return pos === 0 ? (
            <button class="fan-card front" style={style} onClick={() => onOpen(r)} aria-label={`${r.item.title}: details and why`}>
              <Poster item={r.item} height="100%" showTitle={false} />
            </button>
          ) : (
            <div class="fan-card" style={style} aria-hidden="true">
              <Poster item={r.item} height="100%" showTitle={false} />
            </div>
          );
        })}
      </div>
      <div class="stack-info">
        <button class="stack-name" onClick={() => onOpen(front)}>{front.item.title}</button>
        <span class="tile-meta">{metaLine(front.item)}</span>
        <BecauseChip rec={front} catalog={catalog} />
      </div>
      {n > 1 && (
        <div class="stack-nav">
          <button class="icon-btn sm" aria-label="Previous" onClick={() => step(-1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          {n <= 5 ? (
            <span class="dots" aria-label={`${(idx % n) + 1} of ${n}`}>
              {recs.map((_, i) => <span class={'d' + (i === idx % n ? ' on' : '')} />)}
            </span>
          ) : (
            <span class="count" aria-label={`${(idx % n) + 1} of ${n}`}>{(idx % n) + 1} / {n}</span>
          )}
          <button class="icon-btn sm" aria-label="Next" onClick={() => step(1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
    </section>
  );
}
