import { create } from 'zustand'
import type { GameState, Move, PieceType, Terrain, Variant, Vec } from '@/engine/types'
import { applyMove, createInitialState, getLegalMoves, rollRandomPieces, uid } from '@/engine/rules'
import { defaultVariant } from '@/engine/templates'
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
  playSound,
  setSoundEnabled as applySoundEnabled,
  setSoundPack as applySoundPack,
} from '@/lib/sound'
import {
  clockIsOn,
  initialClockState,
  NO_CLOCK,
  type ClockSettings,
  type ClockState,
} from '@/lib/clock'
import { pushRoute, routeFromLocation } from '@/lib/router'
import { proveWork } from '@/lib/captcha'
import {
  connect,
  createRoom,
  writeSeatToken,
  type Connection,
  type CreateResult,
  type ServerMessage,
} from '@/lib/online'

export type MakerTab = 'board' | 'pieces' | 'setup' | 'rules'
export type View = 'play' | 'maker' | 'rulebook'

/** How the position is analysed. */
export type AnalysisMode = 'off' | 'engine' | 'computer'
export type Theme = 'dark' | 'light'

/**
 * A game played over a link. `seat` is which team this browser holds: null
 * means it is only watching, and everyone who opens the link without one of the
 * two saved tokens sees the board but cannot move.
 */
export interface OnlineGame {
  code: string
  seat: number | null
  status: 'connecting' | 'waiting' | 'playing' | 'over' | 'spectating'
  connected: boolean
  /** Which seats have a browser attached right now. */
  presence: [boolean, boolean]
  watchers: number
  error: string | null
}

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

  /** The shared game this tab is in, if any. */
  online: OnlineGame | null

  selected: Vec | null
  legalMoves: Move[]
  undoStack: GameState[]
  bot: BotSettings
  /** The side the bot plays in the current game, when it plays one side. */
  botSide: string | null
  botThinking: boolean
  opponentOpen: boolean
  /** True while a piece is still gliding across the board. */
  boardAnimating: boolean
  /** A move that is waiting for the current animation to finish. */
  queuedMove: { move: Move; origin?: Vec; promotionTypeId?: string } | null
  /** While reviewing a finished game's history (graph / undo), bots stay stopped. */
  reviewingHistory: boolean
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
  applyRoute: (route: { view: View; makerTab: MakerTab; gameCode?: string | null }) => void
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
  /** Loads a variant and opens it in the Play view. */
  playVariant: (v: Variant) => void
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
  /** The position a puzzle started from, so the puzzle can be set up again. */
  puzzleStart: GameState | null
  setPuzzleStart: (state: GameState | null) => void
  /** How the position is analysed: not at all, live, or the whole game. */
  analysisMode: AnalysisMode
  setAnalysisMode: (mode: AnalysisMode) => void
  /** What the last analysis found, for the bar beside the board. */
  analysisResult: { score: number; depth: number } | null
  setAnalysisResult: (result: { score: number; depth: number } | null) => void
  undo: () => void
  /** Goes back to the position after a given number of moves. */
  jumpToPly: (ply: number) => void

  /* online play */
  /** Connects to a shared game, claiming a free seat if there is one. */
  joinOnline: (code: string) => void
  leaveOnline: () => void
  /** Creates a room behind the hidden captcha and joins it. */
  startOnlineGame: () => Promise<CreateResult>
  resignOnline: () => void

  /* bot */
  setBot: (patch: Partial<BotSettings>) => void
  setBotThinking: (thinking: boolean) => void
  setOpponentOpen: (open: boolean) => void
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
        random: false,
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

/** Accepts every shape a promotion target has been stored in over time. */
function normalizePromotion(promotion: unknown): { typeIds: string[] } | null {
  if (!promotion || typeof promotion !== 'object') return null
  const raw = Array.isArray(promotion)
    ? promotion
    : 'typeIds' in promotion
      ? (promotion as { typeIds?: unknown }).typeIds
      : // Older variants stored the single target as `typeId`.
        (promotion as { typeId?: unknown }).typeId
  const list = Array.isArray(raw) ? raw : [raw]
  const typeIds = list.filter((id): id is string => typeof id === 'string' && !!id)
  return typeIds.length ? { typeIds } : null
}

export const useAppStore = create<AppState>((set, get) => {
  const initial = initialVariant()
  const initialRoute = routeFromLocation()
  applyThemeToDom(loadTheme())

  /** The live socket, kept out of the store because it is not renderable. */
  let room: Connection | null = null

  const initialBot = { ...DEFAULT_BOT_SETTINGS, ...loadBotSettings() }
  const initialClock = loadClockSettings()
  const initialPack = loadSoundPack()
  // The sound module keeps the pack it plays from, so it has to start there.
  applySoundPack(initialPack)
  // Download every sound right away: the first move must play instantly even
  // in a fresh session with an empty cache.
  preloadSounds()

  /** The side the bot plays right now — rolled for every new game. */
  const sideFor = (bot: BotSettings, variant: Variant, previous: string | null) => {
    if (bot.mode !== 'one') return null
    if (bot.side === 'random') return rollBotSide(variant, previous)
    return bot.side
  }

  const commit = (variant: Variant) => {
    // Editing the variant ends a shared game: the room has its own copy.
    if (get().online) get().leaveOnline()
    saveVariant(variant)
    const bot = get().bot
    const previous = get().variant
    set({
      variant,
      game: createInitialState(variant),
      selected: null,
      legalMoves: [],
      undoStack: [createInitialState(variant)],
      clockState: initialClockState(get().clock, variant.teams.map((team) => team.id)),
      variantHistory: [...get().variantHistory, previous].slice(-60),
      variantFuture: [],
      botSide: sideFor(bot, variant, get().botSide),
    })
  }

  /** Sets the variant without touching the undo history. */
  const commitDirect = (variant: Variant, history: Variant[], future: Variant[]) => {
    if (get().online) get().leaveOnline()
    saveVariant(variant)
    const bot = get().bot
    set({
      variant,
      game: createInitialState(variant),
      selected: null,
      legalMoves: [],
      undoStack: [],
      clockState: initialClockState(get().clock, variant.teams.map((team) => team.id)),
      variantHistory: history,
      variantFuture: future,
      botSide: sideFor(bot, variant, get().botSide),
    })
  }

  /**
   * The room's clock is the truth, but its timestamps are the server's clock.
   * Rebasing to this browser makes the display tick from the moment it arrived.
   */
  const rebaseClock = (state: ClockState | null | undefined): ClockState | null =>
    state ? { ...state, lastMoveAt: state.running ? Date.now() : null } : null

  /** Folds a message from the room into the store. */
  const receive = (code: string, message: ServerMessage) => {
    const online = get().online
    if (!online || online.code !== code) return

    if (message.t === 'hello') {
      if (message.you.token) writeSeatToken(code, message.you.token)
      const game = message.game ?? createInitialState(message.variant)
      const clock = message.clock ?? NO_CLOCK
      const clockState =
        rebaseClock(message.clockState) ??
        initialClockState(clock, message.variant.teams.map((team) => team.id))
      set({
        variant: message.variant,
        game,
        clock,
        clockState,
        undoStack: [game],
        selected: null,
        legalMoves: [],
        pendingPromotion: null,
        queuedMove: null,
        reviewingHistory: false,
        online: {
          ...online,
          seat: message.you.seat,
          status: game.winner
            ? 'over'
            : message.you.seat === null
              ? 'spectating'
              : message.started
                ? 'playing'
                : 'waiting',
          presence: [!!message.seats[0], !!message.seats[1]],
          connected: true,
          error: null,
        },
      })
      return
    }

    if (message.t === 'presence') {
      // Both browsers are here: the game started on the server, so the
      // waiting player is now playing. The server only sends `state` once,
      // to the player who was already there, so this is where the handoff
      // from "waiting" to "playing" has to happen.
      const both = message.presence[0] && message.presence[1]
      set({
        online: {
          ...online,
          presence: [!!message.presence[0], !!message.presence[1]],
          watchers: message.watchers,
          status:
            online.status === 'waiting' && both
              ? get().game.winner
                ? 'over'
                : 'playing'
              : online.status,
        },
      })
      return
    }

    if (message.t === 'error') {
      // A refused move comes back with the position the room holds, because the
      // board moved before the room had agreed to it.
      const state = message.game
      if (!state) {
        set({ online: { ...online, error: message.code } })
        return
      }
      const ply = state.moveHistory.length
      const history = get().undoStack
      const stack = history.length >= ply + 1 ? history.slice(0, ply) : []
      stack.push(state)
      set({
        game: state,
        undoStack: stack,
        clockState: rebaseClock(message.clockState) ?? get().clockState,
        selected: null,
        legalMoves: [],
        pendingPromotion: null,
        queuedMove: null,
        reviewingHistory: false,
        online: { ...online, error: message.code },
      })
      return
    }

    // A position from the room. Our own move is already on the board, so an
    // echo of it changes nothing; anything longer is the opponent's.
    const local = get().game
    const next = message.game
    if (
      next.moveHistory.length === local.moveHistory.length &&
      next.winner === local.winner &&
      next.status === local.status
    ) {
      // The move is already on the board; the clock that came with the echo is
      // still the room's, so it replaces the local countdown.
      const echoed = rebaseClock(message.clockState)
      if (echoed) set({ clockState: echoed })
      return
    }

    const fresh = next.moveHistory.length > local.moveHistory.length
    const last = next.moveHistory[next.moveHistory.length - 1]
    if (fresh && last) playSound(last.move.capturedId ? 'capture' : 'move')

    set({
      game: next,
      undoStack: fresh
        ? [...get().undoStack.slice(0, local.moveHistory.length + 1), next]
        : get().undoStack,
      selected: null,
      legalMoves: [],
      pendingPromotion: null,
      queuedMove: null,
      reviewingHistory: false,
      clockState: rebaseClock(message.clockState) ?? get().clockState,
      online: {
        ...online,
        status: next.winner ? 'over' : online.seat === null ? 'spectating' : 'playing',
        error: null,
      },
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
    online: null,
    bot: initialBot,
    botSide: sideFor(initialBot, initial, null),
    botThinking: false,
    opponentOpen: false,
    clock: initialClock,
    clockState: initialClockState(initialClock, initial.teams.map((t) => t.id)),
    variantHistory: [],
    variantFuture: [],
    selected: null,
    legalMoves: [],
    // Every position the game has been in, the opening one first.
    undoStack: [createInitialState(initial)],
    pendingPromotion: null,
    boardAnimating: false,
    queuedMove: null,
    reviewingHistory: false,
    puzzleStart: null,
    analysisMode: 'off',
    analysisResult: null,
    selectedPieceTypeId: initial.pieceTypes[0]?.id ?? null,
    brush: { mode: 'terrain', terrain: 'wall', team: initial.teams[0]?.id ?? 'white', typeId: null },
    portalPending: null,

    setView: (view) => {
      set({ view })
      pushRoute(view, get().makerTab, view === 'play' ? (get().online?.code ?? null) : null)
    },
    setMakerTab: (makerTab) => {
      set({ makerTab })
      if (get().view === 'maker') pushRoute('maker', makerTab)
    },
    applyRoute: ({ view, makerTab, gameCode }) => {
      // /g/<code> is a live room, not just a view.
      if (gameCode) {
        get().joinOnline(gameCode)
        return
      }
      if (get().online) get().leaveOnline()
      set({ view, makerTab })
    },
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

    playVariant: (v) => {
      // A variant from the library is played, not edited: the Maker is one
      // click away for anyone who wants to change it.
      commit(structuredClone(v))
      set({ view: 'play', makerTab: 'board' })
      pushRoute('play', 'board', null)
    },

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
        random: false,
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
      // In a shared game only the player whose turn it is may touch the board.
      const online = get().online
      if (online) {
        if (online.seat === null || online.status !== 'playing') return
        // A move made while the socket is down would never reach the room.
        if (!online.connected) {
          set({ online: { ...online, error: 'offline' } })
          return
        }
        if (game.turn !== game.variant.teams[online.seat]?.id) return
      }
      // The bot plays its own side — the human cannot touch it.
      if (isBotTeam(bot, game.turn, botSide)) return
      if (selected) {
        const move = legalMoves.find((m) => m.finalTo.x === x && m.finalTo.y === y)
        if (move) {
          const options = move.promotionOptions ?? []
          if (options.length > 1) {
            // The pawn is on its way to the promotion square; the choice opens
            // once it lands, so the square is not left picked up.
            set({ pendingPromotion: { move, origin }, selected: null, legalMoves: [] })
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
          set({
            selected: { x, y },
            legalMoves: getLegalMoves(position, x, y),
            // Touching the board again abandons a promotion that was left
            // waiting, rather than playing it later by surprise.
            pendingPromotion: null,
          })
          return
        }
      }
      set({ selected: null, legalMoves: [], pendingPromotion: null })
    },

    choosePromotion: (typeId) => {
      const pending = get().pendingPromotion
      if (!pending) return
      set({ pendingPromotion: null })
      // The pawn is already standing on the promotion square, so the move is
      // played from there: the piece turns into the chosen one in place.
      get().playMove(pending.move, pending.move.finalTo, typeId)
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
      const { game, boardAnimating } = get()
      const online = get().online
      // A shared game's time control came with the room; the move is still
      // settled locally for an instant display and replaced by the room's own
      // numbers when the position comes back.
      const clock = get().clock
      const clockState = get().clockState
      if (game.winner) return
      if (online) {
        if (online.seat === null || online.status !== 'playing') return
        if (!online.connected) {
          set({ online: { ...online, error: 'offline' } })
          return
        }
        if (game.turn !== game.variant.teams[online.seat]?.id) return
      }
      // What the board looked like before this move, so a move the room never
      // accepted can be taken back again.
      const before = { game, undoStack: get().undoStack, clockState }
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
        if (left <= 0 && !online) {
          // The flag fell before the move was made. Online, the room owns the
          // flag, so the move is still sent and the room decides.
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
            pendingPromotion: null,
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
      // A piece marked random turns into another kind after every move. The
      // piece that has just moved keeps its kind, so a promotion is seen.
      const settled = rollRandomPieces(next, move.pieceId)
      set({
        game: settled,
        selected: null,
        legalMoves: [],
        pendingPromotion: null,
        // The position the move leads to joins the history. A move made
        // after the game was moved back replaces what came after it.
        undoStack: [...get().undoStack.slice(0, game.moveHistory.length + 1), next],
        clockState: clockNext,
        reviewingHistory: false,
      })

      // The board already shows the move; the room validates it and sends the
      // position back. A rejection arrives as a correction.
      if (online) {
        const sent =
          room?.send({
            t: 'move',
            from: move.from,
            to: move.to,
            finalTo: move.finalTo,
            roll: move.roll,
            promotionTypeId,
            origin,
          }) ?? false
        if (!sent) {
          // The socket was down, so the move never left. Put the board back
          // instead of leaving it ahead of the room.
          set({
            game: before.game,
            undoStack: before.undoStack,
            clockState: before.clockState,
            selected: null,
            legalMoves: [],
            online: { ...online, error: 'offline' },
          })
        } else {
          const current = get().online
          if (current?.error) set({ online: { ...current, error: null } })
        }
      }
    },

    resetGame: () => {
      // Restarting would leave the other player on a board nobody else has.
      if (get().online) return
      const variant = get().variant
      // A puzzle is part of the game, so restarting means starting the puzzle
      // over, not going back to the opening position.
      const puzzle = get().puzzleStart
      set({
        game: puzzle ?? createInitialState(variant),
        selected: null,
        legalMoves: [],
        undoStack: [],
        queuedMove: null,
        pendingPromotion: null,
        clockState: initialClockState(get().clock, variant.teams.map((t) => t.id)),
        // A new game means a new side for a bot that plays at random.
        botSide: sideFor(get().bot, variant, get().botSide),
      })
    },

    setPuzzleStart: (state) => set({ puzzleStart: state }),

    setAnalysisMode: (mode) => set({ analysisMode: mode }),
    setAnalysisResult: (result) => set({ analysisResult: result ? { ...result, score: Math.max(-1000, Math.min(1000, result.score)) } : null }),

    jumpToPly: (ply) => {
      const { undoStack } = get()
      // The history holds the opening and every position after it, so the
      // last one is the position the game is on.
      const total = undoStack.length - 1
      const target = Math.max(0, Math.min(Math.floor(ply), total))
      const last = undoStack[total]
      // Reviewing a finished game's history — bots must stay stopped so the
      // position can be analysed without pieces moving under you.
      const reviewing = last && last.status !== 'active' && target < total
      if (target === total) {
        set({
          game: last,
          selected: null,
          legalMoves: [],
          pendingPromotion: null,
          queuedMove: null,
          reviewingHistory: false,
        })
        return
      }
      const position = undoStack[target]
      if (!position) return
      set({
        game: position,
        selected: null,
        legalMoves: [],
        pendingPromotion: null,
        queuedMove: null,
        reviewingHistory: reviewing,
      })
    },

    joinOnline: (code) => {
      if (get().online?.code === code) return
      room?.close()
      set({
        view: 'play',
        makerTab: 'board',
        // The room's own time control arrives with the hello.
        clock: NO_CLOCK,
        clockState: initialClockState(NO_CLOCK, get().variant.teams.map((team) => team.id)),
        online: {
          code,
          seat: null,
          status: 'connecting',
          connected: false,
          presence: [false, false],
          watchers: 0,
          error: null,
        },
        selected: null,
        legalMoves: [],
        pendingPromotion: null,
      })
      pushRoute('play', 'board', code)
      room = connect(code, {
        onOpenChange: (connected) => {
          const current = get().online
          if (!current || current.code !== code) return
          set({ online: { ...current, connected, error: connected ? null : current.error } })
        },
        onMessage: (message) => receive(code, message),
      })
    },

    leaveOnline: () => {
      room?.close()
      room = null
      if (!get().online) return
      // Back to this browser's own settings; the room's clock stays with it.
      const clock = loadClockSettings()
      set({
        online: null,
        clock,
        clockState: initialClockState(clock, get().variant.teams.map((team) => team.id)),
      })
    },

    startOnlineGame: async () => {
      const variant = get().variant
      if (variant.teams.length !== 2) throw new Error('needs_two_teams')
      // The proof is the only thing standing between a script and a thousand
      // rooms, so it is asked for before the request goes out.
      const proof = await proveWork()
      const created = await createRoom(variant, proof, get().clock)
      writeSeatToken(created.code, created.token)
      get().joinOnline(created.code)
      return created
    },

    resignOnline: () => room?.send({ t: 'resign' }),

    undo: () => {
      // A shared game has no undo: the other player has already seen the move.
      if (get().online) return
      const { game, undoStack, bot, botSide } = get()
      // The history holds the opening and every position after it, so the one
      // before the position the game is on is in it.
      const ply = game.moveHistory.length
      if (ply === 0) return
      let target = ply - 1
      const before = undoStack[target]
      // When the bot is playing, take back its move and the human's with it,
      // so it is the human's turn again.
      if (before && isBotTeam(bot, before.turn, botSide) && target >= 1) target -= 1
      const prev = undoStack[target]
      if (!prev) return
      set({
        game: prev,
        undoStack: undoStack.slice(0, target + 1),
        selected: null,
        legalMoves: [],
        queuedMove: null,
        pendingPromotion: null,
        reviewingHistory: false,
      })
    },

    setBot: (patch) => {
      const bot = { ...get().bot, ...patch }
      saveBotSettings(bot)
      set({ bot, botSide: sideFor(bot, get().variant, get().botSide) })
    },

    setBotThinking: (botThinking) => set({ botThinking }),
    setOpponentOpen: (opponentOpen) => set({ opponentOpen }),

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
      // An online game's time control came with the link.
      if (get().online) return
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
        if (get().online) {
          // The room calls the flag; the display just holds at zero until it
          // says so.
          set({
            clockState: { ...clockState, times: { ...clockState.times, [side]: 0 }, lastMoveAt: now },
          })
          return
        }
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
