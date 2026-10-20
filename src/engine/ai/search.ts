import { applyMove, isInCheck, legalOptionsForTeam, type MoveOption } from '../rules'
import { evaluate } from './evaluate'
import type { GameState, Move } from '../types'

/**
 * A small but real chess engine: negamax with alpha-beta pruning, iterative
 * deepening, a capture-only quiescence search and a time budget.
 *
 * It plays by the same rules as the human player, so it works in every
 * variant the Maker can produce — custom pieces, portals, explosions, several
 * armies and all.
 */

export type BotLevel = 'casual' | 'normal' | 'strong'

export interface LevelProfile {
  /** Deepest search the bot will attempt. */
  maxDepth: number
  /** How long it may think, in milliseconds. */
  timeBudgetMs: number
  /** How many capture-only plies it may look ahead at the horizon. */
  quiescence: number
  /** How much worse a move may be than the best one, in centipawns. */
  slop: number
  /** Chance of playing a random legal move instead of a good one. */
  randomness: number
  /** The shortest time the bot may take, so it does not answer instantly. */
  minThinkMs: number
}

export const LEVELS: Record<BotLevel, LevelProfile> = {
  casual: {
    maxDepth: 1,
    timeBudgetMs: 300,
    quiescence: 0,
    slop: 120,
    randomness: 0.25,
    minThinkMs: 350,
  },
  normal: {
    maxDepth: 3,
    timeBudgetMs: 900,
    quiescence: 2,
    slop: 25,
    randomness: 0.05,
    minThinkMs: 450,
  },
  strong: {
    maxDepth: 6,
    timeBudgetMs: 2200,
    quiescence: 3,
    slop: 0,
    randomness: 0,
    minThinkMs: 500,
  },
}

export const LEVEL_LABELS: Record<BotLevel, string> = {
  casual: 'Casual',
  normal: 'Normal',
  strong: 'Strong',
}

export const LEVEL_HINTS: Record<BotLevel, string> = {
  casual: 'Looks one move ahead and blunders now and then. Fine for learning the rules.',
  normal: 'Looks a few moves ahead and prefers safe moves.',
  strong: 'Searches as deep as the clock allows and punishes loose pieces.',
}

export interface SearchOptions {
  /** The team the bot plays. */
  team: string
  level: BotLevel
  /** Seed for the tie breaker, so two games differ. */
  seed?: number
  /** Overrides the level's time budget — used when a clock is running. */
  timeBudgetMs?: number
}

export interface SearchResult {
  move: Move | null
  /** Evaluation of the chosen move, in centipawns, from the bot's side. */
  score: number
  /** Deepest search that finished. */
  depth: number
  nodes: number
  elapsedMs: number
}

const MATE = 1_000_000

interface SearchContext {
  team: string
  deadline: number
  nodes: number
  aborted: boolean
  quiescence: number
  pointTarget: number | null
  checkmateWins: boolean
  eliminationWins: boolean
  kingCaptureWins: boolean
  teams: string[]
}

/** Small deterministic random generator, so a seed gives a repeatable game. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hasTeam(state: GameState, teamId: string) {
  for (const id in state.pieces) {
    if (state.pieces[id].team === teamId) return true
  }
  return false
}

function hasRoyal(state: GameState, teamId: string) {
  for (const id in state.pieces) {
    const inst = state.pieces[id]
    if (inst.team !== teamId) continue
    if (state.pieceTypes[inst.typeId]?.flags.royal) return true
  }
  return false
}

/** Every legal move of the side to move, with the state it leads to. */
function allLegalMoves(state: GameState): MoveOption[] {
  const out: MoveOption[] = []
  for (const option of legalOptionsForTeam(state, state.turn)) {
    const choices = option.move.promotionOptions
    if (!choices || choices.length < 2) {
      out.push(option)
      continue
    }
    // A piece that may promote into several things is tried as each of them.
    for (const typeId of choices) {
      const move = { ...option.move, promotionTypeId: typeId }
      out.push({ move, next: applyMove(state, move, { compute: false }) })
    }
  }
  return out
}

/**
 * Captures and promotions only — the moves a quiet horizon should not miss.
 * Only those moves are followed, which keeps the quiescence search cheap.
 */
function captureMoves(state: GameState): MoveOption[] {
  return allLegalMoves(state).filter(
    (option) => !!option.move.capturedId || !!option.move.promotionTypeId,
  )
}

/** Most valuable victim first, cheapest attacker second. */
function orderMoves(options: MoveOption[], state: GameState): MoveOption[] {
  const weight = (option: MoveOption) => {
    const move = option.move
    let score = 0
    if (move.capturedId) {
      const victim = state.pieces[move.capturedId]
      const victimPiece = victim ? state.pieceTypes[victim.typeId] : undefined
      const attacker = state.pieces[move.pieceId]
      const attackerPiece = attacker ? state.pieceTypes[attacker.typeId] : undefined
      score += 1000 + (victimPiece?.value ?? 0) * 10 - (attackerPiece?.value ?? 0)
    }
    if (move.promotionTypeId) score += 900
    if (move.castle) score += 25
    return score
  }
  return options.slice().sort((a, b) => weight(b) - weight(a))
}

/** The score of the position for the side that is to move. */
function sideScore(state: GameState, ctx: SearchContext): number {
  const base = evaluate(state, ctx.team, { fast: true })
  return state.turn === ctx.team ? base : -base
}

/** A finished game, or null while it is still being played. */
function terminalScore(state: GameState, ply: number, ctx: SearchContext): number | null {
  // The royal piece is gone: that side has lost.
  if (ctx.kingCaptureWins && !hasRoyal(state, state.turn)) return -MATE + ply
  // Everybody else is wiped out: the side to move has won.
  if (ctx.eliminationWins) {
    for (const team of ctx.teams) {
      if (team === state.turn) continue
      if (!hasTeam(state, team)) return MATE - ply
    }
  }
  return null
}

function outOfTime(ctx: SearchContext) {
  if (ctx.aborted) return true
  if (ctx.nodes % 128 !== 0) return false
  if (performance.now() >= ctx.deadline) {
    ctx.aborted = true
    return true
  }
  return false
}

function quiesce(
  state: GameState,
  alpha: number,
  beta: number,
  ply: number,
  depth: number,
  ctx: SearchContext,
): number {
  ctx.nodes += 1
  if (outOfTime(ctx)) return alpha

  const terminal = terminalScore(state, ply, ctx)
  if (terminal !== null) return terminal

  const stand = sideScore(state, ctx)
  if (stand >= beta) return beta
  if (stand > alpha) alpha = stand
  if (depth <= 0) return alpha

  for (const option of orderMoves(captureMoves(state), state)) {
    const score = -quiesce(option.next, -beta, -alpha, ply + 1, depth - 1, ctx)
    if (ctx.aborted) return alpha
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

function negamax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  ctx: SearchContext,
): number {
  ctx.nodes += 1
  if (outOfTime(ctx)) return alpha

  const terminal = terminalScore(state, ply, ctx)
  if (terminal !== null) return terminal

  const moves = allLegalMoves(state)
  if (moves.length === 0) {
    // No move left: checkmate if the royal piece is attacked, else a draw.
    if (ctx.checkmateWins && isInCheck(state, state.turn)) return -MATE + ply
    return 0
  }

  if (depth <= 0) return quiesce(state, alpha, beta, ply, ctx.quiescence, ctx)

  let best = -Infinity
  for (const option of orderMoves(moves, state)) {
    let score: number
    if (reachedPointTarget(state, option, ctx)) {
      // The mover hits the point target and wins.
      score = MATE - ply
    } else {
      score = -negamax(option.next, depth - 1, -beta, -alpha, ply + 1, ctx)
    }
    if (ctx.aborted) return best === -Infinity ? 0 : best
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

function reachedPointTarget(state: GameState, option: MoveOption, ctx: SearchContext) {
  if (ctx.pointTarget === null) return false
  const mover = state.turn
  return (option.next.scores[mover] ?? 0) >= ctx.pointTarget
}

interface RootMove {
  option: MoveOption
  score: number
}

function searchRoot(state: GameState, depth: number, ctx: SearchContext): RootMove[] {
  const results: RootMove[] = []
  // The best score so far narrows the window for the moves that follow, so
  // the root does not search every line from scratch.
  let alpha = -Infinity
  for (const option of orderMoves(allLegalMoves(state), state)) {
    let score: number
    if (reachedPointTarget(state, option, ctx)) {
      score = MATE - 1
    } else {
      score = -negamax(option.next, depth - 1, -Infinity, -alpha, 1, ctx)
    }
    results.push({ option, score })
    if (score > alpha) alpha = score
    if (ctx.aborted) break
  }
  return results
}

/** Picks the move to play, given a level and the position. */
export function searchBestMove(state: GameState, options: SearchOptions): SearchResult {
  const profile = LEVELS[options.level]
  const started = performance.now()
  const ctx: SearchContext = {
    team: options.team,
    deadline: started + (options.timeBudgetMs ?? profile.timeBudgetMs),
    nodes: 0,
    aborted: false,
    quiescence: profile.quiescence,
    pointTarget: null,
    checkmateWins: false,
    eliminationWins: false,
    kingCaptureWins: false,
    teams: state.variant.teams.map((t) => t.id),
  }
  for (const condition of state.variant.winConditions) {
    if (condition.kind === 'points') ctx.pointTarget = condition.threshold ?? Infinity
    if (condition.kind === 'checkmate') ctx.checkmateWins = true
    if (condition.kind === 'elimination') ctx.eliminationWins = true
    if (condition.kind === 'kingCapture') ctx.kingCaptureWins = true
  }

  const random = mulberry32(options.seed ?? Math.floor(Math.random() * 1e9))
  let rootResults: RootMove[] = []
  let depth = 0

  for (let d = 1; d <= profile.maxDepth; d++) {
    const results = searchRoot(state, d, ctx)
    if (ctx.aborted || !results.length) break
    rootResults = results
    depth = d
    if (performance.now() >= ctx.deadline) break
  }

  if (!rootResults.length) {
    // Nothing was searched — fall back to any legal move.
    const fallback = allLegalMoves(state)
    return {
      move: fallback.length ? fallback[0].move : null,
      score: 0,
      depth: 0,
      nodes: ctx.nodes,
      elapsedMs: performance.now() - started,
    }
  }

  const sorted = rootResults.slice().sort((a, b) => b.score - a.score)

  // A weaker bot plays a move that is nearly as good, or an outright random
  // one now and then, so it does not feel like a machine.
  let chosen = sorted[0]
  if (profile.randomness > 0 && random() < profile.randomness) {
    const any = allLegalMoves(state)
    if (any.length) chosen = { option: any[Math.floor(random() * any.length)], score: 0 }
  } else if (profile.slop > 0 && sorted.length > 1) {
    // The scores of the moves that were cut off are only upper bounds, so the
    // shortlist is scored properly before a near miss is picked.
    const shortlist = sorted.slice(0, 6)
    ctx.aborted = false
    ctx.deadline = performance.now() + 600
    const exact = shortlist.map((entry) => ({
      option: entry.option,
      score: scoreMove(state, entry.option, depth, ctx),
    }))
    const best = exact.reduce((a, b) => (b.score > a.score ? b : a))
    const pool = exact.filter((entry) => entry.score >= best.score - profile.slop)
    chosen = pool[Math.floor(random() * pool.length)]
  }

  return {
    move: chosen.option.move,
    score: chosen.score,
    depth,
    nodes: ctx.nodes,
    elapsedMs: performance.now() - started,
  }
}

/** The exact score of one move, searched with a full window. */
function scoreMove(
  state: GameState,
  option: MoveOption,
  depth: number,
  ctx: SearchContext,
): number {
  if (reachedPointTarget(state, option, ctx)) return MATE - 1
  if (depth <= 0) return sideScore(option.next, ctx)
  return -negamax(option.next, depth - 1, -Infinity, Infinity, 1, ctx)
}
