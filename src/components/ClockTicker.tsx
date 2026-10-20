import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { clockIsOn, formatClock } from '@/lib/clock'

/**
 * The clock display and the timer that keeps it honest.
 *
 * The store holds the authoritative time; this component asks it to settle
 * every quarter second, so both sides always show the same number.
 */
export function ClockTicker() {
  const clock = useAppStore((s) => s.clock)
  const game = useAppStore((s) => s.game)
  const tickClock = useAppStore((s) => s.tickClock)

  useEffect(() => {
    if (!clockIsOn(clock) || game.winner) return
    const timer = window.setInterval(() => tickClock(), 250)
    return () => window.clearInterval(timer)
  }, [clock, game.winner, tickClock])

  return null
}

/** The time left for one side. */
export function ClockFor({ team }: { team: string }) {
  const clock = useAppStore((s) => s.clock)
  const clockState = useAppStore((s) => s.clockState)
  if (!clockIsOn(clock)) return null
  const left = clockState.times[team] ?? 0
  const low = left < 30_000
  return (
    <span
      className={`font-mono text-sm tabular-nums ${low ? 'text-rose-500' : 'text-foreground'}`}
      aria-label={`${Math.ceil(left / 1000)} seconds left`}
    >
      {formatClock(left)}
    </span>
  )
}
