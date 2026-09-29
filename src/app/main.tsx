import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { APP_NAME } from '../shared/brand';
import { useEngine } from '../ui/useEngine';
import { Telly } from '../ui/Telly';
import { Home } from './Home';
import { Saved } from './Saved';
import { SettingsPage } from './Settings';
import { Welcome } from './Welcome';

document.title = APP_NAME;

function useRoute() {
  const get = () => location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(get());
  useEffect(() => {
    const on = () => {
      setRoute(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

const icons = {
  saved: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12v17l-6-4-6 4z" /></svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
  ),
};

function App() {
  const engine = useEngine();
  const route = useRoute();

  useEffect(() => {
    if (engine.settings && !engine.settings.onboarded && route === '/') location.hash = '/welcome';
  }, [engine.settings?.onboarded]);

  if (engine.error) return <main class="page"><p>Something went wrong: {engine.error}</p></main>;
  if (!engine.settings) return null;

  return (
    <>
      <header class="topbar">
        <a class="logo" href="#/">
          <Telly size={34} />
          <span>{APP_NAME}</span>
        </a>
        {route !== '/welcome' && (
          <nav aria-label="Main">
            <a class={'icon-btn' + (route === '/saved' ? ' active' : '')} href="#/saved" aria-label="Saved" title="Saved">{icons.saved}</a>
            <a class={'icon-btn' + (route === '/settings' ? ' active' : '')} href="#/settings" aria-label="Settings" title="Settings">{icons.settings}</a>
          </nav>
        )}
      </header>
      <main class="page">
        {route === '/' && <Home engine={engine} />}
        {route === '/saved' && <Saved engine={engine} />}
        {route === '/settings' && <SettingsPage engine={engine} />}
        {route === '/welcome' && <Welcome engine={engine} />}
      </main>
    </>
  );
}

render(<App />, document.getElementById('root')!);
