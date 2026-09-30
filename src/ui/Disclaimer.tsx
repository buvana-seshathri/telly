import type { ComponentChildren } from 'preact';

/** A small "Good to know" link that opens a short note. Keeps pages calm; details on request. */
export function Disclaimer({ label = 'Good to know', children }: { label?: string; children: ComponentChildren }) {
  return (
    <details class="disclaimer">
      <summary>{label}</summary>
      <div class="disclaimer-body">{children}</div>
    </details>
  );
}
