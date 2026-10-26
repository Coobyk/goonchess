import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getLegalMoves } from '@/engine/rules'
import { classicChess } from '@/engine/templates'
import { fromPgn, toPgn } from './pgn'

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

  it('reads back the game it wrote', () => {
    let game = createInitialState(classicChess())
    game = play(game, [5, 6], [5, 5]) // f3
    game = play(game, [4, 1], [4, 3]) // e5
    game = play(game, [6, 6], [6, 4]) // g4
    game = play(game, [3, 0], [7, 4]) // Qh4 mate

    const imported = fromPgn(toPgn(game))
    expect(imported).not.toBeNull()
    expect(imported!.game.winner).toBe('black')
    expect(imported!.game.status).toBe('checkmate')
    expect(imported!.states).toHaveLength(5)
    expect(imported!.game.moveHistory.map((r) => r.san)).toEqual(
      ['f3', 'e5', 'g4', 'Qh4#'],
    )
  })

  it('reads a score sheet with headers, numbers, comments and variations', () => {
    const imported = fromPgn([
      '[Event "Casual game"]',
      '[Result "*"]',
      '',
      '1. e4! e5 { the best reply } 2. Nf3 (2. d4 is livelier) Nc6 3. Bb5 *',
    ].join('\n'))
    expect(imported).not.toBeNull()
    expect(imported!.game.moveHistory).toHaveLength(5)
    expect(imported!.game.moveHistory.map((r) => r.san)).toEqual(
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    )
  })

  it('rejects a sheet of moves the variant cannot play', () => {
    // A short legal line.
    expect(fromPgn('1. e4 d5 2. exd5 Qxd5 3. Nc3')).not.toBeNull()
    // The queen is gone from d8 and d1 is still blocked by its own pawn.
    expect(fromPgn('1. e4 d5 2. exd5 Qxd5 3. Qxd5')).toBeNull()
    // c1 and d1 are still occupied, so the long castle is not there.
    expect(fromPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O-O')).toBeNull()
    expect(fromPgn('nonsense words only')).toBeNull()
    expect(fromPgn('')).toBeNull()
  })
})
