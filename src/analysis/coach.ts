// "Coach Nova": an original, upbeat commentator for the game review. Comments are built from
// templates plus what the engine found (hanging pieces, missed mates, sacrifices, the opening).
import { Chess, type Square } from 'chess.js';
import { CLASS_LABEL, uciToSan, type MoveReview, type PositionAnalysis, type Review } from './review';

export const COACH_NAME = 'Coach Nova';

const PIECE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function pick<T>(list: T[], seed: number): T {
  return list[Math.abs(seed * 2654435761) % list.length];
}

function movedPiece(m: MoveReview): string {
  const c = m.move.san[0];
  return PIECE[c === c.toUpperCase() && 'KQRBN'.includes(c) ? c.toLowerCase() : 'p'];
}

/** What a UCI move captures in `fen`, e.g. "queen", or undefined. */
function captures(fen: string, uci?: string): string | undefined {
  if (!uci) return undefined;
  const c = new Chess(fen);
  const target = c.get(uci.slice(2, 4) as Square);
  if (target) return PIECE[target.type];
  const p = c.get(uci.slice(0, 2) as Square);
  if (p?.type === 'p' && uci[0] !== uci[2]) return 'pawn'; // en passant
  return undefined;
}

/** Mate in N for the side that just moved? (from the position after the move, White POV eval) */
function mateFor(pos: PositionAnalysis | undefined, color: 'w' | 'b'): number | undefined {
  const m = pos?.eval.mate;
  if (m === undefined || pos?.eval.over) return undefined;
  return (color === 'w' ? m > 0 : m < 0) ? Math.abs(m) : undefined;
}

export function coachComment(r: MoveReview, before: PositionAnalysis | undefined, after: PositionAnalysis | undefined, opening?: string): string {
  const s = r.ply;
  const san = r.move.san;
  const me = r.move.color;
  const opp = me === 'w' ? 'b' : 'w';
  const piece = movedPiece(r);
  const best = r.bestSan;
  const reply = after?.lines[0];
  const replySan = reply ? uciToSan(r.move.fenAfter, reply.uci) : undefined;
  const replyWins = captures(r.move.fenAfter, reply?.uci);
  const bestWins = captures(r.move.fenBefore, r.bestUci);
  const theirMate = mateFor(after, opp);
  const missedMate = mateFor(before, me);
  const ownMate = mateFor(after, me);

  if (san.endsWith('#')) return pick(['Checkmate! Game over, and what a way to finish it.', `${san} — and that's mate. Clean, precise, done.`], s);

  switch (r.classification) {
    case 'book':
      return pick([
        `Still in the books${opening ? ` — this is the ${opening}` : ''}. Nothing to worry about yet.`,
        `Theory move. Both players know their ${opening ?? 'opening'} so far.`,
        `${san} is the standard move here. Develop, fight for the centre, keep going.`,
      ], s);
    case 'forced':
      return `Only one legal move, so ${san} it is. Nothing to think about.`;
    case 'brilliant':
      return pick([
        `WOW. ${san} gives up the ${piece} and it works! That's the kind of move you remember.`,
        `Brilliant! The ${piece} is offered, but taking it is poison. Fantastic calculation.`,
        `${san}!! A real sacrifice — the ${piece} is hanging on purpose and the position backs it up.`,
      ], s);
    case 'great':
      return pick([
        `Great find! ${san} was the only move that holds everything together.`,
        `${san} — the one move that keeps the advantage. Everything else lets it slip.`,
        `Only move, and you found it. That's great chess.`,
      ], s);
    case 'best':
      if (ownMate) return `${san} and there's a forced mate in ${ownMate} now. Can you see it?`;
      if (san.includes('O-O')) return pick(['Castling — the king gets safe and the rook joins the game. Best.', 'King safety first. Exactly what the engine wanted.'], s);
      return pick([
        `${san} is the best move here. Exactly what the engine would play.`,
        `Top engine choice. ${san} keeps everything under control.`,
        `${san} — spot on.`,
        san.includes('x') ? `Taking with ${san} is correct. Grab what's yours.` : `Calm and accurate. ${san} is the best move.`,
      ], s);
    case 'excellent':
      return pick([`${san} is excellent — practically as good as the top move.`, `Very good move. ${best ? `${best} was a hair better, but ` : ''}this is just fine.`], s);
    case 'good':
      return pick([`${san} is a decent move, but ${best ?? 'something else'} was a bit stronger.`, `Solid enough. ${best ? `The engine liked ${best} more.` : ''}`], s);
    case 'inaccuracy':
      return pick([
        `${san} is a little imprecise. ${best ? `${best} was more to the point.` : ''}`,
        `Not a disaster, but ${san} lets some of the advantage go. ${best ? `Look at ${best}.` : ''}`,
      ], s);
    case 'mistake':
      if (theirMate) return `Careful! After ${san} your opponent has mate in ${theirMate}${replySan ? `, starting with ${replySan}` : ''}.`;
      if (replyWins && replyWins !== 'pawn') return `${san} is a mistake — it lets your opponent win a ${replyWins}${replySan ? ` with ${replySan}` : ''}.`;
      return pick([
        `Hmm, ${san} is a mistake. ${best ? `${best} was the move.` : ''}`,
        `That one hurts a bit. ${san} hands over a real chunk of your position. ${best ? `${best} instead!` : ''}`,
      ], s);
    case 'miss':
      if (missedMate) return `Oh no — you had mate in ${missedMate}${best ? ` starting with ${best}` : ''}! ${san} lets it slip.`;
      if (bestWins && bestWins !== 'pawn') return `Your opponent just gave you a chance: ${best} would have won the ${bestWins}. ${san} misses it.`;
      return `There was something big here and ${san} misses it. ${best ? `Try ${best}.` : ''} Always check captures and checks after your opponent makes a mistake!`;
    case 'blunder':
      if (theirMate) return `OOF. ${san} walks into mate in ${theirMate}${replySan ? ` — ${replySan}` : ''}. Always check for checks!`;
      if (replyWins && replyWins !== 'pawn') return pick([
        `BLUNDER. ${san} just hangs the ${replyWins}${replySan ? ` to ${replySan}` : ''}. Before every move: what can my opponent take?`,
        `Ouch — ${san} drops a ${replyWins}. ${best ? `${best} kept everything safe.` : ''}`,
      ], s);
      return pick([
        `${san} is a blunder. The evaluation swings hard against you. ${best ? `${best} was needed.` : ''}`,
        `This is the moment the game turns. ${san}?? ${best ? `${best} holds.` : ''}`,
      ], s);
    default:
      return '';
  }
}

/** Opening remarks before move 1: result, accuracies and the key moment. */
export function coachSummary(review: Review, names: { white: string; black: string }, result: string, opening?: string): string {
  if (!review.complete) return `Give me a moment, I'm going through the game with the engine…`;
  const wa = review.white.accuracy ?? 0;
  const ba = review.black.accuracy ?? 0;
  const winner = result === '1-0' ? names.white : result === '0-1' ? names.black : undefined;
  const swing = [...review.moves]
    .filter((m) => m.winBefore !== undefined && m.winAfter !== undefined && m.classification !== 'book')
    .sort((a, b) => (b.winBefore! - b.winAfter!) - (a.winBefore! - a.winAfter!))[0];
  const bad = (side: 'w' | 'b') => review.moves.filter((m) => m.move.color === side && (m.classification === 'blunder' || m.classification === 'miss')).length;
  const parts = [
    winner ? `${winner} wins this one${opening ? ` out of the ${opening}` : ''}.` : `A draw${opening ? ` in the ${opening}` : ''}.`,
    Math.abs(wa - ba) < 5 ? `Accuracy was close: ${wa.toFixed(1)} vs ${ba.toFixed(1)}.` : `${wa > ba ? names.white : names.black} played more accurately (${Math.max(wa, ba).toFixed(1)} vs ${Math.min(wa, ba).toFixed(1)}).`,
  ];
  if (swing && swing.winBefore! - swing.winAfter! > 15) {
    const no = `${swing.move.fenBefore.split(' ')[5]}${swing.move.color === 'w' ? '.' : '...'}`;
    parts.push(`The big turning point was ${no}${swing.move.san} (${CLASS_LABEL[swing.classification!].toLowerCase()}).`);
  }
  const total = bad('w') + bad('b');
  if (total >= 4) parts.push(`Lesson of the day: blunder check! Before each move, look at every check and capture for your opponent.`);
  else if (total === 0) parts.push(`No blunders at all — that's a really clean game.`);
  return parts.join(' ');
}
