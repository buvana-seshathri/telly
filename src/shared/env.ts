// Small environment layer so the same pages run as a real extension and as a plain
// web page (for design previews/screenshots), where chrome.* APIs are missing.

export const IS_EXTENSION = typeof chrome !== 'undefined' && !!chrome.runtime?.id && !!chrome.storage?.local;

export function assetUrl(path: string): string {
  return IS_EXTENSION ? chrome.runtime.getURL(path) : new URL(path, location.href).toString();
}

// ---- key/value storage (chrome.storage.local, or localStorage in preview) ----

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  if (IS_EXTENSION) {
    const r = await chrome.storage.local.get(key);
    return (r[key] as T | undefined) ?? fallback;
  }
  try {
    const raw = localStorage.getItem('tonight:' + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (IS_EXTENSION) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  try {
    localStorage.setItem('tonight:' + key, JSON.stringify(value));
  } catch {
    /* preview only */
  }
  window.dispatchEvent(new CustomEvent('tonight-kv', { detail: key }));
}

export async function kvRemoveAll(): Promise<void> {
  if (IS_EXTENSION) {
    await chrome.storage.local.clear();
    return;
  }
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('tonight:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export async function kvAll(): Promise<Record<string, unknown>> {
  if (IS_EXTENSION) return chrome.storage.local.get(null);
  const out: Record<string, unknown> = {};
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('tonight:')) out[k.slice(8)] = JSON.parse(localStorage.getItem(k) || 'null');
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function onKvChange(cb: (keys: string[]) => void): () => void {
  if (IS_EXTENSION) {
    const h = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local') cb(Object.keys(changes));
    };
    chrome.storage.onChanged.addListener(h);
    return () => chrome.storage.onChanged.removeListener(h);
  }
  const h = (e: Event) => cb([(e as CustomEvent<string>).detail]);
  window.addEventListener('tonight-kv', h);
  return () => window.removeEventListener('tonight-kv', h);
}

// ---- IndexedDB for large blobs (the catalog) ----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tonight', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('blobs');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction('blobs').objectStore('blobs').get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClear(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function openUrl(url: string) {
  if (IS_EXTENSION && chrome.tabs) chrome.tabs.create({ url });
  else window.open(url, '_blank', 'noopener');
}
