import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getLegalMoves } from './rules'
import { hypergamyChess } from './templates'
import type { GameState } from './types'

const variant = hypergamyChess()
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

/** Where a piece at (x, y) may capture, as "x,y" strings. */
function captureTargets(game: GameState, x: number, y: number): string[] {
  return getLegalMoves(game, x, y)
    .filter((m) => !!m.capturedId)
    .map((m) => `${m.finalTo.x},${m.finalTo.y}`)
}

describe('hypergamy', () => {
  it('lets a pawn take anything it reaches', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 7) // a1
    place(game, 'Pawn', 'white', 4, 4) // e4
    place(game, 'King', 'black', 7, 0) // h8
    place(game, 'Queen', 'black', 3, 3) // d5, one step up the diagonal
    place(game, 'Pawn', 'black', 5, 3) // f5, the other diagonal

    const targets = captureTargets(game, 4, 4)
    expect(targets).toContain('3,3') // the queen, far above it
    expect(targets).toContain('5,3') // a pawn of its own
  })

  it('denies a knight a pawn but lets him take a bishop', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 7) // a1
    place(game, 'Knight', 'white', 4, 4) // e4
    place(game, 'King', 'black', 7, 0) // h8
    place(game, 'Pawn', 'black', 3, 2) // c6, a knight's step away
    place(game, 'Bishop', 'black', 5, 2) // f6, also a knight's step away

    const targets = captureTargets(game, 4, 4)
    expect(targets).not.toContain('3,2')
    expect(targets).toContain('5,2')
  })

  it('pairs the knights and bishops off against each other', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 7) // a1
    place(game, 'Bishop', 'white', 4, 4) // e4
    place(game, 'King', 'black', 7, 0) // h8
    place(game, 'Knight', 'black', 2, 2) // c6, on its diagonal
    place(game, 'Bishop', 'black', 6, 2) // g6, also on its diagonal

    const targets = captureTargets(game, 4, 4)
    expect(targets).toContain('2,2')
    expect(targets).toContain('6,2')
  })

  it('lets a rook take rooks and queens but not bishops', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 7) // a1
    place(game, 'Rook', 'white', 4, 4) // e4
    place(game, 'King', 'black', 7, 0) // h8
    place(game, 'Queen', 'black', 4, 1) // e7, up the file
    place(game, 'Rook', 'black', 4, 6) // e2, down the file
    place(game, 'Bishop', 'black', 6, 4) // g4, along the rank

    const targets = captureTargets(game, 4, 4)
    expect(targets).toContain('4,1')
    expect(targets).toContain('4,6')
    expect(targets).not.toContain('6,4')
  })

  it('leaves the queen nobody but another queen to take', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 7) // a1
    place(game, 'Queen', 'white', 4, 4) // e4
    place(game, 'King', 'black', 7, 0) // h8
    place(game, 'Rook', 'black', 4, 1) // e7, up the file
    place(game, 'Queen', 'black', 4, 6) // e2, down the file
    place(game, 'Pawn', 'black', 3, 3) // d5, on her diagonal

    const targets = captureTargets(game, 4, 4)
    expect(targets).not.toContain('4,1')
    expect(targets).not.toContain('3,3')
    expect(targets).toContain('4,6')
  })

  it('spares the king as a target: even a pawn may take him', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'King', 'black', 4, 0) // e8
    place(game, 'Pawn', 'white', 3, 1) // d7, one step from the king
    place(game, 'Rook', 'black', 0, 0) // a8, so black is not stuck

    const takesKing = getLegalMoves(game, 3, 1).find(
      (m) => m.finalTo.x === 4 && m.finalTo.y === 0,
    )
    expect(takesKing).toBeTruthy()
    const next = applyMove(game, takesKing!)
    expect(next.winner).toBe('white')
    expect(next.status).toBe('royal-captured')
  })

  it('lets the king take anyone, high or low', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'King', 'black', 0, 0) // a8
    place(game, 'Pawn', 'black', 5, 6) // f2, beside the white king
    place(game, 'Queen', 'black', 3, 7) // d1, on his other side

    const targets = captureTargets(game, 4, 7)
    expect(targets).toContain('5,6')
    expect(targets).toContain('3,7')
  })

  it('lets a checked king escape by stepping aside, or by taking her', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'King', 'black', 7, 0) // h8
    place(game, 'Queen', 'black', 3, 0) // d8
    game.turn = 'black'

    // Qe7+ — too far away to take, but d2 is open to him.
    const check = getLegalMoves(game, 3, 0).find((m) => m.finalTo.x === 4 && m.finalTo.y === 1)!
    expect(check).toBeTruthy()
    const next = applyMove(game, check)
    expect(next.status).toBe('active')
    const escapes = getLegalMoves(next, 4, 7)
    expect(escapes.some((m) => m.finalTo.x === 3 && m.finalTo.y === 6)).toBe(true)
    expect(escapes.some((m) => !!m.capturedId)).toBe(false)
  })

  it('still knows checkmate when nothing can answer the queen', () => {
    const game = bare()
    place(game, 'King', 'white', 0, 0) // a8
    place(game, 'King', 'black', 7, 0) // h8
    place(game, 'Queen', 'black', 3, 2) // d6
    place(game, 'Queen', 'black', 1, 4) // b4, covering b8 and b7
    game.turn = 'black'

    // Qa6# — the check down the a-file that the king can neither run from
    // nor take, and nothing else stands on white's side to answer it.
    const mate = getLegalMoves(game, 3, 2).find((m) => m.finalTo.x === 0 && m.finalTo.y === 2)!
    expect(mate).toBeTruthy()
    const next = applyMove(game, mate)
    expect(next.status).toBe('checkmate')
    expect(next.winner).toBe('black')
  })
})
