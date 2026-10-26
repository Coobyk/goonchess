import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getLegalMoves, legalMovesForTeam } from './rules'
import { antichess, classicChess } from './templates'

/** Plays every legal move and counts the leaves `depth` plies down. */
function perft(state: ReturnType<typeof createInitialState>, depth: number): number {
  if (depth === 0) return 1
  let total = 0
  for (const move of legalMovesForTeam(state, state.turn)) {
    const next = applyMove(state, move)
    total += perft(next, depth - 1)
  }
  return total
}

function moveFrom(state: ReturnType<typeof createInitialState>, fromX: number, fromY: number, toX: number, toY: number, promotionTypeId?: string) {
  const move = getLegalMoves(state, fromX, fromY).find(
    (m) => m.to.x === toX && m.to.y === toY,
  )
  expect(move, `no legal move ${fromX},${fromY} -> ${toX},${toY}`).toBeTruthy()
  return { ...move!, promotionTypeId }
}

/** Plays a list of from->to squares, asserting each move exists. */
function play(state: ReturnType<typeof createInitialState>, steps: [number, number, number, number][]) {
  let game = state
  for (const [fx, fy, tx, ty] of steps) {
    game = applyMove(game, moveFrom(game, fx, fy, tx, ty))
  }
  return game
}

describe('classic chess rules', () => {
  it('offers twenty moves in the opening position', () => {
    const game = createInitialState(classicChess())
    expect(legalMovesForTeam(game, game.turn)).toHaveLength(20)
  })

  it('counts four hundred positions two plies deep', () => {
    expect(perft(createInitialState(classicChess()), 2)).toBe(400)
  })

  it('counts eight thousand nine hundred two positions three plies deep', () => {
    expect(perft(createInitialState(classicChess()), 3)).toBe(8902)
  })

  it('ends in checkmate after the fool’s mate', () => {
    const game = play(createInitialState(classicChess()), [
      [5, 6, 5, 5], // f2-f3
      [4, 1, 4, 3], // e7-e5
      [6, 6, 6, 4], // g2-g4
      [3, 0, 7, 4], // Qd8-h4
    ])
    expect(game.status).toBe('checkmate')
    expect(game.winner).toBe('black')
  })

  it('ends in stalemate when the cornered king has no square and no check', () => {
    // A queen walks to c7 against a lone king in the corner: not check, and
    // no square to run to. Rank 8 is y=0, so c7 is (2,1).
    const variant = classicChess()
    variant.setup = [
      { typeId: variant.pieceTypes.find((p) => p.name === 'King')!.id, team: 'black', x: 0, y: 0 },
      { typeId: variant.pieceTypes.find((p) => p.name === 'Queen')!.id, team: 'white', x: 2, y: 2 },
      { typeId: variant.pieceTypes.find((p) => p.name === 'King')!.id, team: 'white', x: 7, y: 7 },
    ]
    const cornered = play(createInitialState(variant), [[2, 2, 2, 1]])
    expect(cornered.status).toBe('stalemate')
    expect(cornered.winner).toBe('draw')
  })

  it('lets the king castle both ways on a clear back rank', () => {
    const variant = classicChess()
    const king = variant.pieceTypes.find((p) => p.name === 'King')!
    const rook = variant.pieceTypes.find((p) => p.name === 'Rook')!
    variant.setup = [
      { typeId: king.id, team: 'white', x: 4, y: 7 },
      { typeId: rook.id, team: 'white', x: 0, y: 7 },
      { typeId: rook.id, team: 'white', x: 7, y: 7 },
      { typeId: king.id, team: 'black', x: 4, y: 0 },
      { typeId: rook.id, team: 'black', x: 0, y: 0 },
      { typeId: rook.id, team: 'black', x: 7, y: 0 },
    ]
    const game = createInitialState(variant)
    const kingMoves = getLegalMoves(game, 4, 7)
    expect(kingMoves.some((m) => m.castle && m.to.x === 6)).toBe(true)
    expect(kingMoves.some((m) => m.castle && m.to.x === 2)).toBe(true)

    const castled = applyMove(game, moveFrom(game, 4, 7, 6, 7))
    // The king is on g1 and the rook has crossed to f1.
    expect(castled.board[7][6]).not.toBeNull()
    expect(castled.board[7][5]).not.toBeNull()
    expect(castled.pieces[castled.board[7][5]!].typeId).toBe(rook.id)
  })

  it('takes en passant the move after a double step', () => {
    const game = play(createInitialState(classicChess()), [
      [4, 6, 4, 4], // e2-e4
      [0, 1, 0, 2], // a7-a6
      [4, 4, 4, 3], // e4-e5
      [3, 1, 3, 3], // d7-d5
    ])
    const captures = getLegalMoves(game, 4, 3).filter((m) => m.capturedId)
    expect(captures).toHaveLength(1)
    expect(captures[0].to).toEqual({ x: 3, y: 2 })
    expect(captures[0].capturedAt).toEqual({ x: 3, y: 3 })
    const taken = applyMove(game, captures[0])
    // The d5 pawn is gone and the capturer stands on d6.
    expect(taken.board[3][3]).toBeNull()
    expect(taken.board[2][3]).not.toBeNull()
  })

  it('promotes a pawn to the piece the player picks', () => {
    const variant = classicChess()
    const pawn = variant.pieceTypes.find((p) => p.name === 'Pawn')!
    const queen = variant.pieceTypes.find((p) => p.name === 'Queen')!
    variant.setup = [
      { typeId: pawn.id, team: 'white', x: 0, y: 1 },
      { typeId: variant.pieceTypes.find((p) => p.name === 'King')!.id, team: 'white', x: 7, y: 7 },
      { typeId: variant.pieceTypes.find((p) => p.name === 'King')!.id, team: 'black', x: 7, y: 0 },
    ]
    const game = createInitialState(variant)
    const moves = getLegalMoves(game, 0, 1)
    expect(moves[0].promotionOptions?.length).toBeGreaterThanOrEqual(4)
    const promoted = applyMove(game, moveFrom(game, 0, 1, 0, 0, queen.id))
    expect(promoted.pieces[promoted.board[0][0]!].typeId).toBe(queen.id)
  })
})

describe('antichess', () => {
  it('forces a capture when one is on the board', () => {
    const game = createInitialState(antichess())
    // 1. e3 is the usual quiet start; here instead: 1. e4 d5 gives a capture.
    const afterE4 = play(game, [[4, 6, 4, 4]])
    const afterD5 = play(afterE4, [[3, 1, 3, 3]])
    // The e4 pawn must take: every legal move of white captures on d5.
    const moves = legalMovesForTeam(afterD5, afterD5.turn)
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every((m) => m.capturedId)).toBe(true)
  })
})
