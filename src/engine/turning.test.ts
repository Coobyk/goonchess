import { describe, expect, it } from 'vitest'
import { applyMove, cloneState, createInitialState, getLegalMoves, legalMovesForTeam } from './rules'
import { turnChess } from './templates'
import type { GameState } from './types'
import { positionKey } from './repetition'
import { replayMoves } from '@/lib/replay'

type State = ReturnType<typeof createInitialState>

function bare(seed = 123): State {
  const game = createInitialState(turnChess(seed))
  for (const row of game.board) row.fill(null)
  game.pieces = {}
  return game
}

function place(game: GameState, name: string, team: string, x: number, y: number, orientation = 0): string {
  const type = game.variant.pieceTypes.find((piece) => piece.name === name)!
  const id = `${type.id}|${team}|${x},${y}`
  game.pieces[id] = { id, typeId: type.id, team, hasMoved: false, orientation }
  game.board[y][x] = id
  return id
}

function targets(game: GameState, x: number, y: number): string[] {
  return getLegalMoves(game, x, y).map((move) => `${move.finalTo.x},${move.finalTo.y}`)
}

function firstMove(game: State) {
  const move = legalMovesForTeam(game, game.turn)[0]
  expect(move).toBeTruthy()
  return applyMove(game, move)
}

describe('turn chess', () => {
  it('starts as ordinary chess', () => {
    const game = createInitialState(turnChess(1))
    expect(legalMovesForTeam(game, game.turn)).toHaveLength(20)
  })

  it('randomly turns the moved piece one eighth left, right, or not at all', () => {
    const seen = new Set<number>()
    for (let seed = 1; seed <= 30; seed++) {
      const game = createInitialState(turnChess(seed))
      const move = getLegalMoves(game, 4, 6).find((candidate) => candidate.finalTo.x === 4 && candidate.finalTo.y === 4)
      expect(move).toBeTruthy()
      const next = applyMove(game, move!)
      const orientation = next.pieces[move!.pieceId].orientation ?? 0
      expect(orientation === 0 || orientation === 1 || orientation === 7).toBe(true)
      expect(next.randomSeed).not.toBe(game.randomSeed)
      seen.add(orientation!)
    }
    expect(seen).toEqual(new Set([0, 1, 7]))
  })

  it('turns every surviving piece independently after a move', () => {
    let sawMixed = false
    for (let seed = 1; seed <= 30; seed++) {
      const game = createInitialState(turnChess(seed))
      const move = getLegalMoves(game, 4, 6).find((candidate) => candidate.finalTo.x === 4 && candidate.finalTo.y === 4)
      expect(move).toBeTruthy()
      const next = applyMove(game, move!)
      const orientations = Object.values(next.pieces).map((piece) => piece.orientation ?? 0)
      expect(orientations).toHaveLength(32)
      expect(orientations.every((orientation) => orientation === 0 || orientation === 1 || orientation === 7)).toBe(true)
      if (new Set(orientations).size > 1) sawMixed = true
    }
    expect(sawMixed).toBe(true)
  })

  it('turns a rook’s orthogonal slide into a diagonal slide', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 0)
    place(game, 'King', 'black', 0, 7)
    place(game, 'Rook', 'white', 4, 4, 1)

    const moves = targets(game, 4, 4)
    expect(moves).toContain('5,3')
    expect(moves).toContain('5,5')
    expect(moves).toContain('3,3')
    expect(moves).toContain('3,5')
    expect(moves).not.toContain('5,4')
    expect(moves).not.toContain('4,5')
  })

  it('turns a bishop’s diagonal slide into an orthogonal slide', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 0)
    place(game, 'King', 'black', 0, 7)
    place(game, 'Bishop', 'white', 4, 4, 1)

    const moves = targets(game, 4, 4)
    expect(moves).toContain('5,4')
    expect(moves).toContain('4,5')
    expect(moves).toContain('3,4')
    expect(moves).toContain('4,3')
    expect(moves).not.toContain('5,5')
    expect(moves).not.toContain('3,3')
  })

  it('turns a pawn’s quiet step diagonally', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 0)
    place(game, 'King', 'black', 0, 7)
    place(game, 'Pawn', 'white', 4, 4, 1)

    const moves = targets(game, 4, 4)
    expect(moves).toContain('5,3')
    expect(moves).not.toContain('4,3')
  })

  it('turns a black pawn in board coordinates after mirroring its forward direction', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 0)
    place(game, 'King', 'black', 0, 7)
    place(game, 'Pawn', 'black', 4, 4, 1)

    const moves = targets(game, 4, 4)
    expect(moves).toContain('3,5')
    expect(moves).not.toContain('4,5')
  })

  it('walks a turned horse two square steps diagonally', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 0)
    place(game, 'King', 'black', 0, 7)
    place(game, 'Knight', 'white', 3, 3, 1)

    const moves = targets(game, 3, 3)
    expect(moves).toContain('5,5')
    expect(moves).toContain('5,1')
    expect(moves).toContain('1,5')
    expect(moves).toContain('1,1')
    expect(moves).toHaveLength(4)
    expect(moves).not.toContain('4,5')
    expect(moves).not.toContain('5,4')
  })

  it('keeps a horse a horse after a quarter turn', () => {
    const game = bare()
    place(game, 'King', 'white', 7, 0)
    place(game, 'King', 'black', 0, 7)
    place(game, 'Knight', 'white', 3, 3, 2)

    const moves = targets(game, 3, 3)
    expect(moves).toContain('4,5')
    expect(moves).toContain('5,4')
    expect(moves).not.toContain('5,5')
  })

  it('replays the same random turns from the game seed', () => {
    let game = createInitialState(turnChess(123))
    game = firstMove(game)
    game = firstMove(game)
    game = firstMove(game)

    const replayed = replayMoves(game.variant, game.moveHistory)
    expect(replayed.randomSeed).toBe(game.randomSeed)
    expect(positionKey(replayed)).toBe(positionKey(game))
    for (const id of Object.keys(game.pieces)) {
      expect(replayed.pieces[id]?.orientation ?? 0).toBe(game.pieces[id].orientation ?? 0)
    }
  })

  it('treats different piece orientations as different positions', () => {
    const game = createInitialState(turnChess(123))
    const copy = cloneState(game)
    const id = game.board[6][4]!
    copy.pieces[id] = { ...copy.pieces[id], orientation: 1 }
    expect(positionKey(copy)).not.toBe(positionKey(game))
  })
})
