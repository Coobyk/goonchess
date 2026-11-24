import { expect, it, vi } from 'vitest'
import { createInitialState } from '@/engine/rules'
import { atomic, classicChess } from '@/engine/templates'

vi.hoisted(() => {
  vi.stubGlobal('document', { documentElement: { classList: { toggle() {} }, style: {} } })
})
vi.mock('sonner', () => ({ toast: vi.fn() }))
import { useAppStore } from './useAppStore'

it('leaves the puzzle behind when selecting another variant, including on restart', () => {
  const puzzleStart = createInitialState(classicChess())
  useAppStore.getState().setPuzzle({
    from: { x: 4, y: 6 }, to: { x: 4, y: 4 }, side: 'white',
    gain: 1, difficulty: 'easy', themes: [], movesBefore: 0,
  })
  useAppStore.getState().setPuzzleStart(puzzleStart)
  useAppStore.getState().setPuzzleVerdict(true)
  expect(useAppStore.getState().puzzle).not.toBeNull()

  const selected = atomic()
  useAppStore.getState().playVariant(selected)
  const state = useAppStore.getState()
  expect(state.puzzleStart).toBeNull()
  expect(state.puzzle).toBeNull()
  expect(state.puzzleVerdict).toBeNull()
  expect(state.game.variant.id).toBe(selected.id)

  state.resetGame()
  expect(useAppStore.getState().game.variant.id).toBe(selected.id)
  expect(useAppStore.getState().game).not.toBe(puzzleStart)
})
