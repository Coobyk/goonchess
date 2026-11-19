import { describe, expect, it } from 'vitest'
import { applyMove, createInitialState, getLegalMoves } from '@/engine/rules'
import { classicChess, miniChess } from '@/engine/templates'
import { archiveEntry, positionHash, replayRequests, variantKey } from './archive'
import { requestFor } from './replay'

function play(game: ReturnType<typeof createInitialState>, from: [number, number], to: [number, number]) {
  const move = getLegalMoves(game, from[0], from[1]).find((m) => m.to.x === to[0] && m.to.y === to[1])
  expect(move).toBeTruthy()
  return applyMove(game, move!, { san: true })
}

function foolsMate() {
  let game = createInitialState(classicChess())
  game = play(game, [5, 6], [5, 5])
  game = play(game, [4, 1], [4, 3])
  game = play(game, [6, 6], [6, 4])
  game = play(game, [3, 0], [7, 4])
  return game
}

describe('game archive', () => {
  it('replays a finished game move by move', () => {
    const game = foolsMate()
    const states = replayRequests(game.variant, game.moveHistory.map(requestFor))
    expect(states).toHaveLength(5)
    expect(states![4].winner).toBe(game.winner)
    expect(states![4].status).toBe('checkmate')
  })

  it('refuses a game with a move the rules do not allow', () => {
    const game = foolsMate()
    const requests = game.moveHistory.map(requestFor)
    requests[1] = { ...requests[1], to: { x: 4, y: 5 }, finalTo: { x: 4, y: 5 } }
    expect(replayRequests(game.variant, requests)).toBeNull()
  })

  it('refuses moves after the game ended', () => {
    const game = foolsMate()
    const requests = game.moveHistory.map(requestFor)
    expect(replayRequests(game.variant, [...requests, requests[0]])).toBeNull()
  })

  it('stores the moves, the winner and the opening positions', async () => {
    const game = foolsMate()
    const states = replayRequests(game.variant, game.moveHistory.map(requestFor))!
    const entry = await archiveEntry(game.variant, states, states[4].moveHistory, states[4], 'local')
    expect(entry).toMatchObject({ moves: ['f3', 'e5', 'g4', 'Qh4#'], winner: 1, status: 'checkmate' })
    expect(entry!.positions).toHaveLength(4)
    expect(entry!.positions[0]).toBe(await positionHash(createInitialState(classicChess())))
    expect(new Set(entry!.positions).size).toBe(4)
  })

  it('stores nothing for a game still being played', async () => {
    const game = play(createInitialState(classicChess()), [4, 6], [4, 4])
    expect(await archiveEntry(game.variant, [game], game.moveHistory, game, 'local')).toBeNull()
  })

  it('keys a variant by its rules, not its random seed', async () => {
    const variant = classicChess()
    const key = await variantKey(variant)
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(await variantKey({ ...variant, randomSeed: 42 })).toBe(key)
    expect(await variantKey(miniChess())).not.toBe(key)
  })
})
