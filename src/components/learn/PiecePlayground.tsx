import { useMemo, useState } from 'react'
import { Crown, Crosshair, Pencil, RotateCcw, RotateCw, Search, Undo2 } from 'lucide-react'
import { applyMove, cloneState, findPiece, getLegalMoves, rollRandomPieces } from '@/engine/rules'
import { DICE_SIDES, type GameState, type Move, type PieceType, type Variant, type Vec } from '@/engine/types'
import { boardCellSize, useElementWidth } from '@/lib/boardMetrics'
import { buildPieceDemoState, effectText, flagCopy, patternText } from '@/lib/learnCopy'
import { cn } from '@/lib/utils'
import { BoardShell, tileBackground } from '../BoardShell'
import { PieceGlyph } from '../PieceGlyph'
import { Spin } from '../Spin'
import { TurningPiece } from '../TurningPiece'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { PieceDiagram } from './PieceDiagram'

const squareKey = (x: number, y: number) => `${x},${y}`
const normalizeOrientation = (orientation: number) => ((Math.round(orientation) % 8) + 8) % 8

function setupCount(variant: Variant, pieceId: string) {
  return variant.setup.filter((entry) => entry.typeId === pieceId).length
}

function teamIndexOf(variant: Variant, teamId: string) {
  return Math.max(0, variant.teams.findIndex((team) => team.id === teamId))
}

function firstMoveOnlyKeys(state: GameState, pieceId: string, at: Vec, moves: Move[]) {
  const piece = state.pieces[pieceId]
  const type = piece ? state.pieceTypes[piece.typeId] : null
  if (!piece || !type || piece.hasMoved) return new Set<string>()
  if (![...type.move, ...type.capture].some((pattern) => pattern.firstMoveOnly)) return new Set<string>()
  const moved = cloneState(state)
  moved.pieces[pieceId] = { ...moved.pieces[pieceId], hasMoved: true }
  const later = new Set(getLegalMoves(moved, at.x, at.y).map((move) => squareKey(move.finalTo.x, move.finalTo.y)))
  return new Set(
    moves
      .map((move) => squareKey(move.finalTo.x, move.finalTo.y))
      .filter((key) => !later.has(key)),
  )
}

function MoveMarker({ move, firstOnly }: { move: Move; firstOnly: boolean }) {
  if (move.capturedId) {
    return (
      <span className="pointer-events-none absolute inset-[8%] z-30 rounded-sm ring-[3px] ring-inset ring-rose-500/75" />
    )
  }
  if (firstOnly) {
    return (
      <span className="pointer-events-none absolute left-1/2 top-1/2 z-30 size-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/90 ring-2 ring-white/80" />
    )
  }
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2 z-30 size-1/4 min-h-2 min-w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 ring-2 ring-white/80" />
  )
}

function SpawnMarker() {
  return (
    <span className="pointer-events-none absolute inset-[18%] z-20 rounded-[3px] border border-dashed border-emerald-600/75 bg-emerald-400/10 dark:border-emerald-300/80">
      <span className="absolute left-1/2 top-1/2 h-px w-3/5 -translate-x-1/2 -translate-y-1/2 bg-emerald-600 dark:bg-emerald-300" />
      <span className="absolute left-1/2 top-1/2 h-3/5 w-px -translate-x-1/2 -translate-y-1/2 bg-emerald-600 dark:bg-emerald-300" />
    </span>
  )
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block size-2.5 rounded-full', className)} />
      {label}
    </span>
  )
}

function PieceSandbox({
  variant,
  piece,
  teamIndex,
  withTargets,
  onTargetsChange,
  onTeamIndexChange,
}: {
  variant: Variant
  piece: PieceType
  teamIndex: number
  withTargets: boolean
  onTargetsChange: (value: boolean) => void
  onTeamIndexChange: (index: number) => void
}) {
  const [demo, setDemo] = useState(() =>
    buildPieceDemoState(variant, piece, { teamIndex, withTargets, boardSize: 7 }),
  )
  const [pieceSelected, setPieceSelected] = useState(true)
  const [container, containerWidth] = useElementWidth<HTMLDivElement>()
  const { state, pieceId, center } = demo
  const position = findPiece(state, pieceId)
  const demoInstance = state.pieces[pieceId]
  const boardSize = state.variant.board.width
  const cell = boardCellSize(containerWidth, boardSize, 46, 24)
  const turning = !!variant.rules?.includes('turning')
  const spinning = !!variant.rules?.includes('spinning')
  const activeType = demoInstance ? state.pieceTypes[demoInstance.typeId] ?? piece : piece
  const isDice = !!activeType.flags.dice
  const diceRoll = state.roll?.pieceId === pieceId ? state.roll.value : 1
  const orientation = normalizeOrientation(demoInstance?.orientation ?? 0)

  const legalMoves = useMemo(() => {
    if (!pieceSelected || !position) return []
    return getLegalMoves(state, position.x, position.y)
  }, [pieceSelected, position, state])
  const firstOnly = useMemo(
    () => (position ? firstMoveOnlyKeys(state, pieceId, position, legalMoves) : new Set<string>()),
    [state, pieceId, position, legalMoves],
  )
  const moveBySquare = useMemo(() => {
    const map = new Map<string, Move>()
    for (const move of legalMoves) {
      const key = squareKey(move.finalTo.x, move.finalTo.y)
      if (!map.has(key)) map.set(key, move)
    }
    return map
  }, [legalMoves])
  const spawnSquares = useMemo(() => {
    const keys = new Set<string>()
    if (!position) return keys
    for (const effect of piece.effects) {
      if (effect.kind !== 'spawn') continue
      const x = position.x + effect.offset.x
      const y = position.y + effect.offset.y
      if (x >= 0 && y >= 0 && x < boardSize && y < boardSize) keys.add(squareKey(x, y))
    }
    return keys
  }, [piece, position, boardSize])

  const reset = () => {
    setDemo(buildPieceDemoState(variant, piece, { teamIndex, withTargets, boardSize: 7 }))
    setPieceSelected(true)
  }

  const setOrientation = (nextOrientation: number) => {
    const current = state.pieces[pieceId]
    if (!current) return
    const next = cloneState(state)
    next.pieces[pieceId] = { ...current, orientation: normalizeOrientation(nextOrientation) }
    setDemo({ state: next, pieceId, center })
    setPieceSelected(true)
  }

  const setDiceRoll = (value: number) => {
    const next = cloneState(state)
    next.roll = { pieceId, value }
    setDemo({ state: next, pieceId, center })
    setPieceSelected(true)
  }

  const clickSquare = (x: number, y: number) => {
    if (position && x === position.x && y === position.y) {
      setPieceSelected((selected) => !selected)
      return
    }
    const move = moveBySquare.get(squareKey(x, y))
    if (!move) return
    const moved = applyMove(state, move, { compute: false })
    const settled = activeType.flags.random ? rollRandomPieces(moved) : moved
    const demoTeam = state.pieces[pieceId]?.team
    const nextRoll = settled.pieces[pieceId] && isDice ? { pieceId, value: diceRoll } : undefined
    setDemo({ state: { ...settled, turn: demoTeam ?? settled.turn, roll: nextRoll }, pieceId, center })
    setPieceSelected(true)
  }

  const squares = []
  for (let y = 0; y < boardSize; y++) for (let x = 0; x < boardSize; x++) squares.push({ x, y })
  const hasQuiet = legalMoves.some((move) => !move.capturedId)
  const hasCapture = legalMoves.some((move) => !!move.capturedId)
  const hasExplosion = piece.effects.some((effect) => effect.kind === 'explosion')
  const hasSwap = piece.effects.some((effect) => effect.kind === 'swap')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/30 p-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <Switch checked={withTargets} onCheckedChange={onTargetsChange} aria-label="Toggle target pieces" />
          Targets
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">Army</span>
          {variant.teams.map((team, index) => (
            <Button
              key={team.id}
              type="button"
              size="sm"
              variant={index === teamIndex ? 'default' : 'secondary'}
              className="h-7 px-2 text-xs"
              onClick={() => onTeamIndexChange(index)}
            >
              <span className="size-2 rounded-full ring-1 ring-black/20" style={{ backgroundColor: team.color }} />
              {team.name}
            </Button>
          ))}
        </div>
        {turning && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Rotation</span>
            <Button type="button" size="icon-sm" variant="secondary" className="size-7" onClick={() => setOrientation(orientation - 1)} aria-label="Rotate 45 degrees counterclockwise">
              <RotateCcw />
            </Button>
            <span className="min-w-10 text-center font-mono text-xs font-semibold">{orientation * 45}°</span>
            <Button type="button" size="icon-sm" variant="secondary" className="size-7" onClick={() => setOrientation(orientation + 1)} aria-label="Rotate 45 degrees clockwise">
              <RotateCw />
            </Button>
            {[0, 1, 2].map((steps) => (
              <Button
                key={steps}
                type="button"
                size="sm"
                variant={orientation === steps ? 'default' : 'ghost'}
                className="h-7 px-2 font-mono text-[11px]"
                onClick={() => setOrientation(steps)}
              >
                {steps * 45}°
              </Button>
            ))}
          </div>
        )}
        {isDice && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground mr-0.5 text-xs font-medium">Die</span>
            {Array.from({ length: DICE_SIDES }, (_, index) => index + 1).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={diceRoll === value ? 'default' : 'secondary'}
                className="size-7 p-0 font-mono text-xs"
                onClick={() => setDiceRoll(value)}
                aria-label={`Set die roll to ${value}`}
              >
                {value}
              </Button>
            ))}
          </div>
        )}
        <Button type="button" size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={reset}>
          <Undo2 /> Reset
        </Button>
      </div>

      <div ref={container} className="flex w-full justify-center overflow-x-auto py-1">
        <BoardShell
          width={boardSize}
          height={boardSize}
          cellSize={cell}
          showLabels={false}
          ariaLabel={`${piece.name} interactive sandbox`}
        >
          {squares.map(({ x, y }) => {
            const occupantId = state.board[y]?.[x]
            const occupant = occupantId ? state.pieces[occupantId] : null
            const occupantType = occupant ? state.pieceTypes[occupant.typeId] : null
            const move = moveBySquare.get(squareKey(x, y))
            const selected = position?.x === x && position.y === y && pieceSelected
            const isDemoPiece = occupantId === pieceId
            return (
              <button
                key={`${x},${y}`}
                type="button"
                role="gridcell"
                aria-label={isDemoPiece ? `${piece.name}, selected piece` : `Sandbox square ${x + 1}, ${y + 1}`}
                aria-selected={selected}
                className="relative flex cursor-pointer items-center justify-center p-0 outline-none transition-[filter] hover:brightness-105 focus-visible:z-40 focus-visible:ring-2 focus-visible:ring-ring"
                style={{ backgroundColor: tileBackground(x, y) }}
                onClick={() => clickSquare(x, y)}
              >
                {spawnSquares.has(squareKey(x, y)) && <SpawnMarker />}
                {occupant && occupantType && (
                  <span className={cn('relative z-10 inline-flex', selected && 'piece-selected z-20')}>
                    <TurningPiece orientation={occupant.orientation ?? 0}>
                      <Spin on={spinning}>
                        <PieceGlyph
                          piece={occupantType}
                          teamIndex={teamIndexOf(state.variant, occupant.team)}
                          lives={occupant.lives}
                          staggered={occupant.staggered}
                          size={Math.round(cell * 0.78)}
                        />
                      </Spin>
                    </TurningPiece>
                  </span>
                )}
                {move && <MoveMarker move={move} firstOnly={firstOnly.has(squareKey(x, y))} />}
              </button>
            )
          })}
        </BoardShell>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {hasQuiet && <LegendItem className="bg-black/50 ring-1 ring-white/70" label="Move" />}
        {hasCapture && <LegendItem className="rounded-none border-2 border-rose-500/80 bg-transparent" label="Capture" />}
        {firstOnly.size > 0 && <LegendItem className="bg-amber-400" label="First move only" />}
        {spawnSquares.size > 0 && <LegendItem className="rounded-none border border-dashed border-emerald-500 bg-emerald-400/20" label="Spawn square" />}
        {hasExplosion && <LegendItem className="bg-primary/70" label="Explodes after landing" />}
        {hasSwap && <LegendItem className="bg-sky-400" label="Swaps on capture" />}
      </div>
    </div>
  )
}

function flagToneClass(tone: 'amber' | 'rose' | 'sky' | 'default' | undefined) {
  if (tone === 'amber') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (tone === 'rose') return 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
  if (tone === 'sky') return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  return 'border-border bg-muted/40 text-foreground'
}

export function PiecePlayground({
  variant,
  selectedPieceId,
  onSelectPiece,
  onEditPiece,
}: {
  variant: Variant
  selectedPieceId?: string | null
  onSelectPiece?: (pieceId: string) => void
  onEditPiece?: (pieceId: string) => void
}) {
  const fallbackId = variant.pieceTypes[0]?.id ?? null
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(fallbackId)
  const requestedId = selectedPieceId === undefined ? localSelectedId : selectedPieceId
  const selectedId = requestedId && variant.pieceTypes.some((piece) => piece.id === requestedId)
    ? requestedId
    : fallbackId
  const selectedPiece = variant.pieceTypes.find((piece) => piece.id === selectedId) ?? null
  const [teamIndex, setTeamIndex] = useState(0)
  const [withTargets, setWithTargets] = useState(true)
  const [filter, setFilter] = useState('')
  const safeTeamIndex = variant.teams.length ? Math.min(teamIndex, variant.teams.length - 1) : 0

  const filteredPieces = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) return variant.pieceTypes
    return variant.pieceTypes.filter((piece) =>
      `${piece.name} ${piece.icon} ${piece.symbol}`.toLowerCase().includes(query),
    )
  }, [filter, variant.pieceTypes])

  const selectPiece = (pieceId: string) => {
    setLocalSelectedId(pieceId)
    onSelectPiece?.(pieceId)
  }

  if (!selectedPiece) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          This variant has no piece types yet.
        </CardContent>
      </Card>
    )
  }

  const pieceName = (id: string) => variant.pieceTypes.find((piece) => piece.id === id)?.name ?? 'piece'
  const selectedCount = setupCount(variant, selectedPiece.id)
  const flags = flagCopy(selectedPiece)
  const promotionIds = selectedPiece.promotion?.typeIds.filter((id) => variant.pieceTypes.some((piece) => piece.id === id)) ?? []

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-3">
        {variant.pieceTypes.length > 8 && (
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter pieces…"
              aria-label="Filter pieces"
              className="pl-9"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-2">
          {filteredPieces.map((piece) => {
            const selected = piece.id === selectedPiece.id
            const count = setupCount(variant, piece.id)
            return (
              <button
                key={piece.id}
                type="button"
                onClick={() => selectPiece(piece.id)}
                className={cn(
                  'group rounded-xl border bg-card p-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected && 'border-primary bg-primary/5 ring-1 ring-primary/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <PieceDiagram
                    variant={variant}
                    piece={piece}
                    teamIndex={safeTeamIndex}
                    size={5}
                    cellSize={9}
                  />
                  <Badge variant={selected ? 'default' : 'secondary'} className="font-mono text-[10px]">
                    {piece.value} pt{piece.value === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="mt-2 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{piece.name}</p>
                    {piece.flags.royal && <Crown className="size-3.5 shrink-0 text-amber-500" />}
                  </div>
                  <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                    <span>×{count} in setup</span>
                    {piece.presentation === 'boss' && <span className="rounded bg-rose-500/10 px-1 font-medium text-rose-500">Boss</span>}
                    {piece.flags.random && <span className="rounded bg-primary/10 px-1 font-medium text-primary">Random</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        {filteredPieces.length === 0 && (
          <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
            No pieces match this filter.
          </p>
        )}
      </aside>

      <Card className="min-w-0 self-start py-0 xl:sticky xl:top-20">
        <CardContent className="space-y-5 px-4 py-5 sm:px-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-xl border bg-muted/30">
              <PieceGlyph piece={selectedPiece} teamIndex={safeTeamIndex} size={52} lives={selectedPiece.lives} />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">{selectedPiece.name}</h2>
                <Badge className="font-mono">{selectedPiece.value} pt{selectedPiece.value === 1 ? '' : 's'}</Badge>
                {(selectedPiece.lives ?? 1) > 1 && <Badge variant="secondary">{selectedPiece.lives} lives</Badge>}
                <Badge variant="secondary">×{selectedCount} in setup</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedPiece.flags.royal && <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-300"><Crown /> Royal</Badge>}
                {selectedPiece.presentation === 'boss' && <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-300">Boss</Badge>}
                {selectedPiece.flags.random && <Badge variant="outline" className="border-primary/40 text-primary">Random</Badge>}
              </div>
            </div>
            {onEditPiece && (
              <Button type="button" variant="secondary" size="sm" onClick={() => onEditPiece(selectedPiece.id)}>
                <Pencil /> Edit in Maker
              </Button>
            )}
          </div>

          <PieceSandbox
            key={`${variant.id}|${selectedPiece.id}|${safeTeamIndex}|${withTargets ? 'targets' : 'empty'}`}
            variant={variant}
            piece={selectedPiece}
            teamIndex={safeTeamIndex}
            withTargets={withTargets}
            onTargetsChange={setWithTargets}
            onTeamIndexChange={setTeamIndex}
          />

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="rounded-xl border bg-muted/20 p-3.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Crosshair className="size-4 text-primary" /> Moves & captures
              </h3>
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">Moves</p>
                  {selectedPiece.move.length ? (
                    <ul className="list-disc space-y-1 pl-4">
                      {selectedPiece.move.map((pattern) => <li key={pattern.id}>{patternText(pattern)}</li>)}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No quiet movement.</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">Captures</p>
                  {selectedPiece.capture.length ? (
                    <ul className="list-disc space-y-1 pl-4">
                      {selectedPiece.capture.map((pattern) => <li key={pattern.id}>{patternText(pattern)}</li>)}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Captures with the same pattern it uses to move.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-muted/20 p-3.5">
              <h3 className="text-sm font-semibold">Effects & promotion</h3>
              <div className="mt-3 space-y-3 text-sm">
                {selectedPiece.effects.length ? (
                  <ul className="space-y-2">
                    {selectedPiece.effects.map((effect, index) => (
                      <li key={`${effect.kind}-${index}`} className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-2">
                        {effectText(effect, pieceName)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No special effects.</p>
                )}
                {promotionIds.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1.5 text-xs font-medium uppercase tracking-wide">Promotes into</p>
                    <div className="flex flex-wrap gap-1.5">
                      {promotionIds.map((id) => {
                        const target = variant.pieceTypes.find((piece) => piece.id === id)
                        if (!target) return null
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => selectPiece(id)}
                            className="flex items-center gap-1.5 rounded-full border bg-background px-2 py-1 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5"
                          >
                            <PieceGlyph piece={target} teamIndex={safeTeamIndex} size={18} />
                            {target.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {flags.length > 0 && (
            <section className="rounded-xl border bg-muted/20 p-3.5">
              <h3 className="text-sm font-semibold">Flags & special rules</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {flags.map((flag) => (
                  <div key={flag.label} className={cn('rounded-lg border px-3 py-2', flagToneClass(flag.tone))}>
                    <p className="text-xs font-semibold uppercase tracking-wide">{flag.label}</p>
                    <p className="text-muted-foreground mt-1 text-sm">{flag.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
