import { applyMove, createInitialState, legalOptionsForTeam } from '../rules'
import { evaluate } from './evaluate'
import type { GameState, Move, Variant } from '../types'

/**
 * Finds a position with a real tactic in it.
 *
 * A random game is played out, and every position is looked at for a capture
 * that wins material — a piece the other side cannot take back. That makes a
 * puzzle the player can actually solve, instead of a random position.
 */

export interface Puzzle {
  /** The position before the move. */
  state: GameState
  /** The move that solves it. */
  solution: Move
  /** How much the move wins, in centipawns. */
  gain: number
  /** Who has to play the move. */
  side: string
}

/** The least a capture must win to count as a puzzle. */
const MIN_GAIN = 250

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function findPuzzle(variant: Variant, seed: number): Puzzle | null {
  let state = createInitialState(variant)
  const random = mulberry32(seed)
  for (let ply = 0; ply < 90; ply++) {
    const options = legalOptionsForTeam(state, state.turn)
    if (!options.length) return null

    let best: Puzzle | null = null
    for (const option of options) {
      if (!option.move.capturedId) continue
      const before = evaluate(state, state.turn, { fast: true })
      const after = evaluate(option.next, state.turn, { fast: true })
      const gain = after - before
      if (gain >= MIN_GAIN && (!best || gain > best.gain)) {
        best = { state, solution: option.move, gain, side: state.turn }
      }
    }
    if (best) return best

    // No tactic here — keep playing, but not too wildly.
    const moves = options.filter((o) => !o.move.capturedId)
    const pool = moves.length ? moves : options
    const pick = pool[Math.floor(random() * pool.length)]
    state = applyMove(state, pick.move, { compute: false })
  }
  return null
}
