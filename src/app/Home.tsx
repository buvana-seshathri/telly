import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Filters, Rec } from '../shared/types';
import { enabledPlatforms } from '../shared/store';
import { genreSections, languageSections, recommend, surprise } from '../engine/recommend';
import { searchVibe } from '../engine/vibe';
import { expandQuery } from '../engine/themes';
import { embedQuery, warmEmbedder } from '../engine/embed-query';
import { genreLabel, langLabel } from '../engine/text';
import type { EngineState } from '../ui/useEngine';
import { useLlmHealth, useLlmRerank } from '../ui/useLlm';
import { Poster } from '../ui/Poster';
import { Telly, type TellyMood } from '../ui/Telly';
import { InfoTip } from '../ui/InfoTip';
import { metaLine } from '../ui/format';
import { DetailModal, PlatformBadges, Tile, useActions } from './RecCard';
import { BecauseChip, Stack } from './Stack';
import { FloatingTelly } from './FloatingTelly';

const TIMES: { label: string; value: number | null }[] = [
  { label: 'Any length', value: null },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: 'Movie length', value: 180 },
];

const NO_RECS: Rec[] = []; // stable identity, so the rerank hook does not re-run every render

export function Home({ engine }: { engine: EngineState }) {
  const { catalog, profile, settings } = engine;
  const enabled = enabledPlatforms(settings);
  const perShelf = settings.picksPerShelf ?? 5;
  const [type, setType] = useState<Filters['type']>('any');
  const [maxMinutes, setMaxMinutes] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const [vibeRecs, setVibeRecs] = useState<Rec[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [wordsOnly, setWordsOnly] = useState(false);
  const [open, setOpen] = useState<Rec | null>(null);
  const [rolled, setRolled] = useState<Rec[] | null>(null);
  const [hostIdx, setHostIdx] = useState(0);
  const [whyOpen, setWhyOpen] = useState(false);
  const [mood, setMood] = useState<TellyMood>('happy');
  const [genreCap, setGenreCap] = useState(6);
  const [hostVisible, setHostVisible] = useState(true);
  const hostRef = useRef<HTMLElement>(null);
  const act = useActions(engine);
  const llmHealth = useLlmHealth(engine);
  const [fresh, setFresh] = useState(false);

  const filters: Filters = { type, maxMinutes, genre: null, platforms: enabled };
  const fkey = `${type}|${maxMinutes}|${enabled.join(',')}`;

  const topBase = useMemo(() => (catalog && profile ? recommend(catalog, profile, filters, 8) : []), [catalog, profile, fkey]);
  const top = useLlmRerank(engine, topBase, { purpose: 'tonight', filters });
  const vibeRanked = useLlmRerank(engine, vibeRecs ?? NO_RECS, { purpose: 'vibe', filters, vibe: asked });
  const hostRecs = vibeRecs ? vibeRanked : top;
  const pick = hostRecs.length ? hostRecs[hostIdx % hostRecs.length] : null;

  const sections = useMemo(() => {
    if (!catalog || !profile) return [];
    const skip = top[0] ? [top[0].item.id] : [];
    const langs = languageSections(catalog, profile, filters, perShelf, skip);
    const taken = [...skip, ...langs.flatMap((s) => s.recs.map((r) => r.item.id))];
    return [...langs, ...genreSections(catalog, profile, filters, perShelf, genreCap, taken)];
  }, [catalog, profile, fkey, top[0]?.item.id, genreCap, perShelf]);

  useEffect(() => {
    setHostIdx(0);
    setWhyOpen(false);
  }, [fkey, vibeRecs]);

  useEffect(() => {
    if (!hostRef.current || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setHostVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(hostRef.current);
    return () => io.disconnect();
  }, [engine.ready]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || !catalog || !profile) return;
    setAsked(q);
    setSearching(true);
    setFresh(false);
    setMood('wow');
    // the answer appears in the pick card above the search box, so bring it into view right away
    hostRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try {
      let vec: Float32Array | null = null;
      try {
        vec = await embedQuery(catalog, expandQuery(q));
      } catch (e) {
        console.warn('[telly] language model unavailable, matching on words only', e);
      }
      setWordsOnly(!vec);
      setVibeRecs(searchVibe(catalog, profile, q, vec, filters, 10));
      setFresh(true);
      setTimeout(() => setFresh(false), 1600);
    } finally {
      setSearching(false);
      setTimeout(() => setMood('happy'), 700);
    }
  }

  function another() {
    setHostIdx((i) => i + 1);
    setWhyOpen(false);
    setMood('wink');
    setTimeout(() => setMood('happy'), 600);
  }

  function roll() {
    if (!catalog || !profile) return;
    setRolled([surprise(catalog, profile, filters, 'movie'), surprise(catalog, profile, filters, 'tv')].filter((x): x is Rec => !!x));
  }

  if (!engine.ready || !catalog) {
    return (
      <div class="loading">
        <Telly size={72} mood="sleepy" />
      </div>
    );
  }

  return (
    <div class="home">
      <section class={'host' + (searching ? ' busy' : '') + (fresh ? ' fresh' : '')} ref={hostRef} aria-label="Telly's pick" aria-busy={searching}>
        <div class="host-telly" aria-hidden="true">
          <Telly size={116} mood={mood} />
        </div>
        {pick ? (
          <div class="bubble-card">
            <p class="bubble-lead">
              {searching ? 'Thinking about that…' : vibeRecs ? "For that mood, try" : "I'd go with"}
              {vibeRecs && (
                <button class="linkish inline" onClick={() => { setVibeRecs(null); setQuery(''); }}>clear</button>
              )}
            </p>
            <h1>{pick.item.title}</h1>
            <div class="meta-row">
              <span>{metaLine(pick.item)}</span>
              <PlatformBadges providers={pick.item.providers} engine={engine} max={1} />
              <BecauseChip rec={pick} catalog={catalog} />
            </div>
            {whyOpen && <p class="host-why">{pick.why}</p>}
            {vibeRecs && wordsOnly && <p class="host-why">Matched on your words only: the smarter matching is still loading (first time only) or couldn't load. Try again in a minute.</p>}
            <div class="host-actions">
              <button class="btn btn-primary big" onClick={() => act.watch(pick)}>Watch</button>
              <button class="btn big" aria-expanded={whyOpen} onClick={() => setWhyOpen((v) => !v)}>Why?</button>
              {hostRecs.length > 1 && (
                <button class="btn btn-ghost big" onClick={another}>Another</button>
              )}
              <button class="btn btn-ghost" onClick={() => { act.seen(pick); setWhyOpen(false); }}>Already watched</button>
              <button class="icon-btn" aria-label="Not for me" title="Not for me" onClick={() => { act.nope(pick); setWhyOpen(false); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>
              </button>
            </div>
          </div>
        ) : (
          <div class="bubble-card">
            <p class="bubble-lead">{searching ? 'Thinking about that…' : vibeRecs ? 'Hmm, nothing on your platforms fits that.' : 'Nothing left for these filters.'}</p>
          </div>
        )}
        {pick && (
          <button class="host-poster" onClick={() => setOpen(pick)} aria-label={`${pick.item.title}: details`}>
            <Poster item={pick.item} height="100%" showTitle={false} />
          </button>
        )}
      </section>

      <form
        class="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          ask(query);
        }}
      >
        <label class="sr-only" for="vibe">Tell Telly a mood</label>
        <input id="vibe" value={query} placeholder="Not it? Tell me a mood…" autocomplete="off" onFocus={() => catalog && warmEmbedder(catalog)} onInput={(e) => setQuery(e.currentTarget.value)} />
        <button class="go" type="submit" aria-label="Ask" disabled={searching || !query.trim()}>
          {searching ? (
            <span class="spin" aria-hidden="true" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
          )}
        </button>
      </form>
      {llmHealth.health && (
        <p class="llm-note" role="status">
          {llmHealth.message} <a href="#/settings">Settings</a>
        </p>
      )}

      <div class="bar">
        <div class="seg" role="group" aria-label="Type">
          {(['any', 'movie', 'tv'] as const).map((t) => (
            <button aria-pressed={type === t} onClick={() => setType(t)}>
              {t === 'any' ? 'All' : t === 'movie' ? 'Movies' : 'Series'}
            </button>
          ))}
        </div>
        <label class="sr-only" for="time-f">Time you have</label>
        <select id="time-f" class="select" value={String(maxMinutes)} onChange={(e) => setMaxMinutes(e.currentTarget.value === 'null' ? null : +e.currentTarget.value)}>
          {TIMES.map((t) => <option value={String(t.value)}>{t.label}</option>)}
        </select>
        <span class="grow" />
        <button class="btn" onClick={roll}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></svg>
          Random
        </button>
      </div>

      <div class="stacks">
        {sections.map((s) => (
          <Stack
            title={s.lang ? langLabel(s.lang) : s.stretch ? 'Something different' : genreLabel(s.genre)}
            info={
              <InfoTip label={`About ${s.lang ? langLabel(s.lang) : s.stretch ? 'something different' : genreLabel(s.genre)}`}>
                {s.lang
                  ? `About ${Math.round(s.share * 100)}% of what you watch is in ${langLabel(s.lang)}. Your top ${perShelf}.`
                  : s.stretch
                    ? `${genreLabel(s.genre)} isn't your usual, but these sit close to your taste.`
                    : s.share > 0
                      ? `About ${Math.round(s.share * 100)}% of what you watch. Your top ${perShelf}.`
                      : 'Popular picks while I learn your taste.'}
              </InfoTip>
            }
            recs={s.recs}
            catalog={catalog}
            onOpen={setOpen}
          />
        ))}
      </div>
      {sections.filter((s) => !s.lang).length >= genreCap && (
        <div class="more-row">
          <button class="btn" onClick={() => setGenreCap((n) => n + 6)}>More genres</button>
        </div>
      )}

      {catalog.meta.sample && (
        <p class="sample-note">
          Sample catalog <InfoTip label="About the sample catalog">{`${catalog.items.length} hand-picked titles with illustrative availability. Add the weekly catalog in Settings for real posters and live data.`}</InfoTip>
        </p>
      )}

      {open && <DetailModal rec={open} engine={engine} onClose={() => setOpen(null)} />}
      {rolled && (
        <div class="overlay" onMouseDown={(e) => e.target === e.currentTarget && setRolled(null)}>
          <div class="modal rolled" role="dialog" aria-modal="true" aria-label="Random picks">
            <div class="section-head">
              <h2>Random picks</h2>
              <button class="btn btn-ghost btn-sm" onClick={roll}>Roll again</button>
            </div>
            <div class="tiles two">
              {rolled.map((r) => <Tile rec={r} onOpen={(x) => { setRolled(null); setOpen(x); }} />)}
            </div>
          </div>
        </div>
      )}
      <FloatingTelly engine={engine} show={!hostVisible} />
    </div>
  );
}
