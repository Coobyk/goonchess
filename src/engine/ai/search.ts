import { applyMove, isInCheck, legalMovesForTeam, royalOnCentre } from '../rules'
import { evaluate } from './evaluate'
import { enPassantSensitive, hashPosition, TABLE_SIZE, type Fingerprint } from './hash'
import type { GameState, Move, Variant } from '../types'

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
  /** Analyse the position: always the best line, never a weaker move. */
  analyze?: boolean
  /**
   * Moves the search must not play, by name. The bot uses this to stay out of
   * a repetition, which would be a draw.
   */
  exclude?: string[]
}

export interface SearchResult {
  move: Move | null
  /** Evaluation of the chosen move, in centipawns, from the bot's side. */
  score: number
  /** The best line the search found. */
  line: Move[]
  /** Deepest search that finished. */
  depth: number
  nodes: number
  elapsedMs: number
}

const MATE = 1_000_000

/** How the score in the table was found. */
const EXACT = 1
/** The score is a lower bound: the position is at least this good. */
const LOWER = 2
/** The score is an upper bound: the position is at most this good. */
const UPPER = 3

/* ------------------------------------------------------ transposition table */

/**
 * What the search remembers about a position it has already looked at.
 *
 * The table is shared by every search the worker makes: the position a bot
 * looks at now is often one it looked at a moment ago, and the score it
 * worked out then still holds.
 */
class TranspositionTable {
  /** Whether the slot holds the position it is asked about. */
  private readonly check = new Int32Array(TABLE_SIZE)
  /** How deep the position was searched. */
  private readonly depth = new Int16Array(TABLE_SIZE)
  /** What the search found. */
  private readonly score = new Int32Array(TABLE_SIZE)
  /** Whether the score is exact, a lower bound or an upper bound. */
  private readonly flag = new Int8Array(TABLE_SIZE)
  /** The move the search liked best, as the square it starts and ends on. */
  private readonly from = new Int16Array(TABLE_SIZE)
  private readonly to = new Int16Array(TABLE_SIZE)
  /** Which round of the search wrote the entry. */
  private readonly age = new Int32Array(TABLE_SIZE)

  private round = 0

  /** Starts a new round. Entries from older rounds may be replaced. */
  beginRound() {
    this.round += 1
  }

  /** Empties the table. */
  clear() {
    this.check.fill(0)
    this.depth.fill(0)
    this.score.fill(0)
    this.flag.fill(0)
    this.from.fill(0)
    this.to.fill(0)
    this.age.fill(0)
    this.round = 0
  }

  /**
   * What is known about a position, or null when it is not in the table.
   */
  probe(
    slot: number,
    check: number,
    depth: number,
  ): { score: number; flag: number; from: number; to: number } | null {
    if (this.check[slot] !== check) return null
    if (this.depth[slot] < depth) {
      // The entry is too shallow to cut the search short, but the move it
      // remembers is still the best guess at what to try first.
      return { score: this.score[slot], flag: 0, from: this.from[slot], to: this.to[slot] }
    }
    return {
      score: this.score[slot],
      flag: this.flag[slot],
      from: this.from[slot],
      to: this.to[slot],
    }
  }

  store(
    slot: number,
    check: number,
    depth: number,
    score: number,
    flag: number,
    from: number,
    to: number,
  ) {
    // A deeper result about the same position is worth more than a shallow
    // one, so it is kept.
    if (this.check[slot] === check && this.depth[slot] > depth && this.age[slot] === this.round) {
      return
    }
    this.check[slot] = check
    this.depth[slot] = depth
    this.score[slot] = score
    this.flag[slot] = flag
    this.from[slot] = from
    this.to[slot] = to
    this.age[slot] = this.round
  }
}

/** The table the worker shares. */
const table = new TranspositionTable()

/**
 * Empties the table of positions the search has looked at.
 *
 * The table is safe to keep between games — a position of one game says
 * nothing about another — but a fresh table keeps the memory small and the
 * search honest.
 */
export function clearSearchTable() {
  table.clear()
}

/* ------------------------------------------------------------- the search */

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
  centerWins: boolean
  teams: string[]
  /** The best line found, one array per ply. */
  pv: Move[][]
  /** Moves the search must not play. */
  exclude?: Set<string>
  /** Positions the search has already looked at. */
  tt: TranspositionTable
  /** The fingerprint of the position being looked at. */
  fingerprint: Fingerprint
  /** The move the table remembers for the position being looked at. */
  ttMove: { from: number; to: number } | null
  /** Moves that caused a cut-off, one pair per ply of the search. */
  killers: ({ from: number; to: number } | null)[][]
  /** How often a quiet move caused a cut-off. */
  history: Map<number, number>
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

/**
 * Whether a variant has a piece that rolls a die.
 *
 * Most variants do not, and looking for such a piece in every position costs
 * a walk over all the pieces — for nothing.
 */
const diceVariants = new WeakMap<Variant, boolean>()

function variantHasDice(variant: Variant): boolean {
  let flag = diceVariants.get(variant)
  if (flag === undefined) {
    flag = variant.pieceTypes.some((piece) => piece.flags.dice)
    diceVariants.set(variant, flag)
  }
  return flag
}

/**
 * Every legal move of the side to move.
 *
 * The states behind the moves are not built here: a search prunes most of the
 * moves it generates before it looks at them, and a state costs a copy of the
 * board and of the piece table. The state of a move is built when the search
 * decides to look at that move.
 */
function allLegalMoves(state: GameState): Move[] {
  const out: Move[] = []
  const dicePieces = variantHasDice(state.variant)
    ? Object.values(state.pieces).filter(
        (p) => p.team === state.turn && state.pieceTypes[p.typeId]?.flags.dice,
      )
    : []
  // A piece that rolls a die is tried with every roll.
  const rolledStates: GameState[] = dicePieces.length
    ? dicePieces.flatMap((piece) =>
        [1, 2, 3, 4, 5, 6].map((value) => ({
          ...state,
          roll: { pieceId: piece.id, value },
        })),
      )
    : [state]

  const seen = new Set<string>()
  for (const rolled of rolledStates) {
    for (const option of legalMovesForTeam(rolled, state.turn, { search: true })) {
      const choices = option.promotionOptions
      if (choices && choices.length > 1) {
        // A piece that may promote into several things is tried as each.
        for (const typeId of choices) {
          const move = { ...option, promotionTypeId: typeId }
          const key = `${move.pieceId}|${move.finalTo.x},${move.finalTo.y}|${typeId}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push(move)
        }
        continue
      }
      const key = `${option.pieceId}|${option.finalTo.x},${option.finalTo.y}|${option.roll ?? 0}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(option)
    }
  }
  return out
}

/**
 * Captures and promotions only — the moves a quiet horizon should not miss.
 * Only those moves are followed, which keeps the quiescence search cheap.
 */
function captureMoves(state: GameState): Move[] {
  return allLegalMoves(state).filter((move) => !!move.capturedId || !!move.promotionTypeId)
}

/* ------------------------------------------------------- ordering the moves */

/** The square a move starts on and the square it ends on, as one number. */
function squaresOf(move: Move, width: number) {
  const from = move.from.y * width + move.from.x
  const to = move.finalTo.y * width + move.finalTo.x
  return { from, to }
}

/** Most valuable victim first, cheapest attacker second. */
function moveWeight(move: Move, state: GameState): number {
  let score = 0
  if (move.capturedId) {
    const victim = state.pieces[move.capturedId]
    const victimPiece = victim ? state.pieceTypes[victim.typeId] : undefined
    const attacker = state.pieces[move.pieceId]
    const attackerPiece = attacker ? state.pieceTypes[attacker.typeId] : undefined
    score += 100_000 + (victimPiece?.value ?? 0) * 100 - (attackerPiece?.value ?? 0)
  }
  if (move.promotionTypeId) score += 900_000
  if (move.castle) score += 2_500
  return score
}

/**
 * The order the moves of a position are tried in.
 *
 * The move the table remembers comes first, then the moves that take
 * something, then the moves that caused a cut-off deeper down, and finally
 * the quiet moves that have served the search well.
 */
function orderMoves(moves: Move[], state: GameState, ctx: SearchContext, ply: number): Move[] {
  if (moves.length < 2) return moves
  const width = state.variant.board.width
  const killers = ctx.killers[ply]
  const weights = new Array<number>(moves.length)
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i]
    const { from, to } = squaresOf(move, width)
    let score = moveWeight(move, state)
    if (ctx.ttMove && ctx.ttMove.from === from && ctx.ttMove.to === to) {
      // The move that worked last time.
      weights[i] = 10_000_000
      continue
    }
    if (!move.capturedId && !move.promotionTypeId) {
      if (killers) {
        for (const killer of killers) {
          if (killer && killer.from === from && killer.to === to) {
            score += 800_000
            break
          }
        }
      }
      const history = ctx.history.get(from * 65536 + to)
      if (history) score += Math.min(history, 700_000)
    }
    weights[i] = score
  }
  const order = moves.map((_, i) => i)
  order.sort((a, b) => weights[b] - weights[a])
  return order.map((i) => moves[i])
}

/** The score of the position for the side that is to move. */
function sideScore(state: GameState, ctx: SearchContext): number {
  const base = evaluate(state, ctx.team, { fast: true })
  return state.turn === ctx.team ? base : -base
}

/** A finished game, or null while it is still being played. */
function terminalScore(state: GameState, ply: number, ctx: SearchContext): number | null {
  // A king has reached the hill: the side that stands there has won, and the
  // side to move has lost.
  if (ctx.centerWins) {
    for (const team of ctx.teams) {
      if (!royalOnCentre(state, team)) continue
      return team === state.turn ? MATE - ply : -MATE + ply
    }
  }
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

/* ------------------------------------------------------------- mate scores */

/**
 * A mate score says how many moves the mate still needs. That number depends
 * on how deep the search was, so it is put in the table in a form that can be
 * read back at any depth.
 */
function toStored(score: number, ply: number) {
  if (score >= MATE - 1000 || score <= -MATE + 1000) return score + ply
  return score
}

function fromStored(stored: number, ply: number) {
  if (stored >= MATE - 1000 || stored <= -MATE + 1000) return stored - ply
  return stored
}

/* ---------------------------------------------------------- the search itself */

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

  for (const move of orderMoves(captureMoves(state), state, ctx, ply)) {
    const next = applyMove(state, move, { compute: false, search: true })
    const score = -quiesce(next, -beta, -alpha, ply + 1, depth - 1, ctx)
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

  // Has this position been looked at before? A position where a capture en
  // passant is open is left out: the rules depend on the last move there, and
  // two positions that look the same can still be different.
  const sensitive = enPassantSensitive(state)
  hashPosition(state, ctx.fingerprint)
  const slot = ctx.fingerprint.slot
  const check = ctx.fingerprint.check
  const hit = sensitive ? null : ctx.tt.probe(slot, check, depth)
  const width = state.variant.board.width
  let bestMove = -1
  let bestTo = -1
  if (hit) {
    const known = fromStored(hit.score, ply)
    if (hit.flag === EXACT) return known
    if (hit.flag === LOWER && known >= beta) return known
    if (hit.flag === UPPER && known <= alpha) return known
    bestMove = hit.from
    bestTo = hit.to
  }
  ctx.ttMove = bestMove >= 0 ? { from: bestMove, to: bestTo } : null

  const moves = allLegalMoves(state)
  if (moves.length === 0) {
    // No move left: checkmate if the royal piece is attacked, else a draw.
    if (ctx.checkmateWins && isInCheck(state, state.turn)) return -MATE + ply
    return 0
  }

  if (depth <= 0) return quiesce(state, alpha, beta, ply, ctx.quiescence, ctx)

  const originalAlpha = alpha
  let best = -Infinity
  let bestMoveUsed = -1
  let bestToUsed = -1
  const ordered = orderMoves(moves, state, ctx, ply)
  for (let i = 0; i < ordered.length; i++) {
    const move = ordered[i]
    // The state behind the move is built now, not when the moves were listed.
    const next = applyMove(state, move, { compute: false, search: true })
    let score: number
    if (reachedPointTarget(state, next, ctx)) {
      // The mover hits the point target and wins.
      score = MATE - ply
    } else if (i === 0) {
      score = -negamax(next, depth - 1, -beta, -alpha, ply + 1, ctx)
    } else {
      // A quiet move that comes late in the order is looked at with less
      // depth first: it is unlikely to be the best move, and there are many
      // of them.
      const quiet = !move.capturedId && !move.promotionTypeId
      const reduced = quiet && i >= 3 && depth >= 3 ? 1 : 0
      // A narrow window first: most moves are worse than the best one, and
      // this says so without looking at them properly.
      score = -negamax(next, depth - 1 - reduced, -alpha - 1, -alpha, ply + 1, ctx)
      if (score > alpha && score < beta) {
        if (reduced) {
          // It might be better than the shorter look suggested.
          score = -negamax(next, depth - 1, -alpha - 1, -alpha, ply + 1, ctx)
        }
        if (score > alpha && score < beta) {
          // It might be the best move after all — look at it properly.
          score = -negamax(next, depth - 1, -beta, -alpha, ply + 1, ctx)
        }
      }
    }
    if (ctx.aborted) return best === -Infinity ? 0 : best
    if (score > best) {
      best = score
      // Remember the line that leads here.
      const line = [move]
      const child = ctx.pv[ply + 1]
      if (child) line.push(...child)
      ctx.pv[ply] = line
      const squares = squaresOf(move, width)
      bestMoveUsed = squares.from
      bestToUsed = squares.to
    }
    if (best > alpha) alpha = best
    if (alpha >= beta) {
      // A cut-off: this move is worth trying first next time.
      if (!move.capturedId && !move.promotionTypeId) {
        const killers = ctx.killers[ply] ?? (ctx.killers[ply] = [null, null])
        killers[1] = killers[0]
        killers[0] = { from: bestMoveUsed, to: bestToUsed }
        const key = bestMoveUsed * 65536 + bestToUsed
        ctx.history.set(key, (ctx.history.get(key) ?? 0) + depth * depth)
      }
      break
    }
  }

  // Remember what was found.
  if (!sensitive) {
    const flag = best <= originalAlpha ? UPPER : best >= beta ? LOWER : EXACT
    ctx.tt.store(slot, check, depth, toStored(best, ply), flag, bestMoveUsed, bestToUsed)
  }
  return best
}

function reachedPointTarget(state: GameState, next: GameState, ctx: SearchContext) {
  if (ctx.pointTarget === null) return false
  const mover = state.turn
  return (next.scores[mover] ?? 0) >= ctx.pointTarget
}

interface RootMove {
  move: Move
  score: number
}

function searchRoot(state: GameState, depth: number, ctx: SearchContext): RootMove[] {
  const results: RootMove[] = []
  // The best score so far narrows the window for the moves that follow, so
  // the root does not search every line from scratch.
  let alpha = -Infinity
  const ordered = orderMoves(allLegalMoves(state), state, ctx, 0)
  for (let i = 0; i < ordered.length; i++) {
    const move = ordered[i]
    // Some moves are off the table — repeating a position is a draw.
    if (ctx.exclude?.has(moveName(move))) continue
    const next = applyMove(state, move, { compute: false, search: true })
    let score: number
    if (reachedPointTarget(state, next, ctx)) {
      score = MATE - 1
    } else if (i === 0) {
      score = -negamax(next, depth - 1, -Infinity, Infinity, 1, ctx)
    } else {
      score = -negamax(next, depth - 1, -Infinity, -alpha, 1, ctx)
      if (score > alpha) {
        // It might be the best move — look at it with the whole window.
        score = -negamax(next, depth - 1, -Infinity, Infinity, 1, ctx)
      }
    }
    results.push({ move, score })
    if (score > alpha) alpha = score
    if (ctx.aborted) break
  }
  return results
}

/** A short name for a move, so the search can be told to leave it alone. */
function moveName(move: Move) {
  return `${move.from.x},${move.from.y}->${move.finalTo.x},${move.finalTo.y}`
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
    centerWins: false,
    teams: state.variant.teams.map((t) => t.id),
    pv: [],
    exclude: options.exclude?.length ? new Set(options.exclude) : undefined,
    tt: table,
    fingerprint: { slot: 0, check: 0 },
    ttMove: null,
    killers: [],
    history: new Map(),
  }
  for (const condition of state.variant.winConditions) {
    if (condition.kind === 'points') ctx.pointTarget = condition.threshold ?? Infinity
    if (condition.kind === 'checkmate') ctx.checkmateWins = true
    if (condition.kind === 'elimination') ctx.eliminationWins = true
    if (condition.kind === 'kingCapture') ctx.kingCaptureWins = true
    if (condition.kind === 'center') ctx.centerWins = true
  }

  const random = mulberry32(options.seed ?? Math.floor(Math.random() * 1e9))
  let rootResults: RootMove[] = []
  let depth = 0

  ctx.tt.beginRound()
  for (let d = 1; d <= profile.maxDepth; d++) {
    const results = searchRoot(state, d, ctx)
    if (ctx.aborted || !results.length) break
    rootResults = results
    depth = d
    if (performance.now() >= ctx.deadline) break
  }

  if (!rootResults.length) {
    // Nothing was searched — fall back to any legal move.
    const all = allLegalMoves(state)
    const fallback = all.filter((m) => !ctx.exclude?.has(moveName(m)))
    const pool = fallback.length ? fallback : all
    return {
      move: pool.length ? pool[0] : null,
      score: 0,
      line: pool.length ? [pool[0]] : [],
      depth: 0,
      nodes: ctx.nodes,
      elapsedMs: performance.now() - started,
    }
  }

  const sorted = rootResults.slice().sort((a, b) => b.score - a.score)

  // A weaker bot plays a move that is nearly as good, or an outright random
  // one now and then, so it does not feel like a machine. An analysis always
  // reports the best line.
  let chosen = sorted[0]
  if (!options.analyze && profile.randomness > 0 && random() < profile.randomness) {
    const any = allLegalMoves(state).filter((m) => !ctx.exclude?.has(moveName(m)))
    if (any.length) chosen = { move: any[Math.floor(random() * any.length)], score: 0 }
  } else if (!options.analyze && profile.slop > 0 && sorted.length > 1) {
    // The scores of the moves that were cut off are only upper bounds, so the
    // shortlist is scored properly before a near miss is picked.
    const shortlist = sorted.slice(0, 6)
    ctx.aborted = false
    ctx.deadline = performance.now() + 600
    const exact = shortlist.map((entry) => ({
      move: entry.move,
      score: scoreMove(state, entry.move, depth, ctx),
    }))
    const best = exact.reduce((a, b) => (b.score > a.score ? b : a))
    const pool = exact.filter((entry) => entry.score >= best.score - profile.slop)
    chosen = pool[Math.floor(random() * pool.length)]
  }

  return {
    move: chosen.move,
    score: chosen.score,
    line: ctx.pv[0] ?? [chosen.move],
    depth,
    nodes: ctx.nodes,
    elapsedMs: performance.now() - started,
  }
}

/** The exact score of one move, searched with a full window. */
function scoreMove(
  state: GameState,
  move: Move,
  depth: number,
  ctx: SearchContext,
): number {
  const next = applyMove(state, move, { compute: false, search: true })
  if (reachedPointTarget(state, next, ctx)) return MATE - 1
  if (depth <= 0) return sideScore(next, ctx)
  return -negamax(next, depth - 1, -Infinity, Infinity, 1, ctx)
}
