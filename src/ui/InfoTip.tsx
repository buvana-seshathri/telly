import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

/** A small ⓘ button; the explanation only appears when asked for. */
export function InfoTip({ label, children }: { label: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span class="info" ref={ref}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        i
      </button>
      {open && (
        <span class="info-pop" role="tooltip">
          {children}
        </span>
      )}
    </span>
  );
}
