import { solve } from './pow'

/**
 * The client half of the hidden captcha: fetch a challenge, spend a fraction of
 * a second on it, hand the answer back with the request. No image grid, no
 * third-party script, nothing to click twice.
 */

export interface Proof {
  challenge: string
  solution: string
}

export class CaptchaError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'CaptchaError'
  }
}

export async function proveWork(): Promise<Proof> {
  const response = await fetch('/api/challenge', { cache: 'no-store' })
  if (!response.ok) {
    throw new CaptchaError(response.status === 503 ? 'captcha_unconfigured' : 'challenge_unavailable')
  }
  const { challenge, salt, bits } = (await response.json()) as {
    challenge: string
    salt: string
    bits: number
  }
  const solution = solve(salt, bits)
  if (solution === null) throw new CaptchaError('too_slow')
  return { challenge, solution }
}

/** Turns the error codes the API uses into something a person can read. */
export function captchaMessage(code: string): string {
  switch (code) {
    case 'captcha_unconfigured':
      return 'Online games are not set up on this deployment yet.'
    case 'rate_limited':
      return 'That is a lot of links in a short time. Try again in a few minutes.'
    case 'insufficient_work':
    case 'expired':
      return 'The check took too long. Try again.'
    case 'bad_variant':
      return 'This variant cannot be played online — online games need exactly two teams.'
    default:
      return 'Could not create a link. Try again.'
  }
}
