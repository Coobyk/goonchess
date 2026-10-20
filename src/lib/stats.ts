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
