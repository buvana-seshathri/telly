// Netflix "Download all" viewing activity CSV → WatchEvents.
// The file looks like:  Title,Date\n"Dark: Season 1: Secrets","9/14/26"\n...
import type { WatchEvent } from '../shared/types';

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Accepts M/D/YY, M/D/YYYY, D.M.YY, YYYY-MM-DD. `dayFirst` flips ambiguous slash dates. */
export function parseLooseDate(s: string, dayFirst = false): number | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
  m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (m) {
    let a = +m[1];
    let b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (t.includes('.') || dayFirst || a > 12) [a, b] = [b, a]; // → month, day
    if (a < 1 || a > 12 || b < 1 || b > 31) return null;
    return Date.UTC(y, a - 1, b, 12);
  }
  const d = Date.parse(t);
  return Number.isNaN(d) ? null : d;
}

export function parseNetflixCsv(text: string, profileKey: string): WatchEvent[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const ti = header.indexOf('title');
  const di = header.indexOf('date');
  if (ti < 0 || di < 0) throw new Error('This does not look like a Netflix viewing activity file (needs Title and Date columns).');
  const rows = lines.slice(1).map(parseCsvLine);
  // If any slash date has a first part > 12, the file is day-first.
  const dayFirst = rows.some((r) => {
    const m = r[di]?.match(/^(\d{1,2})\//);
    return m ? +m[1] > 12 : false;
  });
  const out: WatchEvent[] = [];
  for (const r of rows) {
    const title = r[ti]?.trim();
    const date = r[di] ? parseLooseDate(r[di], dayFirst) : null;
    if (!title || date == null) continue;
    out.push({ platform: 'netflix', profileKey, rawTitle: title, date, source: 'csv' });
  }
  return out;
}
