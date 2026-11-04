import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getLegalMoves } from './rules'
import { loyaltyChess } from './templates'
import type { GameState } from './types'

const variant = loyaltyChess()
const byName = new Map(variant.pieceTypes.map((p) => [p.name, p]))

type State = ReturnType<typeof createInitialState>

/** A bare board, so each test places exactly the pieces it needs. */
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

const royalOf = (game: GameState, team: string) =>
  Object.values(game.pieces).find(
    (p) => p.team === team && game.pieceTypes[p.typeId]?.flags.royal,
  )

describe('loyalty chess', () => {
  it('blows up the mover\'s own king when his queen checks the enemy king', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    const queen = place(game, 'Queen', 'white', 3, 4) // d5
    place(game, 'King', 'black', 3, 0) // d8
    place(game, 'Rook', 'black', 0, 0) // a8, so black is not stuck

    // Qd7 — eye contact down the file: the white king explodes, black wins.
    const move = getLegalMoves(game, 3, 4).find((m) => m.finalTo.x === 3 && m.finalTo.y === 1)
    expect(move).toBeTruthy()
    const next = applyMove(game, move!)

    expect(royalOf(next, 'white')).toBeUndefined()
    expect(next.board[7][4]).toBeNull()
    expect(next.winner).toBe('black')
    expect(next.status).toBe('jealousy')
    // The blast is recorded where the king stood, for the animation.
    expect(next.moveHistory.at(-1)?.blasts).toEqual([
      { x: 4, y: 7, radius: 1, victims: [{ x: 4, y: 7 }] },
    ])
    // The queen herself lives on — the king took his rage out on himself.
    expect(next.pieces[queen]).toBeTruthy()
  })

  it('lets the jealous move be played at all — it is a trap, not a crime', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Queen', 'white', 3, 4) // d5
    place(game, 'King', 'black', 3, 0) // d8
    place(game, 'Rook', 'black', 0, 0) // a8
    const targets = getLegalMoves(game, 3, 4).map((m) => `${m.finalTo.x},${m.finalTo.y}`)
    expect(targets).toContain('3,1') // d7, the check that loses the game
    expect(targets).toContain('1,4') // b5, a quiet move that keeps the king
  })

  it('spares the king while his queen sees no enemy king', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Queen', 'white', 3, 4) // d5
    place(game, 'King', 'black', 0, 0) // a8, out of her sight
    place(game, 'Rook', 'black', 1, 0) // b8
    const move = getLegalMoves(game, 3, 4).find((m) => m.finalTo.x === 1 && m.finalTo.y === 4)!
    const next = applyMove(game, move)
    expect(royalOf(next, 'white')).toBeTruthy()
    expect(next.winner).toBeNull()
    expect(next.status).toBe('active')
  })

  it('treats every other piece\'s check as ordinary chess', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Rook', 'white', 3, 6) // d2
    place(game, 'King', 'black', 3, 0) // d8
    place(game, 'Rook', 'black', 0, 0) // a8
    const move = getLegalMoves(game, 3, 6).find((m) => m.finalTo.x === 3 && m.finalTo.y === 1)!
    const next = applyMove(game, move)
    expect(royalOf(next, 'white')).toBeTruthy()
    expect(next.winner).toBeNull()
    expect(next.status).toBe('active')
    expect(next.turn).toBe('black')
  })

  it('blows up the mover\'s king too, when another of his pieces opens her eye', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Rook', 'white', 0, 7) // a1
    place(game, 'Queen', 'black', 4, 1) // e7
    place(game, 'Knight', 'black', 4, 3) // e5, standing in his own queen's sight
    place(game, 'King', 'black', 0, 0) // a8
    game.turn = 'black'

    // The knight steps off the e-file, the black queen now looks at the white
    // king, and the black king — who owns the gaze — explodes. White wins.
    const knight = game.board[3][4]!
    const move = getLegalMoves(game, 4, 3).find((m) => m.finalTo.x === 6 && m.finalTo.y === 4)!
    expect(move).toBeTruthy()
    const next = applyMove(game, move!)
    expect(next.pieces[knight]).toBeTruthy()
    expect(royalOf(next, 'black')).toBeUndefined()
    expect(next.winner).toBe('white')
    expect(next.status).toBe('jealousy')
  })

  it('keeps the turn and the move list honest after the explosion', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Queen', 'white', 3, 4) // d5
    place(game, 'King', 'black', 3, 0) // d8
    place(game, 'Rook', 'black', 0, 0) // a8
    const move = getLegalMoves(game, 3, 4).find((m) => m.finalTo.x === 3 && m.finalTo.y === 1)!
    const next = applyMove(game, move)
    expect(next.turn).toBe('black')
    expect(next.moveHistory).toHaveLength(1)
    expect(next.moveHistory[0].team).toBe('white')
  })
})
