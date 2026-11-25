import { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import type { DrawShape } from 'chessground/draw';
import { Chess } from 'chess.js';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import type { Side } from '../../engine/types';

export interface Arrow {
  from: string;
  to: string;
  brush: 'green' | 'red' | 'blue' | 'yellow';
}

interface Props {
  fen: string;
  orientation: Side;
  /** Allow the side to move to play. `onlyMoves` restricts to these UCIs (learn mode). */
  interactive?: boolean;
  onlyMoves?: string[];
  onMove?: (uci: string) => void;
  lastMove?: [string, string];
  hintSquare?: string;
  arrows?: Arrow[];
  animate?: boolean;
  /** Small SVG marker drawn on a square (100x100 viewBox), e.g. a move-quality icon. */
  badge?: { square: string; svg: string };
}

const PROMO_NAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' } as const;
const PROMO_WHITE = { q: '♕', r: '♖', b: '♗', n: '♘' } as const;
const PROMO_BLACK = { q: '♛', r: '♜', b: '♝', n: '♞' } as const;

function legalDests(fen: string, only?: string[]): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  const allowed = only ? new Set(only.map((u) => u.slice(0, 4))) : null;
  for (const m of new Chess(fen).moves({ verbose: true })) {
    if (allowed && !allowed.has(m.from + m.to)) continue;
    const list = dests.get(m.from as Key) ?? [];
    if (!list.includes(m.to as Key)) list.push(m.to as Key);
    dests.set(m.from as Key, list);
  }
  return dests;
}

function isPromotion(fen: string, from: string, to: string): boolean {
  const c = new Chess(fen);
  const piece = c.get(from as never);
  return piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
}

export function Board({ fen, orientation, interactive, onlyMoves, onMove, lastMove, hintSquare, arrows, animate = true, badge }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const fenRef = useRef(fen);
  fenRef.current = fen;

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      coordinates: true,
      animation: { enabled: true, duration: 200 },
      draggable: { enabled: true, showGhost: true },
      selectable: { enabled: true },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      drawable: { enabled: false },
      movable: {
        free: false,
        showDests: true,
        events: {
          after: (orig, dest) => {
            if (isPromotion(fenRef.current, orig, dest)) setPromo({ from: orig, to: dest });
            else onMoveRef.current?.(orig + dest);
          },
        },
      },
    });
    if (import.meta.env.DEV) (window as unknown as { __cg?: Api }).__cg = api.current;
    const ro = new ResizeObserver(() => api.current?.redrawAll());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  // Push props into chessground on every render: this also resets the board after a
  // rejected move even when the FEN prop did not change.
  useEffect(() => {
    const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white';
    const chess = new Chess(fen);
    const custom = new Map<Key, string>();
    if (hintSquare) custom.set(hintSquare as Key, 'hint');
    const shapes: DrawShape[] = (arrows ?? []).map((a) => ({ orig: a.from as Key, dest: a.to as Key, brush: a.brush }));
    if (badge) shapes.push({ orig: badge.square as Key, customSvg: { html: badge.svg } });
    const cfg: Config = {
      fen,
      orientation,
      turnColor: turn,
      check: chess.isCheck(),
      lastMove: lastMove as Key[] | undefined,
      animation: { enabled: animate },
      highlight: { custom },
      drawable: { autoShapes: shapes },
      movable: {
        color: interactive && !promo ? turn : undefined,
        dests: interactive ? legalDests(fen, onlyMoves) : new Map(),
      },
    };
    api.current?.set(cfg);
  });

  const choose = (role: string) => {
    if (!promo) return;
    const p = promo;
    setPromo(null);
    onMoveRef.current?.(p.from + p.to + role);
  };

  const turn = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  return (
    <div className="board-wrap">
      <div ref={el} className="board" />
      {promo && (
        <div className="promo" role="dialog" aria-label="Choose promotion piece">
          {(['q', 'r', 'b', 'n'] as const).map((r) => (
            <button key={r} className="promo-btn" aria-label={PROMO_NAME[r]} onClick={() => choose(r)}>
              {(turn === 'white' ? PROMO_WHITE : PROMO_BLACK)[r]}
            </button>
          ))}
          <button className="btn" onClick={() => { setPromo(null); api.current?.set({ fen }); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
