import { useMemo, useState } from 'preact/hooks';
import type { LlmProvider, RefreshCadence, Settings } from '../shared/types';
import { PLATFORMS, PLATFORM_BY_ID } from '../shared/platforms';
import { APP_NAME } from '../shared/brand';
import { addEvents, deleteAll, exportAll, saveSettings, setProfileIsMe, upsertProfile } from '../shared/store';
import { IS_EXTENSION, openUrl } from '../shared/env';
import { parseNetflixCsv } from '../platforms/netflix-csv';
import { buildPrompt, LLM_PROVIDERS, lastModelUsed, listModels, testLlm } from '../engine/llm';
import { recommend } from '../engine/recommend';
import type { EngineState } from '../ui/useEngine';
import { clearLlmHealth, useLlmHealth } from '../ui/useLlm';
import { InfoTip } from '../ui/InfoTip';

function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <label class="toggle" for={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span class="track" aria-hidden="true"><span class="thumb" /></span>
      <span class="sr-only">{label}</span>
    </label>
  );
}

function ago(t: number | null) {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function SettingsPage({ engine }: { engine: EngineState }) {
  const { settings: s, profiles, catalog, profile } = engine;
  const set = (patch: Partial<Settings>) => saveSettings(patch);

  return (
    <div class="settings">
      <h1 class="page-title">
        Settings <InfoTip label="About your data">Everything here stays in this browser. There's no {APP_NAME} server.</InfoTip>
      </h1>

      <section class="panel">
        <h2>
          Platforms{' '}
          <InfoTip label="About platforms">
            Turn off any you don't want picks from, even ones you pay for. Netflix and Prime Video: I read your history. Others: I learn as you watch.
          </InfoTip>
        </h2>
        <p class="muted small panel-note">Telly only reads history from, and suggests titles on, the platforms switched on here.</p>
        <div class="platform-grid">
          {PLATFORMS.map((p) => (
            <label class="row" for={'pf-' + p.id}>
              <span class="dot" style={{ background: p.dot }} />
              <span class="grow">{p.name}</span>
              <Toggle id={'pf-' + p.id} label={`Picks from ${p.name}`} checked={s.platforms[p.id]} onChange={(v) => set({ platforms: { ...s.platforms, [p.id]: v } })} />
            </label>
          ))}
        </div>
      </section>

      <section class="panel">
        <h2>
          Profiles{' '}
          <InfoTip label="About profiles">
            Profiles marked "Me" count toward your taste, across platforms. Leave family profiles off so tastes don't mix.
            {profile && profile.unmatched.length > 0 && <><br /><br />Not in the catalog yet: {profile.unmatched.slice(0, 6).join(', ')}</>}
          </InfoTip>
        </h2>
        {profiles.length === 0 ? (
          <p class="muted">None yet. Open Netflix or Prime Video.</p>
        ) : (
          <div class="list">
            {profiles.map((p) => (
              <label class="row" for={'pm-' + p.key}>
                <span class="dot" style={{ background: PLATFORM_BY_ID[p.platform].dot }} />
                <span>{p.name}</span>
                <span class="muted small">{p.eventCount} views · {ago(p.lastSynced)}</span>
                <span class="grow" />
                <span class="small muted">Me</span>
                <Toggle id={'pm-' + p.key} label={`${p.name} is me`} checked={p.isMe} onChange={(v) => setProfileIsMe(p.key, v)} />
              </label>
            ))}
          </div>
        )}
        {profile && profiles.length > 0 && (
          <p class="note">
            {profile.hasSignal ? `${profile.signals.length} titles are shaping your picks` : 'No history in use yet'}
            {profile.unmatched.length > 0 && ` · ${profile.unmatched.length} not in the catalog yet`}
          </p>
        )}
      </section>

      <section class="panel">
        <div class="row">
          <span class="grow">
            Picks per shelf{' '}
            <InfoTip label="About picks per shelf">Each shelf holds this many picks. The stack shows the top three at a time; use the arrows for the rest.</InfoTip>
          </span>
          <div class="seg" role="radiogroup" aria-label="Picks per shelf">
            {([3, 5, 10] as const).map((n) => (
              <button role="radio" aria-checked={(s.picksPerShelf ?? 5) === n} aria-pressed={(s.picksPerShelf ?? 5) === n} onClick={() => set({ picksPerShelf: n })}>{n}</button>
            ))}
          </div>
        </div>
      </section>

      <HistoryPanel engine={engine} />
      <LlmPanel engine={engine} />

      <section class="panel">
        <h2>
          Catalog{' '}
          <InfoTip label="About the catalog">
            The list of titles and where they stream, rebuilt weekly. Leave blank to use the built-in sample.
            {catalog && <><br /><br />Now: {catalog.items.length.toLocaleString()} titles{catalog.meta.sample ? ' (sample)' : ''}, {catalog.meta.region}.</>}
          </InfoTip>
        </h2>
        <CatalogUrl value={s.catalogUrl} onSave={(v) => set({ catalogUrl: v })} />
      </section>

      <section class="panel">
        <h2>Your data</h2>
        <DataPanel />
      </section>

      <p class="credits">
        Data from <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB</a> and <a href="https://www.justwatch.com" target="_blank" rel="noreferrer">JustWatch</a>. Uses the TMDB API but is not endorsed or certified by TMDB.
        {!IS_EXTENSION && ' · Preview mode'}
      </p>
    </div>
  );
}

function HistoryPanel({ engine }: { engine: EngineState }) {
  const s = engine.settings;
  const [msg, setMsg] = useState('');

  async function importCsv(file: File) {
    try {
      const text = await file.text();
      const existing = engine.profiles.find((p) => p.platform === 'netflix' && p.isMe);
      const prof = existing ?? (await upsertProfile('netflix', 'csv', 'Imported'));
      const events = parseNetflixCsv(text, prof.key);
      const added = await addEvents(prof.key, events, true);
      setMsg(`Imported ${added} new views.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const cadences: { v: RefreshCadence; label: string }[] = [
    { v: 'every-visit', label: 'Every visit' },
    { v: 'daily', label: 'Daily' },
    { v: 'manual', label: 'Manual' },
  ];

  return (
    <section class="panel">
      <h2>
        History{' '}
        <InfoTip label="About history">
          How often I re-read your Netflix and Prime history. "Every visit" checks at most every 6 hours. You can also import Netflix's CSV (Account → Viewing activity → Download all).
        </InfoTip>
      </h2>
      <div class="row">
        <span class="grow">Refresh</span>
        <div class="seg" role="radiogroup" aria-label="Refresh how often">
          {cadences.map((c) => (
            <button role="radio" aria-checked={s.refresh === c.v} aria-pressed={s.refresh === c.v} onClick={() => saveSettings({ refresh: c.v })}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div class="row-actions">
        <button class="btn btn-sm" onClick={() => openUrl('https://www.netflix.com/viewingactivity?tonight-sync=1')}>Sync Netflix</button>
        <button class="btn btn-sm" onClick={() => openUrl('https://www.primevideo.com/settings/watch-history?tonight-sync=1')}>Sync Prime</button>
        <label class="btn btn-sm file-btn">
          Import CSV
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.currentTarget.files?.[0] && importCsv(e.currentTarget.files[0])} />
        </label>
      </div>
      {msg && <p class="note">{msg}</p>}
      <p class="disclaimer">
        <b>How syncing works:</b> "Sync" opens your watch-history page and Telly reads the titles and dates on it, saving them in this browser only. Nothing is uploaded. It reads the page as you see it, so a site redesign can break it until Telly is updated; the CSV import is the fallback for Netflix.
      </p>
      <label class="row" for="passive">
        <span class="grow">
          Learn while I watch{' '}
          <InfoTip label="About learning while watching">Only Netflix and Prime have a history page I can read. On Hulu, Disney+, Max and others, I remember titles you play for 2+ minutes. You can also tap Already watched on any pick.</InfoTip>
        </span>
        <Toggle id="passive" label="Learn while I watch" checked={s.passiveLogging} onChange={(v) => saveSettings({ passiveLogging: v })} />
      </label>
      <label class="row" for="corner">
        <span class="grow">Telly button on streaming sites</span>
        <Toggle id="corner" label="Telly button on streaming sites" checked={s.cornerButton} onChange={(v) => saveSettings({ cornerButton: v })} />
      </label>
    </section>
  );
}

function LlmPanel({ engine }: { engine: EngineState }) {
  const llm = engine.settings.llm;
  const [provider, setProvider] = useState<LlmProvider>(llm.provider);
  const [key, setKey] = useState(llm.apiKey);
  const [model, setModel] = useState(llm.model);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const info = LLM_PROVIDERS[provider];
  const { health, message: healthMsg } = useLlmHealth(engine);

  const preview = useMemo(() => {
    if (!showSent || !engine.catalog || !engine.profile) return '';
    const recs = recommend(engine.catalog, engine.profile, { type: 'any', maxMinutes: null, genre: null, platforms: [] }, 5);
    const p = buildPrompt(engine.catalog, engine.profile, recs, { purpose: 'deck' });
    return `SYSTEM: ${p.system}\n\nUSER:\n${p.user}`;
  }, [showSent, engine.catalog, engine.profile]);

  async function requestHost(): Promise<boolean> {
    if (!IS_EXTENSION || !chrome.permissions) return true;
    return chrome.permissions.request({ origins: [info.host] });
  }

  async function save(enabled: boolean) {
    setBusy(true);
    setStatus('');
    try {
      if (enabled && !(await requestHost())) {
        setStatus('Permission declined. Smarter picks stay off.');
        return;
      }
      const next = { enabled, provider, apiKey: key.trim(), model: model.trim() };
      if (enabled) {
        setStatus(await testLlm(next));
        const used = lastModelUsed(provider);
        if (used && used !== next.model) {
          next.model = used;
          setModel(used);
        }
      }
      await saveSettings({ llm: next });
      if (enabled) await clearLlmHealth();
      if (!enabled) setStatus('Off.');
    } catch (e) {
      setStatus('Could not connect: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadModels() {
    setBusy(true);
    try {
      if (!(await requestHost())) return;
      setModels(await listModels({ enabled: true, provider, apiKey: key.trim(), model }));
    } catch (e) {
      setStatus('Could not list models: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="panel">
      <div class="panel-title">
        <h2>
          Smarter picks{' '}
          <InfoTip label="About smarter picks">
            Optional. Add your own AI key and an AI model re-ranks my top picks and writes friendlier reasons, only from real titles on your platforms. Calls go straight from
            this browser to the provider and count against your key. {info.note}
          </InfoTip>
        </h2>
        <span class={'status' + (llm.enabled ? ' on' : '')}>{llm.enabled ? 'On' : 'Off'}</span>
      </div>
      <div class="form-grid">
        <label>
          <span>Provider</span>
          <select class="select" value={provider} onChange={(e) => { setProvider(e.currentTarget.value as LlmProvider); setModels([]); setModel(''); }}>
            {(Object.keys(LLM_PROVIDERS) as LlmProvider[]).map((p) => <option value={p}>{LLM_PROVIDERS[p].name}</option>)}
          </select>
        </label>
        <label>
          <span>
            API key <a class="small" href={info.keyUrl} target="_blank" rel="noreferrer">get one</a>
          </span>
          <input class="input" type="password" autocomplete="off" value={key} placeholder="Paste key" onInput={(e) => setKey(e.currentTarget.value)} />
        </label>
        <label>
          <span>
            Model{' '}
            <button class="linkish inline" type="button" disabled={!key || busy} onClick={loadModels}>list</button>
          </span>
          {models.length ? (
            <select class="select" value={model || info.defaultModel} onChange={(e) => setModel(e.currentTarget.value)}>
              {[...new Set([model || info.defaultModel, ...models])].map((m) => <option value={m}>{m}</option>)}
            </select>
          ) : (
            <input class="input" value={model} placeholder={info.defaultModel} onInput={(e) => setModel(e.currentTarget.value)} />
          )}
        </label>
      </div>
      <div class="row-actions">
        <button class="btn btn-sm btn-primary" disabled={!key || busy} onClick={() => save(true)}>{busy ? 'Checking…' : llm.enabled ? 'Save' : 'Turn on'}</button>
        {llm.enabled && <button class="btn btn-sm" disabled={busy} onClick={() => save(false)}>Turn off</button>}
        {llm.apiKey && <button class="btn btn-sm btn-ghost" disabled={busy} onClick={() => { setKey(''); saveSettings({ llm: { ...llm, enabled: false, apiKey: '' } }); setStatus('Key removed.'); }}>Remove key</button>}
        <span class="grow" />
        <button class="linkish" onClick={() => setShowSent((v) => !v)} aria-expanded={showSent}>{showSent ? 'Hide' : 'What gets sent?'}</button>
      </div>
      {health && !status && <p class="llm-note" role="status">{healthMsg}</p>}
      {status && <p class="note">{status}</p>}
      <div class="disclaimer">
        <b>Before you add a key:</b>
        <ul class="plain">
          <li>This is optional. Telly's own picks work without it.</li>
          <li>Your key is saved in this browser only (not encrypted). Don't add it on a shared computer, and use a key you can revoke.</li>
          <li>Each refresh of your picks or mood search makes a small request that counts against your provider's free allowance or bill. Set a spending limit with them if you can.</li>
          <li>The AI only sees a short taste summary and the shortlisted titles ("What gets sent?" shows exactly what), never your account details.</li>
          <li>If the key runs out of credit or gets rate-limited, Telly says so here and on the home page, and carries on with its own picks.</li>
        </ul>
      </div>
      {showSent && <pre class="sent">{preview}</pre>}
    </section>
  );
}

function CatalogUrl({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <div class="inline-form">
      <label class="sr-only" for="caturl">Catalog URL</label>
      <input id="caturl" class="input" value={v} placeholder="Catalog URL (blank = bundled sample)" onInput={(e) => setV(e.currentTarget.value)} />
      <button class="btn btn-sm" onClick={() => onSave(v.trim())}>Save</button>
    </div>
  );
}

function DataPanel() {
  const [confirm, setConfirm] = useState(false);
  async function download() {
    const blob = new Blob([await exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `telly-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div class="row-actions">
      <button class="btn btn-sm" onClick={download}>Export</button>
      {!confirm ? (
        <button class="btn btn-sm btn-ghost danger" onClick={() => setConfirm(true)}>Delete everything</button>
      ) : (
        <>
          <button class="btn btn-sm danger-solid" onClick={async () => { await deleteAll(); location.hash = '/welcome'; location.reload(); }}>Yes, delete</button>
          <button class="btn btn-sm btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
        </>
      )}
    </div>
  );
}
