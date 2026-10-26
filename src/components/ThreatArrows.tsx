import { useId } from 'react'
import type { ThreatEdge } from '@/engine/threats'

/**
 * Arrows from every attacker to the piece it can capture. Hanging targets get
 * a rose arrow; targets that can be recaptured get an amber one. Broad and
 * half see-through, so they read over the pieces without hiding them.
 */
export function ThreatArrows({
  edges,
  cell,
  cols,
  rows,
  flip,
}: {
  edges: ThreatEdge[]
  cell: number
  cols: number
  rows: number
  flip: boolean
}) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const hangingId = `threat-hanging-${rawId}`
  const defendedId = `threat-defended-${rawId}`
  const width = cols * cell
  const height = rows * cell

  const left = (x: number) => (flip ? cols - 1 - x : x)
  const top = (y: number) => (flip ? rows - 1 - y : y)

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[15] overflow-visible"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <marker
          id={hangingId}
          viewBox="0 0 10 10"
          markerWidth={Math.max(13, cell * 0.45)}
          markerHeight={Math.max(13, cell * 0.45)}
          refX="6.5"
          refY="5"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="rgb(251 113 133)" />
        </marker>
        <marker
          id={defendedId}
          viewBox="0 0 10 10"
          markerWidth={Math.max(13, cell * 0.45)}
          markerHeight={Math.max(13, cell * 0.45)}
          refX="6.5"
          refY="5"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="rgb(251 191 36)" />
        </marker>
      </defs>

      {edges.map((edge) => {
        const fx = (left(edge.from.x) + 0.5) * cell
        const fy = (top(edge.from.y) + 0.5) * cell
        const tx = (left(edge.to.x) + 0.5) * cell
        const ty = (top(edge.to.y) + 0.5) * cell
        const dx = tx - fx
        const dy = ty - fy
        const length = Math.hypot(dx, dy)
        if (length < cell * 0.5) return null
        const padStart = cell * 0.32
        const padEnd = cell * 0.42
        const sx = fx + (dx / length) * padStart
        const sy = fy + (dy / length) * padStart
        const ex = tx - (dx / length) * padEnd
        const ey = ty - (dy / length) * padEnd
        const color = edge.defended ? 'rgb(251 191 36)' : 'rgb(251 113 133)'
        const marker = edge.defended ? defendedId : hangingId
        return (
          <g key={`${edge.attackerId}-${edge.targetId}`} opacity={0.65}>
            <line
              x1={sx}
              y1={sy}
              x2={ex}
              y2={ey}
              stroke="rgb(0 0 0 / 0.35)"
              strokeWidth={Math.max(6, cell * 0.15)}
              strokeLinecap="round"
            />
            <line
              x1={sx}
              y1={sy}
              x2={ex}
              y2={ey}
              stroke={color}
              strokeWidth={Math.max(4, cell * 0.1)}
              strokeLinecap="round"
              markerEnd={`url(#${marker})`}
            />
          </g>
        )
      })}
    </svg>
  )
}
