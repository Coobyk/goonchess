import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from '@/engine/rules'
import { bossFight } from '@/engine/templates'
import { renderBoardImage } from './image'

afterEach(() => vi.unstubAllGlobals())

describe('Boss Fight position images', () => {
  it('draws the boss fallback alongside the white army and handles empty or unavailable artwork', async () => {
    const drawImage = vi.fn()
    const ctx = new Proxy({}, { get: (_, key) => key === 'drawImage' ? drawImage : vi.fn() })
    vi.stubGlobal('Image', class {
      src = ''
      width = 45
      height = 45
      async decode() {
        if (this.src.includes('missing')) throw new Error('Image unavailable')
      }
    })
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
    vi.stubGlobal('document', { createElement: () => ({
      getContext: () => ctx,
      toBlob: (callback: BlobCallback) => callback(new Blob([], { type: 'image/png' })),
    }) })
    const game = createInitialState(bossFight())
    expect(await renderBoardImage(game)).toBeInstanceOf(Blob)
    expect(drawImage).toHaveBeenCalledTimes(17)
    expect(drawImage.mock.calls.some(([image]) => image.src === '/pieces/boss/boss.svg')).toBe(true)
    drawImage.mockClear()
    const empty = createInitialState({ ...game.variant, setup: [] })
    expect(await renderBoardImage(empty)).toBeInstanceOf(Blob)
    expect(drawImage).not.toHaveBeenCalled()
    const boss = game.pieceTypes[game.pieces[game.board[0][4]!].typeId]
    boss.images = ['/missing.svg', '/missing.svg']
    expect(await renderBoardImage(game)).toBeInstanceOf(Blob)
    expect(drawImage).toHaveBeenCalledTimes(16)
  })
})
