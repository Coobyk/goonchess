/**
 * Local game statistics.
 *
 * Everything stays in this browser: how many games were played per variant and
 * how they ended. Nothing is sent anywhere.
 */

export interface VariantStats {
  games: number
  wins: number
  losses: number
  draws: number
}

export type Stats = Record<string, VariantStats>

const KEY = 'goonchess:stats'

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Stats
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveStats(stats: Stats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats))
  } catch {
    /* storage unavailable: ignore */
  }
}

export function recordResult(
  stats: Stats,
  variantId: string,
  result: 'win' | 'loss' | 'draw',
): Stats {
  const current = stats[variantId] ?? { games: 0, wins: 0, losses: 0, draws: 0 }
  const next: VariantStats = {
    games: current.games + 1,
    wins: current.wins + (result === 'win' ? 1 : 0),
    losses: current.losses + (result === 'loss' ? 1 : 0),
    draws: current.draws + (result === 'draw' ? 1 : 0),
  }
  return { ...stats, [variantId]: next }
}

/**
 * Play streak: how many days in a row at least one game was finished.
 * Several games on one day count once; missing a day resets to zero.
 */
export interface PlayStreak {
  /** Local calendar day of the most recent playing day, as YYYY-MM-DD. */
  lastDay: string
  /** Consecutive playing days ending at lastDay. */
  days: number
  /** Longest streak ever reached. */
  best: number
}

const STREAK_KEY = 'goonchess:streak'

export const EMPTY_STREAK: PlayStreak = { lastDay: '', days: 0, best: 0 }

/** Local calendar day (not UTC) so "yesterday" matches what the player means. */
export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function loadStreak(): PlayStreak {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    if (!raw) return EMPTY_STREAK
    const parsed = JSON.parse(raw) as PlayStreak
    if (!parsed || typeof parsed !== 'object') return EMPTY_STREAK
    return {
      lastDay: typeof parsed.lastDay === 'string' ? parsed.lastDay : '',
      days: Number.isFinite(parsed.days) ? parsed.days : 0,
      best: Number.isFinite(parsed.best) ? parsed.best : 0,
    }
  } catch {
    return EMPTY_STREAK
  }
}

export function saveStreak(streak: PlayStreak) {
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(streak))
  } catch {
    /* storage unavailable: ignore */
  }
}

/** The day before the given YYYY-MM-DD day. */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - 1)
  return dayKey(date)
}

export function recordPlayDay(streak: PlayStreak, day: string): PlayStreak {
  if (streak.lastDay === day) return streak
  const continuing = streak.lastDay !== '' && previousDay(day) === streak.lastDay
  const days = continuing ? streak.days + 1 : 1
  return { lastDay: day, days, best: Math.max(streak.best, days) }
}

/**
 * The streak as it should be shown today: a streak whose last playing day is
 * further back than yesterday has already been broken.
 */
export function liveStreakDays(streak: PlayStreak, today: string): number {
  if (streak.days <= 0) return 0
  return streak.lastDay === today || streak.lastDay === previousDay(today)
    ? streak.days
    : 0
}
