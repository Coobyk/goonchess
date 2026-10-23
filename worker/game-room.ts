/**
 * One game, one Durable Object.
 *
 * It owns the board: the variant, the seats, and the position after every
 * move. Browsers send intent — "this piece to that square" — never a position,
 * so a modified client cannot move a piece it does not own, play out of turn,
 * or quietly change the variant halfway through. The rules it validates with
 * are the same `src/engine/rules.ts` the board uses, because that file has no
 * DOM in it.
 *
 * Everything is stored in two keys, one row each, because the number of rows
 * written is the tightest part of the free plan.
 */
import { applyMove, createInitialState, getLegalMoves, rollRandomPieces } from '../src/engine/rules'
import type { GameState, Variant, Vec } from '../src/engine/types'
import { hashToken, randomToken } from './ids'

/** A room nobody ever joined is not worth keeping. */
const EMPTY_ROOM_TTL = 24 * 60 * 60 * 1000
/** A game that was played survives a week, which covers a slow correspondence one. */
const PLAYED_ROOM_TTL = 7 * 24 * 60 * 60 * 1000
const MAX_MESSAGE = 8 * 1024

interface Meta {
  code: string
  variant: Variant
  createdAt: number
  /** sha256 of each seat's secret. Null means the seat is free. */
  seats: (string | null)[]
  startedAt: number | null
}

interface Attachment {
  /** 0 or 1 for the two players, null for anyone watching. */
  seat: number | null
}

type Message =
  | { t: 'move'; from: Vec; to: Vec; finalTo: Vec; roll?: number; promotionTypeId?: string; origin?: Vec }
  | { t: 'resign' }

export class GameRoom {
  private ctx: DurableObjectState
  private meta: Meta | null = null
  private game: GameState | null = null

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx
  }

  private async load(): Promise<{ meta: Meta; game: GameState | null } | null> {
    if (!this.meta) {
      this.meta = (await this.ctx.storage.get<Meta>('meta')) ?? null
      this.game = (await this.ctx.storage.get<GameState>('game')) ?? null
    }
    if (!this.meta) return null
    return { meta: this.meta, game: this.game }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/create')) {
      if (request.method !== 'POST') return json({ error: 'method' }, 405)
      const body = (await request.json()) as { code: string; token: string; variant: Variant }
      return this.create(body)
    }

    if (request.headers.get('Upgrade') === 'websocket') return this.connect(url)

    // Anything else is a read of the room: does this link still play?
    const loaded = await this.load()
    if (!loaded) return json({ error: 'not_found' }, 404)
    return json({
      code: loaded.meta.code,
      name: loaded.meta.variant.name,
      seats: loaded.meta.seats.map((seat) => seat !== null),
      started: loaded.meta.startedAt !== null,
      over: !!loaded.game?.winner,
      width: loaded.meta.variant.board.width,
      height: loaded.meta.variant.board.height,
    })
  }

  /** Called by the Worker when a game is created. */
  async create(body: { code: string; token: string; variant: Variant }): Promise<Response> {
    if (await this.ctx.storage.get('meta')) return json({ error: 'exists' }, 409)

    const meta: Meta = {
      code: body.code,
      variant: body.variant,
      createdAt: Date.now(),
      seats: [await hashToken(body.token), null],
      startedAt: null,
    }
    await this.ctx.storage.put('meta', meta)
    await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL)
    this.meta = meta
    return json({ ok: true }, 201)
  }

  /**
   * Putting the connection in the hibernation API means an idle game costs no
   * duration: the object leaves memory and the socket wakes it on a message.
   */
  private async connect(url: URL): Promise<Response> {
    const loaded = await this.load()
    if (!loaded) return json({ error: 'not_found' }, 404)
    const { meta } = loaded

    // A token is the whole identity system: whoever holds one holds a seat.
    const token = url.searchParams.get('token')
    const hash = token ? await hashToken(token) : null
    let seat = hash ? meta.seats.findIndex((held) => held === hash) : -1
    let issued: string | null = null

    if (seat < 0 && url.searchParams.get('spectate') !== '1') {
      // Opening the shared link claims the free seat, which is the whole point
      // of the link: one person sends it, the other one plays.
      const free = meta.seats.indexOf(null)
      if (free >= 0) {
        issued = randomToken()
        meta.seats[free] = await hashToken(issued)
        await this.ctx.storage.put('meta', meta)
        seat = free
      }
    }

    if (seat >= 0 && meta.startedAt === null && meta.seats.every((held) => held !== null)) {
      // Both seats are taken: the game begins.
      const fresh = createInitialState(meta.variant)
      meta.startedAt = Date.now()
      await this.ctx.storage.put('meta', meta)
      await this.ctx.storage.put('game', fresh)
      this.game = fresh
      await this.ctx.storage.setAlarm(Date.now() + PLAYED_ROOM_TTL)
      // The player who was already waiting needs the opening position.
      this.broadcast({ t: 'state', game: fresh })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ seat: seat >= 0 ? seat : null } satisfies Attachment)

    server.send(
      JSON.stringify({
        t: 'hello',
        you: { seat: seat >= 0 ? seat : null, token: issued },
        variant: meta.variant,
        game: this.game,
        seats: meta.seats.map((held) => held !== null),
        started: meta.startedAt !== null,
        name: meta.variant.name,
        teams: meta.variant.teams.map((team) => team.id),
      }),
    )
    this.announce()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return
    const attachment = ws.deserializeAttachment() as Attachment | null
    const seat = attachment?.seat ?? null

    let message: Message
    try {
      message = JSON.parse(raw) as Message
    } catch {
      return send(ws, { t: 'error', code: 'bad_message' })
    }

    if (seat === null) return send(ws, { t: 'error', code: 'spectator' })

    if (message.t === 'resign') return this.resign(seat)
    if (message.t === 'move') return this.move(seat, message)
  }

  async webSocketClose(): Promise<void> {
    // The object may have been evicted while the socket was open.
    this.meta = null
    this.game = null
    this.announce()
  }

  private async move(
    seat: number,
    message: Extract<Message, { t: 'move' }>,
  ): Promise<void> {
    const loaded = await this.load()
    if (!loaded?.game) return
    const { meta, game } = loaded
    if (game.winner) return
    if (game.turn !== meta.variant.teams[seat]?.id) return this.reject(seat, 'not_your_turn', game)

    const from = vec(message.from)
    const to = vec(message.to)
    const finalTo = vec(message.finalTo)
    if (!from || !to || !finalTo) return this.reject(seat, 'bad_move', game)

    // The die of a piece that rolls to move is part of the position, so the
    // legal moves are worked out with the roll the player saw.
    const pieceId = game.board[from.y]?.[from.x]
    const roll =
      pieceId && Number.isInteger(message.roll) && message.roll! >= 1 && message.roll! <= 6
        ? { pieceId, value: message.roll! }
        : undefined

    const position = roll ? { ...game, roll } : game
    const legal = getLegalMoves(position, from.x, from.y)
    const move = legal.find(
      (candidate) =>
        candidate.to.x === to.x &&
        candidate.to.y === to.y &&
        candidate.finalTo.x === finalTo.x &&
        candidate.finalTo.y === finalTo.y,
    )
    if (!move) return this.reject(seat, 'illegal_move', game)

    const options = move.promotionOptions ?? []
    let promotionTypeId = message.promotionTypeId
    if (options.length) {
      if (!promotionTypeId) promotionTypeId = options[0]
      if (!options.includes(promotionTypeId)) return this.reject(seat, 'bad_promotion', game)
    } else {
      promotionTypeId = undefined
    }

    const origin = message.origin && vec(message.origin) ? message.origin : undefined
    const next = rollRandomPieces(
      applyMove(game, { ...move, promotionTypeId }, { origin, san: true }),
      move.pieceId,
    )

    await this.ctx.storage.put('game', next)
    this.game = next
    this.broadcast({ t: 'state', game: next })
  }

  private async resign(seat: number): Promise<void> {
    const loaded = await this.load()
    if (!loaded?.game || loaded.game.winner) return
    const { meta, game } = loaded
    const other = meta.variant.teams[(seat + 1) % meta.variant.teams.length]?.id
    if (!other) return

    const next: GameState = { ...game, winner: other, status: 'resign' }
    await this.ctx.storage.put('game', next)
    this.game = next
    this.broadcast({ t: 'state', game: next })
  }

  /**
   * Refuses a move and hands back the position the room actually holds. The
   * browser applies moves optimistically, so a rejection has to undo the board
   * it is showing rather than only complain about it.
   */
  private reject(seat: number, code: string, game: GameState | null = null) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment | null
      if (attachment?.seat === seat) send(ws, { t: 'error', code, game: game ?? undefined })
    }
  }

  private broadcast(message: unknown) {
    const data = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data)
      } catch {
        /* a socket that is already gone */
      }
    }
  }

  private announce() {
    const sockets = this.ctx.getWebSockets()
    const present = sockets.map((ws) => (ws.deserializeAttachment() as Attachment | null)?.seat ?? null)
    this.broadcast({
      t: 'presence',
      presence: [present.includes(0), present.includes(1)],
      watchers: present.filter((seat) => seat === null).length,
    })
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
    this.meta = null
    this.game = null
  }
}

/* ------------------------------------------------------------------ helpers */

function vec(value: unknown): Vec | null {
  if (!value || typeof value !== 'object') return null
  const { x, y } = value as Vec
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null
  return { x, y }
}

function send(ws: WebSocket, message: unknown) {
  try {
    ws.send(JSON.stringify(message))
  } catch {
    /* ignore */
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
