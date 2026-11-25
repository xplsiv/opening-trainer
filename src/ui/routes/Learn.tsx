import { useEffect, useMemo, useState } from 'react';
import { stripAnnotations } from '../../content/pgnTree';
import { formatMove, pathTo } from '../../engine/tree';
import type { Side } from '../../engine/types';
import { Board } from '../components/Board';
import { useAppData } from '../data';
import { href, navigate } from '../router';
import { repo } from '../../db/repo';

export function Learn({ openingId }: { openingId: string }) {
  const { indexes, counts } = useAppData();
  const index = indexes.get(openingId);
  const [lineId, setLineId] = useState<string>(() => index?.lines[0]?.id ?? '');
  const [nodeId, setNodeId] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const side: Side = index?.opening.side ?? 'white';
  const orientation: Side = flipped ? (side === 'white' ? 'black' : 'white') : side;
  const removeImported = async () => {
    await repo.deleteImportedOpening(openingId);
    navigate('');
  };

  const line = index?.lines.find((l) => l.id === lineId) ?? index?.lines[0];
  const node = index?.byId.get(nodeId) ?? index?.opening.root;
  const path = useMemo(() => (index ? pathTo(index, nodeId) : []), [index, nodeId]);

  const nextNode = () => {
    if (!index || !node) return undefined;
    const pos = line?.nodes.findIndex((n) => n.id === node.id) ?? -1;
    if (line && (pos >= 0 || node.id === '') && line.nodes[pos + 1]) return line.nodes[pos + 1];
    return node.children[0];
  };

  const goTo = (id: string) => {
    setNodeId(id);
    if (!index) return;
    const through = index.linesThrough.get(id) ?? [];
    if (!through.includes(lineId) && through[0]) setLineId(through[0]);
  };
  const forward = () => { const n = nextNode(); if (n) goTo(n.id); };
  const back = () => { if (index && nodeId) setNodeId(index.parentOf.get(nodeId)?.id ?? ''); };
  const cycleLine = (dir: 1 | -1) => {
    if (!index) return;
    // switch among lines passing through the current node's parent (sibling variations)
    const lines = index.lines;
    const i = lines.findIndex((l) => l.id === line?.id);
    const next = lines[(i + dir + lines.length) % lines.length];
    setLineId(next.id);
    const keep = path.filter((n, k) => next.nodes[k]?.id === n.id);
    setNodeId(keep.length ? keep[keep.length - 1].id : '');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cycleLine(-1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); cycleLine(1); }
      else if (e.key === 'f' || e.key === 'F') setFlipped((f) => !f);
      else if (e.key === 'Home') setNodeId('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!index || !node || !line) return <div className="page"><p>Opening not found.</p><a href="#/">Back</a></div>;
  const o = index.opening;
  const c = counts(o.id);
  const comment = node.comment ? stripAnnotations(node.comment) : '';
  const lastMove: [string, string] | undefined = node.uci ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : undefined;

  return (
    <div className="page play">
      <div className="board-col">
        <Board
          fen={node.fen}
          orientation={orientation}
          interactive
          onlyMoves={node.children.map((ch) => ch.uci)}
          onMove={(uci) => { const ch = node.children.find((x) => x.uci === uci.slice(0, 4) || x.uci === uci); if (ch) goTo(ch.id); }}
          lastMove={lastMove}
        />
        <div className="controls">
          <button className="btn" onClick={() => setNodeId('')} aria-label="Start position">⏮</button>
          <button className="btn" onClick={back} disabled={!nodeId} aria-label="Back">◀</button>
          <button className="btn" onClick={forward} disabled={!node.children.length} aria-label="Forward">▶</button>
          <button className="btn" onClick={() => setFlipped((f) => !f)} aria-label="Flip board">⇅</button>
        </div>
      </div>

      <aside className="panel">
        <header className="panel-head">
          <h1>{o.name}</h1>
          <div className="opening-meta">{o.eco ? `${o.eco} · ` : ''}{o.origin ? `${o.origin} · ` : ''}you play {o.side} ·{c.learned}/{c.new + c.learning + c.due + c.learned} learned</div>
        </header>

        <label className="field">
          <span>Variation</span>
          <select value={line.id} onChange={(e) => { setLineId(e.target.value); setNodeId(''); }}>
            {index.lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>

        <div className="comment" aria-live="polite">{comment || (node.id ? '' : 'Step through the line with ▶ or play the moves on the board.')}</div>

        {node.children.length > 1 && (
          <div className="branches">
            <span className="muted">Book moves here:</span>
            {node.children.map((ch) => (
              <button key={ch.id} className="btn small" onClick={() => goTo(ch.id)}>{formatMove(node.fen, ch.san)}</button>
            ))}
          </div>
        )}

        <ol className="movelist">
          {line.nodes.map((n, i) => {
            const pf = i === 0 ? o.root.fen : line.nodes[i - 1].fen;
            const onPath = path[i]?.id === n.id;
            return (
              <li key={n.id}>
                <button className={`mv ${n.id === node.id ? 'current' : ''} ${onPath ? '' : 'ahead'}`} onClick={() => goTo(n.id)}>
                  {formatMove(pf, n.san)}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="panel-actions">
          <button className="btn primary big" onClick={() => navigate('quiz', { o: o.id, q: 'all' })}>Start quiz on this opening</button>
          <a className="btn" href={href('quiz', { o: o.id, q: 'all', l: line.id })}>Next-move quiz on this variation</a>
          <div className="btn-row">
            <a className="btn grow" href={href('quiz', { o: o.id, q: 'all', l: line.id, m: 'line' })}>Recall this line</a>
            <a className="btn grow" href={href('quiz', { o: o.id, q: 'all', m: 'line' })}>Recall all lines</a>
          </div>
        </div>

        {o.source === 'imported' && (
          <div className="danger-zone">
            <span className="muted small">Imported opening</span>
            {confirmDelete ? (
              <div className="btn-row">
                <button className="btn danger grow" onClick={() => void removeImported()}>Delete “{o.name}”</button>
                <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn" onClick={() => setConfirmDelete(true)}>Delete this opening…</button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
