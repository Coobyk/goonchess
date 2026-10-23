import { useRef, useState } from 'react'
import { useElementWidth } from './PieceGlyph'
import { cn } from '@/lib/utils'

/** Room for the y labels on the left and the move numbers underneath. */
const PAD = { top: 12, right: 8, bottom: 18, left: 32 }
const HEIGHT = 116
/** The widest window the graph will show, in centipawns. */
const CAP = 1000
/** Grid steps in centipawns, from fine to coarse. */
const STEPS = [100, 200, 250, 500, 1000]

/**
 * The scores, kept inside a window.
 *
 * A forced mate is scored in the tens of thousands of points, so the last few
 * moves of a game would otherwise flatten everything before them into a line
 * at zero. The window is as wide as the advantage the game actually reached,
 * and never narrower than a pawn; anything past it is drawn along the edge,
 * which is where a mate belongs.
 */
function clampScores(scores: number[]) {
  return scores.map((score) => Math.max(-CAP, Math.min(CAP, score)))
}

/**
 * The window and the grid step for a set of scores.
 *
 * The step is the coarsest one that still leaves at most two gridlines either
 * side of level, so the picture never turns into graph paper, and the window
 * rounds out to a whole number of steps so the labels are readable numbers.
 */
function windowFor(maxAbs: number) {
  for (const step of STEPS) {
    if (maxAbs <= step * 2) {
      return { top: Math.max(step, Math.ceil(maxAbs / step) * step), step }
    }
  }
  return { top: CAP, step: 500 }
}

/** `+0.4`, `−1.2`, `0` — a score the way a player reads one. */
function formatScore(value: number): string {
  if (value === 0) return '0'
  const pawns = Math.abs(value) / 100
  return `${value > 0 ? '+' : '−'}${pawns % 1 === 0 ? pawns.toFixed(0) : pawns.toFixed(1)}`
}

/**
 * A curve through the points, as cubic Béziers.
 *
 * The control points come from the neighbours either side — a Catmull-Rom
 * spline — so the line arrives at every score and stays smooth between them,
 * and each one is held inside the plot band: a free spline can bow out over
 * the edge of the window where a mate spike meets a flat line.
 */
function smoothPath(
  points: { x: number; y: number }[],
  top: number,
  bottom: number,
): string {
  if (points.length === 0) return ''
  const band = (value: number) => Math.max(top, Math.min(bottom, value))
  let path = `M${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const before = points[Math.max(i - 1, 0)]
    const from = points[i]
    const to = points[i + 1]
    const after = points[Math.min(i + 2, points.length - 1)]
    path +=
      ` C${from.x + (to.x - before.x) / 6} ${band(from.y + (to.y - before.y) / 6)}` +
      ` ${to.x - (after.x - from.x) / 6} ${band(to.y - (after.y - from.y) / 6)}` +
      ` ${to.x} ${to.y}`
  }
  return path
}

/**
 * The graph of a game.
 *
 * It shows how the position stood after every move: one smooth trace read
 * like an instrument chart, on a hairline grid, with level marked heavier
 * than the rest. The line is ink rather than a bright colour so it sits beside
 * the board without competing with it, and only the move the game is on gets
 * the brass mark.
 *
 * Clicking a point goes to that position.
 */
export function AnalysisGraph({
  scores,
  variantName,
  current,
  onPick,
}: {
  /** The score after every move, from the first army's point of view. */
  scores: number[]
  variantName: string
  /** The move the game is on, marked on the graph. */
  current?: number | null
  /** Called with the move that was clicked. */
  onPick?: (ply: number) => void
}) {
  const [setWrap, width] = useElementWidth<HTMLDivElement>()
  // The measured element, for turning a pointer position into a move. The
  // hook hands back its setter rather than the node, so keep the node here.
  const wrap = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  if (scores.length < 2) return null

  const values = clampScores(scores)
  // A mate is scored far past the window, so say when the edge is a ceiling.
  const capped = scores.some((score) => Math.abs(score) > CAP)
  const n = values.length
  const { top, step } = windowFor(Math.max(100, ...values.map(Math.abs)))

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (i / (n - 1)) * plotW
  const y = (value: number) => PAD.top + plotH * (0.5 - value / (2 * top))

  // One curve through every score. A score is a position, not a wall: the
  // line runs from move to move instead of stepping down a square each time,
  // with the control points held inside the plot so a mate spike cannot throw
  // the curve out over the axis.
  const points = values.map((value, i) => ({ x: x(i), y: y(value) }))
  const trace = smoothPath(points, PAD.top, PAD.top + plotH)
  const area = `${trace} V${y(0)} H${x(0)} Z`

  // The gridlines, and the labels at the ends of the window.
  const gridlines: number[] = []
  for (let v = -top; v <= top; v += step) gridlines.push(v)

  const moveIndexAt = (clientX: number) => {
    const element = wrap.current
    if (!element) return null
    const rect = element.getBoundingClientRect()
    if (rect.width <= PAD.left + PAD.right) return null
    const at = (clientX - rect.left - PAD.left) / plotW
    return Math.max(0, Math.min(n - 1, Math.round(at * (n - 1))))
  }

  const readout = hover ?? current ?? null
  const shown = readout === null ? null : values[readout]

  return (
    <div className="space-y-1">
      <div
        ref={(element) => {
          wrap.current = element
          setWrap(element)
        }}
        className={cn('relative w-full select-none', onPick && 'cursor-pointer')}
        style={{ height: HEIGHT }}
        role="img"
        aria-label={`How ${variantName} went, move by move: a score after every move, from the first army's point of view.`}
        onPointerMove={(event) => setHover(moveIndexAt(event.clientX))}
        onPointerLeave={() => setHover(null)}
        onClick={(event) => {
          const move = moveIndexAt(event.clientX)
          if (move !== null) onPick?.(move)
        }}
      >
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            className="pointer-events-none absolute inset-0 overflow-visible"
          >
            {gridlines.map((value) => (
              <line
                key={value}
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={Math.round(y(value)) + 0.5}
                y2={Math.round(y(value)) + 0.5}
                stroke="var(--border)"
                strokeWidth={1}
              />
            ))}

            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={Math.round(y(0)) + 0.5}
              y2={Math.round(y(0)) + 0.5}
              stroke="var(--foreground)"
              strokeOpacity={0.22}
              strokeWidth={1}
            />

            <path d={area} fill="var(--foreground)" fillOpacity={0.06} stroke="none" />
            <path
              d={trace}
              fill="none"
              stroke="var(--foreground)"
              strokeOpacity={0.78}
              strokeWidth={1.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* The move the board is on: a hairline through the plot, and the
                score itself as a small brass square on the trace. */}
            {current != null && current < n && (
              <g>
                <line
                  x1={Math.round(x(current)) + 0.5}
                  x2={Math.round(x(current)) + 0.5}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke="var(--signal)"
                  strokeOpacity={0.45}
                  strokeWidth={1}
                />
                <rect
                  x={x(current) - 2}
                  y={y(values[current]) - 2}
                  width={4}
                  height={4}
                  fill="var(--signal)"
                  stroke="var(--card)"
                  strokeWidth={1}
                />
              </g>
            )}

            {/* Scrubbing: a hairline on the move under the pointer. */}
            {hover != null && (
              <line
                x1={Math.round(x(hover)) + 0.5}
                x2={Math.round(x(hover)) + 0.5}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--foreground)"
                strokeOpacity={0.28}
                strokeWidth={1}
              />
            )}

            {[-top, 0, top].map((value) => (
              <text
                key={value}
                x={PAD.left - 7}
                y={y(value) + 3}
                textAnchor="end"
                fontFamily="var(--font-mono)"
                fontSize={9}
                fill="var(--muted-foreground)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatScore(value)}
              </text>
            ))}

            {[0, Math.round((n - 1) / 2), n - 1]
              .filter((value, index, all) => all.indexOf(value) === index)
              .map((value) => (
                <text
                  key={value}
                  x={x(value)}
                  y={HEIGHT - 5}
                  textAnchor={value === 0 ? 'start' : value === n - 1 ? 'end' : 'middle'}
                  fontFamily="var(--font-mono)"
                  fontSize={9}
                  fill="var(--muted-foreground)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {value}
                </text>
              ))}
          </svg>
        )}
      </div>

      <div className="text-muted-foreground flex items-baseline justify-between gap-2 font-mono text-[9px] tracking-[0.12em] uppercase">
        <span className="tabular-nums">
          {shown === null ? 'score, pawns' : `move ${readout} · ${formatScore(shown)}`}
        </span>
        {capped && <span className="shrink-0">±{CAP / 100} max</span>}
      </div>
    </div>
  )
}
