import { useMemo, useState } from 'react'
import { BoardShell, tileBackground } from './BoardShell'
import { PieceGlyph, boardCellSize, useElementWidth } from './PieceGlyph'
import { useAppStore } from '@/store/useAppStore'
import { getLegalMoves, isInCheck } from '@/engine/rules'
import type { Move } from '@/engine/types'
import { cn } from '@/lib/utils'

export function GameBoard() {
  const game = useAppStore((s) => s.game)
  const selected = useAppStore((s) => s.selected)
  const legalMoves = useAppStore((s) => s.legalMoves)
  const selectSquare = useAppStore((s) => s.selectSquare)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [container, width] = useElementWidth<HTMLDivElement>()

  const { variant, board, pieceTypes, turn } = game
  const { width: cols, height: rows } = variant.board
  const cell = boardCellSize(width, cols, 64, 24)

  const lastMove = game.moveHistory[game.moveHistory.length - 1]?.move

  const hoverMoves: Move[] = useMemo(() => {
    if (selected || !hover || game.winner) return []
    const id = board[hover.y]?.[hover.x]
    if (!id) return []
    const inst = game.pieces[id]
    if (!inst || inst.team !== turn) return []
    return getLegalMoves(game, hover.x, hover.y)
  }, [selected, hover, game, board, turn])

  const checkedRoyals = useMemo(() => {
    const set = new Set<string>()
    if (!isInCheck(game, turn)) return set
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const id = board[y][x]
        if (!id) continue
        const inst = game.pieces[id]
        if (!inst || inst.team !== turn) continue
        if (pieceTypes[inst.typeId]?.flags.royal) set.add(`${x},${y}`)
      }
    }
    return set
  }, [game, board, pieceTypes, turn, rows, cols])

  const teamIndex = (id: string) => variant.teams.findIndex((t) => t.id === id)

  return (
    <div ref={container} className="w-full">
      <BoardShell width={cols} height={rows} cellSize={cell}>
        {Array.from({ length: rows }, (_, y) =>
          Array.from({ length: cols }, (_, x) => {
            const tile = variant.board.tiles[y]?.[x]
            const pieceId = board[y][x]
            const piece = pieceId ? game.pieces[pieceId] : null
            const pieceType = piece ? pieceTypes[piece.typeId] : null
            const isSelected = selected?.x === x && selected?.y === y
            const dest = legalMoves.filter((m) => m.finalTo.x === x && m.finalTo.y === y)
            const hoverDest = hoverMoves.filter((m) => m.finalTo.x === x && m.finalTo.y === y)
            const captures = [...dest, ...hoverDest].some((m) => !!m.capturedId)
            const hasDest = dest.length > 0 || hoverDest.length > 0
            const isLast =
              !!lastMove &&
              ((lastMove.from.x === x && lastMove.from.y === y) ||
                (lastMove.finalTo.x === x && lastMove.finalTo.y === y))
            const inCheck = checkedRoyals.has(`${x},${y}`)

            return (
              <button
                key={`${x}-${y}`}
                type="button"
                onClick={() => selectSquare(x, y)}
                onMouseEnter={() => setHover({ x, y })}
                onMouseLeave={() => setHover(null)}
                className={cn(
                  'relative flex cursor-pointer items-center justify-center p-0 transition-[filter] outline-none',
                  'hover:brightness-105 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring',
                )}
                style={{ backgroundColor: tileBackground({ ...variant.board, x, y }) }}
              >
                {isLast && <span className="absolute inset-0 bg-amber-400/25" />}
                {tile?.terrain === 'wall' && (
                  <span className="absolute inset-0 bg-foreground/25 [background-image:repeating-linear-gradient(45deg,transparent_0_5px,rgba(0,0,0,0.25)_5px_7px)]" />
                )}
                {tile?.terrain === 'void' && <span className="absolute inset-0 bg-black/75" />}
                {(tile?.terrain === 'portal' || tile?.terrain === 'oneway') && (
                  <span
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at center, rgba(56,189,248,0.55), rgba(56,189,248,0.12) 60%, transparent 72%)',
                    }}
                  />
                )}

                {piece && pieceType && (
                  <span className="relative z-10">
                    <PieceGlyph piece={pieceType} teamIndex={teamIndex(piece.team)} size={Math.round(cell * 0.78)} />
                  </span>
                )}

                {hasDest && !captures && (
                  <span className="absolute z-20 size-1/4 min-h-2 min-w-2 rounded-full bg-black/40 ring-1 ring-white/20" />
                )}
                {hasDest && captures && (
                  <span className="absolute inset-[8%] z-20 rounded-sm ring-[3px] ring-inset ring-rose-500/70" />
                )}
                {isSelected && (
                  <span className="absolute inset-0 z-20 ring-2 ring-inset ring-amber-400" />
                )}
                {inCheck && <span className="absolute inset-0 z-20 ring-2 ring-inset ring-rose-500" />}
              </button>
            )
          }),
        )}
      </BoardShell>
    </div>
  )
}
