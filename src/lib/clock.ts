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

export function initialClockState(settings: ClockSettings, teamIds: string[]): ClockState {
  const total = settings.minutes * 60_000
  const times: Record<string, number> = {}
  for (const id of teamIds) times[id] = total
  return { times, lastMoveAt: null, running: false }
}

export function clockIsOn(settings: ClockSettings) {
  return settings.minutes > 0
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
