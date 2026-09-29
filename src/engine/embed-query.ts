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

export async function embedQuery(cat: Catalog, text: string): Promise<Float32Array> {
  if (cat.meta.embedder === HASH_EMBEDDER) return hashEmbedQuery(text);
  if (cat.meta.embedder === 'minilm-l6-v2') {
    minilm ??= loadMiniLM();
    const extract = await minilm;
    const out = await extract(text, { pooling: 'mean', normalize: true });
    return new Float32Array(out.data);
  }
  throw new Error(`Unknown embedder ${cat.meta.embedder}`);
}
