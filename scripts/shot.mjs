// Dev helper: screenshot extension pages in preview mode (served over http, demo data).
// usage: node scripts/shot.mjs <page> <out.png> [width] [height] [actions-json]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/home/claude/.npm-global/lib/node_modules/playwright'); }
const [page, outFile, w = '380', h = '600', actions = '[]'] = process.argv.slice(2);
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: 'reduce' });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(`http://localhost:8765/${page}`);
await p.waitForTimeout(900);
for (const a of JSON.parse(actions)) {
  if (a.click) await p.click(a.click);
  if (a.fill) await p.fill(a.fill[0], a.fill[1]);
  if (a.key) await p.keyboard.press(a.key);
  if (a.eval) await p.evaluate(a.eval);
  if (a.drag) { const b = await p.locator(a.drag[0]).boundingBox(); await p.mouse.move(b.x + b.width/2, b.y + b.height/2); await p.mouse.down(); await p.mouse.move(b.x + b.width/2 + a.drag[1], b.y + b.height/2 + 8, { steps: 6 }); }
  if (a.wait) await p.waitForTimeout(a.wait);
}
await p.waitForTimeout(400);
await p.screenshot({ path: outFile, fullPage: +h > 1200 ? false : false });
await browser.close();
