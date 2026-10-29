import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, findPiece, getLegalMoves, legalMovesForTeam } from './rules'
import { predatorChess } from './templates'
import type { GameState } from './types'
import { packVariant, unpackVariant } from '@/lib/variantCodec'

const variant = predatorChess()
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

const mover = (game: GameState, move: { pieceId: string }) =>
  game.pieceTypes[game.pieces[move.pieceId]?.typeId ?? '']?.name

describe('predator chess', () => {
  it('moves the Predator like a queen', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Predator', 'white', 3, 7) // d1
    place(game, 'King', 'black', 4, 0) // e8
    const targets = getLegalMoves(game, 3, 7).map((m) => `${m.finalTo.x},${m.finalTo.y}`)
    expect(targets).toContain('3,3') // up the file
    expect(targets).toContain('0,7') // along the rank
    expect(targets).toContain('1,5') // either diagonal
    expect(targets).toContain('6,4') // and the other
  })

  it('forces the Predator to take a pawn it can see, and nothing else may move', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Predator', 'white', 3, 7) // d1
    place(game, 'Pawn', 'black', 3, 3) // d5
    place(game, 'King', 'black', 4, 0) // e8
    const moves = legalMovesForTeam(game, 'white')
    expect(moves).toHaveLength(1)
    expect(mover(game, moves[0])).toBe('Predator')
    expect(moves[0].capturedId).toBeTruthy()
  })

  it('offers the choice between every target in sight', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Predator', 'white', 3, 7) // d1
    place(game, 'Pawn', 'black', 3, 3) // d5
    place(game, 'Pawn', 'black', 7, 3) // h5
    place(game, 'King', 'black', 4, 0) // e8
    const moves = legalMovesForTeam(game, 'white')
    expect(moves).toHaveLength(2)
    for (const move of moves) {
      expect(mover(game, move)).toBe('Predator')
      expect(move.capturedId).toBeTruthy()
    }
  })

  it('lets the game go on when only a rook is in sight', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Predator', 'white', 3, 7) // d1
    place(game, 'Rook', 'black', 3, 3) // d5
    place(game, 'King', 'black', 4, 0) // e8
    expect(legalMovesForTeam(game, 'white').length).toBeGreaterThan(1)
  })

  it('cannot be resisted, even out of check', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1, checked by the rook
    place(game, 'Predator', 'white', 3, 7) // d1
    place(game, 'Rook', 'black', 4, 0) // e8
    place(game, 'Pawn', 'black', 7, 3) // h5
    place(game, 'King', 'black', 0, 0) // a8
    const moves = legalMovesForTeam(game, 'white')
    expect(moves).toHaveLength(1)
    expect(mover(game, moves[0])).toBe('Predator')
    const victim = game.pieces[moves[0].capturedId!]
    expect(game.pieceTypes[victim.typeId].name).toBe('Pawn')
  })

  it('brings a taken Predator back on its own square', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 7) // h1
    place(game, 'Rook', 'white', 0, 7) // a1
    place(game, 'King', 'black', 7, 0) // h8
    const predatorId = place(game, 'Predator', 'black', 3, 0) // d8
    // The Predator wanders off to a5, leaving its starting square free.
    game.board[0][3] = null
    game.board[3][0] = predatorId
    const take = getLegalMoves(game, 0, 7).find((m) => m.finalTo.x === 0 && m.finalTo.y === 3)
    expect(take).toBeTruthy()
    const next = applyMove(game, take!)
    expect(next.pieces[predatorId]).toBeTruthy()
    expect(next.board[0][3]).toBe(predatorId)
    expect(next.winner).toBeNull()
  })

  it('brings a taken Predator back somewhere empty when its square is taken', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 7) // h1
    place(game, 'Rook', 'white', 3, 7) // d1
    place(game, 'King', 'black', 7, 0) // h8
    const predatorId = place(game, 'Predator', 'black', 3, 0) // d8
    const take = getLegalMoves(game, 3, 7).find((m) => m.finalTo.x === 3 && m.finalTo.y === 0)
    expect(take).toBeTruthy()
    const next = applyMove(game, take!)
    // The rook stands where the Predator was; the Predator is back elsewhere.
    expect(next.board[0][3]).toBe(take!.pieceId)
    expect(next.pieces[predatorId]).toBeTruthy()
    const at = findPiece(next, predatorId)
    expect(at).not.toBeNull()
    expect(next.board[at!.y][at!.x]).toBe(predatorId)
    expect(next.winner).toBeNull()
  })

  it('stays dead when a king takes it, and the king wins at once', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    const predatorId = place(game, 'Predator', 'black', 3, 6) // d2
    place(game, 'King', 'black', 0, 0) // a8
    const take = getLegalMoves(game, 4, 7).find((m) => m.finalTo.x === 3 && m.finalTo.y === 6)
    expect(take).toBeTruthy()
    const next = applyMove(game, take!)
    expect(next.winner).toBe('white')
    expect(next.status).toBe('predator-kill')
    expect(next.pieces[predatorId]).toBeUndefined()
  })

  it('lets the king slay it through its defenders', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Predator', 'black', 3, 6) // d2
    place(game, 'Rook', 'black', 3, 0) // d8, guarding d2 down the file
    place(game, 'King', 'black', 0, 0) // a8
    const take = getLegalMoves(game, 4, 7).find((m) => m.finalTo.x === 3 && m.finalTo.y === 6)
    expect(take).toBeTruthy()
    const next = applyMove(game, take!)
    expect(next.winner).toBe('white')
    expect(next.status).toBe('predator-kill')
  })

  it('lets the king slay it even while its own Predator is under the compulsion', () => {
    const game = bare()
    place(game, 'King', 'white', 4, 7) // e1
    place(game, 'Predator', 'white', 3, 7) // d1 — it sees the pawn on h5
    place(game, 'Pawn', 'black', 7, 3) // h5
    place(game, 'Predator', 'black', 3, 6) // d2, beside the king
    place(game, 'King', 'black', 0, 0) // a8
    const slay = getLegalMoves(game, 4, 7).find((m) => m.finalTo.x === 3 && m.finalTo.y === 6)
    expect(slay).toBeTruthy()
    const next = applyMove(game, slay!)
    expect(next.winner).toBe('white')
    expect(next.status).toBe('predator-kill')
    // The compulsion itself is untouched: the Predator still must hunt.
    const teamMoves = legalMovesForTeam(game, 'white')
    expect(teamMoves.length).toBe(2)
    for (const move of teamMoves) {
      const name = mover(game, move)
      expect(name === 'Predator' || name === 'King').toBe(true)
    }
  })

  it('wins the game when the Predator eats the last pawn and minor piece', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 7) // h1
    place(game, 'Predator', 'white', 3, 7) // d1
    place(game, 'Knight', 'black', 3, 3) // d5
    place(game, 'King', 'black', 0, 0) // a8
    const moves = legalMovesForTeam(game, 'white')
    expect(moves).toHaveLength(1)
    const next = applyMove(game, moves[0])
    expect(next.winner).toBe('white')
    expect(next.status).toBe('predator-depletion')
  })

  it('goes on while a minor piece is still standing', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 7) // h1
    place(game, 'Predator', 'white', 3, 7) // d1
    place(game, 'Knight', 'black', 3, 3) // d5
    place(game, 'Bishop', 'black', 0, 2) // a6
    place(game, 'King', 'black', 0, 0) // a8
    const moves = legalMovesForTeam(game, 'white')
    expect(moves).toHaveLength(1)
    const next = applyMove(game, moves[0])
    expect(next.winner).toBeNull()
    expect(next.status).toBe('active')
  })

  it('survives a trip through a share link', () => {
    const unpacked = unpackVariant(packVariant(variant))
    expect(unpacked.rules).toContain('predator')
    expect(unpacked.winConditions.some((w) => w.kind === 'predator')).toBe(true)
    const predator = unpacked.pieceTypes.find((p) => p.name === 'Predator')
    expect(predator?.flags.predator).toBe(true)
  })
})
