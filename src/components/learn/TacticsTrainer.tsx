import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ExternalLink,
  Eye,
  Flame,
  Lightbulb,
  Loader2,
  Puzzle as PuzzleIcon,
  Repeat,
  RotateCcw,
  SkipForward,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { useBotWorker } from '@/lib/bot'
import { loadPuzzleStats, savePuzzleStats } from '@/lib/persist'
import { playSound } from '@/lib/sound'
import { boardCellSize, useElementWidth } from '@/lib/boardMetrics'
import {
  applyMove,
  createInitialState,
  getLegalMoves,
  isInCheck,
  rollRandomPieces,
  squareName,
} from '@/engine/rules'
import { type GameState, type Move, type PieceType, type Terrain, type Vec } from '@/engine/types'
import { cn } from '@/lib/utils'
import { BoardShell, tileBackground } from '../BoardShell'
import { TerrainOverlay } from '../TerrainOverlay'
import { PieceGlyph } from '../PieceGlyph'
import { TurningPiece } from '../TurningPiece'
import { Spin } from '../Spin'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Switch } from '../ui/switch'

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'Easy',
  medium: 'Tricky',
  hard: 'Hard',
}

const THEME_LABEL: Record<string, string> = {
  capture: 'Capture',
  fork: 'Fork',
  check: 'Check',
  promotion: 'Promotion',
  'big-capture': 'Big piece',
}

type TrainerStatus = 'unsolved' | 'solved' | 'wrong' | 'revealed'

interface ActivePuzzle {
  from: Vec
  to: Vec
  promotionTypeId?: string
  side: string
  gain: number
  difficulty: string
  themes: string[]
  start: GameState
}

function sameSquare(a: Vec, b: Vec) {
  return a.x === b.x && a.y === b.y
}

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

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [])

  if (!options.length) return null

  const glyph = Math.max(16, Math.min(40, Math.round(cell * 0.56)))
  const chipPad = Math.max(2, Math.round(cell * 0.035))
  const linePad = Math.max(3, Math.round(cell * 0.05))
  const gap = Math.max(2, Math.round(cell * 0.045))
  const chip = glyph + chipPad * 2 + 2
  const width = options.length * chip + (options.length - 1) * gap + linePad * 2 + 2
  const lift = Math.max(6, Math.round(cell * 0.1))
  const dx = flipBoard ? cols - 1 - move.finalTo.x : move.finalTo.x
  const dy = flipBoard ? rows - 1 - move.finalTo.y : move.finalTo.y
  const center = Math.min(
    Math.max((dx + 0.5) * cell, width / 2 + 4),
    cols * cell - width / 2 - 4,
  )
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
      className="border-border bg-popover text-popover-foreground pointer-events-auto absolute z-50 flex items-center rounded-lg border shadow-lg"
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
              'focus-visible:ring-ring grid place-items-center rounded-[3px] border transition-colors outline-none focus-visible:ring-2',
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

const TERRAIN_LABEL: Partial<Record<Terrain, string>> = {
  wall: 'wall',
  void: 'void',
  portal: 'portal',
  oneway: 'one-way portal',
}

function describeSquare(
  variant: GameState['variant'],
  x: number,
  y: number,
  piece: { team: string } | null,
  pieceType: { name: string } | null,
  terrain?: Terrain,
) {
  const name = squareName(variant, x, y)
  const terrainText = terrain ? TERRAIN_LABEL[terrain] : undefined
  const parts = [name]
  if (terrainText) parts.push(terrainText)
  if (!piece || !pieceType) {
    parts.push('empty')
    return parts.join(', ')
  }
  const team = variant.teams.find((t) => t.id === piece.team)
  parts.push(`${team?.name ?? piece.team} ${pieceType.name}`.replace(/\s+/g, ' '))
  return parts.join(', ')
}

export function TacticsTrainer({ className }: { className?: string }) {
  const variant = useAppStore((s) => s.variant)
  const soundEnabled = useAppStore((s) => s.soundEnabled)
  const loadPosition = useAppStore((s) => s.loadPosition)
  const setPuzzle = useAppStore((s) => s.setPuzzle)
  const setPuzzleStart = useAppStore((s) => s.setPuzzleStart)
  const setView = useAppStore((s) => s.setView)
  const client = useBotWorker()

  const [container, width] = useElementWidth<HTMLDivElement>()
  const [active, setActive] = useState<ActivePuzzle | null>(null)
  const [position, setPosition] = useState<GameState | null>(null)
  const [status, setStatus] = useState<TrainerStatus>('unsolved')
  const [selected, setSelected] = useState<Vec | null>(null)
  const [legalMoves, setLegalMoves] = useState<Move[]>([])
  const [pendingPromotion, setPendingPromotion] = useState<Move | null>(null)
  const [hint, setHint] = useState(false)
  const [lastAttempt, setLastAttempt] = useState<{ from: Vec; to: Vec } | null>(null)
  const [busy, setBusy] = useState(false)
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null)
  const [stats, setStats] = useState(loadPuzzleStats)
  const [streakMode, setStreakMode] = useState(false)

  const streakModeRef = useRef(streakMode)
  const autoDealRef = useRef<number | null>(null)
  const requestSeq = useRef(0)
  const variantRef = useRef(variant.id)
  const arrowId = useId().replace(/:/g, '')

  const clearAutoDeal = useCallback(() => {
    if (autoDealRef.current === null) return
    window.clearTimeout(autoDealRef.current)
    autoDealRef.current = null
  }, [])

  useEffect(() => () => clearAutoDeal(), [clearAutoDeal])

  useEffect(() => {
    streakModeRef.current = streakMode
    if (!streakMode) clearAutoDeal()
  }, [streakMode, clearAutoDeal])

  useEffect(() => {
    if (variantRef.current === variant.id) return
    variantRef.current = variant.id
    requestSeq.current += 1
    clearAutoDeal()
    setActive(null)
    setPosition(null)
    setStatus('unsolved')
    setSelected(null)
    setLegalMoves([])
    setPendingPromotion(null)
    setHint(false)
    setLastAttempt(null)
    setBusy(false)
    setEmptyMessage(null)
  }, [variant.id, clearAutoDeal])

  const loadPuzzle = useCallback(async () => {
    clearAutoDeal()
    const request = ++requestSeq.current
    const requestedVariant = variant
    setBusy(true)
    setEmptyMessage(null)
    try {
      const result = await client.findPuzzle(requestedVariant, Math.floor(Math.random() * 1e9))
      if (requestSeq.current !== request) return
      if (!result.puzzle) {
        const message = 'No puzzle could be found in this variant. Try dealing again or switch variant.'
        setEmptyMessage(message)
        toast.error('No puzzle could be found in this variant.')
        return
      }
      const found = result.puzzle
      setActive({
        from: found.from,
        to: found.to,
        promotionTypeId: found.promotionTypeId,
        side: found.side,
        gain: found.gain,
        difficulty: found.difficulty,
        themes: found.themes,
        start: found.state,
      })
      setPosition(found.state)
      setStatus('unsolved')
      setSelected(null)
      setLegalMoves([])
      setPendingPromotion(null)
      setHint(false)
      setLastAttempt(null)
    } finally {
      if (requestSeq.current === request) setBusy(false)
    }
  }, [clearAutoDeal, client, variant])

  useEffect(() => {
    if (!active || status !== 'solved' || !streakMode) return
    clearAutoDeal()
    autoDealRef.current = window.setTimeout(() => {
      autoDealRef.current = null
      if (streakModeRef.current) void loadPuzzle()
    }, 1100)
    return clearAutoDeal
  }, [active, status, streakMode, loadPuzzle, clearAutoDeal])

  const recordAnswer = useCallback((right: boolean) => {
    setStats((current) => {
      const streak = right ? current.streak + 1 : 0
      const next = {
        streak,
        best: Math.max(current.best, streak),
      }
      savePuzzleStats(next)
      return next
    })
  }, [])

  const finishMove = useCallback(
    (move: Move, promotionTypeId?: string) => {
      if (!active || !position || status !== 'unsolved') return
      const next = applyMove(position, { ...move, promotionTypeId }, { san: true })
      const settled = rollRandomPieces(next, move.pieceId)
      const right =
        move.from.x === active.from.x &&
        move.from.y === active.from.y &&
        move.finalTo.x === active.to.x &&
        move.finalTo.y === active.to.y &&
        (!active.promotionTypeId || promotionTypeId === active.promotionTypeId)

      setPosition(settled)
      setSelected(null)
      setLegalMoves([])
      setPendingPromotion(null)
      setHint(false)
      setLastAttempt({ from: { ...move.from }, to: { ...move.finalTo } })
      setStatus(right ? 'solved' : 'wrong')
      recordAnswer(right)
      if (soundEnabled) {
        playSound(move.capturedId ? 'capture' : 'move')
        if (right) playSound('win')
      }
    },
    [active, position, status, recordAnswer, soundEnabled],
  )

  const handleSquareClick = useCallback(
    (x: number, y: number) => {
      if (!active || !position || status !== 'unsolved' || pendingPromotion) return
      if (position.turn !== active.side) return

      if (selected) {
        const move = legalMoves.find((m) => m.finalTo.x === x && m.finalTo.y === y)
        if (move) {
          const options = move.promotionOptions ?? []
          if (options.length > 1) {
            setPendingPromotion(move)
            setSelected(null)
            setLegalMoves([])
            return
          }
          finishMove(move, options[0])
          return
        }
      }

      const pieceId = position.board[y]?.[x]
      if (pieceId) {
        const inst = position.pieces[pieceId]
        if (inst && inst.team === active.side && inst.team === position.turn) {
          setSelected({ x, y })
          setLegalMoves(getLegalMoves(position, x, y))
          setPendingPromotion(null)
          return
        }
      }

      setSelected(null)
      setLegalMoves([])
      setPendingPromotion(null)
    },
    [active, position, status, pendingPromotion, selected, legalMoves, finishMove],
  )

  const tryAgain = useCallback(() => {
    if (!active) return
    setPosition(active.start)
    setStatus('unsolved')
    setSelected(null)
    setLegalMoves([])
    setPendingPromotion(null)
    setHint(false)
    setLastAttempt(null)
  }, [active])

  const showHint = useCallback(() => {
    if (!active || status === 'solved' || status === 'revealed') return
    if (status === 'wrong') {
      setPosition(active.start)
      setStatus('unsolved')
      setSelected(null)
      setLegalMoves([])
      setPendingPromotion(null)
      setLastAttempt(null)
    }
    setHint(true)
  }, [active, status])

  const showAnswer = useCallback(() => {
    if (!active || status === 'solved' || status === 'revealed') return
    clearAutoDeal()
    recordAnswer(false)
    setPosition(active.start)
    setStatus('revealed')
    setSelected(null)
    setLegalMoves([])
    setPendingPromotion(null)
    setHint(false)
    setLastAttempt(null)
  }, [active, status, clearAutoDeal, recordAnswer])

  const openOnPlayBoard = useCallback(() => {
    if (!active) return
    clearAutoDeal()
    setPuzzle(null)
    setPuzzleStart(null)
    loadPosition(active.start)
    setView('play')
  }, [active, clearAutoDeal, setPuzzle, setPuzzleStart, loadPosition, setView])

  const previewState = useMemo(() => createInitialState(variant), [variant])
  const displayState = position ?? previewState
  const boardVariant = displayState.variant
  const cols = boardVariant.board.width
  const rows = boardVariant.board.height
  const cell = boardCellSize(width, cols, 58, 22)
  const flipBoard = active ? variant.teams.findIndex((team) => team.id === active.side) === 1 : false
  const spinning = !!boardVariant.rules?.includes('spinning')
  const turning = !!boardVariant.rules?.includes('turning')
  const interactive = !!active && status === 'unsolved' && !pendingPromotion && position?.turn === active.side

  const teamIndex = useCallback(
    (teamId: string) => boardVariant.teams.findIndex((team) => team.id === teamId),
    [boardVariant],
  )

  const checkedRoyals = useMemo(() => {
    const set = new Set<string>()
    if (!isInCheck(displayState, displayState.turn)) return set
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const id = displayState.board[y]?.[x]
        if (!id) continue
        const inst = displayState.pieces[id]
        if (!inst || inst.team !== displayState.turn) continue
        if (displayState.pieceTypes[inst.typeId]?.flags.royal) set.add(`${x},${y}`)
      }
    }
    return set
  }, [displayState, rows, cols])

  const sideTeam = active ? variant.teams.find((team) => team.id === active.side) : undefined
  const solutionFrom = active ? squareName(boardVariant, active.from.x, active.from.y) : ''
  const solutionTo = active ? squareName(boardVariant, active.to.x, active.to.y) : ''

  const boardOverlay = (
    <>
      {Array.from({ length: rows }, (_, y) =>
        Array.from({ length: cols }, (_, x) => {
          const moves = legalMoves.filter((m) => m.finalTo.x === x && m.finalTo.y === y)
          if (!moves.length) return null
          const captures = moves.some((m) => !!m.capturedId)
          return (
            <span
              key={`move-${x},${y}`}
              className="pointer-events-none absolute z-40 flex items-center justify-center"
              style={{
                left: (flipBoard ? cols - 1 - x : x) * cell,
                top: (flipBoard ? rows - 1 - y : y) * cell,
                width: cell,
                height: cell,
              }}
            >
              {captures ? (
                <span className="absolute inset-[8%] rounded-sm ring-[3px] ring-inset ring-rose-500/70" />
              ) : (
                <span className="size-1/4 min-h-2 min-w-2 rounded-full bg-black/40 ring-2 ring-white/80" />
              )}
            </span>
          )
        }),
      )}
      {active && status === 'revealed' && (
        <svg
          className="pointer-events-none absolute inset-0 z-30"
          width={cols * cell}
          height={rows * cell}
          viewBox={`0 0 ${cols * cell} ${rows * cell}`}
          aria-hidden
        >
          <defs>
            <marker id={arrowId} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" fill="rgb(52 211 153)" />
            </marker>
          </defs>
          <line
            x1={((flipBoard ? cols - 1 - active.from.x : active.from.x) + 0.5) * cell}
            y1={((flipBoard ? rows - 1 - active.from.y : active.from.y) + 0.5) * cell}
            x2={((flipBoard ? cols - 1 - active.to.x : active.to.x) + 0.5) * cell}
            y2={((flipBoard ? rows - 1 - active.to.y : active.to.y) + 0.5) * cell}
            stroke="rgb(52 211 153)"
            strokeWidth={Math.max(2, cell * 0.055)}
            strokeLinecap="round"
            opacity="0.72"
            markerEnd={`url(#${arrowId})`}
          />
        </svg>
      )}
      {pendingPromotion && (
        <PromotionPicker
          move={pendingPromotion}
          cell={cell}
          cols={cols}
          rows={rows}
          flipBoard={flipBoard}
          teamIndex={active ? teamIndex(active.side) : 0}
          pieceTypes={displayState.pieceTypes}
          onChoose={(typeId) => finishMove(pendingPromotion, typeId)}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </>
  )

  return (
    <section className={cn('grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start', className)}>
      <div ref={container} className="flex min-w-0 justify-center overflow-x-auto pb-1">
        <div className="relative">
          <BoardShell
            width={cols}
            height={rows}
            cellSize={cell}
            flip={flipBoard}
            allowOverflow={boardVariant.pieceTypes.some((piece) => (piece.lives ?? 1) > 1)}
            overlay={boardOverlay}
            ariaLabel={active ? 'Interactive tactics puzzle board' : `${variant.name} starting position preview`}
            className={cn(!active && 'opacity-55 saturate-[0.65]')}
          >
            {Array.from({ length: rows }, (_, dy) =>
              Array.from({ length: cols }, (_, dx) => {
                const x = flipBoard ? cols - 1 - dx : dx
                const y = flipBoard ? rows - 1 - dy : dy
                const tile = boardVariant.board.tiles[y]?.[x]
                const pieceId = displayState.board[y]?.[x]
                const piece = pieceId ? displayState.pieces[pieceId] : null
                const pieceType = piece ? displayState.pieceTypes[piece.typeId] : null
                const isSelected = selected?.x === x && selected?.y === y
                const inCheck = checkedRoyals.has(`${x},${y}`)
                const isHinted =
                  !!active && hint && status === 'unsolved' && sameSquare(active.from, { x, y })
                const isSolution =
                  !!active &&
                  status === 'revealed' &&
                  (sameSquare(active.from, { x, y }) || sameSquare(active.to, { x, y }))
                const isAttempt =
                  !!lastAttempt &&
                  (status === 'solved' || status === 'wrong') &&
                  (sameSquare(lastAttempt.from, { x, y }) || sameSquare(lastAttempt.to, { x, y }))

                return (
                  <button
                    key={`${x}-${y}`}
                    type="button"
                    role="gridcell"
                    aria-label={describeSquare(boardVariant, x, y, piece, pieceType, tile?.terrain)}
                    aria-selected={isSelected}
                    disabled={!interactive}
                    onClick={() => handleSquareClick(x, y)}
                    className={cn(
                      'relative flex items-center justify-center p-0 outline-none transition-[filter]',
                      interactive ? 'cursor-pointer hover:brightness-105' : 'cursor-default',
                      'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                    style={{ backgroundColor: tileBackground(x, y) }}
                  >
                    <TerrainOverlay terrain={tile?.terrain} />

                    {isAttempt && (
                      <span
                        className={cn(
                          'absolute inset-0 z-[6]',
                          status === 'solved' ? 'bg-emerald-400/30' : 'bg-rose-500/30',
                        )}
                      />
                    )}
                    {isSolution && <span className="absolute inset-0 z-[6] bg-emerald-400/25" />}

                    {piece && pieceType && (
                      <span
                        className={cn('relative z-10 inline-flex', isSelected && 'piece-selected z-20')}
                        key={`${piece.id}-${piece.lives ?? 1}`}
                      >
                        <TurningPiece orientation={turning ? piece.orientation ?? 0 : 0}>
                          <Spin on={spinning}>
                            <PieceGlyph
                              piece={pieceType}
                              lives={piece.lives}
                              staggered={piece.staggered}
                              teamIndex={teamIndex(piece.team)}
                              size={Math.round(cell * 0.78)}
                              muted={!active}
                            />
                          </Spin>
                        </TurningPiece>
                      </span>
                    )}

                    {isSelected && (
                      <span className="pointer-events-none absolute inset-0 z-20 ring-2 ring-inset ring-primary" />
                    )}
                    {isHinted && (
                      <span className="pointer-events-none absolute inset-[5%] z-20 animate-pulse rounded-sm ring-4 ring-inset ring-amber-400/90" />
                    )}
                    {isSolution && (
                      <span className="pointer-events-none absolute inset-0 z-20 ring-2 ring-inset ring-primary/80" />
                    )}
                    {isAttempt && (
                      <span
                        className={cn(
                          'pointer-events-none absolute inset-0 z-20 ring-2 ring-inset',
                          status === 'solved' ? 'ring-emerald-400/90' : 'ring-rose-500/90',
                        )}
                      />
                    )}
                    {inCheck && (
                      <span className="pointer-events-none absolute inset-0 z-30 ring-2 ring-inset ring-rose-500" />
                    )}
                  </button>
                )
              }),
            )}
          </BoardShell>

          {!active && (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-4">
              <div className="bg-background/95 pointer-events-auto w-full max-w-64 rounded-xl border p-4 text-center shadow-xl backdrop-blur">
                <div className="bg-primary/10 text-primary mx-auto mb-3 flex size-10 items-center justify-center rounded-full">
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <PuzzleIcon className="size-5" />}
                </div>
                <h3 className="text-sm font-semibold">Deal a tactic</h3>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  Solve a generated position right here on the board.
                </p>
                <Button size="sm" className="mt-3 w-full" onClick={loadPuzzle} disabled={busy}>
                  {busy ? 'Looking for a tactic…' : 'Deal a tactic'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Card className="h-fit py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <PuzzleIcon className="text-muted-foreground size-4" />
              Tactics trainer
              {busy && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
            </span>
            <span className="flex items-center gap-2 text-xs">
              {stats.streak > 0 && (
                <span className={cn('flex items-center gap-1 font-medium', stats.streak >= 5 ? 'text-amber-500' : 'text-foreground')}>
                  <Flame className="size-3.5" /> {stats.streak}
                </span>
              )}
              {stats.best > 0 && <span className="text-muted-foreground">best {stats.best}</span>}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 text-sm">
          {active ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span
                    className="border-border size-2.5 rounded-full border"
                    style={{ backgroundColor: sideTeam?.color ?? 'currentColor' }}
                  />
                  {(sideTeam?.name ?? active.side)} to move
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    active.difficulty === 'hard' && 'border-rose-500/40 text-rose-500',
                    active.difficulty === 'medium' && 'border-amber-500/40 text-amber-500',
                    active.difficulty === 'easy' && 'border-emerald-500/40 text-emerald-600',
                  )}
                >
                  {DIFFICULTY_LABEL[active.difficulty] ?? active.difficulty}
                </Badge>
                {active.themes.map((theme) => (
                  <Badge key={theme} variant="secondary" className="text-muted-foreground text-[10px]">
                    {THEME_LABEL[theme] ?? theme}
                  </Badge>
                ))}
              </div>

              <div
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs leading-5',
                  status === 'unsolved' && 'border-border bg-muted/40 text-muted-foreground',
                  status === 'solved' && 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
                  status === 'wrong' && 'border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-300',
                  status === 'revealed' && 'border-border bg-muted/50 text-muted-foreground',
                )}
              >
                {status === 'unsolved' && 'Find the move that wins material.'}
                {status === 'solved' && `Solved! Wins +${(active.gain / 100).toFixed(1)} pts of material.`}
                {status === 'wrong' && 'Not the strongest move — try again or peek at a hint.'}
                {status === 'revealed' && `Solution: ${solutionFrom} → ${solutionTo}`}
              </div>

              {emptyMessage && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
                  {emptyMessage}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={status === 'solved' || status === 'revealed' ? 'default' : 'secondary'}
                  onClick={loadPuzzle}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <SkipForward />}
                  Next puzzle
                </Button>
                {(status === 'unsolved' || status === 'wrong') && (!hint || status === 'wrong') && (
                  <Button size="sm" variant="secondary" onClick={showHint} disabled={busy}>
                    <Lightbulb /> Hint
                  </Button>
                )}
                {(status === 'wrong' || (status === 'unsolved' && hint)) && (
                  <Button size="sm" variant="secondary" onClick={showAnswer} disabled={busy}>
                    <Eye /> Show answer
                  </Button>
                )}
                {status === 'wrong' && (
                  <Button size="sm" variant="secondary" onClick={tryAgain} disabled={busy}>
                    <RotateCcw /> Try again
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={openOnPlayBoard} disabled={busy}>
                  <ExternalLink /> Open on Play board
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground text-xs leading-5">
                Positions are taken from games the bot played against itself. Find the capture that
                wins material without leaving the Learn page.
              </p>
              {emptyMessage && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-300">
                  {emptyMessage}
                </p>
              )}
              <Button size="sm" variant="secondary" onClick={loadPuzzle} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <PuzzleIcon />}
                Deal a tactic
              </Button>
            </>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Repeat className="text-muted-foreground size-3.5" /> Streak mode
            </span>
            <Switch
              aria-label="Streak mode: automatically deal the next puzzle"
              checked={streakMode}
              onCheckedChange={setStreakMode}
            />
          </div>
          {streakMode && (
            <p className="text-muted-foreground -mt-2 text-[10px] leading-4">
              Solving deals the next puzzle automatically. A miss resets the streak.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
