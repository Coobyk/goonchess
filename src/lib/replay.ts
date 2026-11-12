import { applyMove, createInitialState, rollRandomPieces, type ApplyOptions } from '@/engine/rules'
import { countPosition, positionKey } from '@/engine/repetition'
import type { GameState, Move, MoveRecord, Variant } from '@/engine/types'

// A random piece is rolled anew after every move, the same way it was when
// the game was played. The piece that has just moved keeps its kind.
function step(state: GameState, record: MoveRecord, options: ApplyOptions): GameState {
  return rollRandomPieces(applyMove(state, record.move, options), record.move.pieceId)
}

/**
 * Rebuilds a game from its start, so it can be replayed or exported.
 *
 * The piece ids are derived from where the pieces stand, so replaying the
 * recorded moves lands on exactly the same positions.
 */
export function replayStates(game: GameState): GameState[] {
  const states = [createInitialState(game.variant)]
  for (const record of game.moveHistory) {
    states.push(step(states[states.length - 1], record, { compute: false }))
  }
  return states
}

/**
 * The position a list of moves ends in. The room's undo relies on it: take
 * every move back by playing all but the last one again.
 */
export function replayMoves(
  variant: Variant,
  records: MoveRecord[],
  options: (record: MoveRecord) => ApplyOptions = () => ({}),
): GameState {
  let state = createInitialState(variant)
  for (const record of records) state = step(state, record, options(record))
  return state
}

/**
 * Would this move bring back a position that has already been played?
 *
 * The third time round is a draw, and shuffling towards it is never good
 * play, so a bot that can avoid it should.
 */
export function wouldRepeat(state: GameState, move: Move): boolean {
  const next = applyMove(state, move, { compute: false })
  return countPosition(next, positionKey(next)) > 0
}
