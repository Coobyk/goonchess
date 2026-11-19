/**
 * The browser's side of the game archive: sending a finished game, and asking
 * for the move statistics. See `archive.ts` for what is stored.
 */
import type { GameState, Variant } from '@/engine/types'
import { requestFor } from '@/lib/replay'
import {
  positionHash,
  variantKey,
  type ArchiveSummary,
  type ExplorerMove,
  type GameSource,
  type VariantSummary,
} from '@/lib/archive'

const SHARE_KEY = 'goonchess:share-games'

/** Whether finished games are sent to the archive. On unless turned off. */
export function loadSharing(): boolean {
  try {
    return localStorage.getItem(SHARE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveSharing(on: boolean) {
  try {
    localStorage.setItem(SHARE_KEY, on ? 'on' : 'off')
  } catch {
    /* storage unavailable: ignore */
  }
}

let storedGames = 0
const storedListeners = new Set<() => void>()

/** Counts the games this page has stored, so the numbers on screen can follow. */
export function subscribeStored(listener: () => void): () => void {
  storedListeners.add(listener)
  return () => storedListeners.delete(listener)
}

export const storedVersion = (): number => storedGames

/** Sends a finished game to the archive. Failures are silent: it is only a tally. */
export async function submitGame(game: GameState, source: GameSource): Promise<boolean> {
  if (!game.winner || !game.moveHistory.length) return false
  try {
    const response = await fetch('/api/archive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        variant: game.variant,
        moves: game.moveHistory.map(requestFor),
        ending: { winner: game.winner, status: game.status },
        source,
      }),
    })
    if (response.ok) {
      storedGames += 1
      for (const listener of storedListeners) listener()
    }
    return response.ok
  } catch {
    return false
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`stats_${response.status}`)
  return (await response.json()) as T
}

/** The moves played from this position, most played first. */
export async function fetchExplorer(
  state: GameState,
  signal?: AbortSignal,
): Promise<{ games: number; moves: ExplorerMove[] }> {
  const [variant, position] = await Promise.all([variantKey(state.variant), positionHash(state)])
  return getJson(`/api/stats/moves?variant=${variant}&position=${position}`, signal)
}

/** The numbers for one variant: results, length, most played moves. */
export async function fetchVariantSummary(variant: Variant, signal?: AbortSignal): Promise<VariantSummary> {
  return getJson(`/api/stats/summary?variant=${await variantKey(variant)}`, signal)
}

/** Every variant in the archive, most played first. */
export function fetchArchiveSummary(signal?: AbortSignal): Promise<ArchiveSummary> {
  return getJson('/api/stats/summary', signal)
}
