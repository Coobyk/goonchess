/**
 * A captcha that nobody sees.
 *
 * Creating a game is the only thing worth abusing here: every link allocates a
 * Durable Object and a slice of storage. Before the browser may create one it
 * has to find a number whose hash starts with a run of zero bits, which costs a
 * person about a tenth of a second and costs a script that wants ten thousand
 * links rather more.
 *
 * The challenge is signed with an HMAC instead of being stored, so checking it
 * costs no reads and no writes — the whole point of a speed bump is that it
 * must not itself be the thing that gets abused.
 */

const encoder = new TextEncoder()

/** How much work a client must do. 16 bits is ~65k hashes, about 100 ms. */
const BITS = 16
/** A solved challenge is useless after this. */
const TTL_MS = 3 * 60_000
const VERSION = 'v1'

export interface Challenge {
  /** The signed challenge to send back with the game. */
  challenge: string
  /** The random part the client searches against. */
  salt: string
  bits: number
  expiresAt: number
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): Uint8Array {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return toBase64Url(new Uint8Array(mac))
}

/** Compares without leaking where the first difference is. */
function sameMac(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function issueChallenge(secret: string): Promise<Challenge> {
  const salt = toBase64Url(crypto.getRandomValues(new Uint8Array(12)))
  const expiresAt = Date.now() + TTL_MS
  const payload = `${VERSION}.${salt}.${expiresAt}.${BITS}`
  const mac = await sign(secret, payload)
  return { challenge: `${payload}.${mac}`, salt, bits: BITS, expiresAt }
}

export function countLeadingZeroBits(bytes: Uint8Array): number {
  let count = 0
  for (const byte of bytes) {
    if (byte === 0) {
      count += 8
      continue
    }
    return count + Math.clz32(byte) - 24
  }
  return count
}

export async function digest(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)))
}

/**
 * True when `solution` is the nonce that finishes a challenge this worker
 * signed, before it expired, with enough of a hash.
 */
export async function verifyChallenge(
  secret: string,
  challenge: unknown,
  solution: unknown,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof challenge !== 'string' || typeof solution !== 'string') {
    return { ok: false, reason: 'missing_challenge' }
  }
  if (solution.length > 24) return { ok: false, reason: 'bad_solution' }

  const parts = challenge.split('.')
  if (parts.length !== 5 || parts[0] !== VERSION) return { ok: false, reason: 'bad_challenge' }
  const [, salt, expiresAt, bits, mac] = parts
  if (!/^\d{1,15}$/.test(expiresAt) || !/^\d{1,2}$/.test(bits)) {
    return { ok: false, reason: 'bad_challenge' }
  }

  const payload = `${VERSION}.${salt}.${expiresAt}.${bits}`
  if (!sameMac(mac, await sign(secret, payload))) return { ok: false, reason: 'bad_signature' }
  if (Number(expiresAt) < Date.now()) return { ok: false, reason: 'expired' }

  const wanted = Number(bits)
  if (wanted < 1 || wanted > 24) return { ok: false, reason: 'bad_challenge' }
  const hash = await digest(`${salt}.${solution}`)
  if (countLeadingZeroBits(hash) < wanted) return { ok: false, reason: 'insufficient_work' }
  return { ok: true }
}

/**
 * A rough per-IP ceiling, kept in the isolate's memory. Cloudflare runs more
 * than one isolate, so this is a speed bump rather than a promise; the proof of
 * work is what does the real work.
 */
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 6
const seen = new Map<string, { count: number; resetAt: number }>()

export function allowCreate(ip: string): boolean {
  const now = Date.now()
  const entry = seen.get(ip)
  if (!entry || entry.resetAt <= now) {
    if (seen.size > 5000) seen.clear()
    seen.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_PER_WINDOW) return false
  entry.count += 1
  return true
}

export { fromBase64Url }
