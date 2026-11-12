import type { GameState, Variant } from '../types'
import { enPassantRight } from '../repetition'

/** Whether an en passant capture could be on — positions where the rules
 * look at the last move are left out of the table rather than mixed up. */
export const enPassantSensitive = (state: GameState): boolean => enPassantRight(state) !== null

/**
 * The fingerprint of a position.
 *
 * The search comes across the same position again and again: through a
 * different order of moves, through the deeper rounds of the deepening
 * search. A fingerprint lets the search recognise a position it has already
 * looked at and remember what it learned there.
 *
 * Two numbers are mixed in. The first says where the position sits in the
 * table, the second says whether the position found in that slot really is
 * this one. One number would do most of the time — but a wrong entry means a
 * wrong score, so both are used.
 */

export interface Fingerprint {
  /** Where the position sits in the table. */
  slot: number
  /** Whether the position in that slot is really this one. */
  check: number
}

/** The table size. A power of two, so the slot is a mask away. */
const TABLE_BITS = 17
export const TABLE_SIZE = 1 << TABLE_BITS

interface Indices {
  types: Map<string, number>
  teams: Map<string, number>
  /** Ties the fingerprint to this variant, so two variants never mix. */
  seed: number
}

const indexCache = new WeakMap<Variant, Indices>()

/** Mixes a value into a hash. */
function mix(hash: number, value: number): number {
  let h = hash ^ (value | 0)
  h = Math.imul(h, 0x01000193)
  return h ^ (h >>> 15)
}

/** The hash of a name. */
function hashName(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 0x01000193)
  }
  return h ^ (h >>> 15)
}

function indicesFor(variant: Variant): Indices {
  const cached = indexCache.get(variant)
  if (cached) return cached
  const types = new Map<string, number>()
  variant.pieceTypes.forEach((piece, i) => types.set(piece.id, i))
  const teams = new Map<string, number>()
  variant.teams.forEach((team, i) => teams.set(team.id, i))
  // The seed ties the fingerprint to this variant: two variants never share a
  // position, even when they are made of the same pieces. Everything about
  // the variant is mixed in, so a difference in the rules means a difference
  // in the fingerprint.
  let seed = 0x811c9dc5
  const text = JSON.stringify(variant)
  for (let i = 0; i < text.length; i++) {
    seed = Math.imul(seed ^ text.charCodeAt(i), 0x01000193)
  }
  seed = seed ^ (seed >>> 15)
  const indices = { types, teams, seed }
  indexCache.set(variant, indices)
  return indices
}

/**
 * Works out the fingerprint of a position.
 *
 * Everything that can change what a search finds is mixed in: what stands
 * where, which pieces have already moved, whose turn it is, the die that was
 * rolled and the score so far.
 */
export function hashPosition(state: GameState, out: Fingerprint): void {
  const { variant } = state
  const indices = indicesFor(variant)
  let h1 = indices.seed
  let h2 = ~indices.seed

  const board = state.board
  for (let y = 0; y < board.length; y++) {
    const row = board[y]
    for (let x = 0; x < row.length; x++) {
      const id = row[x]
      if (!id) {
        h1 = mix(h1, 0)
        h2 = mix(h2, 0)
        continue
      }
      const inst = state.pieces[id]
      const type = (indices.types.get(inst.typeId) ?? 0) * 8 + 1
      const team = indices.teams.get(inst.team) ?? 0
      h1 = mix(h1, type + team * 64)
      h2 = mix(h2, type * 4 + team)
      // A piece that has already moved is a different piece, as far as the
      // rules are concerned: it cannot castle, and it cannot take its first
      // step twice.
      if (inst.hasMoved) {
        h1 = mix(h1, 0x5bf03635)
        h2 = mix(h2, 0x27d4eb2f)
      }
    }
  }

  // Whose turn it is.
  const turn = indices.teams.get(state.turn) ?? 0
  h1 = mix(h1, turn + 0x100)
  h2 = mix(h2, turn)

  // The die a piece rolled to pick its move.
  const roll = state.roll
  if (roll) {
    h1 = mix(h1, roll.value * 16 + (hashName(roll.pieceId) & 0xffff))
    h2 = mix(h2, roll.value)
  }

  // The score so far. It decides who wins in a game of points.
  for (const team of variant.teams) {
    h1 = mix(h1, (state.scores[team.id] ?? 0) | 0)
    h2 = mix(h2, (state.scores[team.id] ?? 0) | 0)
  }

  // The checks each side has given. Only a game of Three-Check keeps them,
  // but there two positions with the same pieces are not the same position.
  if (state.checks) {
    for (const team of variant.teams) {
      const given = state.checks[team.id] ?? 0
      h1 = mix(h1, given * 7 + 0x51ed)
      h2 = mix(h2, given)
    }
  }

  // What each pocket holds. In Crazyhouse a drop can come out of it, so two
  // positions with the same pieces are different games again.
  if (state.hands) {
    for (const team of variant.teams) {
      const hand = state.hands[team.id]
      if (!hand) continue
      for (const piece of variant.pieceTypes) {
        const count = hand[piece.id] ?? 0
        if (!count) continue
        const type = (indices.types.get(piece.id) ?? 0) * 8 + 1
        h1 = mix(h1, type * 16 + count)
        h2 = mix(h2, count * 131 + type)
      }
    }
  }

  // The last move, which may have left a capture en passant open.
  const last = state.moveHistory[state.moveHistory.length - 1]
  if (last) {
    const dx = last.move.finalTo.x - last.move.from.x
    const dy = last.move.finalTo.y - last.move.from.y
    if (Math.abs(dx) + Math.abs(dy) === 2) {
      // The square the piece stepped over, and the way it came: together they
      // say whether a capture en passant is open.
      h1 = mix(h1, last.move.from.x * 256 + last.move.from.y + 0x2000)
      h2 = mix(h2, last.move.to.x * 64 + last.move.to.y)
    }
  }

  out.slot = (h1 >>> 0) & (TABLE_SIZE - 1)
  out.check = h2 | 0
}
