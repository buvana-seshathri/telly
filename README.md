# Telly

Telly is a browser extension that picks what to watch across your streaming platforms. It gives a reason for every pick, and your history never leaves your browser.

## Try it

```
npm install
npm run build        # outputs dist/
```

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click **Load unpacked** and select `dist`.

When it's loaded:

- Click the toolbar icon to open the full page.
- On Netflix, Prime Video, Hulu, Disney+, Max and the other supported sites, Telly shows up in the bottom-right corner. Click it to open the swipe deck.

## How it works

| Part | Where |
|---|---|
| Reading history | Netflix: `src/content/netflix-main.ts` (viewing activity) + CSV import. Prime: `src/platforms/prime-dom.ts`. Other platforms: passive logging in `src/content/corner.ts` |
| Title matching | `src/engine/match.ts` |
| Taste profile (binges, recency, swipes) | `src/engine/profile.ts` |
| Ranking (similarity, affinities, quality, diversity via MMR) | `src/engine/recommend.ts` |
| Explanations, built from real evidence | `src/engine/explain.ts` |
| Mood search | `src/engine/vibe.ts`, `embed-query.ts` |
| Optional LLM re-rank (bring your own key) | `src/engine/llm.ts` |
| Catalog pipeline (TMDB → embeddings), weekly | `scripts/build-catalog.ts`, `.github/workflows/catalog.yml` |

The built-in catalog is a hand-written sample of 89 titles. Its platform availability is illustrative, not real. For real data, set up the weekly workflow and paste its URL into Settings → Catalog.

## Checks

```
npm test             # engine, importers, LLM guardrails
npm run typecheck
node scripts/e2e.mjs # loads the extension in Chromium against a mocked Netflix
```
