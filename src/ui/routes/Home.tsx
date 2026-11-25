import { useMemo, useState } from 'react';
import { useAppData } from '../data';
import { href } from '../router';
import { cleanSelection, selectionToParams } from '../../engine/selection';
import type { Opening } from '../../engine/types';

type TabId = 'openings' | 'gambits';
const TABS: { id: TabId; label: string }[] = [
  { id: 'openings', label: 'Openings' },
  { id: 'gambits', label: 'Gambits' },
];
const TAB_KEY = 'home-tab';

/** Openings tagged "gambit" (built-in or imported) go to the Gambits tab. */
const tabOf = (o: Opening): TabId => (o.tags.includes('gambit') ? 'gambits' : 'openings');

function readTab(): TabId {
  try {
    return localStorage.getItem(TAB_KEY) === 'gambits' ? 'gambits' : 'openings';
  } catch {
    return 'openings';
  }
}

export function Home() {
  const { openings, counts, loaded, sets, indexes, cardsFor } = useAppData();
  const now = Date.now();
  const rows = useMemo(() => openings.map((o) => ({ o, c: counts(o.id, now) })), [openings, counts, now]);
  const totalDue = rows.reduce((n, r) => n + r.c.due, 0);
  const totalNew = rows.reduce((n, r) => n + r.c.new, 0);
  const allIds = openings.map((o) => o.id).join(',');
  const anything = totalDue + totalNew > 0;
  const [tab, setTab] = useState<TabId>(readTab);
  const selectTab = (t: TabId) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* storage unavailable */ }
  };
  const visible = rows.filter((r) => tabOf(r.o) === tab);
  const tabDue = visible.reduce((n, r) => n + r.c.due, 0);
  const tabNew = visible.reduce((n, r) => n + r.c.new, 0);

  return (
    <div className="page">
      <section className="hero">
        <div className="due-count" aria-live="polite">
          <div><strong>{loaded ? totalDue : '…'}</strong> due today</div>
          <div className="muted small">{totalNew} new positions not started yet</div>
        </div>
        <a className={`btn primary big ${anything ? '' : 'disabled'}`} href={href('quiz', { o: allIds, q: 'due' })} aria-disabled={!anything}>
          {totalDue ? 'Review due' : 'Learn new'}
        </a>
      </section>

      <div className="row-between">
        <h2>Your sets</h2>
        <a className="btn small" href="#/setup">+ New quiz / set</a>
      </div>
      {sets.length === 0 ? (
        <p className="muted small">Save a selection of openings (e.g. “White repertoire”) in Quiz setup to start it from here.</p>
      ) : (
        <ul className="set-list">
          {sets.map((s) => {
            const sel = cleanSelection({ openingIds: s.openingIds, lineFilter: s.lineFilter ?? {} }, indexes);
            let due = 0;
            for (const id of sel.openingIds) for (const c of cardsFor(id, sel.lineFilter[id])) if (c.srs && c.srs.dueAt <= now) due++;
            return (
              <li key={s.id} className="opening-row">
                <div className="opening-info">
                  <div className="opening-name">{s.name}</div>
                  <div className="opening-meta">{sel.openingIds.length} opening{sel.openingIds.length === 1 ? '' : 's'} · {due} due</div>
                </div>
                <div className="opening-actions">
                  <a className="btn" href={href('setup', { set: s.id })} aria-label={`Edit set ${s.name}`}>Edit</a>
                  <a className="btn primary" href={href('quiz', selectionToParams(sel, 'next-move', 'due'))}>Quiz</a>
                  <a className="btn" href={href('quiz', selectionToParams(sel, 'line', 'due'))} aria-label={`Full line recall: ${s.name}`}>Lines</a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="row-between">
        <div className="tabs" role="tablist" aria-label="Opening category">
          {TABS.map((t) => {
            const n = rows.filter((r) => tabOf(r.o) === t.id).length;
            return (
              <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="opening-panel"
                className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => selectTab(t.id)}>
                {t.label} <span className="tab-count">{n}</span>
              </button>
            );
          })}
        </div>
        <a className="btn small" href="#/import">+ Import PGN</a>
      </div>
      {visible.length > 0 && (
        <div className="tab-actions">
          <span className="muted small">{tabDue} due · {tabNew} new</span>
          <a className={`btn small ${tabDue + tabNew > 0 ? '' : 'disabled'}`} href={href('quiz', { o: visible.map((r) => r.o.id).join(','), q: 'due' })}>
            Quiz all {tab === 'gambits' ? 'gambits' : 'openings'}
          </a>
        </div>
      )}
      {tab === 'gambits' && visible.length === 0 && (
        <p className="muted small">No gambits yet. Openings tagged “gambit” appear here.</p>
      )}
      <ul className="opening-list" id="opening-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {visible.map(({ o, c }) => (
          <li key={o.id} className="opening-row">
            <div className="opening-info">
              <div className="opening-name">{o.name}</div>
              <div className="opening-meta">
                <span className={`side-dot ${o.side}`} aria-hidden /> {o.side === 'white' ? 'White' : 'Black'}{o.eco ? ` · ${o.eco}` : ''}
                {o.origin && <> · <span className="origin" title="Invented / named by">{o.origin}</span></>}
                {o.source === 'imported' && <span className="badge">Imported</span>}
              </div>
              <div className="progress-pills">
                <span className="pill new">{c.new} new</span>
                <span className="pill learning">{c.learning} learning</span>
                <span className="pill due">{c.due} due</span>
                <span className="pill learned">{c.learned} learned</span>
              </div>
            </div>
            <div className="opening-actions">
              <a className="btn" href={href(`learn/${o.id}`)}>Learn</a>
              <a className="btn primary" href={href('quiz', { o: o.id, q: 'due' })}>Quiz</a>
              <a className="btn" href={href('quiz', { o: o.id, q: 'due', m: 'line' })} aria-label={`Full line recall: ${o.name}`}>Lines</a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
