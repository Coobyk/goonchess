import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function BoardShell({
  width,
  height,
  cellSize,
  children,
  className,
  showLabels = true,
  flip = false,
  overlay,
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
}) {
  const ranks = Array.from({ length: height }, (_, i) => (flip ? i + 1 : height - i))
  const files = Array.from({ length: width }, (_, i) =>
    String.fromCharCode(97 + (flip ? width - 1 - i : i)),
  )

  return (
    <div className={cn('inline-flex select-none flex-col', className)}>
      <div className="flex">
        {showLabels && (
          <div
            className="text-muted-foreground flex flex-col items-end pr-1.5 font-mono text-[10px]"
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
          className="board-grid-shadow grid relative overflow-hidden rounded-lg"
          style={{
            gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
          }}
        >
          {children}
          {overlay}
        </div>
        {showLabels && (
          <div
            className="text-muted-foreground flex flex-col pl-1.5 font-mono text-[10px]"
            style={{ height: height * cellSize }}
          >
            {ranks.map((r) => (
              <span key={r} className="flex flex-1 items-center">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
      {showLabels && (
        <div className="flex">
          <div className="w-4" />
          <div
            className="text-muted-foreground grid pt-1 text-center font-mono text-[10px]"
            style={{ gridTemplateColumns: `repeat(${width}, ${cellSize}px)` }}
          >
            {files.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function tileBackground({
  light,
  dark,
  x,
  y,
}: {
  light: string
  dark: string
  x: number
  y: number
}) {
  return (x + y) % 2 === 0 ? light : dark
}
