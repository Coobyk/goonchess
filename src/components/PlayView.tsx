import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Bot, ClipboardCopy, Download, FileText, ImageIcon, Loader2, RotateCcw, Shuffle, Undo2, Trophy, ShieldAlert, FlipHorizontal2, Timer } from 'lucide-react'
import { GameBoard } from './GameBoard'
import { AnalysisPanel } from './AnalysisPanel'
import { LiveAnnouncer } from './LiveAnnouncer'
import { PuzzlePanel } from './PuzzlePanel'
import { StatsPanel } from './StatsPanel'
import { ReplayView } from './ReplayView'
import { BotPlayer } from './BotPlayer'
import { ClockFor, ClockTicker } from './ClockTicker'
import { PieceGlyph } from './PieceGlyph'
import { WinConfetti } from './WinConfetti'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'
import { ScrollArea } from './ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Switch } from './ui/switch'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { useAppStore } from '@/store/useAppStore'
import { isInCheck } from '@/engine/rules'
import { computeThreats, mergeThreats, threatSummary } from '@/engine/threats'
import { LEVEL_HINTS, LEVEL_LABELS, type BotLevel } from '@/engine/ai/search'
import { botLevelFor, isBotTeam, type BotSettings } from '@/engine/ai/botSettings'
import { CLOCK_PRESETS, clockIsOn } from '@/lib/clock'
import { toFen } from '@/lib/fen'
import { toPgn } from '@/lib/pgn'
import { downloadBlob, fileNameFor, positionName, renderBoardImage } from '@/lib/image'
import { playSound } from '@/lib/sound'

const STATUS_TEXT: Record<string, string> = {
  checkmate: 'Checkmate',
  'royal-captured': 'Royal captured',
  eliminated: 'Army eliminated',
  points: 'Point target reached',
  stalemate: 'Stalemate — draw',
  timeout: 'Time ran out',
  threefold: 'Draw by threefold repetition',
}

/** The three strengths, as a compact row of buttons. */
function StrengthButtons({
  level,
  onChange,
}: {
  level: BotLevel
  onChange: (level: BotLevel) => void
}) {
  return (
    <div className="grid shrink-0 grid-cols-3 gap-1">
      {(Object.keys(LEVEL_LABELS) as BotLevel[]).map((option) => (
        <Button
          key={option}
          size="sm"
          className="h-7 px-1 text-xs"
          variant={level === option ? 'secondary' : 'outline'}
          onClick={() => onChange(option)}
        >
          {LEVEL_LABELS[option]}
        </Button>
      ))}
    </div>
  )
}

export function PlayView() {
  const game = useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const resetGame = useAppStore((s) => s.resetGame)
  const startRandomGame = useAppStore((s) => s.startRandomGame)
  const undo = useAppStore((s) => s.undo)
  const canUndo = useAppStore((s) => s.undoStack.length > 0)
  const threatSettings = useAppStore((s) => s.threats)
  const setThreats = useAppStore((s) => s.setThreats)
  const turnView = useAppStore((s) => s.turnView)
  const setTurnView = useAppStore((s) => s.setTurnView)
  const bot = useAppStore((s) => s.bot)
  const botSide = useAppStore((s) => s.botSide)
  const setBot = useAppStore((s) => s.setBot)
  const pendingPromotion = useAppStore((s) => s.pendingPromotion)
  const choosePromotion = useAppStore((s) => s.choosePromotion)
  const cancelPromotion = useAppStore((s) => s.cancelPromotion)
  const clock = useAppStore((s) => s.clock)
  const setClock = useAppStore((s) => s.setClock)
  const [replayOpen, setReplayOpen] = useState(false)
  const botThinking = useAppStore((s) => s.botThinking)

  const threatReport = useMemo(() => {
    if (!threatSettings.show) return null
    const teams =
      threatSettings.scope === 'both' ? variant.teams.map((t) => t.id) : [game.turn]
    return mergeThreats(teams.map((team) => computeThreats(game, team)))
  }, [game, variant.teams, threatSettings.show, threatSettings.scope])
  const summary = threatReport ? threatSummary(threatReport, game) : null

  const prevWinner = useRef(game.winner)

  useEffect(() => {
    if (game.winner && game.winner !== prevWinner.current) {
      playSound(game.winner === 'draw' ? 'draw' : 'win')
    }
    prevWinner.current = game.winner
  }, [game.winner])

  useEffect(() => {
    if (game.winner) {
      toast.message(game.winner === 'draw' ? 'Draw' : `${game.winner} wins`, {
        description: STATUS_TEXT[game.status] ?? '',
      })
    }
  }, [game.winner, game.status])

  const teamIndex = (id: string) => variant.teams.findIndex((t) => t.id === id)
  const turnTeam = variant.teams.find((t) => t.id === game.turn)
  const checked = !game.winner && isInCheck(game, game.turn)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <WinConfetti />
      <BotPlayer />
      <ClockTicker />
      <ReplayView open={replayOpen} onOpenChange={setReplayOpen} />
      <div className="flex flex-col items-center gap-4">
        {pendingPromotion && (
          <div
            role="dialog"
            aria-label="Choose a promotion"
            className="flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-card p-3 shadow-lg"
          >
            <span className="text-muted-foreground mr-1 text-sm">Promote into</span>
            {(pendingPromotion.move.promotionOptions ?? []).map((typeId) => {
              const type = variant.pieceTypes.find((p) => p.id === typeId)
              if (!type) return null
              return (
                <button
                  key={typeId}
                  type="button"
                  onClick={() => choosePromotion(typeId)}
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <PieceGlyph piece={type} teamIndex={teamIndex(game.turn)} size={22} />
                  {type.name}
                </button>
              )
            })}
            <Button variant="ghost" size="sm" onClick={cancelPromotion}>
              Cancel
            </Button>
          </div>
        )}
        {game.winner && (
          <Alert className="w-full max-w-xl">
            <Trophy className="size-4" />
            <AlertTitle>
              {game.winner === 'draw'
                ? 'Draw'
                : `${variant.teams.find((t) => t.id === game.winner)?.name ?? game.winner}${
                    isBotTeam(bot, game.winner, botSide) ? ' (bot)' : ''
                  } wins`}
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{STATUS_TEXT[game.status] ?? 'Game over'}</span>
              <Button size="sm" onClick={resetGame}>
                Play again
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <GameBoard />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={resetGame}>
            <RotateCcw /> Restart
          </Button>
          <Button variant="outline" size="sm" onClick={startRandomGame}>
            <Shuffle /> Random game
          </Button>
          <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo}>
            <Undo2 /> Undo
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant={bot.mode === 'off' ? 'outline' : 'secondary'} size="sm">
                {botThinking ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Bot />
                )}
                {bot.mode === 'all'
                  ? 'Bot vs Bot'
                  : bot.mode === 'one'
                    ? bot.side === 'random'
                      ? 'Bot · Random'
                      : `Bot · ${variant.teams.find((t) => t.id === bot.side)?.name ?? ''}`
                    : 'Opponent'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="center">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">Opponent</Label>
                  <ToggleGroup
                    type="single"
                    className="w-full"
                    value={bot.mode}
                    onValueChange={(value) => {
                      if (!value) return
                      const mode = value as BotSettings['mode']
                      setBot({
                        mode,
                        side:
                          mode === 'one'
                            ? (bot.side ?? variant.teams[0]?.id ?? null)
                            : bot.side,
                      })
                    }}
                  >
                    <ToggleGroupItem value="off" className="flex-1">
                      Two players
                    </ToggleGroupItem>
                    <ToggleGroupItem value="one" className="flex-1">
                      One bot
                    </ToggleGroupItem>
                    <ToggleGroupItem value="all" className="flex-1">
                      Bot vs Bot
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {bot.mode === 'one' && (
                  <div className="space-y-2">
                    <Label className="text-sm">The bot plays</Label>
                    <ToggleGroup
                      type="single"
                      className="w-full"
                      value={bot.side ?? ''}
                      onValueChange={(value) => value && setBot({ side: value })}
                    >
                      {variant.teams.map((team) => (
                        <ToggleGroupItem key={team.id} value={team.id} className="flex-1">
                          {team.name}
                        </ToggleGroupItem>
                      ))}
                      <ToggleGroupItem value="random" className="flex-1">
                        Random
                      </ToggleGroupItem>
                    </ToggleGroup>
                    {bot.side === 'random' && (
                      <p className="text-xs text-muted-foreground">
                        {botSide
                          ? `This game the bot has ${variant.teams.find((t) => t.id === botSide)?.name ?? botSide} — you have the rest. A new game rolls again.`
                          : 'A new game rolls the side again.'}
                      </p>
                    )}
                  </div>
                )}

                {bot.mode !== 'off' && (
                  <div className="space-y-2">
                    <Label className="text-sm">Strength</Label>
                    {bot.mode === 'all'
                      ? variant.teams.map((team) => (
                          <div key={team.id} className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm">{team.name}</span>
                            <StrengthButtons
                              level={botLevelFor(bot, team.id)}
                              onChange={(level) =>
                                setBot({ levels: { ...bot.levels, [team.id]: level } })
                              }
                            />
                          </div>
                        ))
                      : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm">Bot</span>
                            <StrengthButtons
                              level={bot.level}
                              onChange={(level) => setBot({ level })}
                            />
                          </div>
                        )}
                    <p className="text-xs text-muted-foreground">
                      {bot.mode === 'all'
                        ? 'Each side plays with the strength you pick for it.'
                        : LEVEL_HINTS[bot.level]}
                    </p>
                  </div>
                )}

                <Separator />
                <p className="text-xs text-muted-foreground">
                  {bot.mode === 'all'
                    ? 'Every side is played by a bot — sit back and watch. Set a strength for each side.'
                    : "The bot plays with goonchess' own rules engine, so it works in every variant — custom pieces, portals, blasts and all."}
                </p>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={() => setReplayOpen(true)}>
            <RotateCcw /> Replay
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Download /> Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="center">
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={async () => {
                    const blob = await renderBoardImage(game, {
                      labels: true,
                      highlightLastMove: true,
                    })
                    if (!blob) {
                      toast.error('The board could not be drawn.')
                      return
                    }
                    downloadBlob(blob, fileNameFor(positionName(game), 'png'))
                    toast.success('Position saved as an image')
                  }}
                >
                  <ImageIcon /> Save position as PNG
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    const pgn = toPgn(game)
                    downloadBlob(
                      new Blob([pgn], { type: 'application/x-chess-pgn' }),
                      fileNameFor(game.variant.name, 'pgn'),
                    )
                    toast.success('Game exported as PGN')
                  }}
                >
                  <FileText /> Export game as PGN
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={async () => {
                    const fen = toFen(game)
                    if (!fen) {
                      toast.error('This variant cannot be written as FEN.')
                      return
                    }
                    try {
                      await navigator.clipboard.writeText(fen)
                      toast.success('FEN copied')
                    } catch {
                      toast.error('Clipboard unavailable.')
                    }
                  }}
                >
                  <ClipboardCopy /> Copy position as FEN
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant={clockIsOn(clock) ? 'secondary' : 'outline'} size="sm">
                <Timer /> Clock
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="center">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Time control</p>
                  <p className="text-muted-foreground text-xs">
                    Minutes per side, with seconds added after every move. The clock starts with the
                    first move and stops when the game ends.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CLOCK_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      size="sm"
                      variant={
                        clock.minutes === preset.minutes && clock.increment === preset.increment
                          ? 'secondary'
                          : 'outline'
                      }
                      onClick={() => setClock({ minutes: preset.minutes, increment: preset.increment })}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs">
                  Changing the time control restarts the clock.
                </p>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant={threatSettings.show ? 'secondary' : 'outline'} size="sm">
                <ShieldAlert /> Threats
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="center">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Threat visualizer</p>
                    <p className="text-xs text-muted-foreground">
                      See what the other side can attack before you move.
                    </p>
                  </div>
                  <Switch
                    aria-label="Show threats"
                    checked={threatSettings.show}
                    onCheckedChange={(show) => setThreats({ show })}
                  />
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm">Threat arrows</Label>
                      <p className="text-xs text-muted-foreground">
                        Arrows from each attacker to the piece it can take.
                      </p>
                    </div>
                    <Switch
                      aria-label="Show threat arrows"
                      disabled={!threatSettings.show}
                      checked={threatSettings.arrows}
                      onCheckedChange={(arrows) => setThreats({ arrows })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm">Attacked squares</Label>
                      <p className="text-xs text-muted-foreground">Faint dots on every square in range.</p>
                    </div>
                    <Switch
                      aria-label="Show attacked squares"
                      disabled={!threatSettings.show}
                      checked={threatSettings.coverage}
                      onCheckedChange={(coverage) => setThreats({ coverage })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm">Hanging pieces</Label>
                      <p className="text-xs text-muted-foreground">Dashed red ring when there is no defender.</p>
                    </div>
                    <Switch
                      aria-label="Show hanging pieces"
                      disabled={!threatSettings.show}
                      checked={threatSettings.hanging}
                      onCheckedChange={(hanging) => setThreats({ hanging })}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-sm">Defended pieces</Label>
                      <p className="text-xs text-muted-foreground">Amber ring when an ally can recapture.</p>
                    </div>
                    <Switch
                      aria-label="Show defended pieces"
                      disabled={!threatSettings.show}
                      checked={threatSettings.defended}
                      onCheckedChange={(defended) => setThreats({ defended })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Whose threats</Label>
                  <ToggleGroup
                    type="single"
                    className="w-full"
                    value={threatSettings.scope}
                    onValueChange={(scope) => {
                      if (scope) setThreats({ scope: scope as 'turn' | 'both' })
                    }}
                  >
                    <ToggleGroupItem value="turn" disabled={!threatSettings.show} className="flex-1">
                      Side to move
                    </ToggleGroupItem>
                    <ToggleGroupItem value="both" disabled={!threatSettings.show} className="flex-1">
                      Both sides
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant={turnView !== 'off' ? 'secondary' : 'outline'} size="sm">
                <FlipHorizontal2 /> Turn view
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="center">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Turn view</p>
                  <p className="text-xs text-muted-foreground">
                    For two players sharing one screen. The change happens after each move lands.
                  </p>
                </div>
                <ToggleGroup
                  type="single"
                  className="w-full"
                  value={turnView}
                  onValueChange={(value) => {
                    if (value) setTurnView(value as 'off' | 'board' | 'pieces')
                  }}
                >
                  <ToggleGroupItem value="off" className="flex-1">
                    Off
                  </ToggleGroupItem>
                  <ToggleGroupItem value="board" className="flex-1">
                    Flip board
                  </ToggleGroupItem>
                  <ToggleGroupItem value="pieces" className="flex-1">
                    Turn pieces
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  <span className="text-foreground">Flip board</span> rotates the whole board 180° so
                  the side to move is at the bottom. <span className="text-foreground">Turn pieces</span>{' '}
                  keeps the squares still and rotates the pieces to face the player whose turn it is —
                  handy when the opponent sits across an iPad.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <LiveAnnouncer />
        <AnalysisPanel />
        <PuzzlePanel />
        <StatsPanel />
        <Card className="py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Turn</span>
              <Badge variant={game.winner ? 'secondary' : 'default'} className="gap-1.5">
                <span
                  className="size-2.5 rounded-full ring-1 ring-black/20"
                  style={{ backgroundColor: turnTeam?.color ?? '#888' }}
                />
                {turnTeam?.name ?? game.turn}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-sm text-muted-foreground">
            {game.winner ? (
              <span>{STATUS_TEXT[game.status] ?? game.status.replace('-', ' ')}</span>
            ) : botThinking ? (
              <span className="flex items-center gap-2 text-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                The bot is thinking…
              </span>
            ) : checked ? (
              <span className="text-rose-500">Check — the royal piece is under attack.</span>
            ) : (
              <span>
                Move {game.moveHistory.length + 1} ·{' '}
                {variant.chaos?.hidden
                  ? 'nobody knows what the pieces are — pick one and try a square.'
                  : 'select a piece to see its legal moves.'}
              </span>
            )}

            {threatSettings.show && (
              <div className="mt-3 space-y-2 border-t pt-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">Threats</span>
                  <span>
                    {summary?.total ?? 0} attacked
                    {summary ? ` · ${summary.hanging} hanging` : ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {threatSettings.arrows && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-0.5 text-rose-400">
                        <span className="h-0.5 w-3 rounded-full bg-current" />
                        <span className="-ml-1">›</span>
                      </span>
                      arrows
                    </span>
                  )}
                  {threatSettings.coverage && (
                    <span className="flex items-center gap-1.5">
                      <span className="threat-coverage inline-block size-3 rounded-full ring-1 ring-rose-400/30" />
                      attacked
                    </span>
                  )}
                  {threatSettings.hanging && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-3 rounded-sm border-2 border-dashed border-rose-400" />
                      hanging
                    </span>
                  )}
                  {threatSettings.defended && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-3 rounded-sm border-2 border-amber-300" />
                      defended
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {variant.teams.map((team) => {
          const lost = game.captured.filter((c) => c.team === team.id)
          return (
            <Card key={team.id} className="py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 rounded-full ring-1 ring-black/20"
                    style={{ backgroundColor: team.color }}
                  />
                  {team.name}
                  <ClockFor team={team.id} />
                  <span className="text-muted-foreground ml-auto text-xs font-normal">
                    {lost.length} lost
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4">
                <div className="flex min-h-8 flex-wrap gap-0.5">
                  {lost.length === 0 && <span className="text-xs text-muted-foreground">No losses yet.</span>}
                  {lost.map((c, i) => {
                    const pt = variant.pieceTypes.find((p) => p.id === c.typeId)
                    return (
                      <span key={i} title={pt?.name}>
                        <PieceGlyph piece={pt} teamIndex={teamIndex(team.id)} size={24} muted />
                      </span>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}

        <Card className="py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Move history</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <Separator className="mb-2" />
            <ScrollArea className="h-48 pr-2">
              {game.moveHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">No moves yet.</p>
              ) : (
                <ol className="space-y-1">
                  {game.moveHistory.map((rec, i) => (
                    <li key={i} className="flex items-baseline gap-2 font-mono text-[11px]">
                      <span className="w-5 text-right text-muted-foreground">{i + 1}</span>
                      <span className="w-10 truncate text-muted-foreground">
                        {variant.teams.find((t) => t.id === rec.team)?.name ?? rec.team}
                      </span>
                      <span>{rec.notation}</span>
                    </li>
                  ))}
                </ol>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
