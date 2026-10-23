/** Codes, tokens and hashes. */

/** Base32 without the letters that look like digits, so a code can be read out loud. */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const CODE_LENGTH = 10

export const CODE_PATTERN = /^[0-9abcdefghjkmnpqrstvwxyz]{10}$/

/** ~50 bits of room code: long enough that nobody fishes for a live game. */
export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  let code = ''
  for (const byte of bytes) code += ALPHABET[byte & 31]
  return code
}

/** The secret that a seat is. Never leaves the browser that holds it. */
export function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(24)))
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Only the hash is stored, so a dump of the room is not a set of seats. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  let hex = ''
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0')
  return hex
}
