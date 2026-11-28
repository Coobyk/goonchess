import { useMemo } from 'react'
import type { PieceType, Variant } from '@/engine/types'
import { computePatternPreview, type SquareMark } from '@/lib/learnCopy'
import { cn } from '@/lib/utils'
import { tileBackground } from '../BoardShell'
import { PieceGlyph } from '../PieceGlyph'
import { TurningPiece } from '../TurningPiece'

function PatternMark({ mark }: { mark: SquareMark }) {
  if (mark === 'blast') {
    return <span className="absolute inset-0 bg-primary/10 ring-1 ring-inset ring-primary/30" />
  }
  if (mark === 'spawn') {
    return (
      <span className="absolute inset-[16%] rounded-[3px] border border-dashed border-emerald-600/80 bg-emerald-400/15 dark:border-emerald-300/80">
        <span className="absolute left-1/2 top-1/2 h-px w-3/5 -translate-x-1/2 -translate-y-1/2 bg-emerald-600 dark:bg-emerald-300" />
        <span className="absolute left-1/2 top-1/2 h-3/5 w-px -translate-x-1/2 -translate-y-1/2 bg-emerald-600 dark:bg-emerald-300" />
      </span>
    )
  }
  if (mark === 'capture') {
    return <span className="absolute inset-[12%] rounded-[4px] ring-2 ring-inset ring-rose-500/75" />
  }
  if (mark === 'both') {
    return (
      <>
        <span className="absolute inset-[13%] rounded-[4px] ring-2 ring-inset ring-rose-500/65" />
        <span className="absolute left-1/2 top-1/2 size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 ring-1 ring-white/85" />
      </>
    )
  }
  if (mark === 'first-only') {
    return (
      <span className="absolute left-1/2 top-1/2 size-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/90 ring-2 ring-amber-950/25 dark:ring-amber-100/35" />
    )
  }
  return (
    <span className="absolute left-1/2 top-1/2 size-[24%] min-h-1 min-w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/45 ring-1 ring-white/85" />
  )
}

export function PieceDiagram({
  variant,
  piece,
  teamIndex = 0,
  orientation = 0,
  size = 7,
  cellSize = 18,
  className,
}: {
  variant: Variant
  piece: PieceType
  teamIndex?: number
  orientation?: number
  size?: number
  cellSize?: number
  className?: string
}) {
  const preview = useMemo(
    () => computePatternPreview(variant, piece, { size, teamIndex, orientation }),
    [variant, piece, size, teamIndex, orientation],
  )
  const cells = []
  for (let y = 0; y < preview.size; y++) {
    for (let x = 0; x < preview.size; x++) cells.push({ x, y })
  }

  return (
    <div
      role="img"
      aria-label={`${piece.name} movement diagram`}
      className={cn(
        'relative shrink-0 overflow-hidden rounded-md border border-black/20 shadow-sm dark:border-white/15',
        className,
      )}
      style={{ width: preview.size * cellSize, height: preview.size * cellSize }}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${preview.size}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${preview.size}, ${cellSize}px)`,
        }}
      >
        {cells.map(({ x, y }) => {
          const mark = preview.marks[`${x},${y}`]
          const center = x === preview.center.x && y === preview.center.y
          return (
            <span
              key={`${x},${y}`}
              className="relative"
              style={{ backgroundColor: tileBackground(x, y) }}
            >
              {mark && <PatternMark mark={mark} />}
              {center && <span className="absolute inset-[7%] rounded-[4px] ring-1 ring-inset ring-black/20 dark:ring-white/25" />}
            </span>
          )
        })}
      </div>
      <span
        className="pointer-events-none absolute z-10 flex items-center justify-center"
        style={{
          left: preview.center.x * cellSize,
          top: preview.center.y * cellSize,
          width: cellSize,
          height: cellSize,
        }}
      >
        <TurningPiece orientation={orientation}>
          <PieceGlyph piece={piece} teamIndex={teamIndex} size={Math.max(10, Math.round(cellSize * 0.82))} />
        </TurningPiece>
      </span>
    </div>
  )
}
