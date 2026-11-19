/**
 * The game archive: every finished game is stored on the server, so the site
 * can say which moves people play most in a position and how those games
 * went.
 *
 * Only the moves and the result are kept — no name, no account, no address.
 * The same file is used on both sides: the Worker checks and stores a game
 * with it, and the browser asks for the numbers with the same keys.
 */
import { packVariant } from '@/lib/variantCodec'
import { positionKey } from '@/engine/repetition'
import { createInitialState, rollRandomPieces, applyMove } from '@/engine/rules'
import type { GameState, MoveRecord, Variant } from '@/engine/types'
import { resolveMove, type MoveRequest } from '@/lib/replay'

/** Only the opening is counted move by move; past it, positions rarely repeat. */
export const EXPLORER_DEPTH = 24
/** A game longer than this is not a game anybody played by hand. */
export const MAX_ARCHIVED_PLIES = 1000

export type GameSource = 'local' | 'bot' | 'online'
export const GAME_SOURCES: GameSource[] = ['local', 'bot', 'online']

/** Endings the board cannot work out from the moves alone. */
export const DECLARED_ENDINGS = ['resign', 'timeout'] as const
export type DeclaredEnding = (typeof DECLARED_ENDINGS)[number]

export const VARIANT_KEY_PATTERN = /^[0-9a-f]{32}$/
export const POSITION_HASH_PATTERN = /^[0-9a-f]{24}$/

/** What the Worker hands to the archive for one game. */
export interface ArchiveEntry {
  variantKey: string
  variantName: string
  source: GameSource
  /** The index of the winning team, or -1 for a draw. */
  winner: number
  status: GameState['status']
  /** Every move of the game, in algebraic notation. */
  moves: string[]
  /** The position before each move of the opening, hashed. */
  positions: string[]
}

/** One move as the explorer reports it. */
export interface ExplorerMove {
  move: string
  games: number
  /** Games won by the first team, the second team, and drawn. */
  wins: [number, number]
  draws: number
}

export interface VariantSummary {
  variantKey: string
  name: string
  games: number
  wins: [number, number]
  draws: number
  /** Mean length of a game, in plies. */
  averagePlies: number
  topMoves: { move: string; count: number }[]
  firstMoves: { move: string; count: number }[]
  endings: { status: string; count: number }[]
}

export interface ArchiveSummary {
  games: number
  variants: { variantKey: string; name: string; games: number }[]
}

async function sha256Hex(text: string, length: number): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  let hex = ''
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0')
  return hex.slice(0, length)
}

/**
 * The identity of a ruleset. Built from the packed form, which uses indices
 * instead of random ids, so the same variant opened from two links is still
 * the same variant. The seed of the random pieces is left out: Random Chess
 * deals a new one every game, and it is still one variant.
 */
export function variantKey(variant: Variant): Promise<string> {
  return sha256Hex(JSON.stringify(packVariant({ ...variant, randomSeed: undefined })), 32)
}

/** The identity of a position, short enough to index. */
export function positionHash(state: GameState): Promise<string> {
  // A rolled piece has a kind of its own that the variant does not list, and
  // the repetition key cannot tell those apart; the kind it rolled can.
  const rolled: string[] = []
  for (const row of state.board) {
    for (const id of row) {
      const typeId = id ? state.pieces[id]?.typeId : undefined
      if (typeId?.startsWith('r|')) rolled.push(state.pieceTypes[typeId]?.name ?? '?')
    }
  }
  const key = positionKey(state)
  return sha256Hex(rolled.length ? `${key}|${rolled.join(',')}` : key, 24)
}

/**
 * Plays a game again from the start of its variant, checking every move.
 * Returns every position the game passed through, or null when a move is not
 * legal where it was played or the game was already over.
 */
export function replayRequests(variant: Variant, requests: MoveRequest[]): GameState[] | null {
  const states = [createInitialState(variant)]
  for (const request of requests) {
    const game = states[states.length - 1]
    if (game.winner) return null
    const resolved = resolveMove(game, request)
    if ('error' in resolved) return null
    states.push(rollRandomPieces(applyMove(game, resolved.move, { san: true }), resolved.move.pieceId))
  }
  return states
}

/**
 * The archive's record of a finished game.
 *
 * `states` are the positions the game passed through, from the first to the
 * last; `history` the moves between them. A game that has not ended returns
 * null.
 */
export async function archiveEntry(
  variant: Variant,
  states: GameState[],
  history: MoveRecord[],
  ending: { winner: string | null; status: GameState['status'] },
  source: GameSource,
): Promise<ArchiveEntry | null> {
  if (!ending.winner || ending.status === 'active' || !history.length) return null
  const winner = ending.winner === 'draw' ? -1 : variant.teams.findIndex((team) => team.id === ending.winner)
  if (winner < -1 || (winner === -1 && ending.winner !== 'draw')) return null
  const opening = states.slice(0, Math.min(EXPLORER_DEPTH, history.length))
  return {
    variantKey: await variantKey(variant),
    variantName: variant.name,
    source,
    winner,
    status: ending.status,
    moves: history.map((record) => record.san ?? record.notation),
    positions: await Promise.all(opening.map(positionHash)),
  }
}
