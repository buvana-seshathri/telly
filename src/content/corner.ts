// Content script on streaming sites:
//  • the floating Telly button that opens the swipe deck in a small panel
//  • keeping Netflix / Prime history fresh (per the refresh setting)
//  • "learn while I watch" on platforms without a history page
import type { PlatformId, WatchEvent } from '../shared/types';
import { platformForHost, PLATFORM_BY_ID } from '../shared/platforms';
import { addEvents, getSettings, upsertProfile } from '../shared/store';
import { TELLY_SVG } from '../ui/Telly';
import { readPrimeHistory } from '../platforms/prime-dom';
import { cleanPageTitle } from '../platforms/page-title';

const info = platformForHost(location.hostname);
const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
const forcedSync = new URLSearchParams(location.search).has('tonight-sync');

// ---------------- corner button + panel (Shadow DOM, so site CSS can't touch it) ----------------

const CSS = `
:host { all: initial; }
.wrap { position: fixed; right: 22px; bottom: 22px; z-index: 2147483646; font-family: system-ui, sans-serif; }
.btn { width: 58px; height: 58px; border-radius: 999px; border: 1px solid #2b2a2f; background: #1c1b1f; padding: 8px; cursor: pointer;
  box-shadow: 0 10px 28px rgba(0,0,0,.45), 0 0 0 0 rgba(255,161,74,.5); transition: transform .15s; animation: breathe 3.6s ease-in-out infinite; }
.btn:hover { transform: scale(1.08) rotate(-5deg); }
.btn:focus-visible { outline: 2px solid #ffa14a; outline-offset: 3px; }
.btn .eyes { transform-box: fill-box; transform-origin: center; animation: blink 5s infinite; }
@keyframes blink { 0%, 94%, 100% { transform: scaleY(1); } 96% { transform: scaleY(.1); } }
@keyframes breathe { 0%,100% { box-shadow: 0 10px 28px rgba(0,0,0,.45), 0 0 0 0 rgba(255,161,74,.3); } 50% { box-shadow: 0 10px 28px rgba(0,0,0,.45), 0 0 0 8px rgba(255,161,74,0); } }
.panel { position: absolute; right: 0; bottom: 72px; width: 380px; height: min(600px, calc(100vh - 110px)); border-radius: 22px; overflow: hidden; border: 1px solid #2b2a2f;
  box-shadow: 0 24px 60px rgba(0,0,0,.6); background: #141316; transform-origin: 100% 100%; animation: pop .18s ease-out; }
.panel iframe { width: 100%; height: 100%; border: 0; display: block; }
@keyframes pop { from { transform: scale(.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.tip, .toast { position: absolute; right: 70px; bottom: 12px; white-space: nowrap; padding: 9px 13px; border-radius: 14px 14px 4px 14px;
  background: #f5f2ee; color: #1a1a1d; font-size: 13px; font-weight: 600; box-shadow: 0 8px 24px rgba(0,0,0,.35); animation: pop .2s ease-out; }
.toast { background: #ffa14a; color: #2a1500; }
.done { position: absolute; right: 70px; bottom: 12px; white-space: nowrap; padding: 10px 12px 10px 14px; border-radius: 14px 14px 4px 14px; background: #3ecf8e; color: #062a19; font: 700 13px/1.3 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.35); display: flex; align-items: center; gap: 10px; }
.done button { all: unset; cursor: pointer; font-size: 16px; line-height: 1; padding: 0 2px; opacity: .7; }
.done button:hover { opacity: 1; }
.hidden { display: none; }
@media (prefers-reduced-motion: reduce) { .btn, .btn .eyes, .panel, .tip, .toast { animation: none; } }
`;

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let panel: HTMLElement | null = null;

function mountButton(platform: PlatformId) {
  if (host) return;
  host = document.createElement('tonight-telly');
  root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${CSS}</style><div class="wrap"><button class="btn" aria-label="Telly: what should I watch?" title="What should I watch?">${TELLY_SVG}</button></div>`;
  document.documentElement.appendChild(host);
  const wrap = root.querySelector('.wrap') as HTMLElement;
  root.querySelector('.btn')!.addEventListener('click', () => togglePanel(wrap, platform));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closePanel());
  document.addEventListener('click', (e) => {
    if (panel && !e.composedPath().includes(host!)) closePanel();
  });
  maybeTip(wrap);
  keepOutOfTheWay();
}

function togglePanel(wrap: HTMLElement, platform: PlatformId) {
  if (panel) return closePanel();
  wrap.querySelector('.tip')?.remove();
  panel = document.createElement('div');
  panel.className = 'panel';
  const f = document.createElement('iframe');
  f.src = chrome.runtime.getURL(`popup.html?embed=1&platform=${platform}`);
  f.title = 'Telly picks';
  f.allow = '';
  panel.appendChild(f);
  wrap.appendChild(panel);
}

function closePanel() {
  panel?.remove();
  panel = null;
}

/** A message beside the Telly button. 'done' is green and stays until closed. */
function say(text: string, kind: 'tip' | 'toast' | 'done' = 'toast', ms = 4500) {
  const wrap = root?.querySelector('.wrap');
  if (!wrap || panel) return;
  if (kind === 'tip' && wrap.querySelector('.toast, .done')) return; // never cover a sync message
  wrap.querySelector('.tip, .toast, .done')?.remove();
  const el = document.createElement('div');
  el.className = kind;
  el.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);
  wrap.appendChild(el);
  if (kind === 'done') {
    const x = document.createElement('button');
    x.textContent = '×';
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => el.remove();
    el.appendChild(x);
  } else setTimeout(() => el.remove(), ms);
}

async function maybeTip(_wrap: HTMLElement) {
  if (forcedSync) return;
  const today = new Date().toDateString();
  const { lastTip } = await chrome.storage.local.get('lastTip');
  if (lastTip === today) return;
  await chrome.storage.local.set({ lastTip: today });
  setTimeout(() => say("Stuck? Ask Telly.", 'tip', 5000), 2500);
}

/** Hide during full-screen / player pages so Telly never covers video controls. */
function keepOutOfTheWay() {
  const check = () => {
    if (!host) return;
    // a video filling the window = the player (not the autoplaying billboard on browse pages)
    const player = [...document.querySelectorAll('video')].some((v) => {
      const r = v.getBoundingClientRect();
      return !v.paused && r.width > innerWidth * 0.9 && r.height > innerHeight * 0.8;
    });
    const onPlayer = !!document.fullscreenElement || /\/watch\//.test(location.pathname) || player;
    host.style.display = onPlayer && !panel ? 'none' : '';
  };
  setInterval(check, 1500);
  document.addEventListener('fullscreenchange', check);
}

// Messages from the panel iframe (the swipe deck).
window.addEventListener('message', (e) => {
  if (e.origin !== EXT_ORIGIN || !e.data?.tonight) return;
  if (e.data.tonight === 'navigate' && typeof e.data.url === 'string') {
    const url = new URL(e.data.url);
    if (url.protocol === 'https:') location.href = url.toString();
  }
  if (e.data.tonight === 'open-app') {
    chrome.runtime.sendMessage({ type: 'open-app', hash: e.data.hash || '' });
    closePanel();
  }
});

// ---------------- Netflix history ----------------

let nfProfileKey: string | null = null;

function initNetflix() {
  let gotProfile = false;
  if (forcedSync) {
    setTimeout(() => say('Telly is syncing your Netflix history. Please wait…', 'toast', 9000), 600);
    setTimeout(() => {
      if (!gotProfile) say("Telly can't tell which Netflix profile this is. Pick your profile on Netflix's home page, then try Sync again.", 'toast', 10000);
    }, 9000);
  }
  window.addEventListener('message', async (e) => {
    if (e.source !== window || e.data?.source !== 'tonight-nf') return;
    const d = e.data;
    if (d.type === 'progress' && forcedSync) say(`Syncing ${d.count} titles, please wait…`, 'toast', 8000);
    if (d.type === 'profile') {
      gotProfile = true;
      const prof = await upsertProfile('netflix', d.id, d.name);
      nfProfileKey = prof.key;
      if (!prof.confirmed) say(`New profile "${prof.name}". Telly keeps it separate from yours. Mark it as yours in Settings if it is.`, 'toast', 9000);
      const r = await chrome.runtime.sendMessage({ type: 'needs-sync', platform: 'netflix', profileKey: prof.key, forced: forcedSync });
      if (r?.sync) window.postMessage({ source: 'tonight-cs', type: 'sync' }, location.origin);
    }
    if (d.type === 'history') {
      const prof = await upsertProfile('netflix', d.profile.id, d.profile.name);
      const events: WatchEvent[] = (d.items as { title: string; seriesTitle: string | null; date: number | null; progress: number | null }[])
        .filter((i) => i.title && i.date)
        .map((i) => ({
          platform: 'netflix',
          profileKey: prof.key,
          rawTitle: i.seriesTitle ? `${i.seriesTitle}: ${i.title}` : i.title,
          seriesTitle: i.seriesTitle,
          date: i.date!,
          progress: i.progress,
          source: 'history',
        }));
      const added = await addEvents(prof.key, events, true);
      if (forcedSync) {
        const whose = prof.isMe ? '' : ` (kept separate: "${prof.name}" isn't marked as yours)`;
        say(`Synced ${events.length} titles${added ? `, ${added} new` : ''}${whose} ✓ You can close this tab now.`, 'done');
      } else if (added > 0) say(`Telly learned ${added} new views ✓`);
    }
    if (d.type === 'error' && forcedSync) say(`Couldn't read Netflix history (${d.message}). Use "Download all" at the bottom of this page, then Import CSV in Telly's Settings.`, 'toast', 9000);
  });
  window.postMessage({ source: 'tonight-cs', type: 'hello' }, location.origin);
}

// ---------------- Prime Video watch-history page ----------------

async function initPrime() {
  if (!/watch-history/.test(location.pathname)) return;
  const prof = await upsertProfile('prime', 'default', 'Prime Video');
  const r = await chrome.runtime.sendMessage({ type: 'needs-sync', platform: 'prime', profileKey: prof.key, forced: forcedSync });
  if (!r?.sync) return;
  // the list renders late; give it a few tries
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise((res) => setTimeout(res, 1500));
    const entries = readPrimeHistory(document.body);
    if (!entries.length) continue;
    const events: WatchEvent[] = entries.map((x) => ({ platform: 'prime', profileKey: prof.key, rawTitle: x.title, date: x.date, source: 'history' }));
    const added = await addEvents(prof.key, events, true);
    if (forcedSync) say(`Synced ${entries.length} titles${added ? `, ${added} new` : ''} ✓ You can close this tab now.`, 'done');
    else if (added) say(`Telly learned ${added} new Prime views ✓`);
    return;
  }
  if (forcedSync) say("Couldn't find titles on this page yet. Scroll the list, then reload.", 'toast', 7000);
}

// ---------------- learn while watching (no history page) ----------------

function initPassive(platform: PlatformId) {
  let seconds = 0;
  let loggedFor = '';
  setInterval(async () => {
    const playing = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.muted && v.readyState > 2);
    if (!playing) return;
    seconds += 5;
    const meta = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    const title = cleanPageTitle(meta || document.title);
    if (!title || title === loggedFor || seconds < 120) return;
    loggedFor = title;
    seconds = 0;
    const prof = await upsertProfile(platform, 'default', `${PLATFORM_BY_ID[platform].short} (this browser)`);
    await addEvents(prof.key, [{ platform, profileKey: prof.key, rawTitle: title, date: Date.now(), source: 'passive' }]);
  }, 5000);
}

// ---------------- Netflix playback: how far you actually got ----------------
// Netflix's history page says what you played, not for how long. So while you watch, Telly notes the
// title and how far into it you got, and remembers only that (a title you quit early counts against it).

function initNetflixPlayback() {
  type Cur = { path: string; title: string; series: string | null; max: number; dur: number; played: number };
  let cur: Cur | null = null;
  let last = Date.now();

  const readTitle = (): { title: string; series: string | null } | null => {
    const el = document.querySelector('[data-uia="video-title"]');
    if (!el) return null;
    const series = el.querySelector('h4')?.textContent?.trim() || null;
    if (series) {
      const parts = [...el.querySelectorAll('span')].map((s) => s.textContent?.trim() ?? '').filter(Boolean);
      return { series, title: [series, ...parts].join(': ') };
    }
    const t = el.textContent?.trim();
    return t ? { series: null, title: t } : null;
  };

  async function flush() {
    const c = cur;
    cur = null;
    if (!c || !nfProfileKey || c.played < 60 || !c.dur) return; // under a minute of play: ignore
    const progress = Math.min(1, c.max / c.dur);
    await addEvents(nfProfileKey, [
      { platform: 'netflix', profileKey: nfProfileKey, rawTitle: c.title, seriesTitle: c.series, date: Date.now(), progress, source: 'passive' },
    ]);
  }

  setInterval(() => {
    try {
      if (!/^\/watch\//.test(location.pathname)) {
        if (cur) void flush();
        return;
      }
      const v = document.querySelector('video');
      if (!v) return;
      if (cur && cur.path !== location.pathname) void flush();
      if (!cur) {
        const t = readTitle();
        if (!t) return;
        cur = { path: location.pathname, ...t, max: 0, dur: 0, played: 0 };
      }
      const now = Date.now();
      if (!v.paused && v.readyState > 2) cur.played += Math.min(5, (now - last) / 1000);
      last = now;
      if (v.duration && Number.isFinite(v.duration)) cur.dur = v.duration;
      cur.max = Math.max(cur.max, v.currentTime);
    } catch {
      /* the player page changed shape; never let this break the page */
    }
  }, 2000);
  document.addEventListener('visibilitychange', () => document.hidden && void flush());
  window.addEventListener('pagehide', () => void flush());
}

// ---------------- boot ----------------

(async () => {
  if (!info) return;
  const s = await getSettings();
  if (!s.platforms[info.id] && !forcedSync) return; // user turned this platform off
  if (s.cornerButton || forcedSync) mountButton(info.id);
  if (info.id === 'netflix') {
    initNetflix();
    if (s.passiveLogging) initNetflixPlayback();
  }
  else if (info.id === 'prime') initPrime();
  else if (s.passiveLogging) initPassive(info.id);
})();
