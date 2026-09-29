// Telly — the extension's mascot: a tiny TV with antennae.
export type TellyMood = 'happy' | 'wow' | 'sleepy' | 'wink';

interface Props {
  size?: number;
  mood?: TellyMood;
  title?: string;
  class?: string;
}

export function Telly({ size = 48, mood = 'happy', title, class: cls }: Props) {
  return (
    <svg
      class={cls}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M60 38 L44 16" stroke="#C9D6FF" stroke-width="3.5" stroke-linecap="round" />
      <path d="M60 38 L78 14" stroke="#C9D6FF" stroke-width="3.5" stroke-linecap="round" />
      <circle class="telly-antenna-ball" cx="44" cy="16" r="4.5" fill="#FF7AA8" />
      <circle class="telly-antenna-ball" cx="78" cy="14" r="4.5" fill="#6FE3F0" />
      <rect x="18" y="36" width="84" height="66" rx="18" fill="#8FB0FF" />
      <rect x="28" y="46" width="64" height="46" rx="12" fill="#1A1C30" />
      <Face mood={mood} />
      <ellipse cx="40" cy="77" rx="4.5" ry="2.6" fill="#FF7AA8" opacity="0.85" />
      <ellipse cx="80" cy="77" rx="4.5" ry="2.6" fill="#FF7AA8" opacity="0.85" />
      <rect x="36" y="101" width="9" height="8" rx="3" fill="#6E8FE0" />
      <rect x="75" y="101" width="9" height="8" rx="3" fill="#6E8FE0" />
    </svg>
  );
}

function Face({ mood }: { mood: TellyMood }) {
  if (mood === 'sleepy') {
    return (
      <g stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" fill="none">
        <path d="M44 66 Q49 70 54 66" />
        <path d="M66 66 Q71 70 76 66" />
        <path d="M56 79 Q60 81 64 79" />
      </g>
    );
  }
  if (mood === 'wow') {
    return (
      <g>
        <g class="telly-eyes">
          <circle cx="49" cy="64" r="5" fill="#FFFFFF" />
          <circle cx="71" cy="64" r="5" fill="#FFFFFF" />
        </g>
        <ellipse cx="60" cy="79" rx="4" ry="5" fill="#FFFFFF" />
      </g>
    );
  }
  if (mood === 'wink') {
    return (
      <g>
        <circle cx="49" cy="66" r="4.5" fill="#FFFFFF" />
        <path d="M66 66 Q71 62 76 66" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" fill="none" />
        <path d="M53 76 Q60 84 67 76" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" fill="none" />
      </g>
    );
  }
  return (
    <g>
      <g class="telly-eyes">
        <circle cx="49" cy="66" r="4.5" fill="#FFFFFF" />
        <circle cx="71" cy="66" r="4.5" fill="#FFFFFF" />
      </g>
      <path d="M54 76 Q60 82 66 76" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" fill="none" />
    </g>
  );
}

/** Same drawing as a string, for the content-script corner button (no Preact there). */
export const TELLY_SVG = `<svg width="100%" height="100%" viewBox="0 0 120 120" aria-hidden="true"><path d="M60 38 L44 16" stroke="#C9D6FF" stroke-width="5" stroke-linecap="round"/><path d="M60 38 L78 14" stroke="#C9D6FF" stroke-width="5" stroke-linecap="round"/><circle cx="44" cy="16" r="6" fill="#FF7AA8"/><circle cx="78" cy="14" r="6" fill="#6FE3F0"/><rect x="18" y="36" width="84" height="66" rx="18" fill="#8FB0FF"/><rect x="28" y="46" width="64" height="46" rx="12" fill="#1A1C30"/><g class="eyes"><circle cx="49" cy="66" r="6" fill="#fff"/><circle cx="71" cy="66" r="6" fill="#fff"/></g><path d="M53 77 Q60 84 67 77" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none"/><rect x="36" y="101" width="9" height="8" rx="3" fill="#6E8FE0"/><rect x="75" y="101" width="9" height="8" rx="3" fill="#6E8FE0"/></svg>`;
