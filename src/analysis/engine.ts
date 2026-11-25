// Thin UCI wrapper around Stockfish 19 lite (single-threaded WASM) running in a Web Worker.
// The engine files live in public/engine/ (GPL-3.0, from the `stockfish` npm package).
import type { EngineLine, Eval, PositionAnalysis } from './review';

export interface SearchLimits {
  depth: number;
  movetime: number; // ms; whichever limit is hit first stops the search
  multipv: number;
}

export const DEPTH_PRESETS: Record<'fast' | 'standard' | 'deep', SearchLimits> = {
  fast: { depth: 12, movetime: 700, multipv: 3 },
  standard: { depth: 16, movetime: 1800, multipv: 3 },
  deep: { depth: 20, movetime: 4500, multipv: 3 },
};

function engineUrl(): string {
  const base = import.meta.env.BASE_URL;
  const wasm = new URL(`${base}engine/stockfish-19-lite-single.wasm`, location.href).href;
  return `${base}engine/stockfish-19-lite-single.js#${encodeURIComponent(wasm)}`;
}

/** Parse one UCI "info" line into (multipv, line) with the score from White's view. */
export function parseInfo(line: string, whiteToMove: boolean): { multipv: number; depth: number; line: EngineLine } | null {
  if (!line.startsWith('info ') || !line.includes(' pv ') || !line.includes(' score ')) return null;
  const t = line.split(' ');
  const at = (k: string) => t.indexOf(k);
  const depth = Number(t[at('depth') + 1]);
  const multipv = at('multipv') >= 0 ? Number(t[at('multipv') + 1]) : 1;
  const kind = t[at('score') + 1];
  const raw = Number(t[at('score') + 2]);
  const sign = whiteToMove ? 1 : -1;
  const ev: Eval = kind === 'mate' ? { mate: raw * sign } : { cp: raw * sign };
  const pv = t.slice(at('pv') + 1);
  return { multipv, depth, line: { uci: pv[0], eval: ev, pv } };
}

export class Engine {
  private worker: Worker;
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private listener: ((line: string) => void) | null = null;
  private dead = false;

  constructor() {
    this.worker = new Worker(engineUrl());
    this.worker.onmessage = (e: MessageEvent) => {
      const text = typeof e.data === 'string' ? e.data : String(e.data);
      for (const l of text.split('\n')) if (l) this.listener?.(l);
    };
    this.ready = this.waitFor('uciok', 'uci').then(() => this.waitFor('readyok', 'isready'));
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private waitFor(token: string, cmd: string, onLine?: (l: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.dead) return reject(new Error('engine stopped'));
      this.listener = (l) => {
        onLine?.(l);
        if (l.startsWith(token)) {
          this.listener = null;
          resolve();
        }
      };
      this.worker.onerror = (err) => reject(new Error(err.message || 'Engine failed to load'));
      this.send(cmd);
    });
  }

  /** Analyse one position. Calls are queued, so they never overlap. */
  analyse(fen: string, limits: SearchLimits): Promise<PositionAnalysis> {
    const run = async (): Promise<PositionAnalysis> => {
      await this.ready;
      const whiteToMove = fen.split(' ')[1] !== 'b';
      const lines = new Map<number, EngineLine>();
      let depth = 0;
      this.send(`setoption name MultiPV value ${limits.multipv}`);
      this.send(`position fen ${fen}`);
      await this.waitFor('bestmove', `go depth ${limits.depth} movetime ${limits.movetime}`, (l) => {
        const info = parseInfo(l, whiteToMove);
        if (!info) return;
        lines.set(info.multipv, info.line);
        if (info.multipv === 1) depth = info.depth;
      });
      const sorted = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      return { eval: sorted[0]?.eval ?? { cp: 0 }, lines: sorted, depth };
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  stop() {
    if (this.dead) return;
    this.dead = true;
    this.listener = null;
    this.worker.terminate();
  }
}
