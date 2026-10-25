import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { BoardShell, tileBackground } from './BoardShell'
import { PieceGlyph, boardCellSize, useElementWidth } from './PieceGlyph'
import { EvalBar } from './EvalBar'
import { MoveAnimationLayer } from './MoveAnimationLayer'
import { ThreatArrows } from './ThreatArrows'
import { useAppStore } from '@/store/useAppStore'
import { getLegalMoves, isInCheck } from '@/engine/rules'
import { computeThreats, mergeThreats } from '@/engine/threats'
import type { Move, PieceType, Vec } from '@/engine/types'
import { BLAST_STAGGER, travelMs, useMoveAnimation } from '@/lib/moveAnimation'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'

const BLAST_DURATION = 620
const SPARK_ANGLES = [0, 60, 120, 180, 240, 300]
/**
 * How far a pointer has to travel before it counts as a drag. A pencil never
 * lands perfectly still, so a small threshold turns every tap into a drag — and
 * a drag swallows the click that should have played the move.
 */
const DRAG_THRESHOLD = 12

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

/**
 * The promotion choice, opened as a short line of icons right above the piece
 * that is promoting. The pieces are shown, not named, so it reads in one look.
 */
function PromotionPicker({
  move,
  cell,
  cols,
  rows,
  flipBoard,
  teamIndex,
  pieceTypes,
  onChoose,
  onCancel,
}: {
  move: Move
  cell: number
  cols: number
  rows: number
  flipBoard: boolean
  teamIndex: number
  pieceTypes: Record<string, PieceType>
  onChoose: (typeId: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const options = (move.promotionOptions ?? []).filter((id) => pieceTypes[id])

  // Opened away from the board squares, so it takes the keyboard with it.
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])

  if (!options.length) return null

  // Sized off the square, so the pieces stay readable at any board size.
  const glyph = Math.max(16, Math.min(44, Math.round(cell * 0.6)))
  const chipPad = Math.max(2, Math.round(cell * 0.035))
  const linePad = Math.max(3, Math.round(cell * 0.05))
  const gap = Math.max(2, Math.round(cell * 0.045))
  // Each button is the glyph plus its padding and border; the line adds the
  // gaps, its own padding and its border. The sum keeps the line on the board.
  const chip = glyph + chipPad * 2 + 2
  const width = options.length * chip + (options.length - 1) * gap + linePad * 2 + 2
  const lift = Math.max(6, Math.round(cell * 0.1))
  // The piece has already walked to the promotion square, so the line opens
  // above that square.
  const dx = flipBoard ? cols - 1 - move.finalTo.x : move.finalTo.x
  const dy = flipBoard ? rows - 1 - move.finalTo.y : move.finalTo.y
  // Keep the line on the board when the piece stands on an edge file.
  const center = Math.min(
    Math.max((dx + 0.5) * cell, width / 2 + 4),
    cols * cell - width / 2 - 4,
  )
  // White pieces sit on a dark bed and black pieces on a light one, so the
  // icons keep their contrast in either theme.
  const chipTone =
    teamIndex === 0
      ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700'
      : 'border-neutral-300 bg-neutral-200 hover:bg-neutral-300'

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Choose a piece to promote to"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        onCancel()
      }}
      className="border-border bg-popover text-popover-foreground pointer-events-auto absolute z-30 flex items-center rounded-lg border shadow-lg"
      style={{
        left: center,
        top: dy * cell - lift,
        transform: 'translate(-50%, -100%)',
        gap,
        padding: linePad,
      }}
    >
      {options.map((typeId) => {
        const type = pieceTypes[typeId]
        return (
          <button
            key={typeId}
            type="button"
            aria-label={`Promote to ${type.name}`}
            title={type.name}
            onClick={() => onChoose(typeId)}
            className={cn(
              'grid place-items-center rounded-[3px] border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              chipTone,
            )}
            style={{ padding: chipPad }}
          >
            <PieceGlyph piece={type} teamIndex={teamIndex} size={glyph} />
          </button>
        )
      })}
    </div>
  )
}

/**
 * A pawn walks to the promotion square first. Only once it has landed does the
 * choice open, above it: the board never shows the piece turning into
 * something at a square it has not reached yet.
 */
function PendingPromotion({
  move,
  origin,
  cell,
  cols,
  rows,
  flipBoard,
  teamIndex,
  pieceType,
  pieceTypes,
  rotatePieces,
  onChoose,
  onCancel,
}: {
  move: Move
  origin?: Vec
  cell: number
  cols: number
  rows: number
  flipBoard: boolean
  teamIndex: number
  pieceType: PieceType
  pieceTypes: Record<string, PieceType>
  rotatePieces: boolean
  onChoose: (typeId: string) => void
  onCancel: () => void
}) {
  const start = origin ?? move.from
  const travel = travelMs(start, move.finalTo)
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setLanded(true), travel)
    return () => window.clearTimeout(timer)
  }, [travel])

  const size = Math.round(cell * 0.78)
  const left = (flipBoard ? cols - 1 - start.x : start.x) * cell
  const top = (flipBoard ? rows - 1 - start.y : start.y) * cell
  const dx = (move.finalTo.x - start.x) * cell * (flipBoard ? -1 : 1)
  const dy = (move.finalTo.y - start.y) * cell * (flipBoard ? -1 : 1)

  return (
    <>
      <span
        className="piece-fly absolute z-20"
        style={
          {
            left,
            top,
            width: cell,
            height: cell,
            '--fly-dx': `${dx}px`,
            '--fly-dy': `${dy}px`,
            '--fly-duration': `${travel}ms`,
          } as CSSProperties
        }
      >
        <span className="piece-lift flex h-full w-full items-center justify-center">
          <span
            className="inline-flex"
            style={{ transform: rotatePieces ? 'rotate(180deg)' : undefined }}
          >
            <PieceGlyph piece={pieceType} teamIndex={teamIndex} size={size} />
          </span>
        </span>
      </span>
      {landed && (
        <PromotionPicker
          move={move}
          cell={cell}
          cols={cols}
          rows={rows}
          flipBoard={flipBoard}
          teamIndex={teamIndex}
          pieceTypes={pieceTypes}
          onChoose={onChoose}
          onCancel={onCancel}
        />
      )}
    </>
  )
}

export function GameBoard() {
  const game = useAppStore((s) => s.game)
  const selected = useAppStore((s) => s.selected)
  const legalMoves = useAppStore((s) => s.legalMoves)
  const selectSquare = useAppStore((s) => s.selectSquare)
  const pendingPromotion = useAppStore((s) => s.pendingPromotion)
  const choosePromotion = useAppStore((s) => s.choosePromotion)
  const cancelPromotion = useAppStore((s) => s.cancelPromotion)
  const analysisMode = useAppStore((s) => s.analysisMode)
  const analysisResult = useAppStore((s) => s.analysisResult)
  const threatSettings = useAppStore((s) => s.threats)
  const turnView = useAppStore((s) => s.turnView)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [container, width] = useElementWidth<HTMLDivElement>()
  // The square the keyboard cursor is on. Arrow keys move it, Enter plays.
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  const { variant, board, pieceTypes, turn } = game
  const { width: cols, height: rows } = variant.board
  const cell = boardCellSize(width, cols, 64, 24)

  // Put the cursor on the board as soon as it exists.
  useEffect(() => {
    setCursor((current) => current ?? { x: 0, y: Math.max(0, rows - 1) })
  }, [rows])

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
    if (e.button !== 0 || !e.isPrimary || game.winner) return
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
      // A pencil never lands perfectly still, so only a real move counts.
      if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) < DRAG_THRESHOLD) return
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
    // The drop point, in board units, so the slide starts under the cursor.
    const dropX = (e.clientX - rect.left) / cell - 0.5
    const dropY = (e.clientY - rect.top) / cell - 0.5
    const origin: Vec = flipBoard
      ? { x: cols - 1 - dropX, y: rows - 1 - dropY }
      : { x: dropX, y: dropY }
    if (rawX >= 0 && rawY >= 0 && rawX < cols && rawY < rows) {
      selectSquare(flipBoard ? cols - 1 - rawX : rawX, flipBoard ? rows - 1 - rawY : rawY, origin)
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

  // Pieces glide from where they were to where they landed. A drag records its
  // release point on the move, so the glide starts under the cursor.
  const { anim, duration: moveDuration } = useMoveAnimation(game)
  const pendingMoverId = pendingPromotion?.move.pieceId
  const pendingMover = pendingMoverId ? game.pieces[pendingMoverId] : null
  const pendingType = pendingMover ? (pieceTypes[pendingMover.typeId] ?? null) : null
  const hiddenPieces = useMemo(() => {
    const ids = new Set<string>()
    for (const f of anim?.flights ?? []) ids.add(f.pieceId)
    for (const p of anim?.pops ?? []) ids.add(p.pieceId)
    // A pawn waiting on its promotion square is drawn travelling to it instead.
    if (pendingMoverId) ids.add(pendingMoverId)
    return ids
  }, [anim, pendingMoverId])

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


  // Pieces glide across the board. While that is happening, a new move waits
  // its turn so the animation is never cut in half.
  const setBoardAnimating = useAppStore((s) => s.setBoardAnimating)
  useEffect(() => {
    setBoardAnimating(!!anim)
  }, [anim, setBoardAnimating])
  useEffect(() => {
    // Leaving the view should not leave a move waiting forever.
    return () => setBoardAnimating(false)
  }, [setBoardAnimating])

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

  // Keyboard: the arrow keys move a cursor over the board, Enter plays a move.
  const moveCursor = (x: number, y: number) => {
    const nx = Math.max(0, Math.min(cols - 1, x))
    const ny = Math.max(0, Math.min(rows - 1, y))
    setCursor({ x: nx, y: ny })
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-square="${nx},${ny}"]`)
        ?.focus({ preventScroll: true })
    })
  }

  const handleKey = (e: ReactKeyboardEvent<HTMLButtonElement>, x: number, y: number) => {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    // The cursor is the origin, so quick key presses keep moving from where
    // the cursor is now rather than from the square that had focus.
    const origin = cursor ?? { x, y }
    const step = steps[e.key]
    if (step) {
      e.preventDefault()
      moveCursor(origin.x + step[0], origin.y + step[1])
      return true
    }
    if (e.key === 'Home') {
      e.preventDefault()
      moveCursor(0, origin.y)
      return true
    }
    if (e.key === 'End') {
      e.preventDefault()
      moveCursor(cols - 1, origin.y)
      return true
    }
    return false
  }

  return (
    <div ref={container} className="relative flex w-full items-stretch justify-center gap-2">
      {(analysisMode === 'engine' || analysisMode === 'computer') && (analysisResult || game.winner) && (
        <EvalBar score={game.winner ? (game.winner === variant.teams[0]?.id ? 1000 : -1000) : (analysisResult?.score ?? 0)} className="absolute left-0 top-0 bottom-0" />
      )}
      <BoardShell
        width={cols}
        height={rows}
        cellSize={cell}
        flip={flipBoard}
        overlay={
          <>
            {threatSettings.show && threatSettings.arrows && threats && (
              <ThreatArrows
                edges={threats.edges}
                cell={cell}
                cols={cols}
                rows={rows}
                flip={flipBoard}
              />
            )}
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
            {pendingPromotion && pendingType && (
              <PendingPromotion
                move={pendingPromotion.move}
                origin={pendingPromotion.origin}
                cell={cell}
                cols={cols}
                rows={rows}
                flipBoard={flipBoard}
                teamIndex={teamIndex(game.turn)}
                pieceType={pendingType}
                pieceTypes={pieceTypes}
                rotatePieces={rotatePieces}
                onChoose={choosePromotion}
                onCancel={cancelPromotion}
              />
            )}
          </>
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
                role="gridcell"
                tabIndex={cursor?.x === x && cursor?.y === y ? 0 : -1}
                aria-label={describeSquare(x, y, piece, pieceType, variant)}
                aria-selected={isSelected}
                data-square={`${x},${y}`}
                onFocus={() => setCursor({ x, y })}
                onKeyDown={(e) => {
                  if (!handleKey(e, x, y)) return
                }}
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
                onPointerLeave={() => setHover(null)}
                className={cn(
                  'relative flex cursor-pointer items-center justify-center p-0 transition-[filter] outline-none touch-none',
                  'hover:brightness-105 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring',
                )}
                style={{ backgroundColor: tileBackground(x, y) }}
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
                      <PieceGlyph
                        piece={pieceType}
                        teamIndex={teamIndex(piece.team)}
                        size={Math.round(cell * 0.78)}
                      />
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

/** "e4, white pawn" — what a screen reader reads for a square. */
function describeSquare(
  x: number,
  y: number,
  piece: { team: string } | null,
  pieceType: { name: string } | null,
  variant: { board: { width: number; height: number }; teams: { id: string; name: string }[] },
) {
  const file = String.fromCharCode(97 + x)
  const rank = variant.board.height - y
  const name = `${file}${rank}`
  if (!piece || !pieceType) return `${name}, empty`
  const team = variant.teams.find((t) => t.id === piece.team)
  return `${name}, ${team?.name ?? piece.team} ${pieceType.name}`.replace(/\s+/g, ' ')
}
