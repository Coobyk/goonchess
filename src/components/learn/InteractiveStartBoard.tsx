import { useMemo, useState } from 'react'
import { ArrowRight, FlipVertical2, MousePointerClick } from 'lucide-react'
import { createInitialState, getLegalMoves, inBounds, squareName } from '@/engine/rules'
import { vecKey, type Terrain, type Variant, type Vec } from '@/engine/types'
import { boardCellSize, useElementWidth } from '@/lib/boardMetrics'
import { cn } from '@/lib/utils'
import { BoardShell, tileBackground } from '../BoardShell'
import { PieceGlyph } from '../PieceGlyph'
import { Spin } from '../Spin'
import { TerrainOverlay } from '../TerrainOverlay'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

const TERRAIN_LABEL: Partial<Record<Terrain, string>> = {
  wall: 'wall',
  void: 'void',
  portal: 'portal',
  oneway: 'one-way portal',
}

function portalTarget(variant: Variant, square: Vec | null) {
  if (!square) return null
  const tile = variant.board.tiles[square.y]?.[square.x]
  if (tile?.terrain !== 'portal' && tile?.terrain !== 'oneway') return null
  const target = tile.target ?? {
    x: variant.board.width - 1 - square.x,
    y: variant.board.height - 1 - square.y,
  }
  if (!inBounds(variant.board, target.x, target.y)) return null
  return target
}

interface BoardInteraction {
  variant: Variant
  selected: Vec | null
  hovered: Vec | null
  portalFocus: Vec | null
}

export function InteractiveStartBoard({
  variant,
  onInspectPiece,
}: {
  variant: Variant
  onInspectPiece?: (pieceTypeId: string) => void
}) {
  const [container, width] = useElementWidth<HTMLDivElement>()
  const [flipped, setFlipped] = useState(false)
  const [interaction, setInteraction] = useState<BoardInteraction>({
    variant,
    selected: null,
    hovered: null,
    portalFocus: null,
  })
  const currentInteraction =
    interaction.variant === variant
      ? interaction
      : { variant, selected: null, hovered: null, portalFocus: null }
  const { selected, hovered, portalFocus } = currentInteraction

  const updateInteraction = (patch: Partial<Omit<BoardInteraction, 'variant'>>) => {
    setInteraction((current) => {
      const base =
        current.variant === variant
          ? current
          : { variant, selected: null, hovered: null, portalFocus: null }
      return { ...base, ...patch }
    })
  }

  const initialState = useMemo(() => createInitialState(variant), [variant])
  const { width: cols, height: rows } = variant.board
  const cell = boardCellSize(width, cols, 56, 22)
  const spinning = !!variant.rules?.includes('spinning')

  const teamIndex = (teamId: string) =>
    Math.max(0, variant.teams.findIndex((team) => team.id === teamId))

  const selectedPiece = useMemo(() => {
    if (!selected) return null
    const pieceId = initialState.board[selected.y]?.[selected.x]
    const inst = pieceId ? initialState.pieces[pieceId] : null
    const type = inst ? initialState.pieceTypes[inst.typeId] : null
    if (!pieceId || !inst || !type) return null
    return { pieceId, inst, type }
  }, [initialState, selected])

  const selectedMoves = useMemo(() => {
    if (!selected || !selectedPiece) return []
    return getLegalMoves({ ...initialState, turn: selectedPiece.inst.team }, selected.x, selected.y)
  }, [initialState, selected, selectedPiece])

  const moveMarkers = useMemo(() => {
    const dots = new Set<string>()
    const captures = new Set<string>()
    const portals = new Set<string>()
    const targets = new Set<string>()
    for (const move of selectedMoves) {
      const targetKey = vecKey(move.to)
      const finalKey = vecKey(move.finalTo)
      targets.add(targetKey)
      if (move.capturedId) {
        captures.add(finalKey)
        if (targetKey !== finalKey) dots.add(targetKey)
      } else {
        dots.add(targetKey)
      }
      if (targetKey !== finalKey) portals.add(finalKey)
    }
    return { dots, captures, portals, targets }
  }, [selectedMoves])

  const manualPortalTargets = useMemo(() => {
    const targets = new Set<string>()
    for (const square of [hovered, portalFocus, selected]) {
      const target = portalTarget(variant, square)
      if (target) targets.add(vecKey(target))
    }
    return targets
  }, [hovered, portalFocus, selected, variant])

  const handleSquareClick = (x: number, y: number) => {
    if (selected?.x === x && selected?.y === y) {
      updateInteraction({ selected: null, portalFocus: null })
      return
    }

    const square = { x, y }
    const hasPortal = !!portalTarget(variant, square)
    const pieceId = initialState.board[y]?.[x]
    if (pieceId) {
      updateInteraction({ selected: square, portalFocus: hasPortal ? square : null })
      return
    }

    if (moveMarkers.targets.has(vecKey(square))) {
      updateInteraction({ portalFocus: hasPortal ? square : null })
      return
    }

    updateInteraction({ selected: null, portalFocus: hasPortal ? square : null })
  }

  const selectedTeam = selectedPiece
    ? variant.teams.find((team) => team.id === selectedPiece.inst.team)
    : null
  const selectedLives = selectedPiece
    ? selectedPiece.inst.lives ?? selectedPiece.type.lives ?? 1
    : 1

  return (
    <div ref={container} className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary" className="font-mono text-[10px]">
            {cols}×{rows}
          </Badge>
          <span className="text-muted-foreground truncate text-xs">Opening move explorer</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setFlipped((value) => !value)}
        >
          <FlipVertical2 /> Flip
        </Button>
      </div>

      <div className="overflow-x-auto pb-1">
        <BoardShell
          width={cols}
          height={rows}
          cellSize={cell}
          flip={flipped}
          className="mx-auto"
          ariaLabel={`${variant.name} starting position`}
          allowOverflow={variant.pieceTypes.some((piece) => (piece.lives ?? 1) > 1)}
        >
          {Array.from({ length: rows }, (_, dy) =>
            Array.from({ length: cols }, (_, dx) => {
              const x = flipped ? cols - 1 - dx : dx
              const y = flipped ? rows - 1 - dy : dy
              const key = `${x},${y}`
              const tile = variant.board.tiles[y]?.[x]
              const pieceId = initialState.board[y]?.[x]
              const inst = pieceId ? initialState.pieces[pieceId] : null
              const pieceType = inst ? initialState.pieceTypes[inst.typeId] : null
              const isSelected = selected?.x === x && selected?.y === y
              const isDot = moveMarkers.dots.has(key) && !moveMarkers.captures.has(key)
              const isCapture = moveMarkers.captures.has(key)
              const isPortalDestination =
                moveMarkers.portals.has(key) || manualPortalTargets.has(key)
              const isPortalSource =
                !!portalTarget(variant, { x, y }) && hovered?.x === x && hovered?.y === y
              const squareLabel = squareName(variant, x, y)
              const team = inst ? variant.teams.find((t) => t.id === inst.team) : null

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-label={[
                    squareLabel,
                    tile?.terrain ? TERRAIN_LABEL[tile.terrain] : undefined,
                    pieceType && team ? `${team.name} ${pieceType.name}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onClick={() => handleSquareClick(x, y)}
                  onMouseEnter={() => updateInteraction({ hovered: { x, y } })}
                  onMouseLeave={() => updateInteraction({ hovered: null })}
                  className={cn(
                    'relative flex cursor-pointer items-center justify-center p-0 outline-none transition-[filter] hover:brightness-105 focus-visible:z-30 focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected && 'z-20',
                  )}
                  style={{ backgroundColor: tileBackground(x, y) }}
                >
                  <TerrainOverlay terrain={tile?.terrain} />
                  {tile?.terrain === 'oneway' && (
                    <span className="absolute left-0.5 top-0.5 z-10 font-mono text-[9px] text-cyan-200">
                      1→
                    </span>
                  )}

                  {inst && pieceType && (
                    <span className={cn('relative z-10 inline-flex', isSelected && 'z-20')}>
                      <Spin on={spinning}>
                        <PieceGlyph
                          piece={pieceType}
                          lives={inst.lives}
                          teamIndex={teamIndex(inst.team)}
                          size={Math.round(cell * 0.78)}
                        />
                      </Spin>
                    </span>
                  )}

                  {isPortalSource && (
                    <span className="pointer-events-none absolute inset-[10%] z-20 rounded-full border-2 border-cyan-300/80" />
                  )}
                  {isPortalDestination && (
                    <span className="pointer-events-none absolute inset-[14%] z-20 rounded-full border-2 border-cyan-300/80 bg-cyan-400/15" />
                  )}
                  {isDot && (
                    <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 size-1/4 min-h-2 min-w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/45 ring-2 ring-white/85" />
                  )}
                  {isCapture && (
                    <span className="pointer-events-none absolute inset-[8%] z-20 rounded-sm ring-[3px] ring-inset ring-rose-500/75" />
                  )}
                  {isSelected && (
                    <span className="pointer-events-none absolute inset-0 z-30 rounded-sm ring-[3px] ring-inset ring-primary" />
                  )}
                </button>
              )
            }),
          )}
        </BoardShell>
      </div>

      <div className="min-h-[84px] rounded-lg border bg-muted/30 p-3 transition-colors">
        {selectedPiece ? (
          <div className="flex min-h-[58px] flex-wrap items-center gap-3">
            <div className="bg-background/70 grid size-12 shrink-0 place-items-center rounded-md border">
              <PieceGlyph
                piece={selectedPiece.type}
                lives={selectedPiece.inst.lives}
                teamIndex={teamIndex(selectedPiece.inst.team)}
                size={34}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {selectedTeam && (
                  <span
                    className="size-2.5 shrink-0 rounded-full ring-1 ring-black/25"
                    style={{ backgroundColor: selectedTeam.color }}
                    title={selectedTeam.name}
                  />
                )}
                <p className="truncate text-sm font-semibold">{selectedPiece.type.name}</p>
                {selectedTeam && (
                  <span className="text-muted-foreground text-xs">{selectedTeam.name}</span>
                )}
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {selectedPiece.type.value} pts
                </Badge>
                {selectedLives > 1 && (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {selectedLives} lives
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                {selectedMoves.length
                  ? `${selectedMoves.length} opening move${selectedMoves.length === 1 ? '' : 's'}`
                  : 'Blocked at start'}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="ml-auto shrink-0"
              disabled={!onInspectPiece}
              onClick={() => onInspectPiece?.(selectedPiece.type.id)}
            >
              Inspect moves <ArrowRight />
            </Button>
          </div>
        ) : (
          <div className="flex min-h-[58px] flex-col justify-center gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <MousePointerClick className="size-4 shrink-0 text-primary" />
              Click any piece on the board to preview its opening moves
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {variant.teams.map((team) => (
                <span key={team.id} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="size-2.5 rounded-full ring-1 ring-black/25"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="font-medium">{team.name}</span>
                  <span className="text-muted-foreground font-mono">
                    {variant.setup.filter((piece) => piece.team === team.id).length}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
