import {
  ArrowRight,
  BookOpen,
  Bomb,
  Flag,
  FlipHorizontal2,
  Map,
  ShieldAlert,
  Sparkles,
  Swords,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react'
import type { Effect, MovePattern, PieceType, TeamConfig, Terrain, Vec } from '@/engine/types'
import type { ThreatSettings } from '@/engine/threats'
import { useAppStore } from '@/store/useAppStore'
import { findPack } from '@/lib/soundPacks'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'
import { MakerBoard } from './MakerBoard'
import { PieceGlyph } from './PieceGlyph'
import { PuzzlePanel } from './PuzzlePanel'

const ORTH_KEY = ['-1,0', '0,-1', '0,1', '1,0'].join('|')
const DIAG_KEY = ['-1,-1', '-1,1', '1,-1', '1,1'].join('|')
const ALL8_KEY = ['-1,-1', '-1,0', '-1,1', '0,-1', '0,1', '1,-1', '1,0', '1,1'].join('|')
const KNIGHT_KEY = ['-1,-2', '-1,2', '-2,-1', '-2,1', '1,-2', '1,2', '2,-1', '2,1'].join('|')

const TERRAIN_COPY: Record<Terrain, { name: string; hint: string }> = {
  normal: { name: 'Normal', hint: 'Open ground. Any piece may enter or pass through.' },
  wall: { name: 'Wall', hint: 'Blocks movement and captures. Sliders cannot see past it.' },
  void: { name: 'Void', hint: 'A hole in the board. Nothing can stand on it or cross it.' },
  portal: { name: 'Portal', hint: 'Stepping on one teleports the piece to its linked square.' },
  oneway: { name: 'One-way portal', hint: 'A portal that only sends pieces in one direction.' },
}

const WIN_COPY: Record<string, { name: string; hint: string }> = {
  checkmate: {
    name: 'Checkmate',
    hint: 'Trap the enemy royal piece so it is attacked and has no legal escape.',
  },
  kingCapture: {
    name: 'Capture the royal',
    hint: 'The game ends the moment a royal piece is captured.',
  },
  elimination: { name: 'Elimination', hint: 'Win by removing every enemy piece from the board.' },
  points: {
    name: 'Point target',
    hint: 'Win by capturing material until you reach the point target.',
  },
  center: {
    name: 'King of the Hill',
    hint: 'Walk your king onto one of the four centre squares and the game is yours at once.',
  },
  threeCheck: {
    name: 'Three checks',
    hint: 'Give check three times — the third one ends the game.',
  },
  antichess: {
    name: 'Losing chess',
    hint: 'Lose every piece, or be left with no move at all, and you win.',
  },
  race: {
    name: 'The race',
    hint: 'The first king to reach the far rank wins the game.',
  },
}

const TURN_VIEW_COPY = {
  off: 'Off — the board never rotates between turns.',
  board: 'Flip board — after each move the whole board rotates 180° so the side to move is at the bottom.',
  pieces:
    'Turn pieces — the squares stay put and the pieces rotate to face the player whose turn it is. Useful when two players share one screen from opposite ends.',
} as const

function vecKey(v: Vec) {
  return `${v.x},${v.y}`
}

function setKey(vectors: Vec[]) {
  return vectors.map(vecKey).sort().join('|')
}

function offsetText(v: Vec) {
  const parts: string[] = []
  if (v.y < 0) parts.push(`${-v.y} forward`)
  if (v.y > 0) parts.push(`${v.y} back`)
  if (v.x > 0) parts.push(`${v.x} right`)
  if (v.x < 0) parts.push(`${-v.x} left`)
  return parts.join(' and ') || 'in place'
}

function directionText(vectors: Vec[]): string {
  const key = setKey(vectors)
  if (key === ALL8_KEY) return 'in any of the eight directions'
  if (key === ORTH_KEY) return 'forward, back, left or right'
  if (key === DIAG_KEY) return 'diagonally'
  if (key === KNIGHT_KEY) return 'in an L: two squares one way and one square across'
  if (vectors.length === 1) return offsetText(vectors[0])
  return vectors.map(offsetText).join(', ')
}

function patternText(pattern: MovePattern): string {
  const first = pattern.firstMoveOnly ? ' on its first move only' : ''
  if (pattern.kind === 'slider') {
    const range =
      pattern.maxRange > 0
        ? `up to ${pattern.maxRange} square${pattern.maxRange === 1 ? '' : 's'}`
        : 'any number of squares'
    return `slides ${range} ${directionText(pattern.vectors)}${first}`
  }
  return `leaps ${directionText(pattern.vectors)}${first}`
}

function effectText(effect: Effect, pieceName: (id: string) => string): string {
  if (effect.kind === 'swap') return 'when it captures, it swaps places with the captured piece'
  if (effect.kind === 'explosion') {
    return `after it lands, everything within ${effect.radius} square${
      effect.radius === 1 ? '' : 's'
    } is destroyed — only enemy pieces are harmed`
  }
  return `after it moves, it leaves a ${pieceName(effect.pieceTypeId)} ${offsetText(
    effect.offset,
  )} of its starting square (if that square is empty)`
}

function teamPieces(variant: { setup: { typeId: string; team: string }[] }, teamId: string) {
  return variant.setup.filter((s) => s.team === teamId).length
}

function flagCopy(piece: PieceType): string[] {
  const out: string[] = []
  if (piece.flags.royal) out.push('Royal — if it is lost, the game can end.')
  if (piece.flags.uncapturable) out.push('Cannot be captured by anything.')
  if (piece.flags.mustCapture) out.push('May only move when capturing.')
  if (piece.flags.movesOnce) out.push('May only move once per game.')
  if (piece.flags.enPassant)
    out.push('May capture en passant: take a piece that just ran two squares past an attacked square.')
  if (piece.flags.jump) out.push('Jumps over pieces in the way.')
  if (!piece.flags.mirror) out.push('Keeps its pattern unmirrored when played by the other army.')
  return out
}

function ArmyBadge({ team, teamIndex }: { team: TeamConfig; teamIndex: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className="size-3 rounded-full ring-1 ring-black/20"
        style={{ backgroundColor: team.color }}
        aria-hidden
      />
      <span className="font-medium">{team.name}</span>
      <span className="text-muted-foreground text-xs">
        advances {team.forward === 'up' ? 'up' : 'down'}
      </span>
      <span className="text-muted-foreground ml-auto font-mono text-xs">
        {teamIndex === 0 ? 'first' : 'second'}
      </span>
    </div>
  )
}

export function RulebookView() {
  const variant = useAppStore((s) => s.variant)
  const canCastle =
    variant.pieceTypes.some((p) => p.flags.royal) &&
    variant.pieceTypes.some((p) => p.icon === 'rook')
  const setView = useAppStore((s) => s.setView)
  const setMakerTab = useAppStore((s) => s.setMakerTab)
  const threats = useAppStore((s) => s.threats)
  const turnView = useAppStore((s) => s.turnView)
  const soundEnabled = useAppStore((s) => s.soundEnabled)
  const soundPack = useAppStore((s) => s.soundPack)

  const { board, teams, pieceTypes, setup, winConditions } = variant

  const terrainCounts = board.tiles.flat().reduce<Record<Terrain, number>>(
    (acc, tile) => {
      acc[tile.terrain] = (acc[tile.terrain] ?? 0) + 1
      return acc
    },
    { normal: 0, wall: 0, void: 0, portal: 0, oneway: 0 },
  )
  const presentTerrain = (Object.keys(TERRAIN_COPY) as Terrain[]).filter(
    (t) => t === 'normal' || terrainCounts[t] > 0,
  )
  const portalLinks = board.tiles.flat().filter((t) => t.terrain === 'portal').length
  const oneways = terrainCounts.oneway

  const pieceName = (id: string) => pieceTypes.find((p) => p.id === id)?.name ?? 'piece'
  // The kinds that are rolled anew after every move.
  const randomPieces = pieceTypes.filter((p) => p.flags.random).map((p) => p.name)

  const teamForPiece = (pieceId: string) => {
    const first = setup.find((s) => s.typeId === pieceId)
    return Math.max(0, teams.findIndex((t) => t.id === first?.team))
  }

  const threatCopy = (settings: ThreatSettings) => {
    if (!settings.show) return 'Off'
    const layers = [
      settings.arrows && 'threat arrows',
      settings.coverage && 'attacked squares',
      settings.hanging && 'hanging pieces',
      settings.defended && 'defended pieces',
    ].filter(Boolean)
    const scope = settings.scope === 'both' ? 'both armies' : 'the side to move'
    return `On — ${layers.join(', ') || 'no layers selected'}; showing ${scope}.`
  }

  return (
    <div className="space-y-6">
      <PuzzlePanel />
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 py-0 text-zinc-100 dark:from-zinc-900 dark:to-zinc-950">
        <CardContent className="relative px-6 py-8 sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-20 size-60 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-28 size-52 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="relative max-w-3xl space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-400">
              <BookOpen className="size-4" /> Learn
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{variant.name}</h1>
              <p className="text-sm text-zinc-300 sm:text-base">
                {variant.description ||
                  'A custom chess variant. Every rule on this page comes from the current setup.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-white/10 text-zinc-100">
                {board.width} × {board.height} board
              </Badge>
              <Badge variant="secondary" className="bg-white/10 text-zinc-100">
                {teams.length} armies
              </Badge>
              <Badge variant="secondary" className="bg-white/10 text-zinc-100">
                {pieceTypes.length} piece types
              </Badge>
              <Badge variant="secondary" className="bg-white/10 text-zinc-100">
                {winConditions.length} win condition{winConditions.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => setView('play')}>
                <Swords /> Play this variant
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-white/10 text-zinc-100 hover:bg-white/20"
                onClick={() => {
                  setMakerTab('rules')
                  setView('maker')
                }}
              >
                <Wrench /> Edit the rules
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2">
                  <Map className="text-muted-foreground size-4" /> Starting position
                </span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {board.width}×{board.height}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              <MakerBoard interactive={false} />
              <Separator />
              <div className="space-y-2 text-sm">
                {teams.map((team, i) => (
                  <ArmyBadge key={team.id} team={team} teamIndex={i} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Terrain key</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 px-4 text-xs">
              {presentTerrain.map((terrain) => (
                <div key={terrain} className="flex items-start gap-2">
                  <span
                    className={
                      terrain === 'normal'
                        ? 'mt-0.5 inline-block size-3 shrink-0 rounded-sm border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:6px_6px]'
                        : terrain === 'wall'
                          ? 'mt-0.5 inline-block size-3 shrink-0 rounded-sm border bg-[repeating-linear-gradient(45deg,transparent_0_2px,rgba(0,0,0,0.35)_2px_4px)]'
                          : terrain === 'void'
                            ? 'mt-0.5 inline-block size-3 shrink-0 rounded-sm border bg-black'
                            : 'mt-0.5 inline-block size-3 shrink-0 rounded-sm bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.9),rgba(56,189,248,0.15))]'
                    }
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="font-medium">
                      {TERRAIN_COPY[terrain].name}
                      {terrain !== 'normal' && (
                        <span className="text-muted-foreground font-mono"> ×{terrainCounts[terrain]}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground block">{TERRAIN_COPY[terrain].hint}</span>
                  </span>
                </div>
              ))}
              {presentTerrain.length === 1 && (
                <p className="text-muted-foreground border-t pt-2">
                  No special terrain in this variant — every square is open ground.
                </p>
              )}
              {portalLinks > 0 && (
                <p className="text-muted-foreground border-t pt-2">
                  {portalLinks / 2} linked portal pair{portalLinks === 2 ? '' : 's'}
                  {oneways > 0 && ` · ${oneways} one-way`}
                </p>
              )}
            </CardContent>
          </Card>
        </aside>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Flag className="text-muted-foreground size-4" /> How the game ends
              </CardTitle>
              <CardDescription>
                Any enabled condition can finish the game. If more than one applies, the first one
                reached wins.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {winConditions.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No win condition is enabled. The game will keep going until you restart it.
                </p>
              ) : (
                winConditions.map((condition) => {
                  const copy = WIN_COPY[condition.kind]
                  return (
                    <div
                      key={condition.id}
                      className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3"
                    >
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
                        <ArrowRight className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{copy?.name ?? condition.kind}</p>
                        <p className="text-muted-foreground text-sm">
                          {copy?.hint ?? 'Custom win condition.'}
                          {condition.kind === 'points' && (
                            <>
                              {' '}
                              Target:{' '}
                              <span className="text-foreground font-mono">
                                {condition.threshold ?? 20} points
                              </span>
                              .
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
              <p className="text-muted-foreground text-xs">
                A stalemate — no legal move but no check — is a draw. Reaching the point target or
                eliminating an army is reported in the turn panel.
              </p>
              {randomPieces.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-sm font-medium">The pieces are rolled anew</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    After every move each random piece is given a new kind, drawn at random from
                    the kinds of this variant: {randomPieces.join(', ')}. They wear the colours of a
                    rainbow, so it is clear which ones are random. The royal piece keeps its kind, or
                    the game would be over at once.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="text-muted-foreground size-4" /> The armies
              </CardTitle>
              <CardDescription>
                Each army has its own colour and direction of advance. Movement patterns are written
                from the piece&apos;s point of view; patterns marked as mirrored flip for the
                opposing side.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {teams.map((team, i) => (
                <div key={team.id} className="rounded-lg border p-3">
                  <ArmyBadge team={team} teamIndex={i} />
                  <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                    <span>{teamPieces(variant, team.id)} pieces in the starting setup</span>
                    <span className="font-mono">{team.color}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Piece reference</h2>
                <p className="text-muted-foreground text-sm">
                  Movement, captures, special rules and promotions for this variant.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-[10px]">
                values are capture points
              </Badge>
            </div>

            <div className="space-y-3">
              {pieceTypes.map((piece) => {
                const captures = piece.capture.length
                  ? piece.capture.map(patternText).join('; ')
                  : 'captures the same way it moves'
                const flags = flagCopy(piece)
                return (
                  <div key={piece.id} className="rounded-xl border p-4">
                    <div className="flex items-start gap-4">
                      <div className="grid size-12 shrink-0 place-items-center rounded-lg border bg-zinc-100">
                        <PieceGlyph piece={piece} teamIndex={teamForPiece(piece.id)} size={34} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{piece.name}</h3>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {piece.value} pt{piece.value === 1 ? '' : 's'}
                          </Badge>
                          {piece.flags.royal && (
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                              Royal
                            </Badge>
                          )}
                          <span className="text-muted-foreground ml-auto font-mono text-[10px]">
                            {setup.filter((s) => s.typeId === piece.id).length} on board
                          </span>
                        </div>

                        <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                          {piece.move.length ? (
                            piece.move.map((pattern) => (
                              <li key={pattern.id} className="flex gap-2">
                                <span className="text-foreground/60 mt-1 select-none text-[10px]">
                                  ●
                                </span>
                                <span>
                                  <span className="text-foreground">Moves</span> —{' '}
                                  {patternText(pattern)}.
                                </span>
                              </li>
                            ))
                          ) : (
                            <li className="flex gap-2">
                              <span className="text-foreground/60 mt-1 select-none text-[10px]">
                                ●
                              </span>
                              <span>
                                <span className="text-foreground">Moves</span> — cannot move on its
                                own.
                              </span>
                            </li>
                          )}
                          <li className="flex gap-2">
                            <span className="text-foreground/60 mt-1 select-none text-[10px]">
                              ●
                            </span>
                            <span>
                              <span className="text-foreground">Captures</span> — {captures}.
                            </span>
                          </li>
                          {piece.effects.map((effect, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-foreground/60 mt-1 select-none text-[10px]">
                                <Bomb className="size-3" />
                              </span>
                              <span>
                                <span className="text-foreground">Special</span> — {effectText(effect, pieceName)}.
                              </span>
                            </li>
                          ))}
                          {piece.promotion && (
                            <li className="flex gap-2">
                              <span className="text-foreground/60 mt-1 select-none text-[10px]">
                                <ArrowRight className="size-3" />
                              </span>
                              <span>
                                <span className="text-foreground">Promotes</span> — becomes{' '}
                                {piece.promotion.typeIds
                                  .map((id) => pieceName(id))
                                  .join(' or ')}{' '}
                                when it reaches the far rank.
                              </span>
                            </li>
                          )}
                          {flags.map((flag) => (
                            <li key={flag} className="flex gap-2">
                              <span className="text-foreground/60 mt-1 select-none text-[10px]">
                                <ShieldAlert className="size-3" />
                              </span>
                              <span>{flag}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Swords className="text-muted-foreground size-4" /> Playing a turn
              </CardTitle>
              <CardDescription>
                Select a piece to see its legal moves, then click a highlighted square or drag the
                piece there. Clicking a selected piece again clears it.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-2 text-sm">
              <p>
                Captures resolve immediately. Effects such as explosions and spawns happen after the
                moving piece lands; explosions never hurt their own army.
              </p>
              <p>
                Portals and one-way portals move a piece to a linked square as part of the same
                move. Walls and void squares stop movement entirely.
              </p>
              {canCastle && (
                <p>
                  <span className="text-foreground font-medium">Castling</span> — a royal piece and a
                  friendly rook that have not moved can castle if every square between them is open.
                  The royal piece moves two squares toward the rook; the rook jumps to the square it
                  crossed. You cannot castle out of check, through an attacked square, or onto one.
                </p>
              )}
              <p>
                The turn panel shows whose move it is, whether the royal piece is in check, and any
                active threat information. Undo steps back one move; restart resets the starting
                position.
              </p>
              <p>
                The <span className="text-foreground font-medium">Opponent</span> menu turns a
                side over to a bot. It plays by the same rules as you do, in this very variant —
                and two bots can play each other while you watch.
              </p>
              <p>
                The same position three times is a draw. Two positions count as the same when the
                pieces stand in the same squares, the same side is to move, the same castles are
                still possible and an en passant capture is available in both or in neither.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlipHorizontal2 className="text-muted-foreground size-4" /> Display &amp; assists
              </CardTitle>
              <CardDescription>
                These settings are personal to this browser. They change how the game looks, not the
                rules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FlipHorizontal2 className="text-muted-foreground size-4" /> Turn view
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">{TURN_VIEW_COPY[turnView]}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldAlert className="text-muted-foreground size-4" /> Threat visualizer
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">{threatCopy(threats)}</p>
                  {threats.show && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Arrows point from each attacker to the piece it can capture. Rose means the
                      target is undefended; amber means a recapture is waiting.
                    </p>
                  )}
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {soundEnabled ? (
                      <Volume2 className="text-muted-foreground size-4" />
                    ) : (
                      <VolumeX className="text-muted-foreground size-4" />
                    )}{' '}
                    Sound
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {soundEnabled
                      ? `Move, capture, check, promotion, explosion and game-ending sounds are on, from the ${findPack(soundPack).name} pack.`
                      : 'Muted. Use the speaker button in the header to turn sounds back on.'}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Map className="text-muted-foreground size-4" /> Board map
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    The starting position on this page is always the current setup. Open Maker to
                    change the board, pieces or rules.
                  </p>
                </div>
              </div>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setView('play')}>
                  <Swords /> Go to the board
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMakerTab('pieces')
                    setView('maker')
                  }}
                >
                  <Wrench /> Open the Maker
                </Button>
              </div>
            </CardContent>
          </Card>

          <p className="text-muted-foreground px-1 text-xs">
            Piece drawings: chess pieces by Colin M. L. Burnett, shared under CC BY-SA 3.0.{' '}
            <a
              href="/pieces/cburnett/ATTRIBUTION.txt"
              className="underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              Attribution
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
