import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerMessage, SocketHandlers } from '@/lib/online'
import { createInitialState } from '@/engine/rules'

vi.hoisted(() => { vi.stubGlobal('document', { documentElement: { classList: { toggle() {} }, style: {} } }) })

const socket = vi.hoisted(() => ({ send: vi.fn(() => true), close: vi.fn(), handlers: null as SocketHandlers | null }))
vi.mock('@/lib/online', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/online')>(),
  connect: (_code: string, handlers: SocketHandlers) => {
    socket.handlers = handlers
    return { send: socket.send, close: socket.close }
  },
}))
vi.mock('sonner', () => ({ toast: vi.fn() }))
import { useAppStore } from './useAppStore'

const store = () => useAppStore.getState()
const receive = (message: ServerMessage) => socket.handlers!.onMessage(message)

function finish(seat: number | null = 0) {
  const variant = store().variant
  const game = { ...createInitialState(variant), winner: variant.teams[1].id, status: 'resign' as const }
  store().joinOnline('abcdefghjk')
  receive({ t: 'hello', you: { seat, token: null }, variant, game, clock: { minutes: 5, increment: 3 }, clockState: null, seats: [true, true], started: true, name: variant.name, teams: variant.teams.map(t => t.id) })
  socket.send.mockClear()
  return game
}

beforeEach(() => { store().leaveOnline(); socket.send.mockClear() })

describe('Play again in online games', () => {
  it.each([0, 1])('seat %i offers a rematch without locally resetting the result', (seat) => {
    const game = finish(seat)
    store().resetGame()
    expect(socket.send).toHaveBeenCalledExactlyOnceWith({ t: 'offer', kind: 'rematch' })
    expect(store().game).toBe(game)
    expect(store().online?.status).toBe('over')
  })
  it('accepts an incoming rematch and waits for server state', () => {
    const game = finish(1)
    receive({ t: 'offer', kind: 'rematch', seat: 0 })
    store().resetGame()
    expect(socket.send).toHaveBeenCalledExactlyOnceWith({ t: 'offer-response', kind: 'rematch', accept: true })
    expect(store().game).toBe(game)
    const fresh = createInitialState(store().variant)
    receive({ t: 'state', game: fresh, clockState: { times: { white: 300000, black: 300000 }, lastMoveAt: null, running: false } })
    receive({ t: 'offer-accepted', kind: 'rematch' })
    expect(store().game.winner).toBeNull()
    expect(store().game.moveHistory).toHaveLength(0)
    expect(store().online?.status).toBe('playing')
    expect(store().online?.offer).toBeNull()
  })
  it('does not re-offer while its offer is pending; permits retry after decline', () => {
    const game = finish()
    receive({ t: 'offer', kind: 'rematch', seat: 0 })
    store().resetGame()
    expect(socket.send).not.toHaveBeenCalled()
    receive({ t: 'offer-declined', kind: 'rematch' })
    expect(store().game).toBe(game)
    store().resetGame()
    expect(socket.send).toHaveBeenCalledExactlyOnceWith({ t: 'offer', kind: 'rematch' })
  })
  it.each(['spectator', 'offline', 'ongoing'] as const)('does not rematch when %s', (mode) => {
    finish(mode === 'spectator' ? null : 0)
    if (mode === 'offline') socket.handlers!.onOpenChange!(false)
    if (mode === 'ongoing') receive({ t: 'state', game: createInitialState(store().variant) })
    store().resetGame()
    store().offerOnlineRematch()
    expect(socket.send).not.toHaveBeenCalled()
  })
  it('keeps local Play again working', () => {
    finish()
    store().leaveOnline()
    store().resetGame()
    expect(store().game.winner).toBeNull()
    expect(store().game.moveHistory).toHaveLength(0)
    expect(socket.send).not.toHaveBeenCalled()
  })
})
