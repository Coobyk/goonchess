import type { Vec } from '@/engine/types'

/**
 * The one move the engine likes best, drawn as an arrow on the board. A calm
 * sky blue, so it reads apart from the rose and amber of the threat arrows.
 * It is drawn broad and half see-through, the way an overlay should be: under
 * it, never over it.
 */
export function BestMoveArrow({
  from,
  to,
  cell,
  cols,
  rows,
  flip,
}: {
  from: Vec
  to: Vec
  cell: number
  cols: number
  rows: number
  flip: boolean
}) {
  const width = cols * cell
  const height = rows * cell
  const left = (x: number) => (flip ? cols - 1 - x : x)
  const top = (y: number) => (flip ? rows - 1 - y : y)

  const fx = (left(from.x) + 0.5) * cell
  const fy = (top(from.y) + 0.5) * cell
  const tx = (left(to.x) + 0.5) * cell
  const ty = (top(to.y) + 0.5) * cell
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
          id="best-move-head"
          viewBox="0 0 10 10"
          markerWidth={Math.max(14, cell * 0.5)}
          markerHeight={Math.max(14, cell * 0.5)}
          refX="6.5"
          refY="5"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L10,5 L0,10 Z" fill="rgb(56 189 248)" />
        </marker>
      </defs>
      <g opacity={0.6}>
        <line
          x1={sx}
          y1={sy}
          x2={ex}
          y2={ey}
          stroke="rgb(0 0 0 / 0.35)"
          strokeWidth={Math.max(7, cell * 0.17)}
          strokeLinecap="round"
        />
        <line
          x1={sx}
          y1={sy}
          x2={ex}
          y2={ey}
          stroke="rgb(56 189 248)"
          strokeWidth={Math.max(5, cell * 0.12)}
          strokeLinecap="round"
          markerEnd="url(#best-move-head)"
        />
      </g>
    </svg>
  )
}
