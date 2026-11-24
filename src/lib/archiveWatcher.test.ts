import { describe, expect, it, vi } from 'vitest'
import { fromPgn } from './pgn'

vi.hoisted(() => { vi.stubGlobal('document', { documentElement: { classList: { toggle() {} }, style: {} } }) })
vi.mock('sonner', () => ({ toast: vi.fn() }))
vi.mock('./archiveClient', () => ({ loadSharing: () => true, submitGame: vi.fn() }))
import { submitGame } from './archiveClient'
import { useAppStore } from '@/store/useAppStore'
import { watchFinishedGames } from './archiveWatcher'
import { getLegalMoves } from '@/engine/rules'

describe('archiving a timeout', () => {
  it('submits a timeout detected by a late move before the scheduled tick', () => {
    const result = fromPgn('1. e4')!
    const store = () => useAppStore.getState()
    store().loadPosition(result.game, result.states)
    useAppStore.setState({
      puzzle: null,
      clock: { minutes: 1, increment: 0 },
      clockState: { times: { white: 60000, black: 0 }, lastMoveAt: Date.now() - 1, running: true },
    })
    vi.mocked(submitGame).mockClear()
    const stop = watchFinishedGames()
    try {
      store().playMove(getLegalMoves(result.game, 4, 1)[0])
      expect(store().game.winner).toBe('white')
      expect(submitGame).toHaveBeenCalledOnce()
      store().jumpToPly(0)
      store().jumpToPly(1)
      expect(store().game.winner).toBe('white')
      expect(submitGame).toHaveBeenCalledOnce()
    } finally { stop() }
  })

  it.each([false, true])('submits once even when reviewing moves (rewound before timeout: %s)', (rewound) => {
    const result = fromPgn('1. e4')!
    const store = () => useAppStore.getState()
    store().loadPosition(result.game, result.states)
    useAppStore.setState({
      puzzle: null,
      clock: { minutes: 1, increment: 0 },
      clockState: { times: { white: 60000, black: 0 }, lastMoveAt: Date.now() - 1, running: true },
    })
    vi.mocked(submitGame).mockClear()
    const stop = watchFinishedGames()
    try {
      if (rewound) store().jumpToPly(0)
      store().tickClock()
      expect(submitGame).toHaveBeenCalledOnce()
      expect(vi.mocked(submitGame).mock.calls[0][0].winner).toBe('white')
      store().jumpToPly(0)
      store().jumpToPly(1)
      expect(submitGame).toHaveBeenCalledOnce()
    } finally {
      stop()
    }
  })
})
