// End-to-end check: load the built extension in Chromium, fake netflix.com (routes are
// intercepted, nothing reaches Netflix), and verify: profile detection, history sync via the
// MAIN-world script, the corner Telly, the swipe panel, and the full page with synced data.
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const ext = resolve('dist');
const out = process.argv[2] || 'shots';
const ctx = await pw.chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'tonight-')), {
  channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
console.log('extension id', id);

const DAY = 864e5, now = Date.now();
const items = [];
const ep = (series, n, daysAgo, perDay) => { for (let i = 0; i < n; i++) items.push({ title: `Episode ${i + 1}`, seriesTitle: series, date: now - (daysAgo - Math.floor(i / perDay)) * DAY, bookmark: 3000, duration: 3200 }); };
ep('Dark', 9, 10, 4); ep('Mindhunter', 6, 25, 2); ep('Stranger Things', 8, 150, 3); ep('BoJack Horseman', 4, 50, 2);
items.push({ title: 'Whiplash', date: now - 40 * DAY, bookmark: 6000, duration: 6400 });
items.push({ title: 'The Social Network', date: now - 60 * DAY, bookmark: 7000, duration: 7200 });
items.push({ title: 'Some Title Not In Catalog', date: now - 5 * DAY });
let apiHits = 0;
await ctx.route('https://www.netflix.com/**', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/api/shakti/v123/viewingactivity')) {
    apiHits++;
    const pg = +url.searchParams.get('pg');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ viewedItems: pg === 0 ? items : [] }) });
  }
  return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><title>Netflix</title><style>body{margin:0;background:#141414;color:#fff;font-family:sans-serif}.row{display:flex;gap:8px;padding:0 48px}.tile{width:220px;height:124px;border-radius:4px;background:#2a2a2a}.bill{height:420px;background:linear-gradient(90deg,#141414 30%,#3a2b2b);padding:120px 48px;box-sizing:border-box}</style>
  <script>window.netflix={reactContext:{models:{userInfo:{data:{guid:'PROFILE123',name:'Buvana'}},serverDefs:{data:{BUILD_IDENTIFIER:'v123'}}}}}</script></head>
  <body><div class="bill"><h1 style="font-size:48px;margin:0">Mock streaming home</h1><p>(test page standing in for netflix.com)</p></div><h3 style="padding:0 48px">Trending now</h3><div class="row">${'<div class="tile"></div>'.repeat(6)}</div><h3 style="padding:0 48px">Because you watched Dark</h3><div class="row">${'<div class="tile"></div>'.repeat(6)}</div></body></html>` });
});

const page = await ctx.newPage();
await page.goto('https://www.netflix.com/browse');
await page.waitForTimeout(3500);
const stored = await sw.evaluate(async () => {
  const all = await chrome.storage.local.get(null);
  return { profiles: all.profiles, events: Object.entries(all).filter(([k]) => k.startsWith('events:')).map(([k, v]) => [k, v.length]) };
});
console.log('api hits', apiHits, JSON.stringify(stored));
await page.screenshot({ path: `${out}/e2e-netflix-corner.png` });
await page.locator('tonight-telly').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
// closed shadow root: click by coordinates at the button location
await page.mouse.click(1280 - 22 - 29, 800 - 22 - 29);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/e2e-netflix-panel.png` });

// second visit should not re-sync (every-visit => at most every 6h)
const before = apiHits;
await page.reload(); await page.waitForTimeout(2500);
console.log('re-sync on reload?', apiHits > before);

const app = await ctx.newPage();
await app.goto(`chrome-extension://${id}/app.html`);
await app.evaluate(async () => { const s = (await chrome.storage.local.get('settings')).settings || {}; await chrome.storage.local.set({ settings: { ...s, onboarded: true } }); });
await app.goto(`chrome-extension://${id}/app.html#/`);
await app.waitForTimeout(1500);
await app.screenshot({ path: `${out}/e2e-app-home.png` });
await app.goto(`chrome-extension://${id}/app.html#/settings`);
await app.waitForTimeout(1200);
await app.screenshot({ path: `${out}/e2e-settings.png`, fullPage: true });
const errs = [];
app.on('pageerror', (e) => errs.push(e.message));
await ctx.close();
console.log('page errors', errs);
