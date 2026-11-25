// Opening book for game review: every position of the Lichess opening-name dataset (CC0,
// content/lichess/*.tsv, ~3,800 named lines). Loaded lazily (own chunk) the first time a game
// is reviewed, so the opening trainer itself does not pay for it. Parsed with chessops and a
// prefix cache (the lines share most of their moves), which keeps it well under a second.
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { GameMove } from './review';

export interface OpeningBook {
  positions: Set<string>;
  names: Map<string, { eco: string; name: string }>; // final position of a named line
}

/** Placement, side to move and castling rights (en passant is ignored for book lookups). */
export function bookKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 3).join(' ');
}

let loading: Promise<OpeningBook> | null = null;

export function parseBook(tsvs: string[]): OpeningBook {
  const positions = new Set<string>();
  const names = new Map<string, { eco: string; name: string }>();
  const prefix = new Map<string, Chess>(); // "e4 e5 Nf3" -> position after it
  for (const tsv of tsvs) {
    for (const row of tsv.split('\n').slice(1)) {
      const [eco, name, pgn] = row.split('\t');
      if (!pgn) continue;
      const sans = pgn.trim().split(/\s+/).filter((t) => !/^\d+\./.test(t));
      let pos = Chess.default();
      let path = '';
      let ok = true;
      for (const san of sans) {
        path = path ? `${path} ${san}` : san;
        const cached = prefix.get(path);
        if (cached) {
          pos = cached;
          continue;
        }
        const move = parseSan(pos, san);
        if (!move) {
          ok = false;
          break;
        }
        pos = pos.clone();
        pos.play(move);
        prefix.set(path, pos);
        positions.add(bookKey(makeFen(pos.toSetup())));
      }
      if (ok) names.set(bookKey(makeFen(pos.toSetup())), { eco, name: name.trim() });
    }
  }
  return { positions, names };
}

export function loadBook(): Promise<OpeningBook> {
  loading ??= (async () => {
    const files = import.meta.glob('/content/lichess/*.tsv', { query: '?raw', import: 'default' });
    const texts = await Promise.all(Object.values(files).map((f) => f() as Promise<string>));
    return parseBook(texts);
  })();
  return loading;
}

/** Leading moves of the game that are book, and the most specific opening name reached. */
export function bookInfo(moves: GameMove[], book: OpeningBook): { plies: number; opening?: string; eco?: string } {
  let plies = 0;
  let named: { eco: string; name: string } | undefined;
  for (const m of moves) {
    const k = bookKey(m.fenAfter);
    if (!book.positions.has(k)) break;
    plies++;
    named = book.names.get(k) ?? named;
  }
  return { plies, opening: named?.name, eco: named?.eco };
}
