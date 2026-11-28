import { useEffect, useState, type ReactNode } from 'react'
import { TURN_MS, shortestRotation } from '@/lib/moveAnimation'

function normalizeTurn(orientation: number): number {
  return ((Math.round(orientation) % 8) + 8) % 8
}

/**
 * A piece that rotates smoothly instead of snapping. The rendered angle is
 * cumulative: every change — a post-move turn, the 180° seat flip — is merged
 * into a single target and the piece glides there along the shorter arc, so
 * two rotations due at once read as one continuous motion.
 */
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
  const target = baseRotation + normalizeTurn(orientation) * 45
  const start = baseRotation + normalizeTurn(initialOrientation ?? orientation) * 45
  const [degrees, setDegrees] = useState(start)

  useEffect(() => {
    const diff = shortestRotation(degrees, target)
    if (!diff) return
    const timer = window.setTimeout(() => {
      setDegrees((current) => current + diff)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [delay, target, degrees])

  return (
    <span
      className={className}
      style={{
        transform: degrees ? `rotate(${degrees}deg)` : undefined,
        transition: `transform ${TURN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    >
      {children}
    </span>
  )
}
