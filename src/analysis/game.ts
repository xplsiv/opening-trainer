// A game to review: PGN → main-line moves with FENs, plus header info.
import { Chess } from 'chess.js';
import type { GameMove } from './review';
import { posKey } from '../engine/fen';
import type { Opening, TreeNode } from '../engine/types';

export interface ReviewGame {
  id: string; // stable key (game URL or hash of the PGN)
  white: { name: string; rating?: string };
  black: { name: string; rating?: string };
  result: string;
  date?: string;
  opening?: string;
  startFen: string;
  moves: GameMove[];
  pgn: string;
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** "https://www.chess.com/openings/Italian-Game-Two-Knights-Defense" → "Italian Game Two Knights Defense" */
function openingFromEcoUrl(url?: string): string | undefined {
  const slug = url?.split('/openings/')[1];
  if (!slug) return undefined;
  // drop the trailing move list ("...-2.Nc3", "...-2...Nf6")
  return decodeURIComponent(slug).replace(/-\d+\.+.*$/, '').replace(/-/g, ' ').trim() || undefined;
}

export function parseGame(pgn: string, id?: string): ReviewGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn.trim());
  } catch (e) {
    throw new Error(`Could not read this PGN: ${(e as Error).message}`);
  }
  const h = chess.getHeaders();
  const history = chess.history({ verbose: true });
  if (!history.length) throw new Error('This game has no moves.');
  const moves: GameMove[] = history.map((m) => ({
    san: m.san,
    uci: m.from + m.to + (m.promotion ?? ''),
    color: m.color,
    fenBefore: m.before,
    fenAfter: m.after,
  }));
  const val = (k: string) => (h[k] && h[k] !== '?' ? h[k] : undefined);
  return {
    id: id ?? val('Link') ?? hash(pgn),
    white: { name: val('White') ?? 'White', rating: val('WhiteElo') },
    black: { name: val('Black') ?? 'Black', rating: val('BlackElo') },
    result: val('Result') ?? '*',
    date: val('Date')?.replace(/\./g, '-'),
    opening: openingFromEcoUrl(val('ECOUrl')) ?? val('Opening'),
    startFen: history[0].before,
    moves,
    pgn,
  };
}

/** Position keys of every node in the built-in/imported opening trees. */
export function bookPositions(openings: Opening[]): Set<string> {
  const set = new Set<string>();
  const walk = (n: TreeNode) => {
    set.add(posKey(n.fen));
    n.children.forEach(walk);
  };
  for (const o of openings) walk(o.root);
  return set;
}

/** How many leading moves of the game stay inside the opening trees. */
export function countBookPlies(moves: GameMove[], book: Set<string>): number {
  let n = 0;
  for (const m of moves) {
    if (!book.has(posKey(m.fenAfter))) break;
    n++;
  }
  return n;
}

/** Name of the deepest matching opening from the trees (fallback when the PGN has none). */
export function matchOpeningName(moves: GameMove[], openings: Opening[]): string | undefined {
  let best: { name: string; depth: number } | undefined;
  for (const o of openings) {
    let node: TreeNode | undefined = o.root;
    let depth = 0;
    for (const m of moves) {
      node = node?.children.find((c) => posKey(c.fen) === posKey(m.fenAfter));
      if (!node) break;
      depth++;
    }
    if (depth >= 2 && (!best || depth > best.depth)) best = { name: o.name, depth };
  }
  return best?.name;
}

// ---------------------------------------------------------------- hand-over between routes

const KEY = 'review-game';
let current: ReviewGame | null = null;

export function setReviewGame(g: ReviewGame) {
  current = g;
  try { sessionStorage.setItem(KEY, g.pgn); } catch { /* storage unavailable */ }
}

export function getReviewGame(): ReviewGame | null {
  if (current) return current;
  try {
    const pgn = sessionStorage.getItem(KEY);
    if (pgn) current = parseGame(pgn);
  } catch { /* ignore */ }
  return current;
}
