import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getLegalMoves } from '@/engine/rules'
import { classicChess } from '@/engine/templates'

vi.hoisted(() => {
  vi.stubGlobal('document', { documentElement: { classList: { toggle() {} }, style: {} } })
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    clear: () => storage.clear(),
    removeItem: (key: string) => storage.delete(key),
  })
})
vi.mock('sonner', () => ({ toast: vi.fn() }))
import { useAppStore } from '@/store/useAppStore'
import { loadStats } from './stats'
import { watchPersonalResults } from './personalStatsWatcher'
import type { OnlineGame } from '@/store/useAppStore'

let stop: () => void
beforeEach(() => {
  localStorage.clear()
  useAppStore.setState({ online: null, puzzle: null, puzzleStart: null, boardAnimating: false })
  useAppStore.getState().setBot({ mode: 'off' })
  useAppStore.getState().playVariant(classicChess())
  stop = watchPersonalResults()
})
afterEach(() => stop())

function foolsMate() {
  for (const [x, y, tx, ty] of [[5, 6, 5, 5], [4, 1, 4, 3], [6, 6, 6, 4], [3, 0, 7, 4]]) {
    const move = getLegalMoves(useAppStore.getState().game, x, y)
      .find((m) => m.finalTo.x === tx && m.finalTo.y === ty)
    expect(move).toBeDefined()
    useAppStore.getState().playMove(move!)
  }
  expect(useAppStore.getState().game.winner).toBe('black')
}

it('counts two separate games with the same winner and move count', () => {
  foolsMate()
  expect(loadStats().classic.games).toBe(1)
  useAppStore.getState().resetGame()
  foolsMate()
  expect(loadStats().classic.games).toBe(2)
})

it('does not count an imported finished replay or its initial display', () => {
  stop()
  foolsMate()
  const finished = structuredClone(useAppStore.getState().game)
  const history = structuredClone(useAppStore.getState().undoStack)
  stop = watchPersonalResults()
  expect(loadStats()).toEqual({})
  useAppStore.getState().resetGame()
  useAppStore.getState().loadPosition(finished, history)
  expect(loadStats()).toEqual({})
})

it('does not count a result twice while reviewing history or changing views', () => {
  foolsMate()
  useAppStore.getState().setView('maker')
  useAppStore.getState().setView('play')
  useAppStore.getState().jumpToPly(3)
  useAppStore.getState().jumpToPly(4)
  expect(loadStats().classic.games).toBe(1)
})

it('does not count bot-vs-bot games', () => {
  useAppStore.getState().setBot({ mode: 'all' })
  foolsMate()
  expect(loadStats()).toEqual({})
})

const room: OnlineGame = {
  code: 'test-room', seat: 0, status: 'playing', connected: true,
  presence: [true, true], watchers: 0, error: null, chat: [], offer: null,
}

it('waits for the room to correct a provisional win to a timeout loss', () => {
  useAppStore.setState({ online: room })
  const opening = useAppStore.getState().game
  useAppStore.setState({ game: { ...opening, winner: 'white' } })
  expect(loadStats()).toEqual({})
  useAppStore.setState({ game: { ...opening, winner: 'black' }, online: { ...room, status: 'over' } })
  expect(loadStats().classic).toMatchObject({ games: 1, wins: 0, losses: 1 })
})

it('counts an acknowledged identical result even after a puzzle', () => {
  useAppStore.setState({ online: room, puzzle: {
    from: { x: 0, y: 0 }, to: { x: 0, y: 1 }, side: 'white', gain: 1,
    difficulty: 'easy', themes: [], movesBefore: 0,
  } })
  useAppStore.setState({ game: { ...useAppStore.getState().game, winner: 'white' } })
  useAppStore.setState({ online: { ...room, status: 'over' } })
  expect(loadStats().classic).toMatchObject({ games: 1, wins: 1 })
})

it('counts separate zero-move online resignations despite a shared opening history', () => {
  useAppStore.setState({ online: room })
  const opening = useAppStore.getState().game
  for (let i = 0; i < 2; i++) {
    useAppStore.setState({ game: { ...opening, winner: 'black' }, online: { ...room, status: 'over' } })
    useAppStore.setState({ game: opening, online: room })
  }
  expect(loadStats().classic.games).toBe(2)
})
