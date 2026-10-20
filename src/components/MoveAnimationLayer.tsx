import type { CSSProperties } from 'react'
import type { PieceType } from '@/engine/types'
import type { Flight, MoveAnim } from '@/lib/moveAnimation'
import { PieceGlyph } from './PieceGlyph'

const FLIGHT_CLASS: Record<Flight['kind'], string> = {
  slide: 'piece-fly',
  vanish: 'piece-vanish',
  emerge: 'piece-emerge',
}

/**
 * Draws the flying pieces above the board. Rendered inside the board grid so
 * the square coordinates line up with the cells.
 */
export function MoveAnimationLayer({
  anim,
  cell,
  cols,
  rows,
  flip,
  rotation,
  pieceTypes,
  teamIndex,
}: {
  anim: MoveAnim | null
  cell: number
  cols: number
  rows: number
  flip: boolean
  rotation: number
  pieceTypes: Record<string, PieceType>
  teamIndex: (teamId: string) => number
}) {
  if (!anim) return null
  const size = Math.round(cell * 0.78)
  const left = (x: number) => (flip ? cols - 1 - x : x) * cell
  const top = (y: number) => (flip ? rows - 1 - y : y) * cell
  const spin = rotation ? `rotate(${rotation}deg)` : undefined

  return (
    <div key={anim.id} className="pointer-events-none absolute inset-0 z-30">
      {anim.dissolves.map((d) => {
        const type = pieceTypes[d.typeId]
        if (!type) return null
        return (
          <span
            key={d.key}
            className="piece-dissolve absolute flex items-center justify-center"
            style={
              {
                left: left(d.at.x),
                top: top(d.at.y),
                width: cell,
                height: cell,
                '--dissolve-delay': `${d.delay}ms`,
                '--dissolve-duration': `${d.duration}ms`,
              } as CSSProperties
            }
          >
            <span className="inline-flex" style={{ transform: spin }}>
              <PieceGlyph piece={type} teamIndex={teamIndex(d.team)} size={size} />
            </span>
          </span>
        )
      })}

      {anim.pops.map((p) => {
        const type = pieceTypes[p.typeId]
        if (!type) return null
        return (
          <span
            key={p.key}
            className="piece-pop absolute flex items-center justify-center"
            style={
              {
                left: left(p.at.x),
                top: top(p.at.y),
                width: cell,
                height: cell,
                '--pop-delay': `${p.delay}ms`,
              } as CSSProperties
            }
          >
            <span className="inline-flex" style={{ transform: spin }}>
              <PieceGlyph piece={type} teamIndex={teamIndex(p.team)} size={size} />
            </span>
          </span>
        )
      })}

      {anim.flights.map((f) => {
        const type = pieceTypes[f.typeId]
        if (!type) return null
        return (
          <span
            key={f.key}
            className={`${FLIGHT_CLASS[f.kind]} absolute`}
            style={
              {
                left: left(f.from.x),
                top: top(f.from.y),
                width: cell,
                height: cell,
                '--fly-dx': `${(f.to.x - f.from.x) * cell * (flip ? -1 : 1)}px`,
                '--fly-dy': `${(f.to.y - f.from.y) * cell * (flip ? -1 : 1)}px`,
                '--fly-duration': `${f.duration}ms`,
                '--fly-delay': `${f.delay}ms`,
              } as CSSProperties
            }
          >
            <span
              className={
                f.kind === 'slide'
                  ? 'piece-lift flex h-full w-full items-center justify-center'
                  : 'flex h-full w-full items-center justify-center'
              }
            >
              <span className="inline-flex" style={{ transform: spin }}>
                <PieceGlyph piece={type} teamIndex={teamIndex(f.team)} size={size} />
              </span>
            </span>
          </span>
        )
      })}
    </div>
  )
}
