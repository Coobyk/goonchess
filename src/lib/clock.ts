import type { GameState, Variant } from '@/engine/types'

/** Chess clocks: time per side, with an increment after every move. */

export interface ClockSettings {
  /** Minutes per side. Zero means the clock is off. */
  minutes: number
  /** Seconds added to the mover after it moves. */
  increment: number
}

export interface ClockState {
  /** Milliseconds left, by team id. */
  times: Record<string, number>
  /** When the side to move was last updated. */
  lastMoveAt: number | null
  /** The clock only runs once the game is under way. */
  running: boolean
}

export const NO_CLOCK: ClockSettings = { minutes: 0, increment: 0 }

export const CLOCK_PRESETS: { label: string; minutes: number; increment: number }[] = [
  { label: 'No clock', minutes: 0, increment: 0 },
  { label: '1 + 0', minutes: 1, increment: 0 },
  { label: '3 + 0', minutes: 3, increment: 0 },
  { label: '3 + 2', minutes: 3, increment: 2 },
  { label: '5 + 0', minutes: 5, increment: 0 },
  { label: '5 + 3', minutes: 5, increment: 3 },
  { label: '10 + 0', minutes: 10, increment: 0 },
  { label: '15 + 10', minutes: 15, increment: 10 },
]

export function initialClockState(settings: ClockSettings, variant: Variant): ClockState {
  const total = settings.minutes * 60_000
  const times: Record<string, number> = {}
  for (const team of variant.teams) times[team.id] = total
  return { times, lastMoveAt: null, running: false }
}

export function clockIsOn(settings: ClockSettings) {
  return settings.minutes > 0
}

/**
 * Milliseconds the side to move has left as of `now`, or null when the clock
 * is not running. This is the one place the ticking arithmetic lives, so the
 * browser and the room read the flag the same way.
 */
function remaining(state: ClockState, turn: string, now: number): number | null {
  if (!state.running || state.lastMoveAt === null) return null
  return (state.times[turn] ?? 0) - (now - state.lastMoveAt)
}

/** Whether the side to move's flag has fallen. */
export function flagFell(state: ClockState, turn: string, now: number): boolean {
  const left = remaining(state, turn, now)
  return left !== null && left <= 0
}

/** The clock as it stands right now: elapsed charged to the side to move. */
export function projectedClock(state: ClockState, turn: string, now: number): ClockState {
  const left = remaining(state, turn, now)
  if (left === null) return state
  return {
    ...state,
    times: { ...state.times, [turn]: Math.max(0, left) },
    lastMoveAt: now,
  }
}

/**
 * The clock after a move: the mover's elapsed time is charged and the
 * increment is paid. The first move earns the increment too, and starts the
 * clock.
 */
export function settleClock(
  state: ClockState,
  settings: ClockSettings,
  mover: string,
  now: number,
): ClockState {
  const left = remaining(state, mover, now)
  const kept = left === null ? (state.times[mover] ?? 0) : Math.max(0, left)
  return {
    times: { ...state.times, [mover]: kept + settings.increment * 1000 },
    lastMoveAt: now,
    running: true,
  }
}

/**
 * A fallen flag, applied: the side next to move wins, the flagging side's
 * clock reads zero and the clock stops. The store and the room both end a
 * game this way.
 */
export function flagFall(
  game: GameState,
  clock: ClockState,
  side: string,
): { game: GameState; clock: ClockState } {
  return {
    game: { ...game, winner: timeoutWinner(game.variant, side), status: 'timeout' },
    clock: { ...clock, times: { ...clock.times, [side]: 0 }, lastMoveAt: null, running: false },
  }
}

/** A fallen flag hands the game to the side that was next to move. */
export function timeoutWinner(variant: Variant, side: string): string | null {
  const order = variant.teams.map((t) => t.id)
  return order[(order.indexOf(side) + 1) % order.length] ?? null
}

/** "3:07" — minutes, seconds and tenths when there is time to show them. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalSeconds = clamped / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const tenths = Math.floor((clamped % 1000) / 100)
  if (minutes >= 1) return `${minutes}:${String(seconds).padStart(2, '0')}`
  return `${seconds}.${tenths}`
}
