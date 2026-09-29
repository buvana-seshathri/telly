// Read Prime Video's Watch History page (primevideo.com/settings/watch-history).
// Amazon has no API for this, so we walk the page in order: date headings set the current
// date, and links to /detail/ pages are the titles watched on that date. Best-effort.

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_RE = new RegExp(`^(?:[A-Z][a-z]+,\\s+)?(${MONTHS})\\s+(\\d{1,2}),\\s+(\\d{4})$`);

export function parseHeadingDate(text: string): number | null {
  const m = text.trim().match(DATE_RE);
  if (!m) return null;
  const month = MONTHS.split('|').indexOf(m[1]);
  return Date.UTC(+m[3], month, +m[2], 12);
}

export interface PrimeEntry {
  title: string;
  date: number;
}

export function readPrimeHistory(root: ParentNode = document): PrimeEntry[] {
  const out: PrimeEntry[] = [];
  const seen = new Set<string>();
  let current: number | null = null;
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const d = parseHeadingDate(n.textContent ?? '');
      if (d != null) current = d;
      continue;
    }
    const el = n as Element;
    if (el.tagName !== 'A' || !/\/detail\//.test(el.getAttribute('href') ?? '')) continue;
    const title = (el.textContent?.trim() || el.querySelector('img')?.getAttribute('alt') || el.getAttribute('aria-label') || '').trim();
    if (!title || title.length > 150 || current == null) continue;
    const key = title + '|' + current;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, date: current });
  }
  return out;
}
