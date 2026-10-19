import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import type { Variant } from '@/engine/types'
import { packVariant, unpackVariant } from './variantCodec'

/** Current link format. `#v=<...>` is the older, uncompressed JSON form. */
export const HASH_KEY = 'v2'
const LEGACY_HASH_KEY = 'v'

const BASE64_CHUNK = 0x2000

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(input: string): Uint8Array {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const binary = atob(b64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

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
