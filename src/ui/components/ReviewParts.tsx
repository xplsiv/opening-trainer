// Small presentational pieces of the game review: quality icons, eval bar, eval graph.
import type { MouseEvent } from 'react';
import {
  CLASS_LABEL, formatEval, whiteWinChance, type Classification, type Eval, type MoveReview,
} from '../../analysis/review';
import type { Side } from '../../engine/types';

export const CLASS_STYLE: Record<Classification, { color: string; glyph: string }> = {
  brilliant: { color: '#1fb5a8', glyph: '!!' },
  great: { color: '#5b8fc7', glyph: '!' },
  best: { color: '#7cb342', glyph: '★' },
  excellent: { color: '#8bc34a', glyph: '✓' },
  good: { color: '#8aa676', glyph: '✓' },
  book: { color: '#a3825c', glyph: '≡' },
  inaccuracy: { color: '#f2c14e', glyph: '?!' },
  mistake: { color: '#f5964f', glyph: '?' },
  miss: { color: '#f2706a', glyph: '✗' },
  blunder: { color: '#e5483b', glyph: '??' },
  forced: { color: '#8aa676', glyph: '→' },
};

export function ClassIcon({ c, size = 20 }: { c: Classification; size?: number }) {
  const s = CLASS_STYLE[c];
  return (
    <span className="class-icon" style={{ background: s.color, width: size, height: size, fontSize: size * (s.glyph.length > 1 ? 0.5 : 0.62) }}
      title={CLASS_LABEL[c]} aria-label={CLASS_LABEL[c]} role="img">
      {s.glyph}
    </span>
  );
}

/** Icon for the board square (chessground customSvg, 100x100 square). */
export function badgeSvg(c: Classification): string {
  const s = CLASS_STYLE[c];
  const fs = s.glyph.length > 1 ? 15 : 19;
  return `<g><circle cx="82" cy="18" r="17" fill="${s.color}" stroke="#fff" stroke-width="3"/>`
    + `<text x="82" y="18" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" `
    + `font-weight="800" font-size="${fs}" fill="#fff">${s.glyph}</text></g>`;
}

export function EvalBar({ ev, orientation }: { ev?: Eval; orientation: Side }) {
  const white = ev ? whiteWinChance(ev) : 50;
  const shown = Math.max(3, Math.min(97, white));
  const whiteAhead = white >= 50;
  return (
    <div className={`eval-bar ${orientation === 'black' ? 'flipped' : ''}`} role="img"
      aria-label={ev ? `Evaluation ${formatEval(ev)}` : 'Evaluation pending'}>
      <div className="eval-white" style={{ height: `${shown}%` }} />
      <span className={`eval-label ${whiteAhead ? 'on-white' : 'on-black'}`}>{ev ? formatEval(ev).replace('+', '') : ''}</span>
    </div>
  );
}

const NOTABLE: Classification[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'];

/** White's win chance over the game; click to jump to a move. */
export function EvalGraph({ evals, moves, ply, onSelect }: {
  evals: (Eval | undefined)[];
  moves: MoveReview[];
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const n = Math.max(1, moves.length);
  const W = 600;
  const H = 90;
  const x = (i: number) => (i / n) * W;
  const y = (e?: Eval) => H - ((e ? whiteWinChance(e) : 50) / 100) * H;
  let path = `M0 ${H} `;
  let last = 0;
  evals.forEach((e, i) => {
    if (!e) return;
    path += `L${x(i).toFixed(1)} ${y(e).toFixed(1)} `;
    last = i;
  });
  path += `L${x(last).toFixed(1)} ${H} Z`;

  const pick = (ev: MouseEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    onSelect(Math.max(0, Math.min(moves.length, Math.round(((ev.clientX - r.left) / r.width) * n))));
  };
  return (
    <div className="eval-graph" onClick={pick} role="img" aria-label="Evaluation graph (click to jump to a move)">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <rect width={W} height={H} className="eg-bg" />
        <path d={path} className="eg-area" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="eg-mid" />
        <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} className="eg-cursor" vectorEffect="non-scaling-stroke" />
      </svg>
      {moves.map((m) => m.classification && NOTABLE.includes(m.classification) && evals[m.ply] && (
        <span key={m.ply} className="eg-dot" title={`${m.move.san}: ${CLASS_LABEL[m.classification]}`}
          style={{ left: `${(x(m.ply) / W) * 100}%`, top: `${(y(evals[m.ply]) / H) * 100}%`, background: CLASS_STYLE[m.classification].color }} />
      ))}
    </div>
  );
}
