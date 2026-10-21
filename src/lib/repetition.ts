import { applyMove } from '@/engine/rules'
import { countPosition, positionKey } from '@/engine/repetition'
import type { GameState, Move } from '@/engine/types'

/**
 * Would this move bring back a position that has already been played?
 *
 * The third time round is a draw, and shuffling towards it is never good
 * play, so a bot that can avoid it should.
 */
export function wouldRepeat(state: GameState, move: Move): boolean {
  const next = applyMove(state, move, { compute: false })
  const key = positionKey(next)
  return countPosition(next, key) > 0
}
