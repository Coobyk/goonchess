import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { defaultRuleset } from '../engine/presets';

const BEHAVIORS = ['normal', 'void', 'impassable', 'portal'] as const;

export default function SettingsPanel() {
  const game = useGameStore(s => s.game);
  const updateRuleset = useGameStore(s => s.updateRuleset);
  const openModal = useGameStore(s => s.openModal);
  const r = game.ruleset;

  const [w, setW] = useState(r.board.width);
  const [h, setH] = useState(r.board.height);
  const [light, setLight] = useState(r.board.lightColor);
  const [dark, setDark] = useState(r.board.darkColor);
  const [paintBehavior, setPaintBehavior] = useState<typeof BEHAVIORS[number]>('normal');

  const applyBoard = () => {
    const nw = Math.min(16, Math.max(4, w));
    const nh = Math.min(16, Math.max(4, h));
    const tiles = Array.from({ length: nh }, (_, y) =>
      Array.from({ length: nw }, (_, x) => {
        const old = r.board.tiles[y]?.[x];
        return old ? { ...old } : { behavior: 'normal' as const };
      })
    );
    const newR = { ...r, board: { ...r.board, width: nw, height: nh, tiles, lightColor: light, darkColor: dark } };
    updateRuleset(newR);
  };

  const paintTile = (x: number, y: number) => {
    const tiles = r.board.tiles.map(row => row.map(t => ({ ...t })));
    if (!tiles[y]?.[x]) return;
    tiles[y][x].behavior = paintBehavior;
    if (paintBehavior === 'portal') {
      tiles[y][x].portalTarget = { x: r.board.width - 1 - x, y: r.board.height - 1 - y };
    }
    const newR = { ...r, board: { ...r.board, tiles } };
    updateRuleset(newR);
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="font-semibold mb-1">Board Dimensions</div>
        <div className="flex gap-2 items-center">
          <label>W</label>
          <input type="number" value={w} onChange={e => setW(+e.target.value)} className="w-16 bg-neutral-800 border border-neutral-700 px-1" />
          <label>H</label>
          <input type="number" value={h} onChange={e => setH(+e.target.value)} className="w-16 bg-neutral-800 border border-neutral-700 px-1" />
          <button onClick={applyBoard} className="px-2 py-1 border border-neutral-700 hover:bg-neutral-800">Apply</button>
        </div>
        <div className="flex gap-2 items-center mt-2">
          <label>Light</label>
          <input type="color" value={light} onChange={e => setLight(e.target.value)} />
          <label>Dark</label>
          <input type="color" value={dark} onChange={e => setDark(e.target.value)} />
        </div>
      </div>

      <div>
        <div className="font-semibold mb-1">Tile Painter</div>
        <div className="flex gap-1 flex-wrap mb-2">
          {BEHAVIORS.map(b => (
            <button key={b} onClick={() => setPaintBehavior(b)}
              className={`px-2 py-1 border border-neutral-700 text-xs ${paintBehavior === b ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}>
              {b}
            </button>
          ))}
        </div>
        <div className="text-xs text-neutral-400 mb-1">Click tiles below to paint.</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${r.board.width}, 16px)`, gap: 1 }}>
          {Array.from({ length: r.board.height }, (_, y) =>
            Array.from({ length: r.board.width }, (_, x) => (
              <div key={`${x}-${y}`} onClick={() => paintTile(x, y)}
                className="w-4 h-4 cursor-pointer border border-neutral-700"
                style={{ backgroundColor: r.board.tiles[y][x].behavior === 'void' ? '#000' : r.board.tiles[y][x].behavior === 'impassable' ? '#444' : r.board.tiles[y][x].behavior === 'portal' ? '#0ff' : ((x+y)%2===0 ? light : dark) }}
              />
            ))
          )}
        </div>
      </div>

      <div>
        <div className="font-semibold mb-1">Piece Creator</div>
        <button onClick={() => openModal('pieceCreator')} className="px-2 py-1 border border-neutral-700 hover:bg-neutral-800 text-sm">Open Piece Creator</button>
      </div>

      <div>
        <div className="font-semibold mb-1">Win Conditions</div>
        <div className="text-xs text-neutral-400">Current: {r.winConditions.map(w => w.kind).join(', ')}</div>
      </div>

      <div>
        <button onClick={() => updateRuleset(defaultRuleset())} className="px-2 py-1 border border-neutral-700 hover:bg-neutral-800 text-sm">Reset to Default</button>
      </div>
    </div>
  );
}
