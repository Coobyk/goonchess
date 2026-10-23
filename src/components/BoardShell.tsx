import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The board, mounted in its frame.
 *
 * The frame is the one place the interface allows a shadow: the board is the
 * object on the desk, everything else lies flat on the page.
 */
export function BoardShell({
  width,
  height,
  cellSize,
  children,
  className,
  showLabels = true,
  flip = false,
  overlay,
  ariaLabel = 'Board',
}: {
  width: number
  height: number
  cellSize: number
  children: ReactNode
  className?: string
  showLabels?: boolean
  /** Show the board from the other side: ranks and files count backwards. */
  flip?: boolean
  /** Drawn on top of the squares, aligned to the grid. */
  overlay?: ReactNode
  /** What a screen reader hears when it reaches the board. */
  ariaLabel?: string
}) {
  const ranks = Array.from({ length: height }, (_, i) => (flip ? i + 1 : height - i))
  const files = Array.from({ length: width }, (_, i) =>
    String.fromCharCode(97 + (flip ? width - 1 - i : i)),
  )

  return (
    <div className={cn('inline-flex select-none flex-col', className)}>
      <div className="board-frame rounded-[4px] p-2 sm:p-2.5">
        <div className="flex">
          {showLabels && (
            <div
              className="text-muted-foreground/70 flex w-4 flex-col items-end pr-1 font-mono text-[9px] leading-none"
              style={{ height: height * cellSize }}
            >
              {ranks.map((r) => (
                <span key={r} className="flex flex-1 items-center">
                  {r}
                </span>
              ))}
            </div>
          )}
          <div
            className="board-grid-shadow relative grid overflow-hidden"
            role="grid"
            aria-label={ariaLabel}
            style={{
              gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
            }}
          >
            {children}
            {overlay}
          </div>
        </div>
        {showLabels && (
          <div className="flex pt-1.5">
            <div className="w-4" />
            <div
              className="text-muted-foreground/70 grid text-center font-mono text-[9px] leading-none"
              style={{ gridTemplateColumns: `repeat(${width}, ${cellSize}px)` }}
            >
              {files.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function tileBackground(x: number, y: number) {
  return (x + y) % 2 === 0 ? 'var(--board-light)' : 'var(--board-dark)'
}
