import { applyMove, createInitialState, isInCheck, legalOptionsForTeam } from '../rules'
import { computeThreats } from '../threats'
import { evaluate } from './evaluate'
import type { GameState, Move, Variant } from '../types'

/**
 * Finds a position with a real tactic in it.
 *
 * A random game is played out, and every position is looked at for a capture
 * that wins material — a piece the other side cannot take back. That makes a
 * puzzle the player can actually solve, instead of a random position.
 */

export type PuzzleDifficulty = 'easy' | 'medium' | 'hard'

export interface Puzzle {
  /** The position before the move. */
  state: GameState
  /** The move that solves it. */
  solution: Move
  /** How much the move wins, in centipawns. */
  gain: number
  /** Who has to play the move. */
  side: string
  /** How hard the puzzle is, from what the move wins. */
  difficulty: PuzzleDifficulty
  /** What kind of tactic the move is: fork, check, promotion, … */
  themes: string[]
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

/**
 * What kind of tactic the solution is, and how hard it is to find.
 *
 * The difficulty is the material at stake; the themes read off the move and
 * the position it makes: a capture that lands among two or more pieces of
 * three points or more is a fork, a capture that gives check is a check, and
 * so on.
 */
export function describePuzzle(state: GameState, solution: Move, gain: number): {
  difficulty: PuzzleDifficulty
  themes: string[]
} {
  const themes = new Set<string>(['capture'])
  const next = applyMove(state, solution, { compute: false })
  const opponent = next.turn

  if (isInCheck(next, opponent)) themes.add('check')
  if (solution.promotionTypeId) themes.add('promotion')
  const victim = solution.capturedId ? state.pieces[solution.capturedId] : undefined
  const victimPiece = victim ? state.pieceTypes[victim.typeId] : undefined
  if ((victimPiece?.value ?? 0) >= 5) themes.add('big-capture')

  // The moved piece attacks from where it landed: two or more worthwhile
  // targets at once is a fork.
  const attackerId = next.board[solution.finalTo.y]?.[solution.finalTo.x]
  if (attackerId) {
    const targets = new Set(
      computeThreats(next, opponent).edges
        .filter((edge) => edge.attackerId === attackerId)
        .map((edge) => edge.targetId)
        .filter((id) => (state.pieceTypes[state.pieces[id]?.typeId ?? '']?.value ?? 0) >= 3),
    )
    if (targets.size >= 2) themes.add('fork')
  }

  const difficulty: PuzzleDifficulty = gain >= 800 ? 'hard' : gain >= 500 ? 'medium' : 'easy'
  return { difficulty, themes: [...themes] }
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
        const { difficulty, themes } = describePuzzle(state, option.move, gain)
        best = { state, solution: option.move, gain, side: state.turn, difficulty, themes }
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
