import { create } from 'zustand';
import { createInitialState, applyMove, getLegalMoves } from '../engine/engine';
import type { GameState, Ruleset, Move } from '../engine/types';
import { defaultRuleset } from '../engine/presets';
import { saveState, loadState } from '../lib/storage';
import { parseHashRuleset, encodeRuleset } from '../lib/encoding';

interface Store {
  game: GameState;
  selected: { x: number; y: number } | null;
  legalMoves: Move[];
  visualizer: boolean;
  modal: 'none' | 'export' | 'import' | 'pieceCreator' | 'settings';
  importText: string;
  // actions
  newGame: (ruleset?: Ruleset) => void;
  selectSquare: (x: number, y: number) => void;
  setVisualizer: (v: boolean) => void;
  openModal: (m: Store['modal']) => void;
  closeModal: () => void;
  setImportText: (t: string) => void;
  importRuleset: (json: string) => void;
  exportRuleset: () => string;
  updateRuleset: (r: Ruleset) => void;
}

function initialRuleset(): Ruleset {
  const fromHash = parseHashRuleset();
  if (fromHash) {
    try { return fromHash as Ruleset; } catch {}
  }
  const saved = loadState();
  if (saved?.ruleset) return saved.ruleset as Ruleset;
  return defaultRuleset();
}

export const useGameStore = create<Store>((set, get) => ({
  game: createInitialState(initialRuleset()),
  selected: null,
  legalMoves: [],
  visualizer: false,
  modal: 'none',
  importText: '',
  newGame: (ruleset) => {
    const r = ruleset ?? get().game.ruleset;
    set({ game: createInitialState(r), selected: null, legalMoves: [] });
    saveState({ ruleset: r });
    try { window.location.hash = '#rs=' + encodeRuleset(r); } catch {}
  },
  selectSquare: (x, y) => {
    const { game, selected } = get();
    if (game.winner) return;
    // if selected and clicking a legal move dest -> apply
    if (selected) {
      const move = get().legalMoves.find(m => m.finalTo.x === x && m.finalTo.y === y);
      if (move) {
        const next = applyMove(game, move);
        set({ game: next, selected: null, legalMoves: [] });
        saveState({ ruleset: next.ruleset });
        try { window.location.hash = '#rs=' + encodeRuleset(next.ruleset); } catch {}
        return;
      }
    }
    const pieceId = game.board[y]?.[x];
    if (pieceId) {
      const inst = game.pieces[pieceId];
      if (inst && inst.team === game.turn) {
        const moves = getLegalMoves(game, x, y);
        set({ selected: { x, y }, legalMoves: moves });
        return;
      }
    }
    set({ selected: null, legalMoves: [] });
  },
  setVisualizer: (v) => set({ visualizer: v }),
  openModal: (m) => set({ modal: m }),
  closeModal: () => set({ modal: 'none' }),
  setImportText: (t) => set({ importText: t }),
  importRuleset: (json) => {
    try {
      const r = JSON.parse(json) as Ruleset;
      set({ game: createInitialState(r), selected: null, legalMoves: [] });
      saveState({ ruleset: r });
      try { window.location.hash = '#rs=' + encodeRuleset(r); } catch {}
    } catch (e) {
      alert('Invalid JSON: ' + (e as Error).message);
    }
  },
  exportRuleset: () => JSON.stringify(get().game.ruleset, null, 2),
  updateRuleset: (r) => {
    set({ game: createInitialState(r), selected: null, legalMoves: [] });
    saveState({ ruleset: r });
    try { window.location.hash = '#rs=' + encodeRuleset(r); } catch {}
  },
}));
