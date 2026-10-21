import { Area } from '@/components/dither-kit/area'
import { AreaChart } from '@/components/dither-kit/area-chart'
import { Grid } from '@/components/dither-kit/grid'
import { ReferenceLine } from '@/components/dither-kit/reference-line'
import { XAxis } from '@/components/dither-kit/x-axis'
import { YAxis } from '@/components/dither-kit/y-axis'

/**
 * The graph of a game.
 *
 * It shows how the position stood after every move. The first army's side of
 * the graph is the bottom half, the line in the middle is a level game, and
 * the picture is drawn in dithered pixels by the Dither Kit — the same engine
 * the areas, bars and sparkles on its site use.
 */
export function AnalysisGraph({
  scores,
  variantName,
}: {
  /** The score after every move, from the first army's point of view. */
  scores: number[]
  variantName: string
}) {
  if (!scores.length) return null
  const rows = scores.map((score, i) => ({ move: i + 1, score }))

  return (
    <div className="space-y-1" aria-label={`A graph of how ${variantName} went`}>
      <AreaChart
        data={rows}
        config={{ score: { label: 'Evaluation', color: 'green' } }}
        className="h-28 w-full"
        margins={{ top: 8, right: 10, bottom: 18, left: 32 }}
      >
        <Grid />
        <ReferenceLine y={0} />
        <Area dataKey="score" />
        <XAxis dataKey="move" />
        <YAxis tickFormatter={(value) => (value / 100).toFixed(1)} />
      </AreaChart>
      <p className="text-muted-foreground flex justify-between text-[10px]">
        <span>start</span>
        <span>the line is the evaluation, in pawns</span>
        <span>move {scores.length}</span>
      </p>
    </div>
  )
}
