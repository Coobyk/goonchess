import { centreSquares, cloneState, findPiece, isInCheck, movesFor } from '../rules'
import type { GameState, Variant, Vec } from '../types'

/**
 * A generic evaluation for any variant.
 *
 * There is no piece-square table and no opening book: the bot has to work
 * with whatever the Maker produced. So the score is built from things every
 * variant understands — material, how far a piece has travelled, who holds the
 * middle, who is safe, and which pieces are hanging.
 */

/** One point of material is worth this much. */
const MATERIAL_SCALE = 100

export interface EvalOptions {
  /** Skip the threat analysis. Used at the horizon, where speed rules. */
  fast?: boolean
}

interface SideScan {
  /** How many moves the side could make. */
  mobility: number
  /** How many of its pieces attack each square. */
  attacks: Map<string, number>
}

function squareKey(x: number, y: number) {
  return `${x},${y}`
}

/** Which way each team advances. */
const forwardCache = new WeakMap<Variant, Record<string, 'up' | 'down'>>()

function forwardOf(variant: Variant): Record<string, 'up' | 'down'> {
  const cached = forwardCache.get(variant)
  if (cached) return cached
  const forward: Record<string, 'up' | 'down'> = {}
  for (const team of variant.teams) forward[team.id] = team.forward
  forwardCache.set(variant, forward)
  return forward
}

/** The hill, worked out once per variant — the evaluation asks every leaf. */
const centreCache = new WeakMap<Variant, Vec[]>()

function centresOf(variant: Variant): Vec[] {
  const cached = centreCache.get(variant)
  if (cached) return cached
  const squares = centreSquares(variant.board)
  centreCache.set(variant, squares)
  return squares
}

/**
 * The royal pieces on the board.
 *
 * The evaluation is called at every leaf of a search, so it does not want to
 * make a new list every time — it uses the same one again and again.
 */
const royalX: number[] = []
const royalY: number[] = []
const royalTeam: string[] = []

/** One pass over a side: its mobility and the squares it attacks. */
function scanSide(state: GameState, teamId: string): SideScan {
  let mobility = 0
  const attacks = new Map<string, number>()
  for (const id in state.pieces) {
    const inst = state.pieces[id]
    if (inst.team !== teamId) continue
    const at = findPiece(state, id)
    if (!at) continue
    for (const move of movesFor(state, at.x, at.y)) {
      mobility += 1
      if (!move.capturedId) continue
      const key = squareKey(move.finalTo.x, move.finalTo.y)
      attacks.set(key, (attacks.get(key) ?? 0) + 1)
    }
  }
  return { mobility, attacks }
}

function mergeInto(target: SideScan, extra: SideScan): void {
  target.mobility += extra.mobility
  for (const [key, count] of extra.attacks) {
    target.attacks.set(key, (target.attacks.get(key) ?? 0) + count)
  }
}

/**
 * How many pieces of `teamId` would take back on a square that currently holds
 * `victimId`.
 *
 * The trick is to pretend the victim belongs to the other side: then the
 * defenders see an enemy on that square and their capture patterns include it.
 * Without it, a pawn would never be counted as a defender of a friend.
 */
function defenderCount(
  state: GameState,
  teamId: string,
  victimId: string,
  at: Vec,
  victimBecomes: string,
): number {
  const scratch = cloneState(state)
  const victim = scratch.pieces[victimId]
  if (!victim) return 0
  // The instances are shared until they change, so copy this one first.
  scratch.pieces[victimId] = { ...victim, team: victimBecomes }
  let count = 0
  for (const id in scratch.pieces) {
    const inst = scratch.pieces[id]
    if (inst.team !== teamId || id === victimId) continue
    const pos = findPiece(scratch, id)
    if (!pos) continue
    for (const move of movesFor(scratch, pos.x, pos.y)) {
      if (move.capturedId !== victimId) continue
      if (move.finalTo.x !== at.x || move.finalTo.y !== at.y) continue
      count += 1
      break
    }
  }
  return count
}

/** Hanging pieces on both sides. */
function threatScore(
  state: GameState,
  teamId: string,
  myScan: SideScan,
  enemyScan: SideScan,
): number {
  const opponents = state.variant.teams.filter((t) => t.id !== teamId)
  if (!opponents.length) return 0

  let score = 0
  for (let y = 0; y < state.board.length; y++) {
    const row = state.board[y]
    for (let x = 0; x < row.length; x++) {
      const id = row[x]
      if (!id) continue
      const inst = state.pieces[id]
      const piece = state.pieceTypes[inst.typeId]
      if (!piece) continue
      const mine = inst.team === teamId
      const key = squareKey(x, y)
      const attackers = mine ? (enemyScan.attacks.get(key) ?? 0) : (myScan.attacks.get(key) ?? 0)
      if (attackers === 0) continue
      // The side that owns the piece defends it; the other side attacks it.
      const defenders = mine
        ? defenderCount(state, teamId, id, { x, y }, opponents[0].id)
        : defenderCount(state, inst.team, id, { x, y }, teamId)
      const sign = mine ? -1 : 1
      score += sign * piece.value * (defenders === 0 ? 45 : 12)
    }
  }
  return score
}

/**
 * How close the nearest enemy piece is to a royal piece.
 *
 * A king that stands next to the enemy is asking to be taken. The distance is
 * counted in squares, the way a king moves.
 */
function nearestEnemy(state: GameState, x: number, y: number, team: string): number {
  let nearest = 99
  for (let ry = 0; ry < state.board.length; ry++) {
    const row = state.board[ry]
    for (let rx = 0; rx < row.length; rx++) {
      const id = row[rx]
      if (!id) continue
      const inst = state.pieces[id]
      if (inst.team === team) continue
      const distance = Math.max(Math.abs(rx - x), Math.abs(ry - y))
      if (distance < nearest) nearest = distance
    }
  }
  return nearest
}

/**
 * Scores the position from `teamId`'s point of view. A positive number means
 * the position is good for that team.
 */
export function evaluate(state: GameState, teamId: string, options: EvalOptions = {}): number {
  const { variant } = state
  const boardW = variant.board.width
  const boardH = variant.board.height
  const centerX = (boardW - 1) / 2
  const centerY = (boardH - 1) / 2
  const maxDist = Math.max(1, Math.hypot(centerX, centerY))
  const span = Math.max(1, boardH - 1)
  const forward = forwardOf(variant)
  // King of the Hill changes what a king is worth: it is the piece that wins.
  const hillWins = variant.winConditions.some((w) => w.kind === 'center')
  const hill = hillWins ? centresOf(variant) : []
  const hillScale = Math.max(1, (boardW + boardH) / 4)
  // Three-Check counts the checks each side has banked.
  const threeCheck = variant.winConditions.some((w) => w.kind === 'threeCheck')
  // Racing Kings: the king is the piece that wins, so its walk up the board
  // is the whole point of the position.
  const raceWins = variant.winConditions.some((w) => w.kind === 'race')
  // Losing chess turns the board upside down: fewer pieces, fewer options and
  // a man about to be taken are all things to aim for, not to avoid.
  const inverted = variant.winConditions.some((w) => w.kind === 'antichess')

  let score = 0
  let royalCount = 0
  for (let y = 0; y < state.board.length; y++) {
    const row = state.board[y]
    for (let x = 0; x < row.length; x++) {
      const id = row[x]
      if (!id) continue
      const inst = state.pieces[id]
      const piece = state.pieceTypes[inst.typeId]
      if (!piece) continue
      const mine = inst.team === teamId
      const sign = mine ? 1 : -1

      // Material.
      score += sign * piece.value * MATERIAL_SCALE

      if (piece.flags.royal) {
        if (hillWins) {
          // A king in the middle of the board is normally in danger. Here it
          // is halfway to winning, so the walk up the board is worth paying for.
          const nearest = Math.min(
            ...hill.map((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y))),
          )
          score += sign * Math.max(0, 1 - nearest / hillScale) * 90
        }
        if (raceWins) {
          // Every square the king covers towards the far rank is a square
          // from winning the game outright.
          const progress = forward[inst.team] === 'down' ? y / span : (span - y) / span
          score += sign * progress * 300
        }
        // The royal piece is not measured by how far it has travelled or by
        // the square it holds — a king in the middle of the board is in
        // danger, not in a good place. It is measured by its safety instead.
        royalX[royalCount] = x
        royalY[royalCount] = y
        royalTeam[royalCount] = inst.team
        royalCount += 1
        continue
      }

      // How far the piece has pushed towards the far side. Cheap, and it stops
      // the bot from shuffling pieces back and forth.
      const progress = forward[inst.team] === 'down' ? y / span : (span - y) / span
      score += sign * progress * progress * Math.min(piece.value, 3) * 30

      // Holding the middle is worth something in most variants.
      const dist = Math.hypot(x - centerX, y - centerY) / maxDist
      score += sign * (1 - dist) * Math.min(piece.value, 3) * 12

      // A piece that has left its home square is one step closer to the fight.
      if (inst.hasMoved) score += sign * 10
    }
  }

  // In Crazyhouse the pocket is material too: what a side holds, it can put
  // straight back on the board.
  if (state.hands) {
    for (const team of variant.teams) {
      const hand = state.hands[team.id]
      if (!hand) continue
      const sign = team.id === teamId ? 1 : -1
      for (const typeId in hand) {
        const count = hand[typeId] ?? 0
        if (!count) continue
        const piece = state.pieceTypes[typeId]
        if (!piece) continue
        score += sign * count * piece.value * MATERIAL_SCALE
      }
    }
  }

  // Royal safety.
  for (let i = 0; i < royalCount; i++) {
    const nearest = Math.min(4, nearestEnemy(state, royalX[i], royalY[i], royalTeam[i]))
    const sign = royalTeam[i] === teamId ? -1 : 1
    score += sign * (4 - nearest) * 30
  }

  // Two checks already banked are worth more than a pawn: one more wins.
  if (threeCheck && state.checks) {
    for (const team of variant.teams) {
      const given = (state.checks[team.id] ?? 0) * 60
      score += team.id === teamId ? given : -given
    }
  }

  if (options.fast) {
    // At the horizon only the check status of the side to move matters; the
    // rest of the analysis is too slow to run on every leaf.
    if (isInCheck(state, state.turn)) score += state.turn === teamId ? -90 : 90
    return inverted ? -score : score
  }

  const scans = new Map<string, SideScan>()
  for (const team of variant.teams) scans.set(team.id, scanSide(state, team.id))

  let myMobility = 0
  let theirMobility = 0
  for (const team of variant.teams) {
    const scan = scans.get(team.id)
    if (!scan) continue
    if (team.id === teamId) myMobility += scan.mobility
    else theirMobility += scan.mobility
  }

  // Activity: the side with more options is usually the healthier one.
  score += (myMobility - theirMobility) * 1.5

  // Royal safety.
  if (isInCheck(state, teamId)) score -= 90
  for (const other of variant.teams) {
    if (other.id === teamId) continue
    if (isInCheck(state, other.id)) score += 90
  }

  const myScan = scans.get(teamId)
  if (myScan) {
    const enemyScan: SideScan = { mobility: 0, attacks: new Map() }
    for (const team of variant.teams) {
      if (team.id === teamId) continue
      const scan = scans.get(team.id)
      if (scan) mergeInto(enemyScan, scan)
    }
    score += threatScore(state, teamId, myScan, enemyScan)
  }
  return inverted ? -score : score
}
