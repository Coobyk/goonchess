import { useEffect, useRef } from 'react'
import { drawDitheredGraph, type GraphPoint } from '@/lib/dither'
import { useAppStore } from '@/store/useAppStore'

/**
 * The graph of a game.
 *
 * It shows how the position stood after every move, drawn in dithered pixels:
 * the same ordered checker a pixel artist would use, so the denser parts of
 * the graph get more ink. The first army's side of the graph is the bottom
 * half, and the line runs down the middle when the game is level.
 */
export function AnalysisGraph({
  scores,
  variantName,
}: {
  /** The score after every move, from the first army's point of view. */
  scores: number[]
  variantName: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const theme = useAppStore((s) => s.theme)

  useEffect(() => {
    const element = canvas.current
    if (!element || !scores.length) return
    const points: GraphPoint[] = scores.map((score, i) => ({
      at: scores.length === 1 ? 0 : i / (scores.length - 1),
      // A pawn is a long way; anything past that is mate.
      value: 0.5 + Math.max(-0.48, Math.min(0.48, score / 100 / 20)),
    }))
    const dark = theme === 'dark'
    drawDitheredGraph(element, points, {
      ink: dark ? '#e7e5e4' : '#27272a',
      paper: dark ? '#1c1c22' : '#f4f1ea',
      edge: dark ? '#fbbf24' : '#b45309',
      dot: 2,
    })
  }, [scores, theme])

  return (
    <div className="space-y-1">
      <canvas
        ref={canvas}
        className="h-28 w-full rounded-md border"
        style={{ imageRendering: 'pixelated' }}
        aria-label={`A graph of how ${variantName} went`}
      />
      <p className="text-muted-foreground flex justify-between text-[10px]">
        <span>start</span>
        <span>the first army is the lower half</span>
        <span>{scores.length ? `move ${scores.length}` : ''}</span>
      </p>
    </div>
  )
}
