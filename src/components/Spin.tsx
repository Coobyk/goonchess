import { useState, type ReactNode } from 'react'

const SPIN_PERIOD_MS = 2400

/**
 * Turns its piece round and round, forever. Every spinning piece shares one
 * phase, taken from the page clock, so a piece that moves or is redrawn picks
 * the spin up where the others are instead of starting over.
 */
export function Spin({ on, children }: { on: boolean; children: ReactNode }) {
  const [delay] = useState(() => -(performance.now() % SPIN_PERIOD_MS))
  if (!on) return children
  return (
    <span className="piece-spin inline-flex" style={{ animationDuration: `${SPIN_PERIOD_MS}ms`, animationDelay: `${delay}ms` }}>
      {children}
    </span>
  )
}
