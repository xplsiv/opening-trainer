import { useEffect, useState, type FormEvent } from 'react';
import { archiveLabel, fetchArchive, fetchArchives, resultFor, type ChesscomGame } from '../../analysis/chesscom';
import { parseGame, setReviewGame } from '../../analysis/game';
import { navigate } from '../router';

const USER_KEY = 'chesscom-user';
const DEPTH_KEY = 'review-depth';
type Depth = 'fast' | 'standard' | 'deep';

function load(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}
function save(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* storage unavailable */ }
}

const TIME_ICON: Record<string, string> = { bullet: '•', blitz: '⚡', rapid: '◷', daily: '☀' };

export function Analysis() {
  const [user, setUser] = useState(load(USER_KEY));
  const [archives, setArchives] = useState<string[]>([]);
  const [month, setMonth] = useState('');
  const [games, setGames] = useState<ChesscomGame[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pgn, setPgn] = useState('');
  const [pgnError, setPgnError] = useState('');
  const [depth, setDepth] = useState<Depth>((load(DEPTH_KEY) as Depth) || 'standard');

  const loadUser = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setGames(null);
    try {
      const list = await fetchArchives(user);
      save(USER_KEY, user.trim());
      setArchives(list);
      if (!list.length) setError('This player has no games yet.');
      else setMonth(list[0]);
    } catch (err) {
      setError((err as Error).message);
      setArchives([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!month) return;
    let alive = true;
    setBusy(true);
    setError('');
    fetchArchive(month)
      .then((g) => alive && setGames(g))
      .catch((err) => alive && setError((err as Error).message))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [month]);

  const review = (text: string, id?: string) => {
    const g = parseGame(text, id);
    setReviewGame(g);
    save(DEPTH_KEY, depth);
    navigate('analysis/review', { d: depth });
  };

  const reviewPgn = () => {
    setPgnError('');
    try {
      review(pgn);
    } catch (err) {
      setPgnError((err as Error).message);
    }
  };

  const me = user.trim().toLowerCase();

  return (
    <div className="page analysis">
      <h1>Game analysis</h1>
      <p className="muted small">
        Import a game, let Stockfish 19 check every move in your browser, and get accuracy, an estimated game rating,
        move ratings (brilliant to blunder), the evaluation bar and graph.
      </p>

      <section className="card">
        <h2>From Chess.com</h2>
        <form className="row-form" onSubmit={loadUser}>
          <input type="text" value={user} onChange={(e) => setUser(e.target.value)} placeholder="Chess.com username"
            aria-label="Chess.com username" autoComplete="off" autoCapitalize="none" spellCheck={false} />
          <button className="btn primary" type="submit" disabled={busy || user.trim().length < 3}>
            {busy && !games ? 'Loading…' : 'Load games'}
          </button>
        </form>
        {error && <p className="error small" role="alert">{error}</p>}

        {archives.length > 0 && (
          <label className="field">
            <span>Month</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {archives.map((a) => <option key={a} value={a}>{archiveLabel(a)}</option>)}
            </select>
          </label>
        )}

        {games && games.length === 0 && <p className="muted small">No games in this month.</p>}
        {games && games.length > 0 && (
          <ul className="game-list">
            {games.map((g) => {
              const res = resultFor(g, me);
              const iAmWhite = g.white.username.toLowerCase() === me;
              const opp = iAmWhite ? g.black : g.white;
              const standard = g.rules === 'chess';
              return (
                <li key={g.url} className="game-row">
                  <span className={`result-badge ${res}`} aria-label={res}>{res === 'win' ? 'W' : res === 'loss' ? 'L' : '½'}</span>
                  <div className="game-info">
                    <div className="game-title">
                      <span className={`side-dot ${iAmWhite ? 'white' : 'black'}`} aria-label={iAmWhite ? 'You played White' : 'You played Black'} />
                      vs <strong>{opp.username}</strong> ({opp.rating})
                    </div>
                    <div className="muted small">
                      {TIME_ICON[g.timeClass] ?? ''} {g.timeClass} · {new Date(g.endTime * 1000).toLocaleDateString()}
                      {!g.rated && ' · unrated'}{!standard && ` · ${g.rules}`}
                    </div>
                  </div>
                  <button className="btn primary small" disabled={!standard} onClick={() => review(g.pgn, g.url)}>Review</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Paste a PGN</h2>
        <textarea rows={5} value={pgn} onChange={(e) => setPgn(e.target.value)}
          placeholder={'[Event "…"]\n1. e4 e5 2. Nf3 …'} aria-label="PGN" spellCheck={false} />
        {pgnError && <p className="error small" role="alert">{pgnError}</p>}
        <button className="btn primary" onClick={reviewPgn} disabled={!pgn.trim()}>Review this game</button>
      </section>

      <label className="field depth-field">
        <span>Engine strength</span>
        <select value={depth} onChange={(e) => { setDepth(e.target.value as Depth); save(DEPTH_KEY, e.target.value); }}>
          <option value="fast">Fast (depth 12, ~30 s per game)</option>
          <option value="standard">Standard (depth 16)</option>
          <option value="deep">Deep (depth 20, slow)</option>
        </select>
      </label>
    </div>
  );
}
