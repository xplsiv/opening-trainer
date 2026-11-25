import { describe, it, expect } from 'vitest';
import {
  buildReview, classifyMove, estimateRating, formatEval, gameAccuracy, isSacrifice, moveAccuracy,
  terminalEval, whiteWinChance, type PositionAnalysis,
} from '../src/analysis/review';
import { parseInfo } from '../src/analysis/engine';
import { countBookPlies, parseGame } from '../src/analysis/game';
import { posKey } from '../src/engine/fen';

const base = { isBook: false, forced: false, isBest: false, sacrifice: false, recapture: false };
const pos = (cp: number, lines: { uci: string; cp: number }[] = []): PositionAnalysis => ({
  eval: { cp },
  depth: 12,
  lines: lines.map((l) => ({ uci: l.uci, eval: { cp: l.cp }, pv: [l.uci] })),
});

describe('win chances and formatting', () => {
  it('is 50% at equality and symmetric', () => {
    expect(whiteWinChance({ cp: 0 })).toBeCloseTo(50);
    expect(whiteWinChance({ cp: 300 }) + whiteWinChance({ cp: -300 })).toBeCloseTo(100);
    expect(whiteWinChance({ mate: 3 })).toBe(100);
    expect(whiteWinChance({ mate: -2 })).toBe(0);
  });
  it('formats evals', () => {
    expect(formatEval({ cp: 130 })).toBe('+1.3');
    expect(formatEval({ cp: -45 })).toBe('-0.5');
    expect(formatEval({ mate: -3 })).toBe('-M3');
    expect(formatEval({ mate: 1, over: true })).toBe('1-0');
  });
  it('detects checkmate on the board', () => {
    // Fool's mate: White is mated
    expect(terminalEval('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toEqual({ mate: -1, over: true });
  });
});

describe('classification thresholds', () => {
  const at = (winBefore: number, winAfter: number) => classifyMove({ ...base, winBefore, winAfter });
  it('maps win-chance loss to the usual buckets', () => {
    expect(at(60, 59)).toBe('excellent');
    expect(at(60, 56)).toBe('good');
    expect(at(60, 52)).toBe('inaccuracy');
    expect(at(60, 45)).toBe('mistake');
    expect(at(60, 20)).toBe('blunder');
  });
  it('book and forced win over everything', () => {
    expect(classifyMove({ ...base, isBook: true, winBefore: 60, winAfter: 10 })).toBe('book');
    expect(classifyMove({ ...base, forced: true, winBefore: 60, winAfter: 10 })).toBe('forced');
  });
  it('best, great (only good move) and brilliant (sound sacrifice)', () => {
    expect(classifyMove({ ...base, isBest: true, winBefore: 55, winAfter: 54 })).toBe('best');
    expect(classifyMove({ ...base, isBest: true, winBefore: 55, winAfter: 55, secondBestWin: 30 })).toBe('great');
    expect(classifyMove({ ...base, isBest: true, sacrifice: true, winBefore: 60, winAfter: 60 })).toBe('brilliant');
    // a "sacrifice" in a totally won position is just best
    expect(classifyMove({ ...base, isBest: true, sacrifice: true, winBefore: 99, winAfter: 99 })).toBe('best');
  });
  it('miss: failing to punish an opponent error without losing ground', () => {
    expect(classifyMove({ ...base, winBefore: 85, winAfter: 50, opponentErrorFrom: 50 })).toBe('miss');
    expect(classifyMove({ ...base, winBefore: 85, winAfter: 20, opponentErrorFrom: 50 })).toBe('blunder');
  });
});

describe('accuracy and rating', () => {
  it('perfect moves are ~100, big drops are low', () => {
    expect(moveAccuracy(0)).toBe(100);
    expect(moveAccuracy(40)).toBeLessThan(20);
  });
  it('one blunder pulls game accuracy down', () => {
    const clean = gameAccuracy([100, 100, 100, 100])!;
    const blunder = gameAccuracy([100, 100, 100, 5])!;
    expect(clean).toBe(100);
    expect(blunder).toBeLessThan(70);
  });
  it('rating grows with accuracy and stays in range', () => {
    expect(estimateRating(95)).toBeGreaterThan(estimateRating(80));
    expect(estimateRating(0)).toBeGreaterThanOrEqual(100);
    expect(estimateRating(100)).toBeLessThanOrEqual(3200);
  });
});

describe('sacrifice detection', () => {
  it('a piece left en prise counts, a normal developing move does not', () => {
    const g = parseGame('1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5');
    expect(isSacrifice(g.moves[8])).toBe(true); // 5.Nxe5 (Légal): the d6 pawn can take the knight
    expect(isSacrifice(g.moves[4])).toBe(false); // 3.Bc4 is not attacked
  });
});

describe('engine output parsing', () => {
  it('converts scores to White point of view', () => {
    const w = parseInfo('info depth 14 seldepth 20 multipv 1 score cp 35 nodes 1 pv e2e4 e7e5', true)!;
    expect(w.line.eval).toEqual({ cp: 35 });
    const b = parseInfo('info depth 14 multipv 2 score mate 3 nodes 1 pv d8h4', false)!;
    expect(b.multipv).toBe(2);
    expect(b.line.eval).toEqual({ mate: -3 });
    expect(parseInfo('info depth 1 currmove e2e4', true)).toBeNull();
  });
});

describe('whole-game review', () => {
  const g = parseGame('[White "A"]\n[Black "B"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');

  it('reads the opening name from a Chess.com ECOUrl', () => {
    const p = parseGame('[ECOUrl "https://www.chess.com/openings/Scandinavian-Defense-Closed-2...d4-3.Nce2"]\n\n1. e4 d5');
    expect(p.opening).toBe('Scandinavian Defense Closed');
  });

  it('parses players, moves and FENs', () => {
    expect(g.white.name).toBe('A');
    expect(g.moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(g.moves[3].color).toBe('b');
  });

  it('classifies the fool’s mate blunder and the mating move', () => {
    const positions = [
      pos(20, [{ uci: 'e2e4', cp: 20 }, { uci: 'd2d4', cp: 18 }]),
      pos(-60, [{ uci: 'e7e5', cp: -60 }, { uci: 'd7d5', cp: -55 }]),
      pos(-70, [{ uci: 'd2d4', cp: -70 }, { uci: 'e2e4', cp: -90 }]),
      { eval: { mate: -1 }, depth: 12, lines: [{ uci: 'd8h4', eval: { mate: -1 }, pv: ['d8h4'] }] },
      { eval: terminalEval(g.moves[3].fenAfter)!, depth: 0, lines: [] },
    ];
    const r = buildReview(g.moves, positions, 0);
    expect(r.complete).toBe(true);
    expect(r.moves[2].classification).toBe('blunder'); // 2.g4??
    expect(r.moves[2].bestSan).toBe('d4');
    expect(r.moves[3].classification).toBe('best'); // ...Qh4#
    expect(r.white.accuracy!).toBeLessThan(r.black.accuracy!);
  });

  it('tolerates missing analysis while running', () => {
    const r = buildReview(g.moves, [pos(20, [{ uci: 'e2e4', cp: 20 }])], 0);
    expect(r.complete).toBe(false);
    expect(r.moves[0].classification).toBeUndefined();
  });

  it('counts book moves from the opening trees', () => {
    const book = new Set([posKey(g.moves[0].fenAfter)]);
    expect(countBookPlies(g.moves, book)).toBe(1);
  });
});

describe('opening book (Lichess dataset)', () => {
  it('finds book moves and the most specific opening name', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { parseBook, bookInfo } = await import('../src/analysis/book');
    const dir = 'content/lichess';
    const book = parseBook(readdirSync(dir).filter((f) => f.endsWith('.tsv')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')));
    const g = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Qd7 10. Qe2 a5');
    const info = bookInfo(g.moves, book);
    expect(info.plies).toBeGreaterThanOrEqual(16);
    expect(info.plies).toBeLessThan(g.moves.length);
    expect(info.opening).toMatch(/^Ruy Lopez/);
  });
});

describe('coach', () => {
  it('names the hanging piece and the missed mate', async () => {
    const { coachComment } = await import('../src/analysis/coach');
    const g = parseGame('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#');
    const blunder = { ply: 6, move: g.moves[5], classification: 'blunder' as const, bestSan: 'g6' };
    const after = { eval: { mate: 1 }, depth: 10, lines: [{ uci: 'h5f7', eval: { mate: 1 }, pv: ['h5f7'] }] };
    expect(coachComment(blunder, undefined, after)).toMatch(/mate in 1/);
    const mate = { ply: 7, move: g.moves[6], classification: 'best' as const };
    expect(coachComment(mate, undefined, undefined)).toMatch(/mate/i);
  });
});
