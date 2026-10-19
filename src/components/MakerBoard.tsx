import { useState } from 'react'
import { BoardShell, tileBackground } from './BoardShell'
import { PieceGlyph, boardCellSize, useElementWidth } from './PieceGlyph'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

export const PIECE_DRAG_TYPE = 'application/x-goonchess-piece'

export function MakerBoard({ interactive = true }: { interactive?: boolean }) {
  const variant = useAppStore((s) => s.variant)
  const brush = useAppStore((s) => s.brush)
  const portalPending = useAppStore((s) => s.portalPending)
  const selectedPieceTypeId = useAppStore((s) => s.selectedPieceTypeId)
  const paintTerrain = useAppStore((s) => s.paintTerrain)
  const linkPortal = useAppStore((s) => s.linkPortal)
  const placePiece = useAppStore((s) => s.placePiece)
  const eraseSquare = useAppStore((s) => s.eraseSquare)
  const setPortalPending = useAppStore((s) => s.setPortalPending)
  const [container, width] = useElementWidth<HTMLDivElement>()
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const { width: cols, height: rows } = variant.board
  const cell = boardCellSize(width, cols, 60, 22)

  const setupAt = (x: number, y: number) => variant.setup.find((s) => s.x === x && s.y === y)
  const pieceType = (id?: string) => variant.pieceTypes.find((p) => p.id === id)
  const teamIndex = (id: string) => variant.teams.findIndex((t) => t.id === id)

  const handleClick = (x: number, y: number) => {
    if (!interactive) return
    if (brush.mode === 'erase') {
      eraseSquare(x, y)
      return
    }
    if (brush.mode === 'piece') {
      if (brush.typeId) placePiece(brush.typeId, brush.team, x, y)
      return
    }
    if (brush.terrain === 'portal' || brush.terrain === 'oneway') {
      if (!portalPending) {
        setPortalPending({ x, y })
        return
      }
      if (portalPending.x === x && portalPending.y === y) {
        setPortalPending(null)
        return
      }
      linkPortal(portalPending, { x, y }, brush.terrain === 'oneway')
      return
    }
    paintTerrain(x, y, brush.terrain)
  }

  return (
    <div ref={container} className="w-full">
      <BoardShell width={cols} height={rows} cellSize={cell}>
        {Array.from({ length: rows }, (_, y) =>
          Array.from({ length: cols }, (_, x) => {
            const tile = variant.board.tiles[y]?.[x]
            const occupant = setupAt(x, y)
            const pt = pieceType(occupant?.typeId)
            const isPending = portalPending?.x === x && portalPending?.y === y
            const isDropTarget = dropTarget === `${x},${y}`
            const highlighted = !!pt && pt.id === selectedPieceTypeId && brush.mode === 'terrain'

            return (
              <button
                key={`${x}-${y}`}
                type="button"
                onClick={() => handleClick(x, y)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (interactive) eraseSquare(x, y)
                }}
                onDragOver={(e) => {
                  if (!interactive) return
                  e.preventDefault()
                  setDropTarget(`${x},${y}`)
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => {
                  if (!interactive) return
                  e.preventDefault()
                  setDropTarget(null)
                  const raw = e.dataTransfer.getData(PIECE_DRAG_TYPE)
                  if (!raw) return
                  try {
                    const data = JSON.parse(raw) as { typeId: string; team: string }
                    if (data.typeId) placePiece(data.typeId, data.team, x, y)
                  } catch {
                    /* ignore malformed drags */
                  }
                }}
                className={cn(
                  'relative flex items-center justify-center p-0 outline-none',
                  interactive && 'cursor-pointer hover:brightness-105',
                )}
                style={{ backgroundColor: tileBackground({ ...variant.board, x, y }) }}
              >
                {tile?.terrain === 'wall' && (
                  <span className="absolute inset-0 bg-foreground/25 [background-image:repeating-linear-gradient(45deg,transparent_0_5px,rgba(0,0,0,0.25)_5px_7px)]" />
                )}
                {tile?.terrain === 'void' && <span className="absolute inset-0 bg-black/75" />}
                {(tile?.terrain === 'portal' || tile?.terrain === 'oneway') && (
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.55),rgba(56,189,248,0.12)_60%,transparent_72%)]" />
                )}
                {tile?.terrain === 'oneway' && (
                  <span className="absolute left-0.5 top-0.5 z-10 font-mono text-[9px] text-cyan-200">1→</span>
                )}

                {pt && occupant && (
                  <span className="relative z-10">
                    <PieceGlyph piece={pt} teamIndex={teamIndex(occupant.team)} size={Math.round(cell * 0.8)} />
                  </span>
                )}

                {highlighted && (
                  <span className="absolute inset-0 z-20 rounded-sm ring-2 ring-inset ring-sky-400/80" />
                )}
                {isPending && (
                  <span className="absolute inset-0 z-20 animate-pulse ring-2 ring-inset ring-amber-400" />
                )}
                {isDropTarget && (
                  <span className="absolute inset-0 z-20 bg-sky-400/25 ring-2 ring-inset ring-sky-400" />
                )}
              </button>
            )
          }),
        )}
      </BoardShell>
    </div>
  )
}
