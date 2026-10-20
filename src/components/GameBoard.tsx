import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { BoardShell, tileBackground } from './BoardShell'
import { PieceGlyph, boardCellSize, useElementWidth } from './PieceGlyph'
import { MoveAnimationLayer } from './MoveAnimationLayer'
import { useAppStore } from '@/store/useAppStore'
import { getLegalMoves, isInCheck } from '@/engine/rules'
import { computeThreats, mergeThreats } from '@/engine/threats'
import type { Move } from '@/engine/types'
import { BLAST_STAGGER, useMoveAnimation } from '@/lib/moveAnimation'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'

const BLAST_DURATION = 620
const SPARK_ANGLES = [0, 60, 120, 180, 240, 300]

function BlastOverlay({
  distance,
  radius,
  cell,
  baseDelay,
}: {
  distance: number
  radius: number
  cell: number
  baseDelay: number
}) {
  // Surrounding squares get a staggered ember flash so the blast reads as a wave.
  if (distance !== 0) {
    return (
      <span
        className="blast-cell pointer-events-none absolute inset-0 z-40"
        style={
          {
            '--blast-delay': `${baseDelay + distance * BLAST_STAGGER}ms`,
            background:
              'radial-gradient(circle, rgba(253,186,116,0.45), rgba(249,115,22,0.2) 60%, transparent 82%)',
          } as CSSProperties
        }
      />
    )
  }

  // The centre renders one continuous blast sized to the whole radius.
  const size = (radius * 2 + 1) * cell
  return (
    <span
      className="pointer-events-none absolute top-1/2 left-1/2 z-40"
      style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
    >
      <span
        className="blast-core absolute inset-0 rounded-full"
        style={
          {
            '--blast-delay': `${baseDelay}ms`,
            background:
              'radial-gradient(circle, rgba(255,247,224,0.92), rgba(253,186,116,0.72) 22%, rgba(249,115,22,0.32) 48%, transparent 64%)',
          } as CSSProperties
        }
      />
      <span
        className="blast-ring absolute inset-[4%] rounded-full border-[3px] border-amber-200/80"
        style={{ '--blast-delay': `${baseDelay}ms` } as CSSProperties}
      />
      {SPARK_ANGLES.map((angle) => (
        <span
          key={angle}
          className="blast-spark absolute top-1/2 left-1/2 origin-bottom rounded-full bg-amber-100"
          style={
            {
              height: Math.round(cell * 1.1),
              width: 3,
              '--spark-angle': `${angle}deg`,
              '--blast-delay': `${baseDelay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}

export function GameBoard() {
  const game = useAppStore((s) => s.game)
  const selected = useAppStore((s) => s.selected)
  const legalMoves = useAppStore((s) => s.legalMoves)
  const selectSquare = useAppStore((s) => s.selectSquare)
  const threatSettings = useAppStore((s) => s.threats)
  const turnView = useAppStore((s) => s.turnView)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [container, width] = useElementWidth<HTMLDivElement>()

  const { variant, board, pieceTypes, turn } = game
  const { width: cols, height: rows } = variant.board
  const cell = boardCellSize(width, cols, 64, 24)

  const [drag, setDrag] = useState<{ pieceId: string; clientX: number; clientY: number } | null>(null)
  const dragRef = useRef<{
    pointerId: number
    grid: HTMLElement
    startX: number
    startY: number
    pieceId: string
    moved: boolean
  } | null>(null)
  const suppressClickUntil = useRef(0)

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, x: number, y: number) => {
    if (e.button !== 0 || game.winner) return
    const pieceId = board[y]?.[x]
    const inst = pieceId ? game.pieces[pieceId] : undefined
    if (!pieceId || !inst || inst.team !== turn) return
    const grid = e.currentTarget.parentElement
    if (!grid) return
    selectSquare(x, y)
    dragRef.current = {
      pointerId: e.pointerId,
      grid,
      startX: e.clientX,
      startY: e.clientY,
      pieceId,
      moved: false,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer capture is best-effort */
    }
  }

  const moveDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragRef.current
    if (!dragState || dragState.pointerId !== e.pointerId) return
    if (!dragState.moved) {
      if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) < 5) return
      dragState.moved = true
    }
    setDrag({ pieceId: dragState.pieceId, clientX: e.clientX, clientY: e.clientY })
  }

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragRef.current
    if (!dragState || dragState.pointerId !== e.pointerId) return
    dragRef.current = null
    setDrag(null)
    if (!dragState.moved) return

    // The click that follows a drag must not be treated as a fresh square click.
    suppressClickUntil.current = performance.now() + 150

    const rect = dragState.grid.getBoundingClientRect()
    const rawX = Math.floor((e.clientX - rect.left) / cell)
    const rawY = Math.floor((e.clientY - rect.top) / cell)
    if (rawX >= 0 && rawY >= 0 && rawX < cols && rawY < rows) {
      selectSquare(flipBoard ? cols - 1 - rawX : rawX, flipBoard ? rows - 1 - rawY : rawY)
    }
  }

  const cancelDrag = () => {
    dragRef.current = null
    setDrag(null)
  }

  const draggingId = drag?.pieceId

  const threats = useMemo(() => {
    if (!threatSettings.show) return null
    const teams =
      threatSettings.scope === 'both'
        ? variant.teams.map((team) => team.id)
        : [turn]
    return mergeThreats(teams.map((team) => computeThreats(game, team)))
  }, [game, turn, variant.teams, threatSettings.show, threatSettings.scope])

  const lastRecord = game.moveHistory[game.moveHistory.length - 1]
  const lastMove = lastRecord?.move
  const historyLen = game.moveHistory.length

  // Pieces glide from where they were to where they landed.
  const { anim, duration: moveDuration } = useMoveAnimation(game)
  const hiddenPieces = useMemo(() => {
    const ids = new Set<string>()
    for (const f of anim?.flights ?? []) ids.add(f.pieceId)
    for (const p of anim?.pops ?? []) ids.add(p.pieceId)
    return ids
  }, [anim])

  // Flip the view or rotate the pieces only after the move animation lands.
  const sideIndex = variant.teams.findIndex((team) => team.id === turn)
  const targetOrientation = turnView !== 'off' && sideIndex % 2 === 1 ? 1 : 0
  const [orientation, setOrientation] = useState(targetOrientation)
  useEffect(() => {
    if (orientation === targetOrientation) return
    const timer = window.setTimeout(() => setOrientation(targetOrientation), moveDuration + 120)
    return () => window.clearTimeout(timer)
  }, [orientation, targetOrientation, moveDuration])
  const flipBoard = turnView === 'board' && orientation === 1
  const rotatePieces = turnView === 'pieces' && orientation === 1

  // Play a blast animation when a *new* move sets off an explosion (not on undo).
  const [blast, setBlast] = useState<{ id: number; x: number; y: number; radius: number } | null>(null)
  const blastSeq = useRef(0)
  const prevHistoryLen = useRef(historyLen)
  const blastSource = lastRecord?.blasts?.[0]

  // Sound the latest move. A capture, check or promotion gets its own accent.
  const prevSoundLen = useRef(historyLen)
  useEffect(() => {
    const grew = historyLen > prevSoundLen.current
    prevSoundLen.current = historyLen
    if (!grew || !lastRecord) return
    const move = lastRecord.move
    if (move.promotionTypeId) playSound('promote')
    else if (!game.winner && isInCheck(game, game.turn)) playSound('check')
    else if (move.capturedId) playSound('capture')
    else playSound('move')
  }, [historyLen, lastRecord, game])

  useEffect(() => {
    const grew = historyLen > prevHistoryLen.current
    prevHistoryLen.current = historyLen
    if (!grew || !blastSource) {
      setBlast(null)
      return
    }
    blastSeq.current += 1
    setBlast({
      id: blastSeq.current,
      x: blastSource.x,
      y: blastSource.y,
      radius: blastSource.radius,
    })
    // The shockwave only fires once the moving piece has landed.
    const soundTimer = window.setTimeout(() => playSound('explosion'), moveDuration)
    const timer = window.setTimeout(
      () => setBlast(null),
      BLAST_DURATION + blastSource.radius * BLAST_STAGGER + 120 + moveDuration,
    )
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(soundTimer)
    }
  }, [historyLen, blastSource, moveDuration])


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
      <BoardShell
        width={cols}
        height={rows}
        cellSize={cell}
        flip={flipBoard}
        overlay={
          <MoveAnimationLayer
            anim={anim}
            cell={cell}
            cols={cols}
            rows={rows}
            flip={flipBoard}
            rotation={rotatePieces ? 180 : 0}
            pieceTypes={pieceTypes}
            teamIndex={teamIndex}
          />
        }
      >
        {Array.from({ length: rows }, (_, dy) =>
          Array.from({ length: cols }, (_, dx) => {
            const x = flipBoard ? cols - 1 - dx : dx
            const y = flipBoard ? rows - 1 - dy : dy
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
            const blastDistance = blast
              ? Math.max(Math.abs(x - blast.x), Math.abs(y - blast.y))
              : -1
            const inBlast = !!blast && blastDistance <= blast.radius
            const pieceThreat = pieceId && threats ? threats.pieces.get(pieceId) : undefined
            const covered =
              !!threats && threatSettings.coverage && threats.coverage.has(`${x},${y}`)

            return (
              <button
                key={`${x}-${y}`}
                type="button"
                onClick={() => {
                  if (suppressClickUntil.current) {
                    const blocked = performance.now() < suppressClickUntil.current
                    suppressClickUntil.current = 0
                    if (blocked) return
                  }
                  selectSquare(x, y)
                }}
                onPointerDown={(e) => startDrag(e, x, y)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={cancelDrag}
                onMouseEnter={() => setHover({ x, y })}
                onMouseLeave={() => setHover(null)}
                className={cn(
                  'relative flex cursor-pointer items-center justify-center p-0 transition-[filter] outline-none touch-none',
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

                {covered && (
                  <span className="threat-coverage pointer-events-none absolute inset-0 z-[5]" />
                )}

                {piece && pieceType && !hiddenPieces.has(piece.id) && piece.id !== draggingId && (
                  <span
                    className={cn(
                      'relative z-10 inline-flex',
                      isSelected && 'piece-selected z-20',
                    )}
                  >
                    <span
                      className="inline-flex"
                      style={{
                        transform: rotatePieces ? 'rotate(180deg)' : undefined,
                        transition: 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    >
                      <PieceGlyph piece={pieceType} teamIndex={teamIndex(piece.team)} size={Math.round(cell * 0.78)} />
                    </span>
                  </span>
                )}

                {inBlast && (
                  <BlastOverlay
                    key={blast!.id}
                    distance={blastDistance}
                    radius={blast!.radius}
                    cell={cell}
                    baseDelay={moveDuration}
                  />
                )}

                {hasDest && !captures && (
                  <span className="absolute z-20 size-1/4 min-h-2 min-w-2 rounded-full bg-black/40 ring-1 ring-white/20" />
                )}
                {hasDest && captures && (
                  <span className="absolute inset-[8%] z-20 rounded-sm ring-[3px] ring-inset ring-rose-500/70" />
                )}
                {pieceThreat && !pieceThreat.defended && threatSettings.hanging && (
                  <span className="threat-hanging pointer-events-none absolute inset-[7%] z-20 rounded-sm border-2 border-dashed border-rose-400/90" />
                )}
                {pieceThreat?.defended && threatSettings.defended && (
                  <span className="pointer-events-none absolute inset-[10%] z-20 rounded-sm border-2 border-amber-300/75" />
                )}
                {inCheck && <span className="absolute inset-0 z-20 ring-2 ring-inset ring-rose-500" />}
              </button>
            )
          }),
        )}
      </BoardShell>

      {drag && (() => {
        const inst = game.pieces[drag.pieceId]
        const type = inst ? pieceTypes[inst.typeId] : null
        if (!inst || !type) return null
        return (
          <div
            className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2"
            style={{ left: drag.clientX, top: drag.clientY }}
          >
            <span className="piece-dragging inline-flex drop-shadow-2xl">
              <span
                className="inline-flex"
                style={{ transform: rotatePieces ? 'rotate(180deg)' : undefined }}
              >
                <PieceGlyph
                  piece={type}
                  teamIndex={teamIndex(inst.team)}
                  size={Math.round(cell * 0.86)}
                />
              </span>
            </span>
          </div>
        )
      })()}
    </div>
  )
}
