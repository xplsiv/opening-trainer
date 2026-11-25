// Game review maths: win chances, move classification, accuracy and an estimated game rating.
// UI-free and engine-free so it can be unit tested with synthetic evaluations.
//
// The thresholds follow the publicly described "expected points" idea (how much of your
// winning chance a move gives away). Accuracy uses the open Lichess formula. The estimated
// game rating is a rough heuristic, not any site's official number.
import { Chess, type Square } from 'chess.js';

export type Color = 'w' | 'b';

/** Engine evaluation of a position, always from White's point of view. */
export interface Eval {
  cp?: number; // centipawns, + = White better
  mate?: number; // moves to mate, + = White mates, - = Black mates
  over?: boolean; // checkmate on the board (mate sign says who won)
}

export interface EngineLine {
  uci: string; // first move of the line
  eval: Eval; // White POV
  pv: string[]; // UCI moves
}

export interface PositionAnalysis {
  eval: Eval; // best-play evaluation, White POV
  lines: EngineLine[]; // best first; may be empty for finished positions
  depth: number;
}

export interface GameMove {
  san: string;
  uci: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
}

export type Classification =
  | 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book'
  | 'inaccuracy' | 'mistake' | 'miss' | 'blunder' | 'forced';

export const CLASS_ORDER: Classification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder',
];

export const CLASS_LABEL: Record<Classification, string> = {
  brilliant: 'Brilliant', great: 'Great', best: 'Best', excellent: 'Excellent', good: 'Good', book: 'Book',
  inaccuracy: 'Inaccuracy', mistake: 'Mistake', miss: 'Miss', blunder: 'Blunder', forced: 'Forced',
};

export interface MoveReview {
  ply: number; // 1-based
  move: GameMove;
  classification?: Classification; // undefined while not analysed yet
  winBefore?: number; // mover's win chance (0-100) with best play before the move
  winAfter?: number; // mover's win chance after the played move
  accuracy?: number; // 0-100
  bestUci?: string;
  bestSan?: string;
  bestPv?: string[]; // SAN
}

export interface PlayerSummary {
  accuracy?: number;
  rating?: number; // estimated game rating
  counts: Record<Classification, number>;
}

export interface Review {
  moves: MoveReview[];
  white: PlayerSummary;
  black: PlayerSummary;
  complete: boolean;
}

// ---------------------------------------------------------------- win chances

/** White's winning chance in percent (Lichess model). */
export function whiteWinChance(e: Eval): number {
  if (e.mate !== undefined) return e.mate > 0 ? 100 : e.mate < 0 ? 0 : 50;
  const cp = Math.max(-1000, Math.min(1000, e.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function winChanceFor(e: Eval, color: Color): number {
  const w = whiteWinChance(e);
  return color === 'w' ? w : 100 - w;
}

export function formatEval(e: Eval): string {
  if (e.mate !== undefined) {
    if (e.over) return e.mate > 0 ? '1-0' : '0-1';
    return `${e.mate > 0 ? '' : '-'}M${Math.abs(e.mate)}`;
  }
  const v = (e.cp ?? 0) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

/** Lichess move accuracy from the drop in win chance (percentage points). */
export function moveAccuracy(winDrop: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, winDrop)) - 3.1669 + 1;
  return Math.max(0, Math.min(100, a));
}

/** Mean of arithmetic and harmonic mean: one big blunder pulls the score down noticeably. */
export function gameAccuracy(accs: number[]): number | undefined {
  if (!accs.length) return undefined;
  const mean = accs.reduce((s, a) => s + a, 0) / accs.length;
  const harmonic = accs.length / accs.reduce((s, a) => s + 1 / Math.max(a, 1), 0);
  return (mean + harmonic) / 2;
}

/** Rough performance estimate from accuracy (heuristic, rounded to 50). */
export function estimateRating(accuracy: number): number {
  const r = 250 + 2900 * Math.pow(Math.max(0, Math.min(100, accuracy)) / 100, 4);
  return Math.max(100, Math.min(3200, Math.round(r / 50) * 50));
}

// ---------------------------------------------------------------- classification helpers

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * True when the move leaves the moved piece (knight or bigger) where the opponent can win
 * material: attacked by a cheaper piece, or attacked and undefended, and the move did not
 * already capture something at least as valuable.
 */
export function isSacrifice(move: GameMove): boolean {
  const before = new Chess(move.fenBefore);
  const from = move.uci.slice(0, 2) as Square;
  const to = move.uci.slice(2, 4) as Square;
  const piece = before.get(from);
  if (!piece || piece.type === 'p' || piece.type === 'k') return false;
  const captured = before.get(to);
  const value = VALUE[move.uci.length > 4 ? move.uci[4] : piece.type];
  if (captured && VALUE[captured.type] >= value) return false;

  const after = new Chess(move.fenAfter);
  const opp: Color = move.color === 'w' ? 'b' : 'w';
  const attackers = after.attackers(to, opp);
  if (!attackers.length) return false;
  const cheapest = Math.min(...attackers.map((sq) => VALUE[after.get(sq)!.type] || 100));
  const defended = after.attackers(to, move.color).length > 0;
  return cheapest < value || !defended;
}

function isRecapture(prev: GameMove | undefined, move: GameMove): boolean {
  if (!prev) return false;
  return prev.san.includes('x') && move.san.includes('x') && prev.uci.slice(2, 4) === move.uci.slice(2, 4);
}

function legalMoveCount(fen: string): number {
  return new Chess(fen).moves().length;
}

export function uciToSan(fen: string, uci: string): string | undefined {
  try {
    const c = new Chess(fen);
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return undefined;
  }
}

export function pvToSan(fen: string, pv: string[], max = 8): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

/** Classification from the mover's point of view (win chances in percent). */
export function classifyMove(p: {
  isBook: boolean;
  forced: boolean;
  isBest: boolean;
  winBefore: number; // best play before the move
  winAfter: number; // after the played move
  secondBestWin?: number; // mover's win chance after the engine's 2nd choice
  sacrifice: boolean;
  recapture: boolean;
  /** Opponent's previous move gave something away; mover's win chance before that move. */
  opponentErrorFrom?: number;
}): Classification {
  if (p.isBook) return 'book';
  if (p.forced) return 'forced';
  const loss = p.isBest ? 0 : Math.max(0, p.winBefore - p.winAfter) / 100;

  if (loss <= 0.02 && p.sacrifice && p.winAfter >= 50 && p.winBefore < 97) return 'brilliant';
  if (p.isBest || loss < 0.005) {
    const gap = p.secondBestWin === undefined ? 0 : (p.winBefore - p.secondBestWin) / 100;
    if (p.isBest && gap >= 0.1 && !p.recapture && p.winAfter >= 30 && p.winBefore <= 97) return 'great';
    return 'best';
  }
  if (loss <= 0.02) return 'excellent';
  if (loss <= 0.05) return 'good';
  if (loss <= 0.1) return 'inaccuracy';
  // Failing to punish the opponent's error: you only end up where you were before it.
  if (p.opponentErrorFrom !== undefined && p.winAfter >= p.opponentErrorFrom - 5) return 'miss';
  return loss <= 0.2 ? 'mistake' : 'blunder';
}

function emptyCounts(): Record<Classification, number> {
  return {
    brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0,
    inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, forced: 0,
  };
}

// ---------------------------------------------------------------- whole game

/**
 * Build the review. `positions[i]` is the analysis of the position after `i` plies
 * (positions[0] = start). Missing entries are allowed while analysis is still running.
 * `bookPlies` = number of leading moves that are known opening theory.
 */
export function buildReview(moves: GameMove[], positions: (PositionAnalysis | undefined)[], bookPlies: number): Review {
  const out: MoveReview[] = [];
  const white = { counts: emptyCounts(), accs: [] as number[] };
  const black = { counts: emptyCounts(), accs: [] as number[] };

  moves.forEach((move, i) => {
    const ply = i + 1;
    const before = positions[i];
    const after = positions[i + 1];
    const r: MoveReview = { ply, move };
    out.push(r);
    if (!before || !after) return;

    const best = before.lines[0];
    r.bestUci = best?.uci;
    r.bestSan = best ? uciToSan(move.fenBefore, best.uci) : undefined;
    r.bestPv = best ? pvToSan(move.fenBefore, best.pv) : undefined;
    r.winBefore = winChanceFor(before.eval, move.color);
    // If the played move is one of the engine's candidate lines, take its value from that same
    // search: separate searches of neighbouring positions disagree by a few tenths (odd/even
    // depth), which would turn perfectly normal moves into "good" or "inaccuracy".
    const sameSearch = before.lines.find((l) => l.uci === move.uci);
    r.winAfter = winChanceFor(sameSearch?.eval ?? after.eval, move.color);
    const isBest = best?.uci === move.uci;
    const second = before.lines[1];

    const prev = out[i - 1];
    let opponentErrorFrom: number | undefined;
    if (prev?.classification === 'mistake' || prev?.classification === 'blunder' || prev?.classification === 'miss') {
      const prevBefore = positions[i - 1];
      if (prevBefore) opponentErrorFrom = winChanceFor(prevBefore.eval, move.color);
    }

    r.classification = classifyMove({
      isBook: i < bookPlies,
      forced: legalMoveCount(move.fenBefore) === 1,
      isBest,
      winBefore: r.winBefore,
      winAfter: r.winAfter,
      secondBestWin: second ? winChanceFor(second.eval, move.color) : undefined,
      sacrifice: isSacrifice(move),
      recapture: isRecapture(moves[i - 1], move),
      opponentErrorFrom,
    });
    r.accuracy = moveAccuracy(isBest ? 0 : r.winBefore - r.winAfter);

    const side = move.color === 'w' ? white : black;
    side.counts[r.classification]++;
    side.accs.push(r.accuracy);
  });

  const summary = (s: typeof white): PlayerSummary => {
    const accuracy = gameAccuracy(s.accs);
    return { accuracy, rating: accuracy === undefined ? undefined : estimateRating(accuracy), counts: s.counts };
  };
  return {
    moves: out,
    white: summary(white),
    black: summary(black),
    complete: positions.length >= moves.length + 1 && positions.every(Boolean),
  };
}

/** Evaluation for a finished position (no engine needed). */
export function terminalEval(fen: string): Eval | undefined {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { mate: c.turn() === 'w' ? -1 : 1, over: true };
  if (c.isDraw() || c.isStalemate()) return { cp: 0 };
  return undefined;
}
