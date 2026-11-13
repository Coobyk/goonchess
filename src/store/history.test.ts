import { describe, expect, it, vi } from 'vitest'
import { fromPgn } from '@/lib/pgn'

vi.hoisted(() => { vi.stubGlobal('document', { documentElement: { classList: { toggle() {} }, style: {} } }) })
vi.mock('sonner', () => ({ toast: vi.fn() }))
import { useAppStore } from './useAppStore'

const store = () => useAppStore.getState()

describe('imported games keep their history', () => {
  it('lets the move list and the graph step through a PGN game', () => {
    const result = fromPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5')
    expect(result).toBeTruthy()
    store().loadPosition(result!.game, result!.states)

    // The opening plus every ply the sheet played.
    expect(store().undoStack).toHaveLength(6)
    expect(store().undoStack.at(-1)?.moveHistory).toHaveLength(5)
    expect(store().game.moveHistory).toHaveLength(5)

    store().jumpToPly(2)
    expect(store().game.moveHistory).toHaveLength(2)
    store().jumpToPly(0)
    expect(store().game.moveHistory).toHaveLength(0)
    store().jumpToPly(5)
    expect(store().game.moveHistory).toHaveLength(5)
  })
})
