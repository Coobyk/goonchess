import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { isInCheck, getPseudoMoves, getLegalMoves } from '../engine/engine';
import PieceIcon from './PieceIcon';

export default function Board() {
  const game = useGameStore(s => s.game);
  const selected = useGameStore(s => s.selected);
  const legalMoves = useGameStore(s => s.legalMoves);
  const visualizer = useGameStore(s => s.visualizer);
  const selectSquare = useGameStore(s => s.selectSquare);
  const selectedStore = useGameStore(s => s.selected);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const { board, ruleset } = game;
  const hoverMoves = (!selectedStore && hover) ? getLegalMoves(game, hover.x, hover.y) : [];
  const w = ruleset.board.width;
  const h = ruleset.board.height;

  // attack squares in visualizer mode
  const attackMap: Record<string, { from: {x:number;y:number}[] }> = {};
  const attackArrows: { fx:number; fy:number; tx:number; ty:number }[] = [];
  if (visualizer) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const id = board[y][x];
        if (!id) continue;
        const inst = game.pieces[id];
        if (!inst || inst.team !== game.turn) continue;
        const moves = getPseudoMoves(game, x, y).filter((m: any) => !!m.capturedId);
        for (const m of moves) {
          const key = `${m.finalTo.x},${m.finalTo.y}`;
          if (!attackMap[key]) attackMap[key] = { from: [] };
          attackMap[key].from.push({ x, y });
          attackArrows.push({ fx: x, fy: y, tx: m.finalTo.x, ty: m.finalTo.y });
        }
      }
    }
  }

  const inCheckSquares = new Set<string>();
  if (isInCheck(game, game.turn)) {
    // highlight royal pieces
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const id = board[y][x];
        if (!id) continue;
        const inst = game.pieces[id];
        const pt = inst ? game.pieceTypes[inst.typeId] : null;
        if (inst && inst.team === game.turn && pt?.modifiers.royal) inCheckSquares.add(`${x},${y}`);
      }
  }

  return (
    <div className="inline-block border border-neutral-700 bg-neutral-900 p-1 relative">
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${w}, 1fr)`, gap: 0, position: 'relative' }}>
        {Array.from({ length: h }, (_, y) =>
          Array.from({ length: w }, (_, x) => {
            const tile = ruleset.board.tiles[y][x];
            const isLight = (x + y) % 2 === 0;
            const baseColor = isLight ? ruleset.board.lightColor : ruleset.board.darkColor;
            const color = tile.colorOverride ?? baseColor;
            const pieceId = board[y][x];
            const piece = pieceId ? game.pieces[pieceId] : null;
            const pt = piece ? game.pieceTypes[piece.typeId] : null;
            const isSelected = selected?.x === x && selected?.y === y;
            const isMoveDest = legalMoves.some(m => m.finalTo.x === x && m.finalTo.y === y);
            const isCaptureDest = legalMoves.some(m => m.finalTo.x === x && m.finalTo.y === y && !!m.capturedId);
            const isHoverDest = hoverMoves.some(m => m.finalTo.x === x && m.finalTo.y === y);
            const isHoverCapture = hoverMoves.some(m => m.finalTo.x === x && m.finalTo.y === y && !!m.capturedId);
            const attack = attackMap[`${x},${y}`];
            const inCheck = inCheckSquares.has(`${x},${y}`);
            return (
              <div
                key={`${x}-${y}`}
                onClick={() => selectSquare(x, y)}
                onMouseEnter={() => setHover({ x, y })}
                onMouseLeave={() => setHover(null)}
                className="relative flex items-center justify-center cursor-pointer select-none"
                style={{
                  width: 56, height: 56,
                  backgroundColor: color,
                  outline: isSelected ? '2px solid #facc15' : inCheck ? '2px solid #ef4444' : 'none',
                  boxSizing: 'border-box',
                }}
              >
                {tile.behavior === 'void' && (
                  <div className="absolute inset-0 bg-black/70" />
                )}
                {tile.behavior === 'impassable' && (
                  <div className="absolute inset-0 bg-neutral-800/80 flex items-center justify-center text-neutral-500 text-xs">✕</div>
                )}
                {tile.behavior === 'portal' && (
                  <div className="absolute top-1 left-1 text-[10px] text-cyan-300">P</div>
                )}
                {piece && pt && (
                  pt.svg
                    ? <img src={pt.svg} alt={`${piece.team} ${pt.name}`} style={{ width: 40, height: 40 }} />
                    : ['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'].includes(pt.name)
                      ? <PieceIcon name={pt.name} team={piece.team} />
                      : <span style={{ fontSize: 32, lineHeight: 1 }}>{pt.symbol}</span>
                )}
                {(isMoveDest || isHoverDest) && !(isCaptureDest || isHoverCapture) && (
                  <div className="absolute w-3 h-3 rounded-full bg-black/40" />
                )}
                {(isCaptureDest || isHoverCapture) && (
                  <div className="absolute inset-1 border-2 border-red-500/50 rounded-none pointer-events-none" />
                )}
                {visualizer && attack && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-red-500 text-xs font-bold">●</div>
                    <div className="absolute top-0 left-0 text-[9px] text-red-400">{attack.from.length}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {visualizer && (
        <svg className="absolute inset-0 pointer-events-none" style={{ width: w*56 + 2, height: h*56 + 2 }} viewBox={`0 0 ${w*56} ${h*56}`}>
          <defs>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="#ef4444" />
            </marker>
          </defs>
          {attackArrows.map((a,i) => (
            <line key={i}
              x1={a.fx*56 + 28} y1={a.fy*56 + 28}
              x2={a.tx*56 + 28} y2={a.ty*56 + 28}
              stroke="#ef4444" strokeWidth="1.5" markerEnd="url(#arrow)" opacity="0.7" />
          ))}
        </svg>
      )}
    </div>
  );
}
