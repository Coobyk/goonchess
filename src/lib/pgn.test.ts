import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getLegalMoves } from '@/engine/rules'
import { classicChess } from '@/engine/templates'
import { toPgn } from './pgn'

function play(game: ReturnType<typeof createInitialState>, from: [number, number], to: [number, number]) {
  const move = getLegalMoves(game, from[0], from[1]).find(
    (m) => m.to.x === to[0] && m.to.y === to[1],
  )
  expect(move).toBeTruthy()
  return applyMove(game, move!, { san: true })
}

describe('pgn export', () => {
  it('writes headers, numbered moves and the result', () => {
    let game = createInitialState(classicChess())
    game = play(game, [5, 6], [5, 5]) // f3
    game = play(game, [4, 1], [4, 3]) // e5
    game = play(game, [6, 6], [6, 4]) // g4
    game = play(game, [3, 0], [7, 4]) // Qh4 mate

    const pgn = toPgn(game)
    expect(pgn).toContain('[Event ')
    expect(pgn).toContain('[White "White"]')
    expect(pgn).toContain('[Black "Black"]')
    expect(pgn).toContain('[Result "0-1"]')
    expect(pgn).toContain('1. f3 e5 2. g4 Qh4#')
    expect(pgn.trimEnd().endsWith('0-1')).toBe(true)
  })

  it('marks an unfinished game with a star', () => {
    const pgn = toPgn(createInitialState(classicChess()))
    expect(pgn).toContain('[Result "*"]')
    expect(pgn.trimEnd().endsWith('*')).toBe(true)
  })
})
