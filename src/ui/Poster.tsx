import type { CatalogItem } from '../shared/types';

// Colourful stand-ins for the sample catalog (the live catalog uses real TMDB posters).
const PALETTES: [string, string, string][] = [
  ['#E4572E', '#F3A712', '#7A1F12'],
  ['#2A9D8F', '#E9C46A', '#12423D'],
  ['#3D5A80', '#EE6C4D', '#1B2A40'],
  ['#9B5DE5', '#F15BB5', '#3D1D66'],
  ['#118AB2', '#06D6A0', '#073B4C'],
  ['#EF476F', '#FFD166', '#5C1127'],
  ['#6A994E', '#F2E8CF', '#2B3D1F'],
  ['#D1495B', '#EDAE49', '#4A1A21'],
  ['#00798C', '#EDAE49', '#003B44'],
  ['#8338EC', '#FFBE0B', '#2E1257'],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function Poster({ item, height, showTitle = true }: { item: CatalogItem; height: number | string; showTitle?: boolean }) {
  const h = hash(item.title);
  const [a, b, bg] = PALETTES[h % PALETTES.length];
  return (
    <div class="poster" style={{ height, background: bg }}>
      {item.poster ? (
        <img src={item.poster} alt="" loading="lazy" />
      ) : (
        <div class="ph" aria-hidden="true">
          <span class="ph-shape" style={{ background: a, width: '120%', height: '80%', left: `${(h % 40) - 50}%`, top: '-30%' }} />
          <span class="ph-shape" style={{ background: b, width: '70%', height: '55%', right: `${(h % 30) - 30}%`, top: `${20 + (h % 25)}%`, opacity: 0.45 }} />
          {showTitle && <span class="ph-title">{item.title}</span>}
        </div>
      )}
    </div>
  );
}
