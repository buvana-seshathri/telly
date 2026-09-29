// Service worker: opens pages, and decides when a platform's history is due for a refresh.
import { getProfiles, getSettings } from '../shared/store';
import type { PlatformId } from '../shared/types';

const EVERY_VISIT_MIN_GAP = 6 * 3600 * 1000;
const DAILY = 24 * 3600 * 1000;

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('app.html#/welcome') });
});

// Toolbar icon → full page.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});

type Msg =
  | { type: 'open-app'; hash?: string }
  | { type: 'needs-sync'; platform: PlatformId; profileKey: string; forced?: boolean };

chrome.runtime.onMessage.addListener((msg: Msg, _sender, reply) => {
  if (msg.type === 'open-app') {
    chrome.tabs.create({ url: chrome.runtime.getURL('app.html' + (msg.hash ? '#' + msg.hash : '')) });
    return false;
  }
  if (msg.type === 'needs-sync') {
    (async () => {
      const s = await getSettings();
      if (!s.platforms[msg.platform] && !msg.forced) return reply({ sync: false });
      const p = (await getProfiles()).find((x) => x.key === msg.profileKey);
      if (msg.forced) return reply({ sync: true });
      if (p && p.isMe === false) return reply({ sync: false }); // never read someone else's profile
      if (s.refresh === 'manual') return reply({ sync: false });
      if (!p?.lastSynced) return reply({ sync: true });
      const age = Date.now() - p.lastSynced;
      const due = s.refresh === 'every-visit' ? age > EVERY_VISIT_MIN_GAP : s.refresh === 'daily' ? age > DAILY : false;
      reply({ sync: due });
    })();
    return true; // async reply
  }
  return false;
});
