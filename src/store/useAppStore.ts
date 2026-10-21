import { create } from 'zustand'
import type { GameState, Move, PieceType, Terrain, Variant, Vec } from '@/engine/types'
import { applyMove, createInitialState, getLegalMoves, rerollPieces, uid } from '@/engine/rules'
import { defaultVariant, randomChess } from '@/engine/templates'
import type { ThreatSettings } from '@/engine/threats'
import {
  DEFAULT_BOT_SETTINGS,
  isBotTeam,
  rollBotSide,
  type BotSettings,
} from '@/engine/ai/botSettings'
import { variantFromHash } from '@/lib/encoding'
import { DEFAULT_ANALYSIS_SETTINGS, type AnalysisSettings } from '@/lib/analysis'
import {
  loadAnalysisSettings,
  loadBotSettings,
  loadClockSettings,
  loadLibrary,
  loadSoundEnabled,
  loadSoundPack,
  loadTheme,
  loadThreatSettings,
  loadTurnView,
  loadVariant,
  saveAnalysisSettings,
  saveBotSettings,
  saveClockSettings,
  saveLibrary,
  saveSoundPack,
  saveTheme,
  saveThreatSettings,
  saveTurnView,
  saveVariant,
  type SavedVariant,
  type TurnView,
} from '@/lib/persist'
import {
  preloadSounds,
  setSoundEnabled as applySoundEnabled,
  setSoundPack as applySoundPack,
} from '@/lib/sound'
import {
  clockIsOn,
  initialClockState,
  type ClockSettings,
  type ClockState,
} from '@/lib/clock'
import { pushRoute, routeFromLocation } from '@/lib/router'

export type MakerTab = 'board' | 'pieces' | 'setup' | 'rules'
export type View = 'play' | 'maker' | 'rulebook'
export type Theme = 'dark' | 'light'

interface AppState {
  variant: Variant
  game: GameState
  view: View
  makerTab: MakerTab
  theme: Theme
  soundEnabled: boolean
  soundPack: string
  analysis: AnalysisSettings
  threats: ThreatSettings
  turnView: TurnView
  library: SavedVariant[]

  selected: Vec | null
  legalMoves: Move[]
  undoStack: GameState[]
  bot: BotSettings
  /** The side the bot plays in the current game, when it plays one side. */
  botSide: string | null
  botThinking: boolean
  /** True while a piece is still gliding across the board. */
  boardAnimating: boolean
  /** A move that is waiting for the current animation to finish. */
  queuedMove: { move: Move; origin?: Vec; promotionTypeId?: string } | null
  clock: ClockSettings
  clockState: ClockState
  /** Earlier versions of the variant, for undo. */
  variantHistory: Variant[]
  /** Versions that were undone, for redo. */
  variantFuture: Variant[]

  selectedPieceTypeId: string | null
  brush: Brush
  portalPending: Vec | null

  /* navigation */
  setView: (view: View) => void
  setMakerTab: (tab: MakerTab) => void
  applyRoute: (route: { view: View; makerTab: MakerTab }) => void
  setTheme: (theme: Theme) => void
  setSoundEnabled: (enabled: boolean) => void
  setSoundPack: (pack: string) => void
  setAnalysis: (patch: Partial<AnalysisSettings>) => void
  setThreats: (patch: Partial<ThreatSettings>) => void
  setTurnView: (view: TurnView) => void

  /* variant editing */
  updateVariant: (updater: (v: Variant) => Variant) => void
  undoVariant: () => void
  redoVariant: () => void
  loadVariantIntoMaker: (v: Variant) => void
  resizeBoard: (width: number, height: number) => void
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
  selectSquare: (x: number, y: number, origin?: Vec) => void
  playMove: (move: Move, origin?: Vec, promotionTypeId?: string) => void
  pendingPromotion: { move: Move; origin?: Vec } | null
  choosePromotion: (typeId: string) => void
  cancelPromotion: () => void
  loadPosition: (state: GameState) => void
  resetGame: () => void
  /** Starts a fresh random chess game, with a new set of rolls. */
  startRandomGame: () => void
  undo: () => void

  /* bot */
  setBot: (patch: Partial<BotSettings>) => void
  setBotThinking: (thinking: boolean) => void
  setBoardAnimating: (busy: boolean) => void

  /* clock */
  setClock: (settings: ClockSettings) => void
  tickClock: () => void

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
        dice: false,
        ...((p.flags ?? {}) as Partial<NonNullable<typeof p.flags>>),
      },
      effects: p.effects ?? [],
      capture: p.capture ?? [],
      move: p.move ?? [],
      promotion: normalizePromotion(p.promotion),
    })),
  }
}

/** Older variants stored a single promotion target. */
function normalizePromotion(promotion: unknown): { typeIds: string[] } | null {
  if (!promotion) return null
  if (Array.isArray(promotion)) {
    const typeIds = promotion.filter((id): id is string => typeof id === 'string' && !!id)
    return typeIds.length ? { typeIds } : null
  }
  if (typeof promotion === 'object' && 'typeId' in promotion) {
    const typeId = (promotion as { typeId?: unknown }).typeId
    return typeof typeId === 'string' && typeId ? { typeIds: [typeId] } : null
  }
  return null
}

export const useAppStore = create<AppState>((set, get) => {
  const initial = initialVariant()
  const initialRoute = routeFromLocation()
  applyThemeToDom(loadTheme())

  const initialBot = { ...DEFAULT_BOT_SETTINGS, ...loadBotSettings() }
  const initialClock = loadClockSettings()
  const initialPack = loadSoundPack()
  // The sound module keeps the pack it plays from, so it has to start there.
  applySoundPack(initialPack)

  /** The side the bot plays right now — rolled for every new game. */
  const sideFor = (bot: BotSettings, variant: Variant, previous: string | null) => {
    if (bot.mode !== 'one') return null
    if (bot.side === 'random') return rollBotSide(variant, previous)
    return bot.side
  }

  const commit = (variant: Variant) => {
    saveVariant(variant)
    const bot = get().bot
    const previous = get().variant
    set({
      variant,
      game: createInitialState(variant),
      selected: null,
      legalMoves: [],
      undoStack: [],
      variantHistory: [...get().variantHistory, previous].slice(-60),
      variantFuture: [],
      botSide: sideFor(bot, variant, get().botSide),
    })
  }

  /** Sets the variant without touching the undo history. */
  const commitDirect = (variant: Variant, history: Variant[], future: Variant[]) => {
    saveVariant(variant)
    const bot = get().bot
    set({
      variant,
      game: createInitialState(variant),
      selected: null,
      legalMoves: [],
      undoStack: [],
      variantHistory: history,
      variantFuture: future,
      botSide: sideFor(bot, variant, get().botSide),
    })
  }

  return {
    variant: initial,
    game: createInitialState(initial),
    view: initialRoute.view,
    makerTab: initialRoute.makerTab,
    theme: loadTheme(),
    soundEnabled: loadSoundEnabled(),
    soundPack: initialPack,
    analysis: { ...DEFAULT_ANALYSIS_SETTINGS, ...loadAnalysisSettings() },
    threats: loadThreatSettings(),
    turnView: loadTurnView(),
    library: loadLibrary(),
    bot: initialBot,
    botSide: sideFor(initialBot, initial, null),
    botThinking: false,
    clock: initialClock,
    clockState: initialClockState(initialClock, initial.teams.map((t) => t.id)),
    variantHistory: [],
    variantFuture: [],
    selected: null,
    legalMoves: [],
    undoStack: [],
    pendingPromotion: null,
    boardAnimating: false,
    queuedMove: null,
    selectedPieceTypeId: initial.pieceTypes[0]?.id ?? null,
    brush: { mode: 'terrain', terrain: 'wall', team: initial.teams[0]?.id ?? 'white', typeId: null },
    portalPending: null,

    setView: (view) => {
      set({ view })
      pushRoute(view, get().makerTab)
    },
    setMakerTab: (makerTab) => {
      set({ makerTab })
      if (get().view === 'maker') pushRoute('maker', makerTab)
    },
    applyRoute: ({ view, makerTab }) => set({ view, makerTab }),
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
    setSoundPack: (pack) => {
      saveSoundPack(pack)
      applySoundPack(pack)
      set({ soundPack: pack })
    },

    setAnalysis: (patch) => {
      const analysis = { ...get().analysis, ...patch }
      saveAnalysisSettings(analysis)
      set({ analysis })
    },

    setThreats: (patch) => {
      const threats = { ...get().threats, ...patch }
      saveThreatSettings(threats)
      set({ threats })
    },
    setTurnView: (turnView) => {
      saveTurnView(turnView)
      set({ turnView })
    },

    updateVariant: (updater) => {
      const next = updater(get().variant)
      commit(next)
    },

    undoVariant: () => {
      const history = get().variantHistory
      if (!history.length) return
      const previous = history[history.length - 1]
      const current = get().variant
      commitDirect(previous, history.slice(0, -1), [...get().variantFuture, current])
    },

    redoVariant: () => {
      const future = get().variantFuture
      if (!future.length) return
      const next = future[future.length - 1]
      const current = get().variant
      commitDirect(next, [...get().variantHistory, current], future.slice(0, -1))
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
          dice: false,
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
            promotion: p.promotion?.typeIds.includes(id) ? null : p.promotion,
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

    selectSquare: (x, y, origin) => {
      const { game, selected, legalMoves, bot, botSide } = get()
      if (game.winner) return
      // The bot plays its own side — the human cannot touch it.
      if (isBotTeam(bot, game.turn, botSide)) return
      if (selected) {
        const move = legalMoves.find((m) => m.finalTo.x === x && m.finalTo.y === y)
        if (move) {
          const options = move.promotionOptions ?? []
          if (options.length > 1) {
            // The player picks what the piece turns into.
            set({ pendingPromotion: { move, origin } })
            return
          }
          get().playMove(move, origin, options[0])
          return
        }
      }
      const pieceId = game.board[y]?.[x]
      if (pieceId) {
        const inst = game.pieces[pieceId]
        if (inst && inst.team === game.turn) {
          // A piece that rolls to move gets its die rolled when it is picked up.
          const piece = game.pieceTypes[inst.typeId]
          let position = game
          if (piece?.flags.dice) {
            const value = 1 + Math.floor(Math.random() * 6)
            position = { ...game, roll: { pieceId, value } }
            set({ game: position })
          }
          set({ selected: { x, y }, legalMoves: getLegalMoves(position, x, y) })
          return
        }
      }
      set({ selected: null, legalMoves: [] })
    },

    choosePromotion: (typeId) => {
      const pending = get().pendingPromotion
      if (!pending) return
      set({ pendingPromotion: null })
      get().playMove(pending.move, pending.origin, typeId)
    },

    cancelPromotion: () => set({ pendingPromotion: null }),

    loadPosition: (state) => {
      set({
        game: state,
        selected: null,
        legalMoves: [],
        undoStack: [],
        pendingPromotion: null,
      })
    },

    playMove: (move, origin, promotionTypeId) => {
      const { game, clock, clockState, boardAnimating } = get()
      if (game.winner) return
      if (boardAnimating) {
        // A piece is still gliding across the board. The move waits its turn,
        // so an animation is never cut in half.
        set({ queuedMove: { move, origin, promotionTypeId } })
        return
      }
      // The clock runs while the player thinks, so the time is settled first.
      const now = Date.now()
      let clockNext = clockState
      if (clockIsOn(clock) && clockState.running && clockState.lastMoveAt !== null) {
        const mover = game.turn
        const elapsed = now - clockState.lastMoveAt
        const left = Math.max(0, (clockState.times[mover] ?? 0) - elapsed)
        if (left <= 0) {
          // The flag fell before the move was made.
          const order = game.variant.teams.map((t) => t.id)
          const index = order.indexOf(mover)
          set({
            game: { ...game, winner: order[(index + 1) % order.length], status: 'timeout' },
            clockState: {
              ...clockState,
              times: { ...clockState.times, [mover]: 0 },
              lastMoveAt: null,
              running: false,
            },
            selected: null,
            legalMoves: [],
          })
          return
        }
        clockNext = {
          times: { ...clockState.times, [mover]: left + clock.increment * 1000 },
          lastMoveAt: now,
          running: true,
        }
      } else if (clockIsOn(clock)) {
        // The first move starts the clock and still earns the increment.
        const mover = game.turn
        clockNext = {
          times: { ...clockState.times, [mover]: (clockState.times[mover] ?? 0) + clock.increment * 1000 },
          lastMoveAt: now,
          running: true,
        }
      }

      const next = applyMove(game, { ...move, promotionTypeId }, { origin, san: true })
      // In a chaos game the pieces are rolled anew after every move.
      const settled = next.variant.chaos ? rerollPieces(next) : next
      set({
        game: settled,
        selected: null,
        legalMoves: [],
        undoStack: [...get().undoStack, game],
        clockState: clockNext,
      })
    },

    startRandomGame: () => {
      // Every game gets its own rolls, so no two games play out the same.
      const variant = randomChess(Math.floor(Math.random() * 2 ** 31))
      commit(variant)
      set({ view: 'play', makerTab: 'board' })
    },

    resetGame: () => {
      const variant = get().variant
      set({
        game: createInitialState(variant),
        selected: null,
        legalMoves: [],
        undoStack: [],
        queuedMove: null,
        clockState: initialClockState(get().clock, variant.teams.map((t) => t.id)),
        // A new game means a new side for a bot that plays at random.
        botSide: sideFor(get().bot, variant, get().botSide),
      })
    },

    undo: () => {
      const stack = get().undoStack
      if (!stack.length) return
      const bot = get().bot
      const botSide = get().botSide
      let rest = stack.slice(0, -1)
      let prev = rest[rest.length - 1]
      // When the bot is playing, take back its move and the human's with it,
      // so it is the human's turn again.
      if (prev && isBotTeam(bot, prev.turn, botSide) && rest.length > 1) {
        rest = rest.slice(0, -1)
        prev = rest[rest.length - 1]
      }
      if (!prev) return
      set({ game: prev, undoStack: rest, selected: null, legalMoves: [], queuedMove: null })
    },

    setBot: (patch) => {
      const bot = { ...get().bot, ...patch }
      saveBotSettings(bot)
      set({ bot, botSide: sideFor(bot, get().variant, get().botSide) })
    },

    setBotThinking: (botThinking) => set({ botThinking }),

    setBoardAnimating: (busy) => {
      if (busy) {
        set({ boardAnimating: true })
        return
      }
      const queued = get().queuedMove
      if (!queued) {
        set({ boardAnimating: false })
        return
      }
      // The board is free again, so the waiting move can be played.
      set({ boardAnimating: false, queuedMove: null })
      get().playMove(queued.move, queued.origin, queued.promotionTypeId)
    },

    setClock: (settings) => {
      saveClockSettings(settings)
      set({
        clock: settings,
        clockState: initialClockState(settings, get().variant.teams.map((t) => t.id)),
      })
    },

    tickClock: () => {
      const { clock, clockState, game } = get()
      if (!clockIsOn(clock) || game.winner) return
      if (!clockState.running || clockState.lastMoveAt === null) return
      const now = Date.now()
      const elapsed = now - clockState.lastMoveAt
      if (elapsed <= 0) return
      const side = game.turn
      const left = (clockState.times[side] ?? 0) - elapsed
      if (left <= 0) {
        // The flag fell: the other side wins.
        const order = game.variant.teams.map((t) => t.id)
        const index = order.indexOf(side)
        const winner = order[(index + 1) % order.length]
        const times = { ...clockState.times, [side]: 0 }
        set({
          clockState: { ...clockState, times, lastMoveAt: null, running: false },
          game: { ...game, winner, status: 'timeout' },
          selected: null,
          legalMoves: [],
        })
        return
      }
      set({
        clockState: {
          ...clockState,
          times: { ...clockState.times, [side]: left },
          lastMoveAt: now,
        },
      })
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
