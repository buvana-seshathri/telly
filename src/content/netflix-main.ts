// Runs in Netflix's own page context (MAIN world) so it can read the signed-in profile and
// call Netflix's viewing-activity endpoint with the user's existing session. It only talks
// to the extension's content script via window.postMessage and sends nothing anywhere else.
// Netflix has no public API, so this is best-effort: if it breaks, CSV import still works.

import { parseLooseDate } from '../platforms/netflix-csv';

interface NfItem {
  title?: string;
  seriesTitle?: string;
  videoTitle?: string;
  date?: number;
  bookmark?: number;
  duration?: number;
}

type RC = {
  models?: {
    userInfo?: { data?: { guid?: string; userGuid?: string; name?: string; profileName?: string } };
    serverDefs?: { data?: { BUILD_IDENTIFIER?: string; API_ROOT?: string } };
  };
};

function ctx(): RC | undefined {
  return (window as unknown as { netflix?: { reactContext?: RC } }).netflix?.reactContext;
}

function profile(): { id: string; name: string } | null {
  const u = ctx()?.models?.userInfo?.data;
  const id = u?.guid ?? u?.userGuid;
  if (!id) return null;
  return { id, name: u?.name ?? u?.profileName ?? 'Netflix profile' };
}

const post = (msg: Record<string, unknown>) => window.postMessage({ source: 'tonight-nf', ...msg }, location.origin);

/** Netflix has changed this endpoint's path before, so try the known shapes in turn. */
function apiBases(): string[] {
  const build = ctx()?.models?.serverDefs?.data?.BUILD_IDENTIFIER;
  return ['/api/shakti/mre/viewingactivity', ...(build ? [`/api/shakti/${build}/viewingactivity`] : [])];
}

async function fetchViaApi(maxPages = 40): Promise<NfItem[]> {
  const codes: number[] = [];
  for (const base of apiBases()) {
    const items: NfItem[] = [];
    let ok = true;
    for (let pg = 0; pg < maxPages; pg++) {
      const res = await fetch(`${base}?pg=${pg}&pgSize=100`, { credentials: 'include' });
      if (!res.ok) {
        if (pg === 0) codes.push(res.status);
        ok = pg > 0;
        break;
      }
      const j = (await res.json().catch(() => ({}))) as { viewedItems?: NfItem[] };
      const page = j.viewedItems ?? [];
      items.push(...page);
      if (page.length < 100) break;
      await new Promise((r) => setTimeout(r, 250)); // be gentle
    }
    if (ok && items.length) return items;
  }
  throw new Error(`Netflix returned ${codes.join('/') || 'no data'}`);
}

/** Fallback: read the rows of the viewing-activity page itself (only works while it is open). */
async function readActivityPage(): Promise<NfItem[]> {
  if (!/^\/viewingactivity/.test(location.pathname)) throw new Error('Open the Viewing activity page to read it');
  const rows = () => document.querySelectorAll('.retableRow');
  const more = () => [...document.querySelectorAll('button')].find((b) => /^show more$/i.test(b.textContent?.trim() ?? ''));
  // Recent history is what matters, so stop at ~1,500 rows or ~75 seconds and use what we have.
  const started = Date.now();
  for (let i = 0; i < 120; i++) {
    const btn = more();
    if (!btn || rows().length >= 1500 || Date.now() - started > 75_000) break;
    const before = rows().length;
    btn.click();
    for (let w = 0; w < 12 && rows().length === before && more(); w++) await new Promise((r) => setTimeout(r, 250));
    post({ type: 'progress', count: rows().length });
  }
  const raw = [...rows()].map((row) => ({
    title: (row.querySelector('.title')?.textContent ?? '').replace(/[“”"]/g, '').trim(),
    date: (row.querySelector('.date')?.textContent ?? '').trim(),
  }));
  const dayFirst = raw.some((r) => /^\d{1,2}\//.test(r.date) && +r.date.split('/')[0] > 12);
  const items: NfItem[] = raw
    .map((r) => ({ title: r.title, date: parseLooseDate(r.date, dayFirst) ?? undefined }))
    .filter((r) => r.title && r.date);
  if (!items.length) throw new Error('Could not read the rows on this page');
  return items;
}

async function fetchHistory(): Promise<NfItem[]> {
  try {
    return await fetchViaApi();
  } catch (apiErr) {
    try {
      return await readActivityPage();
    } catch {
      throw apiErr;
    }
  }
}

function announce() {
  const p = profile();
  if (p) post({ type: 'profile', ...p });
}

let syncing = false;
window.addEventListener('message', async (e) => {
  if (e.source !== window || e.data?.source !== 'tonight-cs') return;
  if (e.data.type === 'hello') announce();
  if (e.data.type === 'sync') {
    if (syncing) return;
    syncing = true;
    const p = profile();
    try {
      if (!p) throw new Error('No Netflix profile selected yet');
      const items = await fetchHistory();
      post({
        type: 'history',
        profile: p,
        items: items.map((i) => ({
          title: i.title ?? i.videoTitle ?? '',
          seriesTitle: i.seriesTitle ?? null,
          date: i.date ?? null,
          progress: i.bookmark && i.duration ? Math.min(1, i.bookmark / i.duration) : null,
        })),
      });
    } catch (err) {
      console.info('[telly] history read failed:', (err as Error).message);
      post({ type: 'error', message: (err as Error).message });
    } finally {
      syncing = false;
    }
  }
});

// Netflix fills in its profile info a moment after load; keep looking for a few seconds.
announce();
let tries = 0;
const poll = setInterval(() => {
  if (profile()) {
    announce();
    clearInterval(poll);
  } else if (++tries > 20) clearInterval(poll);
}, 500);
