import { describe, expect, it } from 'vitest'
import { shortestRotation, turnDelta } from '@/lib/moveAnimation'

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

describe('shortestRotation', () => {
  it('combines a seat flip and a turn into the shorter arc', () => {
    expect(shortestRotation(0, 225)).toBe(-135)
    expect(shortestRotation(0, 135)).toBe(135)
    expect(shortestRotation(0, 180)).toBe(180)
  })

  it('wraps cumulative angles instead of spinning all the way back', () => {
    expect(shortestRotation(180, 0)).toBe(180)
    expect(shortestRotation(350, 10)).toBe(20)
    expect(shortestRotation(720, 720)).toBe(0)
  })
})
