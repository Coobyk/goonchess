import { describe, expect, it, vi } from 'vitest'
import { decodeGame, encodeGame } from '@/lib/encoding'
import { fromPgn } from '@/lib/pgn'
import { createInitialState, getLegalMoves, staggerPass } from '@/engine/rules'
import { bossFight, miniChess } from '@/engine/templates'
import { replayMoves, undoPly } from '@/lib/replay'
import { positionKey } from '@/engine/repetition'

vi.hoisted(() => { vi.stubGlobal('document', { documentElement: { classList: { toggle() {} }, style: {} } }) })
vi.mock('sonner', () => ({ toast: vi.fn() }))
import { selectLatestGame, useAppStore } from './useAppStore'

const store = () => useAppStore.getState()

describe('starting a variant after a puzzle', () => {
  it('restarts the chosen variant rather than the previous puzzle', () => {
    const puzzle = fromPgn('1. e4 e5 2. Nf3')!.game
    store().loadPosition(puzzle, [puzzle])
    store().setPuzzleStart(puzzle)
    store().setPuzzle({ from: { x: 4, y: 6 }, to: { x: 4, y: 4 }, side: 'white', gain: 1, difficulty: 'easy', themes: [], movesBefore: 3 })
    store().setPuzzleVerdict(true)
    const variant = miniChess()
    store().playVariant(variant)
    expect(store().puzzleStart).toBeNull()
    expect(store().puzzle).toBeNull()
    expect(store().puzzleVerdict).toBeNull()
    store().resetGame()
    expect(store().game.variant).toEqual(variant)
    expect(store().game.board).toHaveLength(6)
    expect(store().game.moveHistory).toHaveLength(0)
  })
})

describe('imported games keep their history', () => {
  it('reads the live timeout result rather than the unfinished history snapshot', () => {
    const result = fromPgn('1. e4')!
    store().loadPosition(result.game, result.states)
    useAppStore.setState({
      clock: { minutes: 1, increment: 0 },
      clockState: { times: { white: 60000, black: 0 }, lastMoveAt: Date.now() - 1, running: true },
    })
    store().tickClock()
    expect(store().game.winner).toBe('white')
    expect(selectLatestGame(store())).toBe(store().game)
    useAppStore.setState({ clock: { minutes: 0, increment: 0 } })
  })

  it('lets the move list and the graph step through a PGN game', () => {
    const result = fromPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5')
    expect(result).toBeTruthy()
    store().loadPosition(result!.game, result!.states)

    // The opening plus every ply the sheet played.
    expect(store().undoStack).toHaveLength(6)
    expect(store().undoStack.at(-1)?.moveHistory).toHaveLength(5)
    expect(store().game.moveHistory).toHaveLength(5)
    expect(undoPly(result!.game.moveHistory)).toBe(4)
    expect(undoPly([])).toBe(0)

    store().jumpToPly(2)
    expect(store().game.moveHistory).toHaveLength(2)
    store().jumpToPly(0)
    expect(store().game.moveHistory).toHaveLength(0)
    expect(selectLatestGame(store()).moveHistory).toHaveLength(5)
    store().jumpToPly(5)
    expect(store().game.moveHistory).toHaveLength(5)
  })

  it('round-trips the move list through the URL encoding', () => {
    const result = fromPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6')
    expect(result).toBeTruthy()
    const replayed = fromPgn(decodeGame(encodeGame(result!.game)))
    expect(replayed?.game.moveHistory).toHaveLength(6)
  })

  it('records a forced pass in history and undoes it with the preceding real move', () => {
    const variant = bossFight()
    const placements: [string, string, number, number][] = [['King', 'white', 4, 1], ['Pawn', 'white', 0, 6], ['Boss', 'black', 4, 0]]
    variant.setup = placements.map(([name, team, x, y]) => ({
      typeId: variant.pieceTypes.find((p) => p.name === name)!.id, team, x, y,
    }))
    variant.board.tiles = variant.board.tiles.map((row, y) => row.map((tile, x) =>
      [[4, 0], [4, 1], [4, 2], [0, 6], [0, 5]].some(([tx, ty]) => tx === x && ty === y) ? tile : { terrain: 'wall' },
    ))
    const opening = createInitialState(variant)
    store().setBot({ mode: 'off' })
    store().loadPosition(opening, [opening])
    store().playMove(getLegalMoves(opening, 4, 1).find((m) => m.capturedId)!)
    const hit = store().game
    store().playMove(staggerPass(hit)!)
    const passed = store().game
    expect(passed.moveHistory.at(-1)?.move.pass).toBe(true)
    const roomUndo = replayMoves(variant, passed.moveHistory.slice(0, undoPly(passed.moveHistory)))
    expect(positionKey(roomUndo)).toBe(positionKey(opening))
    expect(roomUndo.moveHistory).toHaveLength(0)
    expect(staggerPass(roomUndo)).toBeUndefined()
    expect(store().undoStack).toHaveLength(3)
    store().jumpToPly(1)
    expect(store().game).toBe(hit)
    store().jumpToPly(2)
    expect(store().game).toBe(passed)
    store().playMove(getLegalMoves(passed, 4, 1).find((m) => m.finalTo.y === 2)!)
    store().undo()
    expect(store().game).toBe(passed)
    store().undo()
    expect(store().game).toBe(opening)
    expect(store().undoStack).toEqual([opening])
  })
})
