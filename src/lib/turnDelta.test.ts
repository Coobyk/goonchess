import { describe, expect, it } from 'vitest'
import { turnDelta } from '@/lib/moveAnimation'

describe('turnDelta', () => {
  it('turns the short way across the upright direction', () => {
    expect(turnDelta(7, 0)).toBe(1)
    expect(turnDelta(0, 7)).toBe(-1)
  })

  it('turns one step either way without wrapping', () => {
    expect(turnDelta(6, 7)).toBe(1)
    expect(turnDelta(7, 6)).toBe(-1)
    expect(turnDelta(0, 1)).toBe(1)
    expect(turnDelta(1, 0)).toBe(-1)
  })
})
