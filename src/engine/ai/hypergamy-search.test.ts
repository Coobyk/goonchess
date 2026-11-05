import { describe, expect, it } from 'vitest'
import { createInitialState } from '../rules'
import { searchBestMove } from './search'
import { hypergamyChess } from '../templates'
import type { GameState } from '../types'

const variant = hypergamyChess()
const byName = new Map(variant.pieceTypes.map((p) => [p.name, p]))

type State = ReturnType<typeof createInitialState>

function bare(): State {
  const game = createInitialState(variant)
  for (const row of game.board) row.fill(null)
  game.pieces = {}
  return game
}

function place(game: GameState, name: string, team: string, x: number, y: number): string {
  const typeId = byName.get(name)!.id
  const id = `${typeId}|${team}|${x},${y}`
  game.pieces[id] = { id, typeId, team, hasMoved: false }
  game.board[y][x] = id
  return id
}

describe('the bot under hypergamy', () => {
  it('finds Qa6# — a mate the king cannot answer', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 0) // a8
    place(game, 'King', 'black', 7, 0) // h8
    place(game, 'Queen', 'black', 3, 2) // d6
    place(game, 'Queen', 'black', 1, 4) // b4
    game.turn = 'black'

    const result = searchBestMove(game, { team: 'black', level: 'normal', seed: 1 })
    expect(result.move?.finalTo).toEqual({ x: 0, y: 2 }) // a6
    expect(result.score).toBeGreaterThan(500_000)
  })

  it('finds Qb7# — mate that only stands because the king cannot take', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 0) // a8
    place(game, 'King', 'black', 7, 0) // h8
    place(game, 'Queen', 'black', 5, 1) // f7, on b7's rank
    game.turn = 'black'

    // In classic chess Kxb7 refutes this unless the queen is defended; under
    // hypergamy the king can never take, so Qb7 is mate on its own.
    const result = searchBestMove(game, { team: 'black', level: 'normal', seed: 1 })
    expect(result.move?.finalTo).toEqual({ x: 1, y: 1 }) // b7
    expect(result.score).toBeGreaterThan(500_000)
  })

  it('finds Qb7# even with a rook staring at the mating square', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 0) // a8
    place(game, 'Rook', 'white', 2, 0) // c8, watching b8 but powerless
    place(game, 'King', 'black', 7, 3) // h5, clear of the rook
    place(game, 'Queen', 'black', 4, 1) // e7
    game.turn = 'black'

    // Nobody may take the queen on b7: the king may not, and the rook is
    // beneath her. The mate the old rules would call a blunder.
    const result = searchBestMove(game, { team: 'black', level: 'normal', seed: 1 })
    expect(result.move?.finalTo).toEqual({ x: 1, y: 1 }) // b7
    expect(result.score).toBeGreaterThan(500_000)
  })

  it('finds the mate at every level, casual included', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 0) // a8
    place(game, 'Rook', 'white', 2, 0) // c8, watching b8 but powerless
    place(game, 'King', 'black', 7, 3) // h5
    place(game, 'Queen', 'black', 4, 1) // e7
    game.turn = 'black'

    for (const level of ['casual', 'normal', 'strong'] as const) {
      const result = searchBestMove(game, { team: 'black', level, seed: 7 })
      expect(result.move?.finalTo).toEqual({ x: 1, y: 1 }) // b7
    }
  })
})
