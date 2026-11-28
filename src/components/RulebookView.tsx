import { useState, type ComponentType } from 'react'
import {
  ArrowRight,
  Ban,
  Bomb,
  BookOpen,
  Compass,
  Crown,
  Dices,
  Flag,
  Flame,
  Grid2x2,
  HeartCrack,
  Layers,
  Map,
  Mountain,
  Package,
  Puzzle,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Skull,
  Sparkles,
  Swords,
  Target,
  Wrench,
  Zap,
} from 'lucide-react'
import { TEMPLATES } from '@/engine/templates'
import type { TeamConfig, Terrain, VariantRule, WinConditionKind } from '@/engine/types'
import { RULE_COPY, TERRAIN_COPY, WIN_COPY } from '@/lib/learnCopy'
import { useAppStore } from '@/store/useAppStore'
import { InteractiveStartBoard } from './learn/InteractiveStartBoard'
import { ModeAtlas } from './learn/ModeAtlas'
import { PieceDiagram } from './learn/PieceDiagram'
import { PiecePlayground } from './learn/PiecePlayground'
import { TacticsTrainer } from './learn/TacticsTrainer'
import { PieceGlyph } from './PieceGlyph'
import { TerrainSwatch } from './TerrainOverlay'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

type LearnTab = 'overview' | 'pieces' | 'tactics' | 'modes'

const RULE_ICON: Record<VariantRule, ComponentType<{ className?: string }>> = {
  atomic: Bomb,
  crazyhouse: Package,
  forcedCapture: Swords,
  noCheck: Ban,
  noCastle: ShieldAlert,
  predator: Flame,
  loyalty: HeartCrack,
  hypergamy: Crown,
  spinning: RefreshCw,
  turning: RotateCw,
}

const WIN_ICON: Record<WinConditionKind, ComponentType<{ className?: string }>> = {
  checkmate: Crown,
  kingCapture: Swords,
  elimination: Skull,
  points: Target,
  center: Mountain,
  threeCheck: Zap,
  antichess: Skull,
  race: Flag,
  predator: Flame,
}

function teamPieces(variant: { setup: { typeId: string; team: string }[] }, teamId: string) {
  return variant.setup.filter((s) => s.team === teamId).length
}

function ordinal(index: number) {
  const n = index + 1
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  if (n % 10 === 1) return `${n}st`
  if (n % 10 === 2) return `${n}nd`
  if (n % 10 === 3) return `${n}rd`
  return `${n}th`
}

function ArmyRow({
  team,
  teamIndex,
  count,
}: {
  team: TeamConfig
  teamIndex: number
  count: number
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="size-3.5 shrink-0 rounded-full ring-1 ring-black/25 dark:ring-white/25"
          style={{ backgroundColor: team.color }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">{team.name}</p>
          <p className="text-muted-foreground text-xs">
            Moves {team.forward === 'up' ? 'upward' : 'downward'} · {count} piece
            {count === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
        {ordinal(teamIndex)}
      </Badge>
    </div>
  )
}

export function RulebookView() {
  const variant = useAppStore((s) => s.variant)
  const setView = useAppStore((s) => s.setView)
  const setMakerTab = useAppStore((s) => s.setMakerTab)
  const setSelectedPieceType = useAppStore((s) => s.setSelectedPieceType)

  const [tab, setTab] = useState<LearnTab>('overview')
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)

  const { board, teams, pieceTypes, setup, winConditions } = variant
  const rules = variant.rules ?? []
  const canCastle =
    pieceTypes.some((p) => p.flags.royal) &&
    pieceTypes.some((p) => p.icon === 'rook') &&
    !rules.includes('noCastle')

  const terrainCounts = board.tiles.flat().reduce<Record<Terrain, number>>(
    (acc, tile) => {
      acc[tile.terrain] = (acc[tile.terrain] ?? 0) + 1
      return acc
    },
    { normal: 0, wall: 0, void: 0, portal: 0, oneway: 0 },
  )
  const specialTerrain = (['wall', 'void', 'portal', 'oneway'] as Terrain[]).filter(
    (t) => terrainCounts[t] > 0,
  )
  const portalLinks = terrainCounts.portal
  const oneways = terrainCounts.oneway
  const randomPieces = pieceTypes.filter((p) => p.flags.random).map((p) => p.name)
  const dicePieces = pieceTypes.filter((p) => p.flags.dice).map((p) => p.name)
  const hasEffects = pieceTypes.some((p) => p.effects.length > 0)

  const teamForPiece = (pieceId: string) => {
    const first = setup.find((s) => s.typeId === pieceId)
    return Math.max(0, teams.findIndex((t) => t.id === first?.team))
  }

  const openPieceInLab = (pieceId: string) => {
    setSelectedPieceId(pieceId)
    setTab('pieces')
  }

  const editPieceInMaker = (pieceId: string) => {
    setSelectedPieceType(pieceId)
    setMakerTab('pieces')
    setView('maker')
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden py-0">
        <CardContent className="relative px-5 py-6 sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/12 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                  <BookOpen className="size-3.5" /> Learn
                </span>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {board.width}×{board.height} · {pieceTypes.length} piece
                  {pieceTypes.length === 1 ? '' : 's'} · {teams.length} armies
                </span>
              </div>

              <div className="space-y-1.5">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{variant.name}</h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  {variant.description ||
                    'Interactive rules, movement diagrams and live tactics for the current variant.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {rules.map((rule) => {
                  const Icon = RULE_ICON[rule] ?? Sparkles
                  return (
                    <Badge
                      key={rule}
                      variant="outline"
                      className="border-primary/40 bg-primary/10 text-foreground gap-1"
                    >
                      <Icon className="size-3 text-primary" />
                      {RULE_COPY[rule]?.name ?? rule}
                    </Badge>
                  )
                })}
                {winConditions.map((condition) => {
                  const Icon = WIN_ICON[condition.kind] ?? Flag
                  return (
                    <Badge key={condition.id} variant="secondary" className="gap-1">
                      <Icon className="text-muted-foreground size-3" />
                      {WIN_COPY[condition.kind]?.name ?? condition.kind}
                      {condition.kind === 'points' && condition.threshold
                        ? ` (${condition.threshold})`
                        : ''}
                    </Badge>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setView('play')}>
                  <Swords /> Play now
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setMakerTab('rules')
                    setView('maker')
                  }}
                >
                  <Wrench /> Edit in Maker
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTab('modes')}>
                  <Layers /> Switch mode
                </Button>
              </div>

              {pieceTypes.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {pieceTypes.slice(0, 8).map((piece) => (
                    <button
                      key={piece.id}
                      type="button"
                      title={`Inspect ${piece.name}`}
                      onClick={() => openPieceInLab(piece.id)}
                      className="grid size-9 place-items-center rounded-md border bg-muted/40 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <PieceGlyph piece={piece} teamIndex={teamForPiece(piece.id)} size={26} />
                    </button>
                  ))}
                  {pieceTypes.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setTab('pieces')}
                      className="text-muted-foreground hover:text-foreground rounded-md border px-2 py-1.5 font-mono text-xs transition-colors"
                    >
                      +{pieceTypes.length - 8}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(next) => setTab(next as LearnTab)} className="space-y-6">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-10 w-full justify-start sm:w-fit">
            <TabsTrigger value="overview" className="gap-1.5 px-3">
              <Compass className="size-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="pieces" className="gap-1.5 px-3">
              <Grid2x2 className="size-4" /> Pieces
              <span className="bg-background/70 text-muted-foreground ml-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] leading-none">
                {pieceTypes.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="tactics" className="gap-1.5 px-3">
              <Puzzle className="size-4" /> Tactics
            </TabsTrigger>
            <TabsTrigger value="modes" className="gap-1.5 px-3">
              <Layers className="size-4" /> All modes
              <span className="bg-background/70 text-muted-foreground ml-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] leading-none">
                {TEMPLATES.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
            <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
              <Card className="py-4">
                <CardHeader className="px-4 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Map className="text-primary size-4" /> Starting position
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4">
                  <InteractiveStartBoard variant={variant} onInspectPiece={openPieceInLab} />
                </CardContent>
              </Card>

              <Card className="py-4">
                <CardHeader className="px-4 pb-2">
                  <CardTitle className="text-sm">Terrain</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 px-4 text-xs">
                  {specialTerrain.length === 0 ? (
                    <p className="text-muted-foreground">
                      Open ground everywhere — no walls, voids or portals in this variant.
                    </p>
                  ) : (
                    <>
                      {specialTerrain.map((terrain) => (
                        <div key={terrain} className="flex items-start gap-2.5">
                          <TerrainSwatch
                            terrain={terrain}
                            className={
                              terrain === 'oneway'
                                ? 'mt-0.5 font-mono text-[8px] text-cyan-100'
                                : 'mt-0.5'
                            }
                          >
                            {terrain === 'oneway' ? '1→' : null}
                          </TerrainSwatch>
                          <div className="min-w-0">
                            <span className="font-medium">
                              {TERRAIN_COPY[terrain].name}{' '}
                              <span className="text-muted-foreground font-mono">
                                ×{terrainCounts[terrain]}
                              </span>
                            </span>
                            <span className="text-muted-foreground block">
                              {TERRAIN_COPY[terrain].hint}
                            </span>
                          </div>
                        </div>
                      ))}
                      {(portalLinks > 0 || oneways > 0) && (
                        <p className="text-muted-foreground border-t pt-2 font-mono text-[11px]">
                          {[
                            portalLinks > 0
                              ? `${portalLinks} portal square${portalLinks === 1 ? '' : 's'}`
                              : null,
                            oneways > 0 ? `${oneways} one-way` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </aside>

            <div className="min-w-0 space-y-6">
              {rules.length > 0 && (
                <Card className="border-primary/35">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="size-4 text-primary" /> What makes this mode different
                    </CardTitle>
                    <CardDescription>
                      Special rules active on top of standard piece movement.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {rules.map((rule) => {
                      const copy = RULE_COPY[rule]
                      const Icon = RULE_ICON[rule] ?? Sparkles
                      return (
                        <div
                          key={rule}
                          className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5"
                        >
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
                            <Icon className="size-4" />
                          </span>
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-sm font-semibold">{copy?.name ?? rule}</p>
                            <p className="text-muted-foreground text-sm leading-relaxed">
                              {copy?.hint ?? 'A custom rule of this variant.'}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Flag className="text-muted-foreground size-4" /> How to win
                  </CardTitle>
                  <CardDescription>
                    {winConditions.length > 1
                      ? 'Any enabled goal ends the game immediately — whichever happens first wins.'
                      : 'How a game of this variant finishes.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {winConditions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No win condition is enabled — play freely until you restart.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {winConditions.map((condition) => {
                        const copy = WIN_COPY[condition.kind]
                        const Icon = WIN_ICON[condition.kind] ?? Flag
                        return (
                          <div
                            key={condition.id}
                            className="flex items-start gap-3 rounded-lg border bg-muted/25 p-3.5"
                          >
                            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-primary/12 text-primary">
                              <Icon className="size-4" />
                            </span>
                            <div className="min-w-0 space-y-0.5">
                              <p className="text-sm font-medium">{copy?.name ?? condition.kind}</p>
                              <p className="text-muted-foreground text-xs leading-relaxed">
                                {copy?.hint ?? 'Custom win condition.'}
                                {condition.kind === 'points' && (
                                  <>
                                    {' '}
                                    Target:{' '}
                                    <span className="text-foreground font-mono font-medium">
                                      {condition.threshold ?? 20} pts
                                    </span>
                                    .
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {randomPieces.length > 0 && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/8 p-3.5">
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-500" />
                      <div className="min-w-0 space-y-0.5 text-sm">
                        <p className="font-medium">Rainbow pieces re-roll every turn</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          After every move, each random piece ({randomPieces.join(', ')}) transforms
                          into another non-royal piece from this variant.
                        </p>
                      </div>
                    </div>
                  )}

                  {dicePieces.length > 0 && (
                    <div className="flex items-start gap-3 rounded-lg border border-sky-500/35 bg-sky-500/8 p-3.5">
                      <Dices className="mt-0.5 size-4 shrink-0 text-sky-500" />
                      <div className="min-w-0 space-y-0.5 text-sm">
                        <p className="font-medium">Dice-driven movement</p>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          Selecting {dicePieces.join(', ')} rolls a die to pick which movement pattern
                          it can use on that turn.
                        </p>
                      </div>
                    </div>
                  )}

                  <p className="text-muted-foreground text-xs">
                    Stalemate (no legal move while not in check) and threefold repetition are draws.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Grid2x2 className="text-muted-foreground size-4" /> Piece lineup
                    </CardTitle>
                    <CardDescription>
                      Click any piece to test its movement on an interactive sandbox board.
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTab('pieces')}>
                    Open Piece Lab <ArrowRight className="size-3.5" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {pieceTypes.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No piece types defined yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {pieceTypes.map((piece) => {
                        const count = setup.filter((s) => s.typeId === piece.id).length
                        return (
                          <button
                            key={piece.id}
                            type="button"
                            onClick={() => openPieceInLab(piece.id)}
                            className="group flex flex-col items-center gap-2.5 rounded-xl border bg-muted/15 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-muted/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <PieceDiagram
                              variant={variant}
                              piece={piece}
                              teamIndex={teamForPiece(piece.id)}
                              size={5}
                              cellSize={18}
                            />
                            <div className="w-full min-w-0 space-y-1">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="truncate text-sm font-semibold">{piece.name}</span>
                                {piece.flags.royal && (
                                  <Crown className="size-3.5 shrink-0 text-amber-500" />
                                )}
                              </div>
                              <div className="text-muted-foreground flex items-center justify-center gap-2 font-mono text-[11px]">
                                <span>
                                  {piece.value} pt{piece.value === 1 ? '' : 's'}
                                </span>
                                <span>·</span>
                                <span>×{count}</span>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Armies</CardTitle>
                    <CardDescription className="text-xs">
                      Mirrored patterns flip vertically for the downward army.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {teams.map((team, index) => (
                      <ArmyRow
                        key={team.id}
                        team={team}
                        teamIndex={index}
                        count={teamPieces(variant, team.id)}
                      />
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Quick reference</CardTitle>
                    <CardDescription className="text-xs">
                      Essentials for playing this variant.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-muted-foreground space-y-2 text-xs leading-relaxed">
                    <p>
                      <span className="text-foreground font-medium">Controls</span> — click a piece
                      or drag it to any highlighted legal square.
                    </p>
                    {canCastle && (
                      <p>
                        <span className="text-foreground font-medium">Castling</span> — an unmoved
                        royal piece and an unmoved rook can castle across clear, unattacked squares
                        (moving to their standard castling files in Chess960).
                      </p>
                    )}
                    {hasEffects && (
                      <p>
                        <span className="text-foreground font-medium">Effects</span> — explosions,
                        swaps and spawns trigger right after the piece lands.
                      </p>
                    )}
                    {specialTerrain.length > 0 && (
                      <p>
                        <span className="text-foreground font-medium">Terrain</span> — portals
                        teleport on arrival; walls and void squares block movement.
                      </p>
                    )}
                    <p>
                      <span className="text-foreground font-medium">Practice</span> — test your eye
                      in the{' '}
                      <button
                        type="button"
                        onClick={() => setTab('tactics')}
                        className="text-primary font-medium underline underline-offset-2 hover:opacity-80"
                      >
                        Tactics trainer
                      </button>{' '}
                      or face the built-in bot from the Play screen.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pieces" className="mt-0">
          <PiecePlayground
            variant={variant}
            selectedPieceId={selectedPieceId}
            onSelectPiece={setSelectedPieceId}
            onEditPiece={editPieceInMaker}
          />
        </TabsContent>

        <TabsContent value="tactics" className="mt-0">
          <TacticsTrainer />
        </TabsContent>

        <TabsContent value="modes" className="mt-0">
          <ModeAtlas
            onLearnVariant={() => {
              setSelectedPieceId(null)
              setTab('overview')
            }}
          />
        </TabsContent>
      </Tabs>

      <p className="text-muted-foreground px-1 text-xs">
        Piece drawings: chess pieces by Colin M. L. Burnett, shared under CC BY-SA 3.0.{' '}
        <a
          href="/pieces/cburnett/ATTRIBUTION.txt"
          className="underline underline-offset-2 hover:text-foreground"
          target="_blank"
          rel="noreferrer"
        >
          Attribution
        </a>
        .
      </p>
    </div>
  )
}
