import { useEffect, useState, type ReactNode } from 'react'
import { TURN_MS, turnDelta } from '@/lib/moveAnimation'

function normalizeTurn(orientation: number): number {
  return ((Math.round(orientation) % 8) + 8) % 8
}

export function TurningPiece({
  orientation = 0,
  initialOrientation,
  baseRotation = 0,
  delay = 0,
  className = 'inline-flex',
  children,
}: {
  orientation?: number
  initialOrientation?: number
  baseRotation?: number
  delay?: number
  className?: string
  children: ReactNode
}) {
  const target = normalizeTurn(orientation)
  const start = normalizeTurn(initialOrientation ?? orientation)
  const [turn, setTurn] = useState(start)
  const [degrees, setDegrees] = useState(start * 45)

  useEffect(() => {
    const diff = turnDelta(turn, target)
    if (!diff) return
    const timer = window.setTimeout(() => {
      setDegrees((current) => current + diff * 45)
      setTurn(target)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [delay, target, turn])

  return (
    <span
      className={className}
      style={{ transform: baseRotation ? `rotate(${baseRotation}deg)` : undefined }}
    >
      <span
        className="inline-flex"
        style={{
          transform: degrees ? `rotate(${degrees}deg)` : undefined,
          transition: `transform ${TURN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      >
        {children}
      </span>
    </span>
  )
}
