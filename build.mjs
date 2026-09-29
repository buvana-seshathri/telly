// Build the extension into dist/ (load it via chrome://extensions → Load unpacked → dist).
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const out = 'dist';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// static files: manifest, html, css, catalog, icons
cpSync('static', out, { recursive: true });
mkdirSync(`${out}/fonts`, { recursive: true });
cpSync('node_modules/@fontsource-variable/fredoka/files/fredoka-latin-wght-normal.woff2', `${out}/fonts/fredoka.woff2`);
cpSync('node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2', `${out}/fonts/nunito.woff2`);
// onnxruntime wasm for the optional MiniLM embedder (vibe search with a MiniLM catalog)
const ort = 'node_modules/onnxruntime-web/dist';
if (existsSync(ort)) {
  mkdirSync(`${out}/ort`, { recursive: true });
  // the transformers.js build asks for the "asyncify" flavour; the plain one is kept as a fallback
  for (const f of ['ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
    if (existsSync(`${ort}/${f}`)) cpSync(`${ort}/${f}`, `${out}/ort/${f}`);
  }
}

const common = {
  bundle: true,
  target: 'chrome114',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': watch ? '"development"' : '"production"' },
};

const pages = {
  ...common,
  entryPoints: { popup: 'src/popup/main.tsx', app: 'src/app/main.tsx', sw: 'src/background/sw.ts' },
  outdir: out,
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
};

const content = {
  ...common,
  entryPoints: { corner: 'src/content/corner.ts', 'netflix-main': 'src/content/netflix-main.ts' },
  outdir: out,
  format: 'iife',
};

if (watch) {
  const a = await esbuild.context(pages);
  const b = await esbuild.context(content);
  await Promise.all([a.watch(), b.watch()]);
} else {
  await Promise.all([esbuild.build(pages), esbuild.build(content)]);
}
