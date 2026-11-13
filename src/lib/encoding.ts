import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import type { GameState, Variant } from '@/engine/types'
import { fromBase64Url, toBase64Url } from './base64'
import { packVariant, unpackVariant } from './variantCodec'

/** Current link format. `#v=<...>` is the older, uncompressed JSON form. */
export const HASH_KEY = 'v2'
const LEGACY_HASH_KEY = 'v'
/** The move list of a shared game, deflated the same way the variant is. */
export const GAME_HASH_KEY = 'g'

/**
 * Compact + deflated + URL-safe code for a whole variant. A classic chess
 * variant is ~580 characters this way instead of ~7,900 as plain JSON+base64.
 */
export function encodeVariant(variant: Variant): string {
  const packed = JSON.stringify(packVariant(variant))
  return toBase64Url(deflateSync(strToU8(packed), { level: 9 }))
}

export function decodeVariant(input: string): Variant {
  return unpackVariant(JSON.parse(strFromU8(inflateSync(fromBase64Url(input)))))
}

/** Old links from before the compact format. */
function decodeLegacyVariant(input: string): unknown {
  return JSON.parse(strFromU8(fromBase64Url(input)))
}

export function variantToHash(variant: Variant): string {
  return `#${HASH_KEY}=${encodeVariant(variant)}`
}

export function variantFromHash(): unknown | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash
  try {
    const packed = hash.match(new RegExp(`[#&]${HASH_KEY}=([^&]+)`))
    if (packed) return decodeVariant(packed[1])
    const legacy = hash.match(new RegExp(`[#&]${LEGACY_HASH_KEY}=([^&]+)`))
    if (legacy) return decodeLegacyVariant(legacy[1])
  } catch {
    return null
  }
  return null
}

/**
 * The move list of a game, the way a score sheet reads: SAN tokens separated
 * by spaces, deflated to the same URL-safe form the variant uses.
 */
export function encodeGame(game: GameState): string {
  const moves = game.moveHistory.map((record) => record.san ?? record.notation).join(' ')
  return toBase64Url(deflateSync(strToU8(moves), { level: 9 }))
}

export function decodeGame(input: string): string {
  return strFromU8(inflateSync(fromBase64Url(input)))
}

/**
 * The hash of a link that carries a whole game: the variant it was played on
 * and the moves it took, so a reload can play it again.
 */
export function gameToHash(game: GameState): string {
  return `${variantToHash(game.variant)}&${GAME_HASH_KEY}=${encodeGame(game)}`
}

export function gameFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.hash.match(new RegExp(`[#&]${GAME_HASH_KEY}=([^&]+)`))
  if (!match) return null
  try {
    return decodeGame(match[1])
  } catch {
    return null
  }
}

/** Drops everything the hash carried — the variant and the game alike. */
export function clearHash(): void {
  if (typeof window === 'undefined' || !window.location.hash) return
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  } catch {
    /* ignore */
  }
}
