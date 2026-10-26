import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getLegalMoves } from '@/engine/rules'
import { classicChess } from '@/engine/templates'
import { toFen, fromFen } from './fen'

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function play(game: ReturnType<typeof createInitialState>, from: [number, number], to: [number, number]) {
  const move = getLegalMoves(game, from[0], from[1]).find(
    (m) => m.to.x === to[0] && m.to.y === to[1],
  )
  expect(move).toBeTruthy()
  return applyMove(game, move!)
}

describe('fen', () => {
  it('writes the opening position', () => {
    expect(toFen(createInitialState(classicChess()))).toBe(initialFen)
  })

  it('round trips through import', () => {
    const state = createInitialState(classicChess())
    const imported = fromFen(toFen(state)!)
    expect(imported).not.toBeNull()
    expect(toFen(imported!.game)).toBe(initialFen)
  })

  it('marks the en passant square after a double push', () => {
    const game = play(createInitialState(classicChess()), [4, 6], [4, 4])
    expect(toFen(game)).toContain(' e3 ')
  })

  it('loses castling rights once the rook has moved', () => {
    let game = play(createInitialState(classicChess()), [1, 7], [2, 5]) // Nb1-c3
    game = play(game, [0, 1], [0, 2]) // a7-a6
    game = play(game, [0, 7], [1, 7]) // Ra1-b1
    game = play(game, [1, 1], [1, 2]) // b7-b6
    game = play(game, [6, 7], [5, 5]) // Ng1-f3
    game = play(game, [7, 1], [7, 2]) // h7-h6
    game = play(game, [7, 7], [6, 7]) // Rh1-g1
    // Both white rooks have moved; black still has both of theirs.
    expect(toFen(game)).toMatch(/ kq /)
  })

  it('refuses a nonsense layout', () => {
    expect(fromFen('not a fen at all')).toBeNull()
    expect(fromFen('9/9/9/9/9/9/9/9 w - - 0 1')).toBeNull()
  })
})
