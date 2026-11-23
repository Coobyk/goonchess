import { useLayoutEffect, useRef, type ReactNode } from 'react'

const SPIN_PERIOD_MS = 2400

/**
 * Turns its piece round and round, forever. Every spin is pinned to the start
 * of the page's timeline, so all pieces turn in step and a piece that moves or
 * is redrawn picks the spin up where the others are instead of starting over.
 * The turning glyph overhangs its square at the corners, so it lets clicks
 * through to the square underneath.
 */
export function Spin({ on, children }: { on: boolean; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    for (const animation of ref.current?.getAnimations?.() ?? []) animation.startTime = 0
  }, [on])
  if (!on) return children
  return (
    <span
      ref={ref}
      className="piece-spin pointer-events-none inline-flex"
      style={{ animationDuration: `${SPIN_PERIOD_MS}ms` }}
    >
      {children}
    </span>
  )
}
