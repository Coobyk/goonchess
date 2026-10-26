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
import { applyMove, createInitialState, dropOptions, getLegalMoves, rollRandomPieces } from '../src/engine/rules'
import type { GameState, Variant, Vec } from '../src/engine/types'
import {
  clockIsOn,
  initialClockState,
  NO_CLOCK,
  type ClockSettings,
  type ClockState,
} from '../src/lib/clock'
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
  /** The time control the room enforces, chosen by whoever made the link. */
  clock: ClockSettings
}

/** The board and its clock travel in one row, so a move writes one record. */
interface StoredGame {
  game: GameState
  clock: ClockState | null
}

interface Attachment {
  /** 0 or 1 for the two players, null for anyone watching. */
  seat: number | null
}

type Message =
  | { t: 'move'; from: Vec; to: Vec; finalTo: Vec; roll?: number; promotionTypeId?: string; origin?: Vec; drop?: { typeId: string } }
  | { t: 'resign' }
  /** An offer to take the last move back, or to play the whole game again. */
  | { t: 'offer'; kind: OfferKind }
  | { t: 'offer-response'; kind: OfferKind; accept: boolean }
  | { t: 'chat'; text: string }

type OfferKind = 'undo' | 'rematch'

interface ChatLine {
  from: number
  text: string
  at: number
}

export class GameRoom {
  private ctx: DurableObjectState
  private meta: Meta | null = null
  private game: GameState | null = null
  private clock: ClockState | null = null
  /** Who is offering an undo or a rematch, per kind. One live offer per kind. */
  private offers = new Map<OfferKind, number>()
  /** The last few chat lines. They live in memory: a restart loses them. */
  private chat: ChatLine[] = []

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx
  }

  private async load(): Promise<{
    meta: Meta
    game: GameState | null
    clock: ClockState | null
  } | null> {
    if (!this.meta) {
      this.meta = (await this.ctx.storage.get<Meta>('meta')) ?? null
      const raw = await this.ctx.storage.get<GameState | StoredGame>('game')
      // Rooms made before clocks existed stored the game on its own.
      if (raw && 'game' in raw) {
        this.game = raw.game
        this.clock = raw.clock
      } else {
        this.game = (raw as GameState | undefined) ?? null
        this.clock = null
      }
    }
    if (!this.meta) return null
    // Older rooms were made without a time control.
    if (!this.meta.clock) this.meta.clock = NO_CLOCK
    return { meta: this.meta, game: this.game, clock: this.clock }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/create')) {
      if (request.method !== 'POST') return json({ error: 'method' }, 405)
      const body = (await request.json()) as {
        code: string
        token: string
        variant: Variant
        clock?: unknown
      }
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
  async create(body: {
    code: string
    token: string
    variant: Variant
    clock?: unknown
  }): Promise<Response> {
    if (await this.ctx.storage.get('meta')) return json({ error: 'exists' }, 409)

    const meta: Meta = {
      code: body.code,
      variant: body.variant,
      createdAt: Date.now(),
      seats: [await hashToken(body.token), null],
      startedAt: null,
      clock: normalizeClock(body.clock),
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
      const clock = clockIsOn(meta.clock)
        ? initialClockState(meta.clock, fresh.variant.teams.map((team) => team.id))
        : null
      meta.startedAt = Date.now()
      await this.ctx.storage.put('meta', meta)
      this.game = fresh
      this.clock = clock
      await this.save()
      await this.scheduleAlarm(meta, fresh, clock)
      // The player who was already waiting needs the opening position.
      this.broadcast({ t: 'state', game: fresh, clockState: clock })
    }

    // A room can sit for days. If a flag fell while nobody was here, the game
    // is already over before the hello goes out.
    if (this.game) await this.flagIfNeeded(meta, this.game, this.clock)

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
        clock: meta.clock,
        clockState: this.displayClock(this.game, this.clock),
        seats: meta.seats.map((held) => held !== null),
        started: meta.startedAt !== null,
        name: meta.variant.name,
        teams: meta.variant.teams.map((team) => team.id),
        chat: this.chat,
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
    if (message.t === 'offer') return this.offer(seat, message.kind)
    if (message.t === 'offer-response') return this.offerResponse(seat, message.kind, message.accept)
    if (message.t === 'chat') return this.chatLine(seat, message.text)
  }

  async webSocketClose(): Promise<void> {
    // The object may have been evicted while the socket was open.
    this.meta = null
    this.game = null
    this.clock = null
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

    const now = Date.now()
    let clock = loaded.clock
    // The room owns the clock: a move that arrives after the flag fell does
    // not count, and the game is already lost.
    if (clock && clockIsOn(meta.clock) && clock.running && clock.lastMoveAt !== null) {
      if ((clock.times[game.turn] ?? 0) - (now - clock.lastMoveAt) <= 0) {
        await this.finishTimeout(meta, game, clock)
        return
      }
    }

    const refusedClock = this.displayClock(game, loaded.clock)
    if (game.turn !== meta.variant.teams[seat]?.id) {
      return this.reject(seat, 'not_your_turn', game, refusedClock)
    }

    const from = vec(message.from)
    const to = vec(message.to)
    const finalTo = vec(message.finalTo)
    if (!from || !to || !finalTo) return this.reject(seat, 'bad_move', game, refusedClock)

    // The die of a piece that rolls to move is part of the position, so the
    // legal moves are worked out with the roll the player saw.
    const pieceId = game.board[from.y]?.[from.x]
    const roll =
      pieceId && Number.isInteger(message.roll) && message.roll! >= 1 && message.roll! <= 6
        ? { pieceId, value: message.roll! }
        : undefined

    const position = roll ? { ...game, roll } : game
    // A drop comes out of the pocket, so there is no piece under `from` to
    // ask — the legal drops are worked out instead.
    const legal = message.drop
      ? dropOptions(position, game.turn).map((option) => option.move)
      : getLegalMoves(position, from.x, from.y)
    const move = legal.find(
      (candidate) =>
        candidate.to.x === to.x &&
        candidate.to.y === to.y &&
        candidate.finalTo.x === finalTo.x &&
        candidate.finalTo.y === finalTo.y &&
        candidate.drop?.typeId === message.drop?.typeId,
    )
    if (!move) return this.reject(seat, 'illegal_move', game, refusedClock)

    const options = move.promotionOptions ?? []
    let promotionTypeId = message.promotionTypeId
    if (options.length) {
      if (!promotionTypeId) promotionTypeId = options[0]
      if (!options.includes(promotionTypeId)) return this.reject(seat, 'bad_promotion', game, refusedClock)
    } else {
      promotionTypeId = undefined
    }

    if (clock && clockIsOn(meta.clock)) {
      const times = { ...clock.times }
      const mover = game.turn
      if (clock.running && clock.lastMoveAt !== null) {
        times[mover] =
          Math.max(0, (times[mover] ?? 0) - (now - clock.lastMoveAt)) +
          meta.clock.increment * 1000
      } else {
        // The first move starts the clock and still earns the increment.
        times[mover] = (times[mover] ?? 0) + meta.clock.increment * 1000
      }
      clock = { times, lastMoveAt: now, running: true }
    }

    const origin = message.origin && vec(message.origin) ? message.origin : undefined
    const next = rollRandomPieces(
      applyMove(game, { ...move, promotionTypeId }, { origin, san: true }),
      move.pieceId,
    )
    // A game that ends here stops the clock.
    if (next.winner && clock) clock = { ...clock, running: false, lastMoveAt: null }

    this.game = next
    this.clock = clock
    await this.save()
    await this.scheduleAlarm(meta, next, clock)
    this.broadcast({ t: 'state', game: next, clockState: clock })
  }

  private async resign(seat: number): Promise<void> {
    const loaded = await this.load()
    if (!loaded?.game || loaded.game.winner) return
    const { meta, game } = loaded
    const other = meta.variant.teams[(seat + 1) % meta.variant.teams.length]?.id
    if (!other) return

    const next: GameState = { ...game, winner: other, status: 'resign' }
    const clock = this.clock ? { ...this.clock, running: false, lastMoveAt: null } : null
    this.game = next
    this.clock = clock
    await this.save()
    await this.scheduleAlarm(meta, next, clock)
    this.broadcast({ t: 'state', game: next, clockState: clock })
  }

  /**
   * An offer to take the last move back, or to play the whole game again.
   * It stands until the other seat answers it or replaces it.
   */
  private async offer(seat: number, kind: OfferKind): Promise<void> {
    const loaded = await this.load()
    const game = loaded?.game
    if (!game) return
    // An undo asks for a move that exists; a rematch asks for a game that is
    // over. The two never apply at the same time.
    if (kind === 'undo' && (game.winner || !game.moveHistory.length)) return
    if (kind === 'rematch' && !game.winner) return
    // Offering to yourself is only possible with two browsers in one seat,
    // and it would answer itself.
    if (this.offers.get(kind) === seat) return
    this.offers.set(kind, seat)
    this.broadcast({ t: 'offer', kind, seat })
  }

  private async offerResponse(
    seat: number,
    kind: OfferKind,
    accept: boolean,
  ): Promise<void> {
    const from = this.offers.get(kind)
    if (from === undefined || from === seat) return
    this.offers.delete(kind)
    if (!accept) {
      this.broadcast({ t: 'offer-declined', kind })
      return
    }
    if (kind === 'undo') await this.undo(from)
    else await this.rematch()
    this.broadcast({ t: 'offer-accepted', kind })
  }

  /** One move back. The position is rebuilt by playing the history again. */
  private async undo(_seat: number): Promise<void> {
    const loaded = await this.load()
    if (!loaded?.game || loaded.game.winner) return
    const { meta, game } = loaded
    const history = game.moveHistory
    if (!history.length) return

    let rebuilt = createInitialState(meta.variant)
    for (const record of history.slice(0, -1)) {
      rebuilt = rollRandomPieces(
        applyMove(rebuilt, record.move, { origin: record.origin, san: true }),
        record.move.pieceId,
      )
    }
    // The clock hands back to the side that is to move again; the time that
    // was spent stays spent.
    const clock = this.clock
      ? { ...this.clock, lastMoveAt: Date.now(), running: true }
      : null
    this.game = rebuilt
    this.clock = clock
    await this.save()
    await this.scheduleAlarm(meta, rebuilt, clock)
    this.broadcast({ t: 'state', game: rebuilt, clockState: clock })
  }

  /** The same rooms, the same seats, the whole game from the start again. */
  private async rematch(): Promise<void> {
    const loaded = await this.load()
    if (!loaded?.game?.winner) return
    const { meta } = loaded
    const fresh = createInitialState(meta.variant)
    const clock = clockIsOn(meta.clock)
      ? initialClockState(meta.clock, fresh.variant.teams.map((team) => team.id))
      : null
    this.game = fresh
    this.clock = clock
    await this.save()
    await this.scheduleAlarm(meta, fresh, clock)
    this.broadcast({ t: 'state', game: fresh, clockState: clock })
  }

  /** A line of chat, trimmed and capped, passed on to everybody. */
  private chatLine(seat: number, text: unknown): void {
    if (typeof text !== 'string') return
    const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, 280)
    if (!trimmed) return
    const line: ChatLine = { from: seat, text: trimmed, at: Date.now() }
    this.chat = [...this.chat.slice(-29), line]
    this.broadcast({ t: 'chat', from: seat, text: trimmed, at: line.at })
  }

  /**
   * Refuses a move and hands back the position the room actually holds. The
   * browser applies moves optimistically, so a rejection has to undo the board
   * it is showing rather than only complain about it.
   */
  private reject(
    seat: number,
    code: string,
    game: GameState | null = null,
    clockState: ClockState | null = null,
  ) {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment | null
      if (attachment?.seat === seat) {
        send(ws, { t: 'error', code, game: game ?? undefined, clockState: clockState ?? undefined })
      }
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

  /** One row: the board and the clock that goes with it. */
  private async save(): Promise<void> {
    if (!this.game) return
    await this.ctx.storage.put('game', { game: this.game, clock: this.clock } satisfies StoredGame)
  }

  /**
   * Wakes the room for the next thing that has to happen by itself: the side
   * to move running out of time, or the room's own expiry, whichever is first.
   */
  private async scheduleAlarm(
    meta: Meta,
    game: GameState | null,
    clock: ClockState | null,
  ): Promise<void> {
    const ttl =
      (meta.startedAt ?? meta.createdAt) +
      (meta.startedAt !== null ? PLAYED_ROOM_TTL : EMPTY_ROOM_TTL)
    let at = ttl
    if (game && !game.winner && clock?.running && clock.lastMoveAt !== null) {
      const left = Math.max(0, clock.times[game.turn] ?? 0)
      at = Math.min(at, clock.lastMoveAt + left + 500)
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now(), at))
  }

  /** The clock as the side to move sees it right now, for a fresh connection. */
  private displayClock(game: GameState | null, clock: ClockState | null): ClockState | null {
    if (!game || !clock || !clock.running || clock.lastMoveAt === null || game.winner) return clock
    const left = Math.max(0, (clock.times[game.turn] ?? 0) - (Date.now() - clock.lastMoveAt))
    return { ...clock, times: { ...clock.times, [game.turn]: left }, lastMoveAt: Date.now() }
  }

  /** Ends the game if the side to move has run out of time. */
  private async flagIfNeeded(
    meta: Meta,
    game: GameState | null,
    clock: ClockState | null,
  ): Promise<boolean> {
    if (!game || game.winner || !clock || !clock.running || clock.lastMoveAt === null) return false
    if ((clock.times[game.turn] ?? 0) - (Date.now() - clock.lastMoveAt) > 0) return false
    await this.finishTimeout(meta, game, clock)
    return true
  }

  /** The side to move ran out of time: the other side wins. */
  private async finishTimeout(meta: Meta, game: GameState, clock: ClockState): Promise<void> {
    const side = game.turn
    const order = meta.variant.teams.map((team) => team.id)
    const index = order.indexOf(side)
    const next: GameState = { ...game, winner: order[(index + 1) % order.length] ?? null, status: 'timeout' }
    const nextClock: ClockState = {
      ...clock,
      times: { ...clock.times, [side]: 0 },
      lastMoveAt: null,
      running: false,
    }
    this.game = next
    this.clock = nextClock
    await this.save()
    await this.scheduleAlarm(meta, next, nextClock)
    this.broadcast({ t: 'state', game: next, clockState: nextClock })
  }

  async alarm(): Promise<void> {
    const loaded = await this.load()
    if (!loaded) return
    const { meta } = loaded
    // The clock's alarm can come before the room's expiry.
    if (await this.flagIfNeeded(meta, loaded.game, loaded.clock)) return

    const expiry =
      (meta.startedAt ?? meta.createdAt) +
      (meta.startedAt !== null ? PLAYED_ROOM_TTL : EMPTY_ROOM_TTL)
    if (Date.now() < expiry) {
      await this.scheduleAlarm(meta, loaded.game, loaded.clock)
      return
    }

    await this.ctx.storage.deleteAll()
    this.meta = null
    this.game = null
    this.clock = null
  }
}

/* ------------------------------------------------------------------ helpers */

function normalizeClock(value: unknown): ClockSettings {
  if (!value || typeof value !== 'object') return NO_CLOCK
  const { minutes, increment } = value as Partial<ClockSettings>
  if (!Number.isInteger(minutes) || !Number.isInteger(increment)) return NO_CLOCK
  const m = Math.max(0, Math.min(180, minutes!))
  const i = Math.max(0, Math.min(180, increment!))
  return m > 0 ? { minutes: m, increment: i } : NO_CLOCK
}

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
