// Chess.com Published-Data API (public, read-only, no login): https://www.chess.com/news/view/published-data-api
const API = 'https://api.chess.com/pub/player';

export interface ChesscomPlayer {
  username: string;
  rating: number;
  result: string; // "win", "checkmated", "resigned", "timeout", "agreed", "repetition", ...
}

export interface ChesscomGame {
  url: string;
  pgn: string;
  timeClass: string; // bullet | blitz | rapid | daily
  timeControl: string;
  endTime: number; // epoch seconds
  rated: boolean;
  rules: string; // "chess" for standard games
  white: ChesscomPlayer;
  black: ChesscomPlayer;
}

interface RawGame {
  url: string;
  pgn?: string;
  time_class: string;
  time_control: string;
  end_time: number;
  rated: boolean;
  rules: string;
  white: ChesscomPlayer;
  black: ChesscomPlayer;
}

async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Could not reach Chess.com. Check your internet connection.');
  }
  if (res.status === 404) throw new Error('Player not found on Chess.com.');
  if (res.status === 429) throw new Error('Chess.com is rate-limiting requests. Try again in a minute.');
  if (!res.ok) throw new Error(`Chess.com answered with HTTP ${res.status}.`);
  return (await res.json()) as T;
}

/** Monthly archive URLs, newest first. */
export async function fetchArchives(username: string): Promise<string[]> {
  const user = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,25}$/.test(user)) throw new Error('That does not look like a Chess.com username.');
  const data = await getJson<{ archives: string[] }>(`${API}/${encodeURIComponent(user)}/games/archives`);
  return [...(data.archives ?? [])].reverse();
}

/** Games of one monthly archive, newest first. */
export async function fetchArchive(url: string): Promise<ChesscomGame[]> {
  if (!url.startsWith(`${API}/`)) throw new Error('Unexpected archive URL.');
  const data = await getJson<{ games: RawGame[] }>(url);
  return (data.games ?? [])
    .filter((g) => g.pgn)
    .map((g) => ({
      url: g.url, pgn: g.pgn!, timeClass: g.time_class, timeControl: g.time_control, endTime: g.end_time,
      rated: g.rated, rules: g.rules, white: g.white, black: g.black,
    }))
    .reverse();
}

/** "2026/11" from an archive URL. */
export function archiveLabel(url: string): string {
  const m = url.match(/(\d{4})\/(\d{2})$/);
  if (!m) return url;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

export function resultFor(game: ChesscomGame, username: string): 'win' | 'loss' | 'draw' {
  const me = game.white.username.toLowerCase() === username.toLowerCase() ? game.white : game.black;
  if (me.result === 'win') return 'win';
  const draws = ['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'];
  return draws.includes(me.result) ? 'draw' : 'loss';
}
