import { render } from 'preact';
import type { PlatformId } from '../shared/types';
import { useEngine } from '../ui/useEngine';
import { Deck } from './Deck';

const params = new URLSearchParams(location.search);
const embed = params.get('embed') === '1';
const platform = (params.get('platform') as PlatformId | null) ?? null;
if (embed) document.documentElement.classList.add('embed');

function App() {
  const engine = useEngine();
  if (engine.error) return <div class="empty" style={{ padding: 24 }}>Something went wrong: {engine.error}</div>;
  if (!engine.settings) return null;
  return <Deck engine={engine} embed={embed} currentPlatform={platform} />;
}

render(<App />, document.getElementById('root')!);
