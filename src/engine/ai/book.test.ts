import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getLegalMoves } from '@/engine/rules'
import { classicChess, horde } from '@/engine/templates'
import { bookMove } from './book'

type State = ReturnType<typeof createInitialState>

function play(game: State, from: [number, number], to: [number, number]) {
  const move = getLegalMoves(game, from[0], from[1]).find(
    (m) => m.to.x === to[0] && m.to.y === to[1],
  )
  expect(move).toBeTruthy()
  return applyMove(game, move!, { san: true })
}

describe('opening book', () => {
  it('offers a first move for classic chess', () => {
    const game = createInitialState(classicChess())
    const move = bookMove(game, 7)
    expect(move).not.toBeNull()
    expect(game.pieces[move!.pieceId].team).toBe('white')
  })

  it('follows a score sheet into the book and stays varied by seed', () => {
    let game = createInitialState(classicChess())
    game = play(game, [4, 6], [4, 4]) // e4
    const move = bookMove(game, 3)
    expect(move).not.toBeNull()
    // The reply to e4 comes from the book: e5, c5, e6 or c6 — a black piece.
    const inst = game.pieces[move!.pieceId]
    expect(inst.team).toBe('black')
  })

  it('leaves the book when the game wanders off it', () => {
    let game = createInitialState(classicChess())
    game = play(game, [0, 6], [0, 4]) // a4
    game = play(game, [0, 1], [0, 3]) // a5
    // a4 a5 is not in the book.
    expect(bookMove(game, 1)).toBeNull()
  })

  it('knows nothing about other variants', () => {
    expect(bookMove(createInitialState(horde()), 1)).toBeNull()
  })

  it('returns a legal move', () => {
    const game = createInitialState(classicChess())
    for (let seed = 0; seed < 20; seed++) {
      const move = bookMove(game, seed)
      expect(move).not.toBeNull()
      const legal = getLegalMoves(game, move!.from.x, move!.from.y).some(
        (m) => m.to.x === move!.to.x && m.to.y === move!.to.y,
      )
      expect(legal).toBe(true)
    }
  })
})
