import type { GameState, Variant, Vec } from '@/engine/types'

/**
 * The HTTP and socket side of a shared game.
 *
 * A seat is a secret token in localStorage, so a refresh is the same player and
 * the link is the only thing that has to travel. Nothing here knows the rules:
 * the server validates every move, and this file only carries intent and state.
 */

export interface RoomInfo {
  code: string
  name: string
  seats: [boolean, boolean]
  started: boolean
  over: boolean
  width: number
  height: number
}

export interface MoveIntent {
  from: Vec
  to: Vec
  finalTo: Vec
  roll?: number
  promotionTypeId?: string
  origin?: Vec
}

export type ServerMessage =
  | {
      t: 'hello'
      you: { seat: number | null; token: string | null }
      variant: Variant
      game: GameState | null
      seats: boolean[]
      started: boolean
      name: string
      teams: string[]
    }
  | { t: 'state'; game: GameState }
  | { t: 'presence'; presence: boolean[]; watchers: number }
  /** A refusal carries the position the room holds, so the board can be put back. */
  | { t: 'error'; code: string; game?: GameState }

const seatKey = (code: string) => `goonchess.seat.${code}`

export function readSeatToken(code: string): string | null {
  try {
    return localStorage.getItem(seatKey(code))
  } catch {
    return null
  }
}

export function writeSeatToken(code: string, token: string): void {
  try {
    localStorage.setItem(seatKey(code), token)
  } catch {
    /* private browsing, or storage full */
  }
}

export async function fetchRoom(code: string): Promise<RoomInfo | null> {
  try {
    const response = await fetch(`/api/games/${code}`, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as RoomInfo
  } catch {
    return null
  }
}

export interface CreateResult {
  code: string
  token: string
  path: string
}

export async function createRoom(
  variant: Variant,
  captcha: { challenge: string; solution: string },
): Promise<CreateResult> {
  const response = await fetch('/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ variant, captcha }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `create_failed_${response.status}`)
  }
  return (await response.json()) as CreateResult
}

export interface Connection {
  /** Sends one message if the socket is up. False means it never went out. */
  send: (message: unknown) => boolean
  close: () => void
}

export interface SocketHandlers {
  onMessage: (message: ServerMessage) => void
  onOpenChange?: (connected: boolean) => void
}

/**
 * Opens the room's socket and keeps it open. A dropped connection is retried
 * with a backoff; the server replies to every connection with the whole game,
 * so reconnecting is the same code path as opening the link for the first time.
 */
export function connect(code: string, handlers: SocketHandlers): Connection {
  let socket: WebSocket | null = null
  let closed = false
  let attempt = 0
  let timer: number | null = null

  const open = () => {
    if (closed) return
    const url = new URL(`/api/games/${code}/ws`, window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = readSeatToken(code)
    if (token) url.searchParams.set('token', token)

    try {
      socket = new WebSocket(url)
    } catch {
      scheduleRetry()
      return
    }

    socket.onopen = () => {
      attempt = 0
      handlers.onOpenChange?.(true)
    }
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      try {
        handlers.onMessage(JSON.parse(event.data) as ServerMessage)
      } catch {
        /* a message that is not ours */
      }
    }
    socket.onclose = () => {
      handlers.onOpenChange?.(false)
      scheduleRetry()
    }
    socket.onerror = () => {
      /* the close handler does the work */
    }
  }

  const scheduleRetry = () => {
    if (closed) return
    attempt += 1
    const wait = Math.min(12_000, 600 * 2 ** Math.min(attempt, 5))
    timer = window.setTimeout(open, wait)
  }

  open()

  return {
    send: (message) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false
      try {
        socket.send(JSON.stringify(message))
        return true
      } catch {
        // The socket closed between the check and the send.
        return false
      }
    },
    close: () => {
      closed = true
      if (timer !== null) window.clearTimeout(timer)
      socket?.close()
    },
  }
}
