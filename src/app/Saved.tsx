import { useState } from 'preact/hooks';
import type { Rec } from '../shared/types';
import { removeFeedback, savedIds } from '../shared/store';
import { explain } from '../engine/explain';
import type { EngineState } from '../ui/useEngine';
import { Telly } from '../ui/Telly';
import { DetailModal, Tile } from './RecCard';

export function Saved({ engine }: { engine: EngineState }) {
  const { catalog, profile, feedback } = engine;
  const [open, setOpen] = useState<Rec | null>(null);
  if (!catalog || !profile) return null;
  const recs: Rec[] = savedIds(feedback)
    .map((id) => catalog.byId.get(id))
    .filter((i): i is number => i != null)
    .map((i) => {
      const item = catalog.items[i];
      const { why, evidence } = explain(catalog, profile, item, null, { maxMinutes: null });
      return { item, score: 0, why: 'You saved this. ' + why, evidence };
    });
  return (
    <div class="saved">
      <h1 class="page-title">Saved</h1>
      {recs.length === 0 ? (
        <div class="loading">
          <Telly size={72} mood="sleepy" />
          <p class="muted">Swipe right on a card to keep it here.</p>
        </div>
      ) : (
        <div class="tiles">
          {recs.map((r) => (
            <div class="saved-item">
              <Tile rec={r} onOpen={setOpen} />
              <button class="linkish" onClick={() => removeFeedback(r.item.id, 'like')}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {open && <DetailModal rec={open} engine={engine} onClose={() => setOpen(null)} />}
    </div>
  );
}
