import { allowCreate, issueChallenge, verifyChallenge } from './captcha'
import { GameRoom } from './game-room'
import { CODE_PATTERN, randomCode, randomToken } from './ids'
import type { Variant } from '../src/engine/types'

export { GameRoom }

/** A variant bigger than this is not a variant, it is an upload. */
const MAX_BODY = 192 * 1024
const MAX_NAME = 80

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
  if (!allowCreate(ip)) return json({ error: 'rate_limited' }, 429)

  const raw = await request.text()
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413)

  let body: { variant?: unknown; captcha?: { challenge?: unknown; solution?: unknown } }
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'bad_json' }, 400)
  }

  const variant = body?.variant
  if (!isPlayableVariant(variant)) {
    return json({ error: 'bad_variant', message: 'Two teams and a board between 3 and 16 squares fit in a shared game.' }, 400)
  }

  const check = await verifyChallenge(secret, body?.captcha?.challenge, body?.captcha?.solution)
  if (!check.ok) return json({ error: check.reason }, 403)

  const code = randomCode()
  const token = randomToken()
  const stub = env.GAME.get(env.GAME.idFromName(code))
  const created = await stub.fetch('https://room.internal/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, token, variant }),
  })
  if (!created.ok) return json({ error: 'create_failed' }, 502)

  return json({ code, token, path: `/g/${code}` }, 201)
}

/**
 * Online play is two players for now, so the room only accepts a variant it
 * knows how to seat. Everything else stays a share link.
 */
function isPlayableVariant(value: unknown): value is Variant {
  if (!value || typeof value !== 'object') return false
  const variant = value as Partial<Variant>
  if (typeof variant.name !== 'string' || variant.name.length > MAX_NAME) return false
  if (!Array.isArray(variant.teams) || variant.teams.length !== 2) return false
  if (!Array.isArray(variant.pieceTypes) || variant.pieceTypes.length === 0) return false
  const board = variant.board
  if (!board || typeof board !== 'object') return false
  const { width, height, tiles } = board
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false
  if (width < 3 || height < 3 || width > 16 || height > 16) return false
  if (!Array.isArray(tiles) || tiles.length !== height) return false
  return variant.teams.every(
    (team) => !!team && typeof team.id === 'string' && typeof team.name === 'string',
  )
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}
