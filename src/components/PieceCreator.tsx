import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { PieceType, MovePattern, SpecialEffect, MovementVector } from '../engine/types';
import { uid } from '../engine/engine';

const TEAMS = ['white', 'black'];

export default function PieceCreator() {
  const game = useGameStore(s => s.game);
  const updateRuleset = useGameStore(s => s.updateRuleset);
  const r = game.ruleset;

  const [name, setName] = useState('Fairy');
  const [symbol, setSymbol] = useState('★');
  const [pointValue, setPointValue] = useState(3);
  const [team, setTeam] = useState('white');
  const [moveOffsets, setMoveOffsets] = useState<Set<string>>(new Set());
  const [captureOffsets, setCaptureOffsets] = useState<Set<string>>(new Set());
  const [sliderDirs, setSliderDirs] = useState<Set<string>>(new Set());
  const [captureSliderDirs, setCaptureSliderDirs] = useState<Set<string>>(new Set());
  const [isSlider, setIsSlider] = useState(false);
  const [canJump, setCanJump] = useState(false);
  const [mustCapture, setMustCapture] = useState(false);
  const [uncapturable, setUncapturable] = useState(false);
  const [royal, setRoyal] = useState(false);
  const [swap, setSwap] = useState(false);
  const [explosion, setExplosion] = useState(false);
  const [spawn, setSpawn] = useState(false);

  const GRID = 5; // -2..2
  const cells: number[] = [];
  for (let i = -2; i <= 2; i++) cells.push(i);

  const toggleOffset = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key); else n.add(key);
    setter(n);
  };

  const buildPatterns = (offsets: Set<string>, sliderDirsSet: Set<string>, sliderMode: boolean): MovePattern[] => {
    const patterns: MovePattern[] = [];
    if (sliderMode && sliderDirsSet.size > 0) {
      const dirs: MovementVector[] = [];
      for (const k of sliderDirsSet) {
        const [dx, dy] = k.split(',').map(Number);
        dirs.push({ dx, dy });
      }
      patterns.push({ kind: 'slider', directions: dirs });
    }
    if (offsets.size > 0) {
      const offs: MovementVector[] = [];
      for (const k of offsets) {
        const [dx, dy] = k.split(',').map(Number);
        offs.push({ dx, dy });
      }
      patterns.push({ kind: 'stepper', offsets: offs });
    }
    if (patterns.length === 0) patterns.push({ kind: 'stepper', offsets: [] });
    return patterns;
  };

  const save = () => {
    const effects: SpecialEffect[] = [];
    if (swap) effects.push({ kind: 'swap' });
    if (explosion) effects.push({ kind: 'explosion', radius: 1 });
    if (spawn) effects.push({ kind: 'spawn', pieceTypeId: r.pieceTypes[0]?.id ?? '', offset: { dx: 0, dy: 0 } });

    const movePattern = buildPatterns(moveOffsets, sliderDirs, isSlider);
    const capturePattern = buildPatterns(captureOffsets.size || captureSliderDirs.size ? captureOffsets : moveOffsets, captureOffsets.size ? new Set() : (captureSliderDirs.size ? captureSliderDirs : new Set()), isSlider && captureSliderDirs.size > 0);
    // If no separate capture pattern defined, leave empty (engine falls back to movePattern)
    const hasCapture = captureOffsets.size > 0 || captureSliderDirs.size > 0;
    const finalCapture = hasCapture ? capturePattern : [];

    const pt: PieceType = {
      id: uid(),
      name,
      symbol,
      pointValue,
      team,
      movePattern,
      capturePattern: finalCapture,
      modifiers: { canJump, mustCaptureToMove: mustCapture, uncapturable, royal },
      effects,
    };
    const newTypes = [...r.pieceTypes, pt];
    // add to setup at first empty square
    const setup = [...r.setup];
    outer: for (let y = 0; y < r.board.height; y++) {
      for (let x = 0; x < r.board.width; x++) {
        if (!r.setup.some(s => s.x === x && s.y === y)) {
          setup.push({ typeId: pt.id, x, y });
          break outer;
        }
      }
    }
    const newR = { ...r, pieceTypes: newTypes, setup };
    updateRuleset(newR);
    alert('Piece added: ' + name);
  };

  const renderGrid = (offsets: Set<string>, setter: (s: Set<string>) => void, label: string) => (
    <div className="mb-2">
      <div className="text-xs text-neutral-400 mb-1">{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID * 2 + 1}, 20px)`, gap: 1 }}>
        {cells.map(dy => cells.map(dx => {
          if (dx === 0 && dy === 0) {
            return <div key={`${dx},${dy}`} className="w-5 h-5 bg-neutral-700 flex items-center justify-center text-[10px]">●</div>;
          }
          const key = `${dx},${dy}`;
          const active = offsets.has(key);
          return (
            <div key={key}
              onClick={() => toggleOffset(offsets, setter, key)}
              className={`w-5 h-5 border border-neutral-700 cursor-pointer ${active ? 'bg-yellow-500' : 'bg-neutral-800 hover:bg-neutral-700'}`}
            />
          );
        }))}
      </div>
    </div>
  );

  const sliderToggle = (set: Set<string>, setter: (s: Set<string>) => void, dir: {dx:number;dy:number}) => {
    const key = `${dir.dx},${dir.dy}`;
    return (
      <button key={key} onClick={() => toggleOffset(set, setter, key)}
        className={`px-1 py-0.5 border border-neutral-700 text-xs ${set.has(key) ? 'bg-yellow-500 text-black' : 'hover:bg-neutral-800'}`}>
        {dir.dx},{dir.dy}
      </button>
    );
  };

  const dirs8 = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:-1,dy:-1}];

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-neutral-400">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 px-1" />
        </div>
        <div>
          <label className="text-xs text-neutral-400">Symbol</label>
          <input value={symbol} onChange={e => setSymbol(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 px-1" />
        </div>
        <div>
          <label className="text-xs text-neutral-400">Point Value</label>
          <input type="number" value={pointValue} onChange={e => setPointValue(+e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 px-1" />
        </div>
        <div>
          <label className="text-xs text-neutral-400">Team</label>
          <select value={team} onChange={e => setTeam(e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 px-1">
            {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs"><input type="checkbox" checked={isSlider} onChange={e => setIsSlider(e.target.checked)} /> Slider mode</label>
      </div>

      {isSlider ? (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Slider Directions (move)</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {dirs8.map(d => sliderToggle(sliderDirs, setSliderDirs, d))}
          </div>
          <div className="text-xs text-neutral-400 mb-1">Slider Directions (capture) - optional</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {dirs8.map(d => sliderToggle(captureSliderDirs, setCaptureSliderDirs, d))}
          </div>
        </div>
      ) : null}

      <div>
        {renderGrid(moveOffsets, setMoveOffsets, 'Move offsets (stepper) - click cells')}
        {renderGrid(captureOffsets, setCaptureOffsets, 'Capture offsets (stepper) - optional, leave empty to use move')}
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-xs"><input type="checkbox" checked={canJump} onChange={e => setCanJump(e.target.checked)} /> Can jump (leaper)</label>
        <label className="text-xs"><input type="checkbox" checked={mustCapture} onChange={e => setMustCapture(e.target.checked)} /> Must capture to move</label>
        <label className="text-xs"><input type="checkbox" checked={uncapturable} onChange={e => setUncapturable(e.target.checked)} /> Uncapturable</label>
        <label className="text-xs"><input type="checkbox" checked={royal} onChange={e => setRoyal(e.target.checked)} /> Royal</label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-xs"><input type="checkbox" checked={swap} onChange={e => setSwap(e.target.checked)} /> Swap on capture</label>
        <label className="text-xs"><input type="checkbox" checked={explosion} onChange={e => setExplosion(e.target.checked)} /> Explosion</label>
        <label className="text-xs"><input type="checkbox" checked={spawn} onChange={e => setSpawn(e.target.checked)} /> Spawn subordinate</label>
      </div>

      <button onClick={save} className="px-3 py-1 border border-neutral-700 hover:bg-neutral-800">Save Piece</button>
    </div>
  );
}
