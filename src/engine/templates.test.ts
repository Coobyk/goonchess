import { describe, expect, it } from 'vitest'
import { createInitialState, legalMovesForTeam } from './rules'
import { TEMPLATES } from './templates'

describe('built-in templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s builds a playable game', (_id, template) => {
    const variant = template.build()
    expect(variant.pieceTypes.length).toBeGreaterThan(0)
    expect(variant.teams.length).toBeGreaterThanOrEqual(2)
    expect(variant.setup.length).toBeGreaterThan(0)

    const game = createInitialState(variant)
    // Every setup piece is on the board where it was placed.
    for (const placed of variant.setup) {
      expect(game.board[placed.y][placed.x], `${variant.id}: (${placed.x},${placed.y}) occupied`).not.toBeNull()
    }
    // The side to move has somewhere to go.
    expect(legalMovesForTeam(game, game.turn).length, `${variant.id}: opening moves`).toBeGreaterThan(0)
  })
})
