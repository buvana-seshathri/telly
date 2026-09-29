// Render Telly into the extension's PNG icons.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let sharp; try { sharp = require('sharp'); } catch { sharp = require('/home/claude/.npm-global/lib/node_modules/sharp'); }
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><path d="M60 38 L44 16" stroke="#C9D6FF" stroke-width="5" stroke-linecap="round"/><path d="M60 38 L78 14" stroke="#C9D6FF" stroke-width="5" stroke-linecap="round"/><circle cx="44" cy="16" r="7" fill="#FF7AA8"/><circle cx="78" cy="14" r="7" fill="#6FE3F0"/><rect x="14" y="34" width="92" height="72" rx="20" fill="#8FB0FF"/><rect x="25" y="45" width="70" height="50" rx="13" fill="#1A1C30"/><circle cx="48" cy="66" r="7" fill="#fff"/><circle cx="72" cy="66" r="7" fill="#fff"/><path d="M52 78 Q60 86 68 78" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`;
for (const s of [16, 32, 48, 128]) await sharp(Buffer.from(svg), { density: 600 }).resize(s, s).png().toFile(`static/icons/icon-${s}.png`);
console.log('icons ok');
