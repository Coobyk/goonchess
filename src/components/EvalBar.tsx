import { cn } from '@/lib/utils'

/**
 * The bar beside the board.
 *
 * It shows how the position stands: the taller the light part, the better it
 * is for the first army, and the number in the middle says by how much. It
 * only appears when the analysis is switched on, because it says nothing the
 * analysis does not.
 */
export function EvalBar({
  score,
  className,
}: {
  /** The score in centipawns, from the first army's point of view. */
  score: number
  className?: string
}) {
  const mate = Math.abs(score) > 90_000
  // A pawn is a long way; anything past that is mate.
  const clamped = Math.max(-10, Math.min(10, score / 100))
  // The first army is at the bottom of the board, so it fills from there.
  const share = 50 + clamped * 5
  const label = mate
    ? `M${Math.max(1, Math.ceil((100_000 - Math.abs(score)) / 100))}`
    : `${score >= 0 ? '+' : '−'}${Math.abs(clamped).toFixed(1)}`

  return (
    <div
      className={cn(
        'relative flex h-full w-5 shrink-0 overflow-hidden rounded-full border bg-zinc-800',
        className,
      )}
      title={`${label} for the first army`}
      aria-label={`The position stands at ${label}`}
    >
      {/* The first army's share, filled from the bottom. */}
      <div
        className="absolute inset-x-0 bottom-0 bg-zinc-100 transition-[height] duration-500"
        style={{ height: `${share}%` }}
      />
      <span
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-[10px] leading-none font-semibold tabular-nums mix-blend-difference text-white"
        style={{ writingMode: 'vertical-rl' }}
      >
        {label}
      </span>

    </div>
  )
}
