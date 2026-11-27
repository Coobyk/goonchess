import { allowCreate, issueChallenge, rateLimiter, verifyChallenge } from './captcha'
import { GameArchive, archiveStub, ARCHIVE_RECORD_URL } from './archive'
import { GameRoom } from './game-room'
import { CREATE_PATH, json } from './http'
import { CODE_PATTERN, randomCode, randomToken } from './ids'
import type { Variant } from '../src/engine/types'
import { createInitialState } from '../src/engine/rules'
import {
  archiveEntry,
  DECLARED_ENDINGS,
  GAME_SOURCES,
  MAX_ARCHIVED_PLIES,
  POSITION_HASH_PATTERN,
  replayRequests,
  VARIANT_KEY_PATTERN,
  type GameSource,
} from '../src/lib/archive'
import type { MoveRequest } from '../src/lib/replay'
import { normalizeVariant, validateVariant } from '../src/lib/variantValidation'

export { GameArchive, GameRoom }

/** A finished game a minute is more than anybody plays by hand. */
const allowArchive = rateLimiter(20)

/** A variant bigger than this is not a variant, it is an upload. */
const MAX_BODY = 192 * 1024

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // Static assets never reach this line: `run_worker_first` in wrangler.toml
    // only lets /api/* through, which is what keeps the site inside the free
    // request quota. The fallback is here for `wrangler dev` and for safety.
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request)

    if (path === '/api/challenge') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
      if (!env.CAPTCHA_SECRET) return json({ error: 'captcha_unconfigured' }, 503)
      return json(await issueChallenge(env.CAPTCHA_SECRET), 200, { 'cache-control': 'no-store' })
    }

    if (path === '/api/games') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
      return createGame(request, env)
    }

    if (path === '/api/archive') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
      return archiveGame(request, env)
    }

    if (path === '/api/stats/moves' || path === '/api/stats/summary') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
      return stats(url, env)
    }

    const room = path.match(/^\/api\/games\/([^/]+)(\/ws)?$/)
    if (room) {
      if (!CODE_PATTERN.test(room[1])) return json({ error: 'bad_code' }, 400)
      return env.GAME.get(env.GAME.idFromName(room[1])).fetch(request)
    }

    return json({ error: 'not_found' }, 404)
  },
} satisfies ExportedHandler<Env>

/**
 * Create a room. The only expensive endpoint, so it is the only one that asks
 * for proof of work first.
 */
async function createGame(request: Request, env: Env): Promise<Response> {
  const secret = env.CAPTCHA_SECRET
  if (!secret) return json({ error: 'captcha_unconfigured' }, 503)

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'

  const raw = await request.text()
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413)

  let body: {
    variant?: unknown
    clock?: unknown
    seat?: unknown
    captcha?: { challenge?: unknown; solution?: unknown }
  }
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'bad_json' }, 400)
  }

  const checked = validatePlayableVariant(body?.variant)
  if (!checked.variant) return badVariant(checked.errors)
  const variant = checked.variant

  const check = await verifyChallenge(secret, body?.captcha?.challenge, body?.captcha?.solution)
  if (!check.ok) return json({ error: check.reason }, 403)

  // The proof-of-work comes first: a request that cannot solve it must not
  // spend a slot of the address's quota.
  if (!allowCreate(ip)) return json({ error: 'rate_limited' }, 429)

  const code = randomCode()
  const token = randomToken()
  const stub = env.GAME.get(env.GAME.idFromName(code))
  const created = await stub.fetch(`https://room.internal${CREATE_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, token, variant, clock: body.clock, seat: body.seat }),
  })
  if (!created.ok) return json({ error: 'create_failed' }, 502)

  return json({ code, token, path: `/g/${code}` }, 201)
}

/**
 * Stores a finished game that was played in this browser. Nothing is taken on
 * trust: the game is played again from the start of its variant, every move
 * checked by the same rules the board uses, and only a game that really ended
 * is kept. Online games never come this way — their room stores them.
 */
async function archiveGame(request: Request, env: Env): Promise<Response> {
  const raw = await request.text()
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413)

  let body: { variant?: unknown; moves?: unknown; ending?: unknown; source?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'bad_json' }, 400)
  }

  const checked = validatePlayableVariant(body?.variant)
  if (!checked.variant) return badVariant(checked.errors)
  const variant = checked.variant
  const source = GAME_SOURCES.includes(body.source as GameSource) ? (body.source as GameSource) : null
  if (!source || source === 'online') return json({ error: 'bad_source' }, 400)
  const requests = parseRequests(body.moves)
  if (!requests) return json({ error: 'bad_moves' }, 400)

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
  if (!allowArchive(ip)) return json({ error: 'rate_limited' }, 429)

  const states = replayRequests(variant, requests)
  if (!states) return json({ error: 'illegal_move' }, 422)
  const final = states[states.length - 1]

  // The board knows when a game ended by the rules. A resignation or a fallen
  // flag only the player knows about, so it is taken as said — but only for a
  // game the moves left open.
  let ending: { winner: string | null; status: typeof final.status } = final
  if (!final.winner) {
    const declared = body.ending as { winner?: unknown; status?: unknown } | undefined
    const status = DECLARED_ENDINGS.find((kind) => kind === declared?.status)
    const winner = variant.teams.find((team) => team.id === declared?.winner)?.id
    if (!status || !winner) return json({ error: 'not_finished' }, 422)
    ending = { winner, status }
  }

  const entry = await archiveEntry(variant, states, final.moveHistory, ending, source)
  if (!entry) return json({ error: 'not_finished' }, 422)
  const stored = await archiveStub(env).fetch(ARCHIVE_RECORD_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry),
  })
  if (!stored.ok) return json({ error: 'store_failed' }, 502)
  return json({ ok: true }, 201)
}

function parseRequests(value: unknown): MoveRequest[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ARCHIVED_PLIES) return null
  const out: MoveRequest[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const raw = item as Record<string, unknown>
    const from = vec(raw.from)
    const to = vec(raw.to)
    const finalTo = vec(raw.finalTo)
    if (!from || !to || !finalTo) return null
    const drop = raw.drop as { typeId?: unknown } | undefined
    out.push({
      from,
      to,
      finalTo,
      drop: drop && typeof drop.typeId === 'string' ? { typeId: drop.typeId } : undefined,
      promotionTypeId: typeof raw.promotionTypeId === 'string' ? raw.promotionTypeId : undefined,
      roll: Number.isInteger(raw.roll) ? (raw.roll as number) : undefined,
    })
  }
  return out
}

function vec(value: unknown): { x: number; y: number } | null {
  if (!value || typeof value !== 'object') return null
  const { x, y } = value as { x?: unknown; y?: unknown }
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null
  return { x: x as number, y: y as number }
}

/** The move statistics, read from the archive. */
async function stats(url: URL, env: Env): Promise<Response> {
  const variant = url.searchParams.get('variant')
  const position = url.searchParams.get('position')
  const moves = url.pathname === '/api/stats/moves'
  if (variant !== null && !VARIANT_KEY_PATTERN.test(variant)) return json({ error: 'bad_variant' }, 400)
  if (moves && (!variant || !position || !POSITION_HASH_PATTERN.test(position))) {
    return json({ error: 'bad_position' }, 400)
  }

  const query = new URLSearchParams()
  if (variant) query.set('variant', variant)
  if (moves && position) query.set('position', position)
  const answer = await archiveStub(env).fetch(
    `https://archive.internal/${moves ? 'moves' : 'summary'}?${query}`,
  )
  if (!answer.ok) return json({ error: 'stats_failed' }, 502)
  return json(await answer.json(), 200, { 'cache-control': 'no-store' })
}

/**
 * Online play is two players for now, so the room only accepts a variant it
 * knows how to seat. Everything else stays a share link.
 */
function validatePlayableVariant(value: unknown): { variant: Variant | null; errors: string[] } {
  const normalized = normalizeVariant(value)
  if (!normalized) return { variant: null, errors: ['variant: expected a schema-1 variant object'] }
  const validation = validateVariant(normalized)
  if (!validation.ok) return { variant: null, errors: validation.errors }
  try {
    createInitialState(validation.value)
  } catch {
    return { variant: null, errors: ['The rules cannot start this variant.'] }
  }
  return { variant: validation.value, errors: [] }
}

function badVariant(errors: string[]): Response {
  return json({
    error: 'bad_variant',
    message: errors[0] ?? 'The variant is not playable.',
    details: errors.slice(0, 8),
  }, 400)
}

