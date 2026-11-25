import { useEffect, useMemo, useRef, useState } from 'react';
import { Board, type Arrow } from '../components/Board';
import { badgeSvg, ClassIcon, EvalBar, EvalGraph } from '../components/ReviewParts';
import { useAppData } from '../data';
import { DEPTH_PRESETS, Engine } from '../../analysis/engine';
import { bookPositions, getReviewGame, matchOpeningName, type ReviewGame } from '../../analysis/game';
import { bookInfo, bookKey, loadBook, type OpeningBook } from '../../analysis/book';
import { COACH_NAME, coachComment, coachSummary } from '../../analysis/coach';
import { posKey } from '../../engine/fen';
import {
  buildReview, CLASS_LABEL, CLASS_ORDER, formatEval, terminalEval,
  type Classification, type MoveReview, type PositionAnalysis, type PlayerSummary,
} from '../../analysis/review';
import type { Side } from '../../engine/types';

type Preset = keyof typeof DEPTH_PRESETS;

// Finished analyses survive navigating away and back (per game + preset, this session only).
const cache = new Map<string, (PositionAnalysis | undefined)[]>();

const PHRASE: Record<Classification, string> = {
  brilliant: 'is brilliant', great: 'is a great move', best: 'is best', excellent: 'is excellent', good: 'is good',
  book: 'is a book move', inaccuracy: 'is an inaccuracy', mistake: 'is a mistake', miss: 'is a miss',
  blunder: 'is a blunder', forced: 'is the only legal move',
};

const NOT_BEST: Classification[] = ['excellent', 'good', 'inaccuracy', 'mistake', 'miss', 'blunder'];

function useAnalysis(game: ReviewGame, preset: Preset) {
  const key = `${game.id}|${preset}`;
  const total = game.moves.length + 1;
  const [positions, setPositions] = useState<(PositionAnalysis | undefined)[]>(() => cache.get(key) ?? []);
  const [error, setError] = useState('');

  useEffect(() => {
    const have = cache.get(key) ?? [];
    if (have.length === total && have.every(Boolean)) return;
    const engine = new Engine();
    let alive = true;
    const acc = [...have];
    (async () => {
      for (let i = 0; i < total; i++) {
        if (!alive) return;
        if (acc[i]) continue;
        const fen = i === 0 ? game.startFen : game.moves[i - 1].fenAfter;
        const over = terminalEval(fen);
        acc[i] = over ? { eval: over, lines: [], depth: 0 } : await engine.analyse(fen, DEPTH_PRESETS[preset]);
        if (!alive) return;
        cache.set(key, [...acc]);
        setPositions([...acc]);
      }
    })().catch((err) => alive && setError((err as Error).message || 'The engine stopped unexpectedly.'));
    return () => {
      alive = false;
      engine.stop();
    };
  }, [key, game, preset, total]);

  const done = positions.filter(Boolean).length;
  return { positions, done, total, error };
}

function PlayerStrip({ name, rating, color, summary }: { name: string; rating?: string; color: Side; summary: PlayerSummary }) {
  return (
    <div className="player-strip">
      <span className={`side-dot ${color}`} aria-hidden />
      <strong>{name}</strong>{rating && <span className="muted"> ({rating})</span>}
      {summary.accuracy !== undefined && <span className={`acc-chip ${color}`}>{summary.accuracy.toFixed(1)}</span>}
    </div>
  );
}

export function Review({ params }: { params: URLSearchParams }) {
  const game = useMemo(() => getReviewGame(), []);
  if (!game) {
    return (
      <div className="page narrow">
        <h1>No game selected</h1>
        <p className="muted">Pick a game from Chess.com or paste a PGN first.</p>
        <a className="btn primary" href="#/analysis">Choose a game</a>
      </div>
    );
  }
  const preset = (['fast', 'standard', 'deep'].includes(params.get('d') ?? '') ? params.get('d') : 'standard') as Preset;
  return <ReviewView key={`${game.id}|${preset}`} game={game} preset={preset} />;
}

function ReviewView({ game, preset }: { game: ReviewGame; preset: Preset }) {
  const { openings } = useAppData();
  const { positions, done, total, error } = useAnalysis(game, preset);
  const trees = useMemo(() => bookPositions(openings), [openings]);
  const [lichess, setLichess] = useState<OpeningBook | null>(null);
  useEffect(() => { loadBook().then(setLichess).catch(() => undefined); }, []);
  const info = useMemo(() => (lichess ? bookInfo(game.moves, lichess) : undefined), [game, lichess]);
  const bookPlies = useMemo(() => {
    let n = 0;
    for (const m of game.moves) {
      const k = posKey(m.fenAfter);
      if (!trees.has(k) && !lichess?.positions.has(bookKey(m.fenAfter))) break;
      n++;
    }
    return n;
  }, [game, trees, lichess]);
  const opening = useMemo(() => game.opening ?? info?.opening ?? matchOpeningName(game.moves, openings), [game, info, openings]);
  const review = useMemo(() => buildReview(game.moves, positions, bookPlies), [game, positions, bookPlies]);

  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Side>('white');
  const [showLine, setShowLine] = useState(false);
  const n = game.moves.length;
  const go = (p: number) => { setPly(Math.max(0, Math.min(n, p))); setShowLine(false); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') go(ply + 1);
      else if (e.key === 'ArrowLeft') go(ply - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(n);
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only the move list, never the page.
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('.mv.on');
    if (!box || !el) return;
    const top = el.offsetTop; // .move-table is position: relative, so this is relative to the list
    if (top < box.scrollTop) box.scrollTop = top - 4;
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + el.offsetHeight - box.clientHeight + 4;
  }, [ply]);

  const cur: MoveReview | undefined = ply > 0 ? review.moves[ply - 1] : undefined;
  const fen = cur ? cur.move.fenAfter : game.startFen;
  const ev = positions[ply]?.eval;

  const arrows: Arrow[] = [];
  if (cur?.classification && NOT_BEST.includes(cur.classification) && cur.bestUci) {
    arrows.push({ from: cur.bestUci.slice(0, 2), to: cur.bestUci.slice(2, 4), brush: 'green' });
  }
  const badge = cur?.classification ? { square: cur.move.uci.slice(2, 4), svg: badgeSvg(cur.classification) } : undefined;

  const top: Side = orientation === 'white' ? 'black' : 'white';
  const strip = (c: Side) => (
    <PlayerStrip color={c} name={c === 'white' ? game.white.name : game.black.name}
      rating={c === 'white' ? game.white.rating : game.black.rating}
      summary={c === 'white' ? review.white : review.black} />
  );

  const rows: { no: number; w?: MoveReview; b?: MoveReview }[] = [];
  for (const m of review.moves) {
    const no = Number(m.move.fenBefore.split(' ')[5]);
    if (m.move.color === 'w' || !rows.length) rows.push({ no, w: m.move.color === 'w' ? m : undefined, b: m.move.color === 'b' ? m : undefined });
    else rows[rows.length - 1].b = m;
  }

  return (
    <div className="page play review">
      <div className="board-col">
        {strip(top)}
        <div className="board-row">
          <EvalBar ev={ev} orientation={orientation} />
          <Board fen={fen} orientation={orientation} lastMove={cur ? [cur.move.uci.slice(0, 2), cur.move.uci.slice(2, 4)] : undefined}
            arrows={arrows} badge={badge} />
        </div>
        {strip(orientation)}
        <div className="controls">
          <button className="btn" onClick={() => go(0)} aria-label="Start">⏮</button>
          <button className="btn grow" onClick={() => go(ply - 1)} aria-label="Previous move">◀</button>
          <button className="btn grow" onClick={() => go(ply + 1)} aria-label="Next move">▶</button>
          <button className="btn" onClick={() => go(n)} aria-label="End">⏭</button>
          <button className="btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} aria-label="Flip board">⇅</button>
        </div>
      </div>

      <aside className="panel review-panel">
        <div className="row-between">
          <a className="btn small ghost" href="#/analysis">← Games</a>
          <span className="muted small">{game.result}{game.date ? ` · ${game.date}` : ''}</span>
        </div>
        {opening && <div className="muted small">Opening: <strong>{opening}</strong></div>}

        {done < total && (
          <div className="progress" role="status">
            <div className="progress-bar"><span style={{ width: `${(done / total) * 100}%` }} /></div>
            <span className="small muted">Stockfish is checking the moves… {done}/{total}</span>
          </div>
        )}
        {error && <p className="error small" role="alert">Engine error: {error}</p>}

        <section className="card summary">
          <div className="sum-grid">
            <span />
            <span className="sum-head">{game.white.name}</span>
            <span className="sum-head">{game.black.name}</span>

            <span className="sum-label">Accuracy</span>
            <span className="acc-big white">{review.white.accuracy?.toFixed(1) ?? '–'}</span>
            <span className="acc-big black">{review.black.accuracy?.toFixed(1) ?? '–'}</span>

            {CLASS_ORDER.map((c) => (
              <ClassRow key={c} c={c} w={review.white.counts[c]} b={review.black.counts[c]} />
            ))}

            <span className="sum-label">Game rating <span className="muted small">(est.)</span></span>
            <span className="rating-box">{review.complete ? review.white.rating : '–'}</span>
            <span className="rating-box">{review.complete ? review.black.rating : '–'}</span>
          </div>
        </section>

        <EvalGraph evals={positions.map((p) => p?.eval)} moves={review.moves} ply={ply} onSelect={go} />

        <section className={`card explain coach ${cur?.classification ?? ''}`} aria-live="polite">
          <div className="coach-avatar" aria-hidden>♛</div>
          <div className="coach-body">
            <div className="coach-name">{COACH_NAME}</div>
            {cur?.classification && (
              <div className="explain-head">
                <ClassIcon c={cur.classification} size={24} />
                <span><strong>{cur.move.san}</strong> {PHRASE[cur.classification]}</span>
                {ev && <span className="eval-chip">{formatEval(ev)}</span>}
              </div>
            )}
            <p className="coach-text">
              {!cur
                ? coachSummary(review, { white: game.white.name, black: game.black.name }, game.result, opening)
                : cur.classification
                  ? coachComment(cur, positions[ply - 1], positions[ply], opening)
                  : `Let me look at ${cur.move.san} first…`}
            </p>
            {cur?.classification && NOT_BEST.includes(cur.classification) && cur.bestSan && (
              <div className="best-line">
                <ClassIcon c="best" size={18} /> <span>Best was <strong>{cur.bestSan}</strong></span>
                <button className="btn small ghost" onClick={() => setShowLine((v) => !v)}>{showLine ? 'Hide line' : 'Show line'}</button>
              </div>
            )}
            {showLine && cur?.bestPv && <div className="pv small">{cur.bestPv.join(' ')}</div>}
          </div>
        </section>

        <div className="move-table" ref={listRef}>
          {rows.map((r) => (
            <div key={r.no} className="mv-row">
              <span className="mv-no">{r.no}.</span>
              {r.w ? <MoveCell m={r.w} on={ply === r.w.ply} onClick={() => go(r.w!.ply)} /> : <span className="mv">…</span>}
              {r.b ? <MoveCell m={r.b} on={ply === r.b.ply} onClick={() => go(r.b!.ply)} /> : <span />}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function ClassRow({ c, w, b }: { c: Classification; w: number; b: number }) {
  return (
    <>
      <span className="sum-label class-label"><ClassIcon c={c} size={18} /> {CLASS_LABEL[c]}</span>
      <span className={`count ${w ? '' : 'zero'}`}>{w}</span>
      <span className={`count ${b ? '' : 'zero'}`}>{b}</span>
    </>
  );
}

const SHOW_ICON: Classification[] = ['brilliant', 'great', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder', 'best'];

function MoveCell({ m, on, onClick }: { m: MoveReview; on: boolean; onClick: () => void }) {
  return (
    <button className={`mv ${on ? 'on' : ''}`} onClick={onClick}>
      {m.classification && SHOW_ICON.includes(m.classification) && <ClassIcon c={m.classification} size={16} />}
      <span>{m.move.san}</span>
    </button>
  );
}
