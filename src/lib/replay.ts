import { applyMove, createInitialState, rollRandomPieces } from '@/engine/rules'
import type { GameState } from '@/engine/types'

/**
 * Rebuilds a game from its start, so it can be replayed or exported.
 *
 * The piece ids are derived from where the pieces stand, so replaying the
 * recorded moves lands on exactly the same positions.
 */
export function replayStates(game: GameState): GameState[] {
  const start = createInitialState(game.variant)
  const states: GameState[] = [start]
  let current = start
  for (const record of game.moveHistory) {
    current = applyMove(current, record.move, { compute: false })
    // A random piece is rolled anew after every move, the same way it was
    // when the game was played.
    current = rollRandomPieces(current)
    states.push(current)
  }
  return states
}

/** The move that led to a state, for the replay label. */
export function moveLabel(game: GameState, index: number): string {
  const record = game.moveHistory[index - 1]
  if (!record) return 'Start'
  const team = game.variant.teams.find((t) => t.id === record.team)
  return `${team?.name ?? record.team} ${record.notation}`
}
