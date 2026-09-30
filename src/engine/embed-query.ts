// Embed a free-text request with the same embedder the catalog was built with.
import type { Catalog } from '../shared/types';
import { HASH_EMBEDDER, hashEmbedQuery } from './embed-hash';

type Extractor = (text: string, opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;
let minilm: Promise<Extractor> | null = null;

async function loadMiniLM(): Promise<Extractor> {
  // Loaded only when the live catalog uses MiniLM. The model (~23 MB) downloads once from
  // Hugging Face and is cached by the browser; the onnxruntime wasm ships inside the extension.
  const t = await import('@huggingface/transformers');
  t.env.allowLocalModels = false;
  const wasm = t.env.backends.onnx.wasm;
  if (wasm) {
    wasm.wasmPaths = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.getURL('ort/') : new URL('ort/', location.href).toString();
    wasm.numThreads = 1;
  }
  const pipe = await t.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8', device: 'wasm' });
  return pipe as unknown as Extractor;
}

/** Start loading the language model in the background (cheap no-op for the bundled sample catalog). */
export function warmEmbedder(cat: Catalog): void {
  if (cat.meta.embedder === 'minilm-l6-v2') {
    minilm ??= loadMiniLM();
    minilm.catch(() => { minilm = null; });
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function embedQuery(cat: Catalog, text: string, timeoutMs = 30000): Promise<Float32Array> {
  if (cat.meta.embedder === HASH_EMBEDDER) return hashEmbedQuery(text);
  if (cat.meta.embedder === 'minilm-l6-v2') {
    minilm ??= loadMiniLM();
    // A model that is still downloading keeps loading in the background; this search just
    // stops waiting for it (the caller falls back to words) instead of hanging silently.
    const extract = await withTimeout(minilm, timeoutMs, 'Loading the language model').catch((e) => {
      if (!/took longer/.test(String(e?.message))) minilm = null; // a real failure: retry next time
      throw e;
    });
    const out = await withTimeout(extract(text, { pooling: 'mean', normalize: true }), 15000, 'Embedding your request');
    return new Float32Array(out.data);
  }
  throw new Error(`Unknown embedder ${cat.meta.embedder}`);
}
