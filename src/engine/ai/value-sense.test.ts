import { describe, expect, it } from 'vitest'
import { fromFen } from '../../lib/fen'
import { applyMove, legalMovesForTeam } from '../rules'
import { searchBestMove, type BotLevel } from './search'
import type { GameState } from '../types'

function load(fen: string): GameState {
  const parsed = fromFen(fen)
  if (!parsed) throw new Error('bad fen')
  return parsed.game
}

function material(game: GameState, team: string): number {
  let total = 0
  for (const id in game.pieces) {
    const inst = game.pieces[id]
    const value = game.pieceTypes[inst.typeId]?.value ?? 0
    total += inst.team === team ? value : -value
  }
  return total
}

/** Material balance for `team` after the move and the opponent's best capture reply. */
function materialAfterReply(game: GameState, team: string, move: Parameters<typeof applyMove>[1]) {
  const next = applyMove(game, move, { compute: false, search: true })
  const other = next.variant.teams.find((t) => t.id !== team)!.id
  let worst = material(next, team)
  for (const reply of legalMovesForTeam(next, other)) {
    const after = applyMove(next, reply, { compute: false, search: true })
    worst = Math.min(worst, material(after, team))
  }
  return worst
}

// White queen d4 can take a knight on d5 that a pawn on e6 defends.
const FEN = '4k3/8/4p3/3n4/3Q4/8/8/4K3 w - - 0 1'

describe('bots know what a queen is worth', () => {
  for (const level of ['normal', 'strong'] as BotLevel[]) {
    it(`${level} does not give the queen for a defended knight`, () => {
      const game = load(FEN)
      let bad = 0
      const runs = 20
      for (let seed = 1; seed <= runs; seed++) {
        const result = searchBestMove(game, { team: 'white', level, seed, timeBudgetMs: 150 })
        const m = result.move!
        if (m.finalTo.x === 3 && m.finalTo.y === 3) bad++
      }
      expect(bad).toBeLessThanOrEqual(0)
    })
  }

  it('does not hang the queen on a random move', () => {
    const game = load('4k3/8/8/8/3Q4/8/3P4/4K3 w - - 0 1')
    for (const level of ['normal'] as BotLevel[]) {
      for (let seed = 1; seed <= 150; seed++) {
        const result = searchBestMove(game, { team: 'white', level, seed, timeBudgetMs: 100 })
        expect(materialAfterReply(game, 'white', result.move!)).toBeGreaterThan(5)
      }
    }
  })

  it('still takes a free queen and still plays a real sacrifice for mate', () => {
    const free = load('4k3/8/8/3q4/3Q4/8/8/4K3 w - - 0 1')
    expect(searchBestMove(free, { team: 'white', level: 'normal', seed: 3 }).move?.finalTo).toEqual({ x: 3, y: 3 })
    // Back-rank: Qd8+ sacrifices the queen for mate after Rxd8? use Rook mate-in-one via queen sac line.
    const mate = load('6k1/5ppp/8/8/8/8/8/3QK2R w - - 0 1')
    const res = searchBestMove(mate, { team: 'white', level: 'normal', seed: 3 })
    expect(res.score).toBeGreaterThan(500_000)
  })
})
