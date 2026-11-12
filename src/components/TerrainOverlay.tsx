import type { Terrain } from '@/engine/types'

/**
 * The look of a square's terrain — one place that knows how walls, holes and
 * portals are drawn, whether the square is on a board or in a legend.
 */

const OVERLAY: Partial<Record<Terrain, string>> = {
  wall: 'bg-foreground/25 [background-image:repeating-linear-gradient(45deg,transparent_0_5px,rgba(0,0,0,0.25)_5px_7px)]',
  void: 'bg-black/75',
  portal: 'bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.55),rgba(56,189,248,0.12)_60%,transparent_72%)]',
  oneway: 'bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.55),rgba(56,189,248,0.12)_60%,transparent_72%)]',
}

/** The square-sized wash a board square wears. */
export function TerrainOverlay({ terrain }: { terrain: Terrain | undefined }) {
  const style = terrain ? OVERLAY[terrain] : undefined
  if (!style) return null
  return <span className={`absolute inset-0 ${style}`} />
}

const SWATCH: Record<Terrain, string> = {
  normal:
    'border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:6px_6px]',
  wall: 'border bg-[repeating-linear-gradient(45deg,transparent_0_2px,rgba(0,0,0,0.35)_2px_4px)]',
  void: 'border bg-black',
  portal: 'bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.9),rgba(56,189,248,0.15))]',
  oneway: 'bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.9),rgba(56,189,248,0.15))]',
}

/** The legend-sized sample next to a terrain's name. */
export function TerrainSwatch({
  terrain,
  className = '',
  children,
}: {
  terrain: Terrain
  className?: string
  children?: React.ReactNode
}) {
  return (
    <span className={`inline-block size-3 shrink-0 rounded-sm ${SWATCH[terrain]} ${className}`} aria-hidden>
      {children}
    </span>
  )
}
