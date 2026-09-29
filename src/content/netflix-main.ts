// Runs in Netflix's own page context (MAIN world) so it can read the signed-in profile and
// call Netflix's viewing-activity endpoint with the user's existing session. It only talks
// to the extension's content script via window.postMessage and sends nothing anywhere else.
// Netflix has no public API, so this is best-effort: if it breaks, CSV import still works.

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

async function fetchHistory(maxPages = 40): Promise<NfItem[]> {
  const build = ctx()?.models?.serverDefs?.data?.BUILD_IDENTIFIER;
  if (!build) throw new Error('Could not read Netflix build id');
  const items: NfItem[] = [];
  for (let pg = 0; pg < maxPages; pg++) {
    const res = await fetch(`/api/shakti/${build}/viewingactivity?pg=${pg}&pgSize=100`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Netflix returned ${res.status}`);
    const j = (await res.json()) as { viewedItems?: NfItem[] };
    const page = j.viewedItems ?? [];
    items.push(...page);
    if (page.length < 100) break;
    await new Promise((r) => setTimeout(r, 250)); // be gentle
  }
  return items;
}

function announce() {
  const p = profile();
  if (p) post({ type: 'profile', ...p });
}

window.addEventListener('message', async (e) => {
  if (e.source !== window || e.data?.source !== 'tonight-cs') return;
  if (e.data.type === 'hello') announce();
  if (e.data.type === 'sync') {
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
      post({ type: 'error', message: (err as Error).message });
    }
  }
});

announce();
