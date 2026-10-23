import { useRef } from 'react'
import { Area } from '@/components/dither-kit/area'
import { AreaChart } from '@/components/dither-kit/area-chart'
import { Grid } from '@/components/dither-kit/grid'
import { ReferenceLine } from '@/components/dither-kit/reference-line'
import { XAxis } from '@/components/dither-kit/x-axis'
import { YAxis } from '@/components/dither-kit/y-axis'

const MARGINS = { top: 8, right: 10, bottom: 18, left: 32 }

/** A score past this is the search saying the game is won, not an advantage. */

/**
 * The scores, kept inside a window.
 *
 * A forced mate is scored in the tens of thousands of points, so the last few
 * moves of a game would otherwise flatten everything before them into a line
 * at zero. The window is as wide as the advantage the game actually reached,
 * and never narrower than ten pawns; anything past it is drawn along the edge,
 * which is where a mate belongs.
 */
function clampScores(scores: number[]) {
  const cap = 1000
  return {
    cap,
    values: scores.map((score) => Math.max(-cap, Math.min(cap, score))),
  }
}

/**
 * The graph of a game.
 *
 * It shows how the position stood after every move. The first army's side of
 * the graph is the bottom half, the line in the middle is a level game, and
 * the picture is drawn in dithered pixels by the Dither Kit — the same engine
 * the areas, bars and sparkles on its site use.
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
  const wrap = useRef<HTMLDivElement>(null)
  if (!scores.length) return null
  const { cap, values } = clampScores(scores)
  const rows = values.map((score, i) => ({ move: i, score }))

  /** The move under the pointer, from where it was clicked. */
  const moveAt = (clientX: number) => {
    const element = wrap.current
    if (!element) return null
    const rect = element.getBoundingClientRect()
    const plot = rect.width - MARGINS.left - MARGINS.right
    if (plot <= 0) return null
    const at = (clientX - rect.left - MARGINS.left) / plot
    const index = Math.round(at * (rows.length - 1))
    return Math.max(0, Math.min(index, rows.length - 1))
  }

  return (
    <div ref={wrap} className="space-y-1" aria-label={`A graph of how ${variantName} went`}>
      <div
        className={onPick ? 'cursor-pointer' : undefined}
        onClick={(event) => {
          const move = moveAt(event.clientX)
          if (move !== null) onPick?.(move)
        }}
      >
        <AreaChart
          data={rows}
          config={{ score: { label: 'Evaluation', color: 'green' } }}
          className="h-28 w-full"
          margins={MARGINS}
          markerIndex={current ?? null}
        >
          <Grid />
          <ReferenceLine y={0} />
          <Area dataKey="score" />
          <XAxis dataKey="move" />
          <YAxis tickFormatter={(value) => (value / 100).toFixed(1)} />
        </AreaChart>
      </div>
      <p className="text-muted-foreground flex justify-between text-[10px]">
        <span>start</span>
        <span>evaluation in pawns, clamped to ±{cap / 100}</span>
        <span>move {scores.length - 1}</span>
      </p>
    </div>
  )
}
