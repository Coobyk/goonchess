import { create } from 'zustand'
import type { GameState, Move, PieceType, Terrain, Variant, Vec } from '@/engine/types'
import { applyMove, createInitialState, getLegalMoves, uid } from '@/engine/rules'
import { defaultVariant } from '@/engine/templates'
import type { ThreatSettings } from '@/engine/threats'
import { variantFromHash } from '@/lib/encoding'
import {
  loadLibrary,
  loadSoundEnabled,
  loadTheme,
  loadThreatSettings,
  loadVariant,
  saveLibrary,
  saveTheme,
  saveThreatSettings,
  saveVariant,
  type SavedVariant,
} from '@/lib/persist'
import { playSound, preloadSounds, setSoundEnabled as applySoundEnabled } from '@/lib/sound'

export type MakerTab = 'board' | 'pieces' | 'setup' | 'rules'
export type View = 'play' | 'maker'
export type Theme = 'dark' | 'light'

interface AppState {
  variant: Variant
  game: GameState
  view: View
  makerTab: MakerTab
  theme: Theme
  soundEnabled: boolean
  threats: ThreatSettings
  library: SavedVariant[]

  selected: Vec | null
  legalMoves: Move[]
  undoStack: GameState[]

  selectedPieceTypeId: string | null
  brush: Brush
  portalPending: Vec | null

  /* navigation */
  setView: (view: View) => void
  setMakerTab: (tab: MakerTab) => void
  setTheme: (theme: Theme) => void
  setSoundEnabled: (enabled: boolean) => void
  setThreats: (patch: Partial<ThreatSettings>) => void

  /* variant editing */
  updateVariant: (updater: (v: Variant) => Variant) => void
  loadVariantIntoMaker: (v: Variant) => void
  resizeBoard: (width: number, height: number) => void
  setBoardColors: (light: string, dark: string) => void
  paintTerrain: (x: number, y: number, terrain: Terrain) => void
  linkPortal: (source: Vec, target: Vec, oneway: boolean) => void
  placePiece: (typeId: string, team: string, x: number, y: number) => void
  eraseSquare: (x: number, y: number) => void
  clearSetup: () => void
  mirrorSetup: (axis: 'horizontal' | 'vertical') => void
  duplicateSide: (fromTeam: string, toTeam: string) => void
  addPieceType: (piece?: Partial<PieceType>) => string
  updatePieceType: (id: string, patch: Partial<PieceType>) => void
  deletePieceType: (id: string) => void
  duplicatePieceType: (id: string) => void
  setSelectedPieceType: (id: string | null) => void
  setBrush: (brush: Brush) => void
  setPortalPending: (v: Vec | null) => void
  updateTeam: (id: string, patch: Partial<Variant['teams'][number]>) => void
  toggleWinCondition: (kind: 'checkmate' | 'kingCapture' | 'elimination' | 'points') => void
  setPointThreshold: (n: number) => void

  /* game */
  selectSquare: (x: number, y: number) => void
  resetGame: () => void
  undo: () => void

  /* library */
  addCurrentToLibrary: (name?: string) => void
  loadFromLibrary: (id: string) => void
  deleteFromLibrary: (id: string) => void
  importVariant: (json: string) => { ok: boolean; error?: string }
  exportVariant: () => string
}

export interface Brush {
  mode: 'terrain' | 'piece' | 'erase'
  terrain: Terrain
  team: string
  typeId: string | null
}

function initialVariant(): Variant {
  const fromHash = variantFromHash()
  if (fromHash) {
    const normalized = normalizeVariant(fromHash)
    if (normalized) {
      // The shared variant was just consumed; drop it so later edits persist.
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search)
      } catch {
        /* ignore */
      }
      return normalized
    }
  }
  const saved = loadVariant()
  if (saved) {
    const normalized = normalizeVariant(saved)
    if (normalized) return normalized
  }
  return defaultVariant()
}

export function normalizeVariant(input: unknown): Variant | null {
  if (!input || typeof input !== 'object') return null
  const v = input as Variant
  if (!v.board || !Array.isArray(v.pieceTypes) || !Array.isArray(v.teams)) return null
  if (!v.board.tiles || !Array.isArray(v.board.tiles)) return null
  return {
    ...v,
    schema: 1,
    teams: v.teams.length ? v.teams : defaultVariant().teams,
    setup: Array.isArray(v.setup) ? v.setup : [],
    winConditions: Array.isArray(v.winConditions) ? v.winConditions : [],
    pieceTypes: v.pieceTypes.map((p) => ({
      ...p,
      flags: {
        jump: false,
        mustCapture: false,
        uncapturable: false,
        royal: false,
        movesOnce: false,
        mirror: true,
        enPassant: false,
        ...((p.flags ?? {}) as Partial<NonNullable<typeof p.flags>>),
      },
      effects: p.effects ?? [],
      capture: p.capture ?? [],
      move: p.move ?? [],
      promotion: p.promotion ?? null,
    })),
  }
}

export const useAppStore = create<AppState>((set, get) => {
  const initial = initialVariant()
  applyThemeToDom(loadTheme())

  const commit = (variant: Variant) => {
    saveVariant(variant)
    set({ variant, game: createInitialState(variant), selected: null, legalMoves: [], undoStack: [] })
  }

  return {
    variant: initial,
    game: createInitialState(initial),
    view: 'play',
    makerTab: 'board',
    theme: loadTheme(),
    soundEnabled: loadSoundEnabled(),
    threats: loadThreatSettings(),
    library: loadLibrary(),
    selected: null,
    legalMoves: [],
    undoStack: [],
    selectedPieceTypeId: initial.pieceTypes[0]?.id ?? null,
    brush: { mode: 'terrain', terrain: 'wall', team: initial.teams[0]?.id ?? 'white', typeId: null },
    portalPending: null,

    setView: (view) => set({ view }),
    setMakerTab: (makerTab) => set({ makerTab }),
    setTheme: (theme) => {
      saveTheme(theme)
      applyThemeToDom(theme)
      set({ theme })
    },
    setSoundEnabled: (enabled) => {
      applySoundEnabled(enabled)
      if (enabled) preloadSounds()
      set({ soundEnabled: enabled })
    },
    setThreats: (patch) => {
      const threats = { ...get().threats, ...patch }
      saveThreatSettings(threats)
      set({ threats })
    },

    updateVariant: (updater) => {
      const next = updater(get().variant)
      commit(next)
    },

    loadVariantIntoMaker: (v) => commit(structuredClone(v)),

    resizeBoard: (width, height) => {
      const v = get().variant
      const w = Math.max(3, Math.min(16, Math.round(width)))
      const h = Math.max(3, Math.min(16, Math.round(height)))
      const tiles = Array.from({ length: h }, (_, y) =>
        Array.from({ length: w }, (_, x) => v.board.tiles[y]?.[x] ?? { terrain: 'normal' as Terrain }),
      )
      const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h
      commit({
        ...v,
        board: { ...v.board, width: w, height: h, tiles },
        setup: v.setup.filter((s) => inBounds(s.x, s.y)),
      })
    },

    setBoardColors: (light, dark) => {
      const v = get().variant
      commit({ ...v, board: { ...v.board, light, dark } })
    },

    paintTerrain: (x, y, terrain) => {
      const v = get().variant
      if (!v.board.tiles[y]?.[x]) return
      const tiles = v.board.tiles.map((row) => row.map((t) => ({ ...t })))
      const tile = tiles[y][x]
      tile.terrain = terrain
      if (terrain === 'portal' || terrain === 'oneway') {
        if (!tile.target) tile.target = { x: v.board.width - 1 - x, y: v.board.height - 1 - y }
      } else {
        delete tile.target
      }
      commit({ ...v, board: { ...v.board, tiles } })
    },

    linkPortal: (source, target, oneway) => {
      const v = get().variant
      const tiles = v.board.tiles.map((row) => row.map((t) => ({ ...t })))
      if (!tiles[source.y]?.[source.x] || !tiles[target.y]?.[target.x]) return
      tiles[source.y][source.x] = { terrain: oneway ? 'oneway' : 'portal', target }
      if (!oneway) {
        tiles[target.y][target.x] = { terrain: 'portal', target: { x: source.x, y: source.y } }
      }
      commit({ ...v, board: { ...v.board, tiles } })
      set({ portalPending: null })
    },
    placePiece: (typeId, team, x, y) => {
      const v = get().variant
      const setup = v.setup.filter((s) => !(s.x === x && s.y === y))
      setup.push({ typeId, team, x, y })
      commit({ ...v, setup })
    },

    eraseSquare: (x, y) => {
      const v = get().variant
      commit({ ...v, setup: v.setup.filter((s) => !(s.x === x && s.y === y)) })
    },

    clearSetup: () => commit({ ...get().variant, setup: [] }),

    mirrorSetup: (axis) => {
      const v = get().variant
      const { width, height } = v.board
      const setup = v.setup.map((s) => ({
        ...s,
        x: axis === 'horizontal' ? width - 1 - s.x : s.x,
        y: axis === 'vertical' ? height - 1 - s.y : s.y,
      }))
      commit({ ...v, setup })
    },

    duplicateSide: (fromTeam, toTeam) => {
      const v = get().variant
      const { width, height } = v.board
      const source = v.setup.filter((s) => s.team === fromTeam)
      const mirrored = source.map((s) => ({
        typeId: s.typeId,
        team: toTeam,
        x: width - 1 - s.x,
        y: height - 1 - s.y,
      }))
      const kept = v.setup.filter((s) => s.team !== toTeam)
      commit({ ...v, setup: [...kept, ...mirrored] })
    },

    addPieceType: (piece) => {
      const v = get().variant
      const id = uid()
      const created: PieceType = {
        id,
        name: piece?.name ?? 'New Piece',
        icon: piece?.icon ?? 'custom',
        symbol: piece?.symbol ?? '★',
        value: piece?.value ?? 1,
        move: piece?.move ?? [
          { id: uid(), kind: 'leaper', vectors: [{ x: 0, y: -1 }], maxRange: 0 },
        ],
        capture: piece?.capture ?? [],
        flags: {
          jump: false,
          mustCapture: false,
          uncapturable: false,
          royal: false,
          movesOnce: false,
          mirror: true,
          enPassant: false,
          ...piece?.flags,
        },
        effects: piece?.effects ?? [],
        promotion: piece?.promotion ?? null,
      }
      commit({ ...v, pieceTypes: [...v.pieceTypes, created] })
      set({ selectedPieceTypeId: id })
      return id
    },

    updatePieceType: (id, patch) => {
      const v = get().variant
      commit({
        ...v,
        pieceTypes: v.pieceTypes.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })
    },

    deletePieceType: (id) => {
      const v = get().variant
      set({ selectedPieceTypeId: v.pieceTypes.find((p) => p.id !== id)?.id ?? null })
      commit({
        ...v,
        pieceTypes: v.pieceTypes
          .filter((p) => p.id !== id)
          .map((p) => ({
            ...p,
            promotion: p.promotion?.typeId === id ? null : p.promotion,
            effects: p.effects.filter((e) => !(e.kind === 'spawn' && e.pieceTypeId === id)),
          })),
        setup: v.setup.filter((s) => s.typeId !== id),
      })
    },

    duplicatePieceType: (id) => {
      const v = get().variant
      const source = v.pieceTypes.find((p) => p.id === id)
      if (!source) return
      const copy: PieceType = { ...structuredClone(source), id: uid(), name: `${source.name} copy` }
      commit({ ...v, pieceTypes: [...v.pieceTypes, copy] })
      set({ selectedPieceTypeId: copy.id })
    },

    setSelectedPieceType: (selectedPieceTypeId) => set({ selectedPieceTypeId }),
    setBrush: (brush) => set({ brush }),
    setPortalPending: (portalPending) => set({ portalPending }),

    updateTeam: (id, patch) => {
      const v = get().variant
      commit({
        ...v,
        teams: v.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })
    },

    toggleWinCondition: (kind) => {
      const v = get().variant
      const existing = v.winConditions.find((w) => w.kind === kind)
      let winConditions
      if (existing) {
        winConditions = v.winConditions.filter((w) => w.kind !== kind)
      } else {
        winConditions = [
          ...v.winConditions,
          { id: uid(), kind, threshold: kind === 'points' ? 20 : undefined },
        ]
      }
      commit({ ...v, winConditions })
    },

    setPointThreshold: (n) => {
      const v = get().variant
      commit({
        ...v,
        winConditions: v.winConditions.map((w) =>
          w.kind === 'points' ? { ...w, threshold: n } : w,
        ),
      })
    },

    selectSquare: (x, y) => {
      const { game, selected, legalMoves } = get()
      if (game.winner) return
      if (selected) {
        const move = legalMoves.find((m) => m.finalTo.x === x && m.finalTo.y === y)
        if (move) {
          const next = applyMove(game, move)
          set({
            game: next,
            selected: null,
            legalMoves: [],
            undoStack: [...get().undoStack, game],
          })
          return
        }
      }
      const pieceId = game.board[y]?.[x]
      if (pieceId) {
        const inst = game.pieces[pieceId]
        if (inst && inst.team === game.turn) {
          set({ selected: { x, y }, legalMoves: getLegalMoves(game, x, y) })
          return
        }
      }
      if (selected && pieceId === null) playSound('illegal')
      set({ selected: null, legalMoves: [] })
    },

    resetGame: () => set({ game: createInitialState(get().variant), selected: null, legalMoves: [], undoStack: [] }),

    undo: () => {
      const stack = get().undoStack
      if (!stack.length) return
      const prev = stack[stack.length - 1]
      set({ game: prev, undoStack: stack.slice(0, -1), selected: null, legalMoves: [] })
    },

    addCurrentToLibrary: (name) => {
      const { variant, library } = get()
      const entry: SavedVariant = {
        id: uid(),
        name: name ?? variant.name,
        updatedAt: Date.now(),
        variant: structuredClone({ ...variant, name: name ?? variant.name }),
      }
      const next = [entry, ...library]
      saveLibrary(next)
      set({ library: next, variant: { ...variant, name: entry.name } })
      saveVariant({ ...variant, name: entry.name })
    },

    loadFromLibrary: (id) => {
      const entry = get().library.find((l) => l.id === id)
      if (entry) commit(structuredClone(entry.variant))
    },

    deleteFromLibrary: (id) => {
      const next = get().library.filter((l) => l.id !== id)
      saveLibrary(next)
      set({ library: next })
    },

    importVariant: (json) => {
      try {
        const parsed = JSON.parse(json)
        const normalized = normalizeVariant(parsed)
        if (!normalized) return { ok: false, error: 'That JSON does not look like a variant.' }
        commit(normalized)
        return { ok: true }
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    },

    exportVariant: () => JSON.stringify(get().variant, null, 2),
  }
})

function applyThemeToDom(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}
