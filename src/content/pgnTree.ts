import { Chess } from 'chess.js';
import { parsePgn, type ChildNode, type PgnNodeData } from 'chessops/pgn';
import { START_FEN } from '../engine/fen';
import type { Opening, Side, TreeNode } from '../engine/types';

export interface ParsedPgn {
  headers: Record<string, string>;
  root: TreeNode;
  errors: string[];
}

const NAME_RE = /\[%name\s+([^\]]+)\]/;

/** Line name annotation embedded in a comment: { [%name Giuoco Piano] ... } */
export function extractName(comment: string | undefined): string | undefined {
  return comment?.match(NAME_RE)?.[1].trim();
}

export function stripAnnotations(comment: string): string {
  return comment.replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
}

function joinComments(data: PgnNodeData): string | undefined {
  const parts = [...(data.startingComments ?? []), ...(data.comments ?? [])]
    .map((c) => c.trim())
    .filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

export interface ParseOptions {
  /** Merge every game in the file into one tree (e.g. a Lichess study export). Default: first game only. */
  allGames?: boolean;
  /** Safety cap on tree size; parsing stops with an error beyond it. */
  maxNodes?: number;
}

export const DEFAULT_MAX_NODES = 5000;

/**
 * Parse PGN text into a move tree with FENs. Variations and comments are preserved.
 * Illegal moves are reported in `errors` and their subtree dropped. Repeated branches
 * (also across games) are merged; the first non-empty comment wins.
 */
export function parsePgnTree(text: string, opts: ParseOptions = {}): ParsedPgn & { games: number; usedGames: number } {
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
  const games = parsePgn(text);
  if (!games.length) return { headers: {}, root: emptyRoot(START_FEN), errors: ['No game found in PGN'], games: 0, usedGames: 0 };
  const headers: Record<string, string> = {};
  for (const [k, v] of games[0].headers) headers[k] = v;
  const errors: string[] = [];
  let root: TreeNode;
  try {
    root = emptyRoot(new Chess(headers.FEN || START_FEN).fen());
  } catch (e) {
    return { headers, root: emptyRoot(START_FEN), errors: [`Invalid FEN header: ${(e as Error).message}`], games: games.length, usedGames: 0 };
  }

  let nodes = 0;
  let capped = false;
  let firstCreated: TreeNode | undefined; // first new node of the game being merged
  const build = (parent: TreeNode, children: ChildNode<PgnNodeData>[], path: string, label: string) => {
    for (const child of children) {
      if (capped) return;
      const chess = new Chess(parent.fen);
      let move;
      try {
        move = chess.move(child.data.san);
      } catch {
        errors.push(`${label}Illegal move ${child.data.san} after ${path ? path.replace(/\./g, ' ') : 'the start position'}`);
        continue;
      }
      const id = path ? `${path}.${move.san}` : move.san;
      const comment = joinComments(child.data);
      let node = parent.children.find((c) => c.uci === move.lan);
      if (node) {
        if (!node.comment && comment) node.comment = comment;
      } else {
        if (++nodes > maxNodes) {
          capped = true;
          errors.push(`Stopped after ${maxNodes} moves: this PGN is too large for an opening tree. Import a smaller file or fewer games.`);
          return;
        }
        node = { id, san: move.san, uci: move.lan, fen: chess.fen(), comment, children: [] };
        parent.children.push(node);
        firstCreated ??= node;
      }
      build(node, child.children, id, label);
    }
  };

  const toUse = opts.allGames ? games : games.slice(0, 1);
  let usedGames = 0;
  toUse.forEach((game, i) => {
    const label = toUse.length > 1 ? `Game ${i + 1}: ` : '';
    const fen = game.headers.get('FEN');
    if (i > 0 && fen && posKeyOf(fen) !== posKeyOf(root.fen)) {
      errors.push(`${label}starts from a different position and was skipped`);
      return;
    }
    usedGames++;
    firstCreated = undefined;
    build(root, game.moves.children, '', label);
    // When merging chapters, name the branch each game adds after its chapter title.
    const title = chapterTitle(game.headers);
    const node = firstCreated as TreeNode | undefined; // assigned inside build()
    if (toUse.length > 1 && title && node && !extractName(node.comment)) {
      node.comment = `[%name ${title}]${node.comment ? ` ${node.comment}` : ''}`;
    }
  });
  if (!root.children.length && !errors.length) errors.push('No moves found in this PGN');
  return { headers, root, errors, games: games.length, usedGames };
}

/** "My study: Advance" -> "Advance"; Lichess also sets ChapterName on some exports. */
function chapterTitle(headers: Map<string, string>): string | undefined {
  const raw = headers.get('ChapterName') || headers.get('Event');
  if (!raw || raw === '?') return undefined;
  const parts = raw.split(': ');
  return (parts.length > 1 ? parts.slice(1).join(': ') : raw).replace(/[[\]]/g, '').trim() || undefined;
}

function posKeyOf(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

function emptyRoot(fen: string): TreeNode {
  return { id: '', san: '', uci: '', fen, children: [] };
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export interface OpeningMeta {
  id: string;
  source: Opening['source'];
  name?: string;
  side?: Side;
  tags?: string[];
  eco?: string;
  updatedAt?: number;
}

export function parseSide(v: string | undefined): Side | undefined {
  const s = v?.toLowerCase();
  return s === 'white' || s === 'black' ? s : undefined;
}

/** Defaults for the import form, guessed from the PGN headers. */
export function suggestImportMeta(
  headers: Record<string, string>, multiGame = false,
): { name: string; side?: Side; eco: string; tags: string[] } {
  let event = headers.Event && headers.Event !== '?' ? headers.Event : '';
  // "Study: Chapter" from a multi-chapter export -> the study name
  if (multiGame && event.includes(': ')) event = event.split(': ')[0];
  return {
    name: headers.Opening || (multiGame ? '' : headers.ChapterName) || event || '',
    side: parseSide(headers.Side) ?? parseSide(headers.Orientation),
    eco: /^[A-E]\d\d$/.test(headers.ECO ?? '') ? headers.ECO : '',
    tags: headers.Tags ? headers.Tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
  };
}

/** Build an Opening from PGN text. Header values are overridden by `meta` when given. */
export function openingFromPgn(text: string, meta: OpeningMeta & ParseOptions): { opening: Opening; errors: string[] } {
  const { headers, root, errors } = parsePgnTree(text, meta);
  const side = meta.side ?? parseSide(headers.Side);
  if (!side) errors.push('Missing [Side "white"|"black"] header');
  const diff = Number(headers.Difficulty);
  const opening: Opening = {
    id: meta.id,
    name: meta.name ?? headers.Opening ?? headers.Event ?? meta.id,
    eco: meta.eco ?? headers.ECO ?? '',
    ...(headers.Origin?.trim() ? { origin: headers.Origin.trim() } : {}),
    side: side ?? 'white',
    tags: meta.tags ?? (headers.Tags ? headers.Tags.split(',').map((t) => t.trim()).filter(Boolean) : []),
    difficulty: diff === 2 || diff === 3 ? diff : 1,
    source: meta.source,
    root,
    pgn: meta.source === 'imported' ? text : undefined,
    updatedAt: meta.updatedAt ?? 0,
  };
  return { opening, errors };
}
