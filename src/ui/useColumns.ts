import { useEffect, useRef, useState } from 'preact/hooks';

/** How many columns a CSS grid currently has (follows window resizes). */
export function useGridColumns<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [cols, setCols] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const n = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      if (n > 0) setCols(n);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return [ref, cols] as const;
}

/** Trim a list to whole rows (at least one row, even if short). */
export function fullRows<T>(list: T[], cols: number): T[] {
  if (list.length <= cols) return list;
  return list.slice(0, Math.floor(list.length / cols) * cols);
}
