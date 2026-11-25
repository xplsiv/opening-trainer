import { useEffect } from 'react';
import { AppDataProvider } from './data';
import { useRoute } from './router';
import { Home } from './routes/Home';
import { Learn } from './routes/Learn';
import { Quiz } from './routes/Quiz';
import { Setup } from './routes/Setup';
import { Import } from './routes/Import';
import { Settings, SyncStatusText } from './routes/Settings';
import { Analysis } from './routes/Analysis';
import { Review } from './routes/Review';
import { startSync, useSyncStatus } from '../sync/instance';
import { ErrorBoundary } from './components/ErrorBoundary';

const CHIP_ICON: Record<string, string> = {
  disabled: '⚙', 'needs-login': '☁', idle: '✓', syncing: '⟳', offline: '⚡', error: '!',
};

function SyncChip() {
  const s = useSyncStatus();
  return (
    <a className={`btn small ghost sync-chip state-${s.state}`} href="#/settings" aria-label="Settings and sync status">
      <span aria-hidden>{CHIP_ICON[s.state]}</span>
      <span className="chip-text"><SyncStatusText short /></span>
    </a>
  );
}

function Shell() {
  const route = useRoute();
  const [section, id] = route.path;
  let page;
  if (section === 'learn' && id) page = <Learn key={id} openingId={id} />;
  else if (section === 'quiz') page = <Quiz key={route.params.toString()} params={route.params} />;
  else if (section === 'setup') page = <Setup key={route.params.toString()} params={route.params} />;
  else if (section === 'import') page = <Import />;
  else if (section === 'settings') page = <Settings />;
  else if (section === 'analysis' && id === 'review') page = <Review key={route.params.toString()} params={route.params} />;
  else if (section === 'analysis') page = <Analysis />;
  else page = <Home />;
  const inAnalysis = section === 'analysis';

  return (
    <div className="app">
      <header className="topbar">
        <nav className="app-tabs" aria-label="Sections">
          <a href="#/" className={`app-tab ${inAnalysis ? '' : 'on'}`} aria-current={inAnalysis ? undefined : 'page'}>
            <span aria-hidden>♞</span> Openings
          </a>
          <a href="#/analysis" className={`app-tab ${inAnalysis ? 'on' : ''}`} aria-current={inAnalysis ? 'page' : undefined}>
            <span aria-hidden>±</span> Analysis
          </a>
        </nav>
        <nav>
          {!inAnalysis && <a className="btn small ghost" href="#/setup">Quiz setup</a>}
          <SyncChip />
        </nav>
      </header>
      <main>
        <ErrorBoundary key={section ?? 'home'}>{page}</ErrorBoundary>
      </main>
    </div>
  );
}

export function App() {
  useEffect(() => {
    void startSync();
  }, []);
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}
