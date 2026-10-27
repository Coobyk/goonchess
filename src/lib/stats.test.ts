import { describe, expect, it } from 'vitest'
import {
  dayKey,
  EMPTY_STREAK,
  liveStreakDays,
  previousDay,
  recordPlayDay,
} from './stats'

describe('dayKey', () => {
  it('formats in local time, zero-padded', () => {
    expect(dayKey(new Date(2026, 9, 27))).toBe('2026-10-27')
    expect(dayKey(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('previousDay', () => {
  it('steps back one day across month and year edges', () => {
    expect(previousDay('2026-10-27')).toBe('2026-10-26')
    expect(previousDay('2026-11-01')).toBe('2026-10-31')
    expect(previousDay('2026-01-01')).toBe('2025-12-31')
  })
})

describe('recordPlayDay', () => {
  it('starts a streak on the first day', () => {
    expect(recordPlayDay(EMPTY_STREAK, '2026-10-27')).toEqual({
      lastDay: '2026-10-27',
      days: 1,
      best: 1,
    })
  })

  it('counts a second game on the same day once', () => {
    const once = recordPlayDay(EMPTY_STREAK, '2026-10-27')
    expect(recordPlayDay(once, '2026-10-27')).toBe(once)
  })

  it('extends across consecutive days', () => {
    const two = recordPlayDay(recordPlayDay(EMPTY_STREAK, '2026-10-26'), '2026-10-27')
    expect(two.days).toBe(2)
    expect(two.best).toBe(2)
  })

  it('resets after a skipped day', () => {
    const streak = recordPlayDay(recordPlayDay(EMPTY_STREAK, '2026-10-24'), '2026-10-27')
    expect(streak.days).toBe(1)
    expect(streak.best).toBe(1)
  })

  it('keeps the best streak across resets', () => {
    let streak = EMPTY_STREAK
    streak = recordPlayDay(streak, '2026-10-01')
    streak = recordPlayDay(streak, '2026-10-02')
    streak = recordPlayDay(streak, '2026-10-03')
    streak = recordPlayDay(streak, '2026-10-06')
    expect(streak.days).toBe(1)
    expect(streak.best).toBe(3)
  })
})

describe('liveStreakDays', () => {
  const twoDays: { lastDay: string; days: number; best: number } = {
    lastDay: '2026-10-26',
    days: 2,
    best: 2,
  }

  it('still counts a streak ended yesterday', () => {
    expect(liveStreakDays(twoDays, '2026-10-27')).toBe(2)
  })

  it('counts a streak played today', () => {
    expect(liveStreakDays({ ...twoDays, lastDay: '2026-10-27' }, '2026-10-27')).toBe(2)
  })

  it('reads zero once the last day is two days back', () => {
    expect(liveStreakDays(twoDays, '2026-10-28')).toBe(0)
  })

  it('reads zero for an empty streak', () => {
    expect(liveStreakDays(EMPTY_STREAK, '2026-10-27')).toBe(0)
  })
})
