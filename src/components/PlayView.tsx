import { useEffect, useRef } from "react"
import { toast } from 'sonner'
import { Bot, ClipboardCopy, Download, FileText, ImageIcon, Loader2, RotateCcw, Undo2, Trophy, FlipHorizontal2, Timer } from 'lucide-react'
import { GameBoard } from './GameBoard'
import { AnalysisPanel } from './AnalysisPanel'
import { LiveAnnouncer } from './LiveAnnouncer'
import { StatsPanel } from './StatsPanel'
import { BotPlayer } from './BotPlayer'
import { ClockFor, ClockTicker } from './ClockTicker'
import { PieceGlyph } from './PieceGlyph'
import { WinConfetti } from './WinConfetti'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Separator } from './ui/separator'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'
import { useAppStore } from '@/store/useAppStore'
import { OnlineBar } from './OnlineBar'
import { cn } from '@/lib/utils'
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

/**
 * One side of the table: who is playing, their clock, what they have taken and
 * whether they are the side to move.
 */
function PlayerStrip({ teamIndex }: { teamIndex: number }) {
  const game = useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const theme = useAppStore((s) => s.theme)

  const team = variant.teams[teamIndex]
  const other = variant.teams[(teamIndex + 1) % variant.teams.length]
  if (!team) return null

  const active = game.turn === team.id && !game.winner
  const lost = game.captured
    .filter((c) => c.team === team.id)
    .sort((a, b) => a.typeId.localeCompare(b.typeId))
  const value = (typeId: string) => variant.pieceTypes.find((p) => p.id === typeId)?.value ?? 0
  const ownLosses = lost.reduce((sum, c) => sum + value(c.typeId), 0)
  // The difference, not what each side has taken: equal material shows nothing.
  const advantage =
    (other ? game.captured.filter((c) => c.team === other.id) : []).reduce(
      (sum, c) => sum + value(c.typeId),
      0,
    ) - ownLosses

  const groups = lost.reduce(
    (all, c) => {
      ;(all[c.typeId] ??= []).push(c)
      return all
    },
    {} as Record<string, typeof lost>,
  )

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2.5 border px-2.5 py-2 transition-colors',
        active ? 'border-foreground/25 bg-secondary' : 'border-border bg-card',
      )}
    >
      <span
        aria-hidden
        className={cn('h-7 w-[2px] shrink-0', active ? 'bg-signal' : 'bg-transparent')}
      />
      <span
        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/20"
        style={{ backgroundColor: team.color }}
        aria-hidden
      />
      <span className="truncate text-[13px] font-medium">{team.name}</span>
      {active && <span className="label-mono hidden shrink-0 text-signal sm:inline">to move</span>}
      <ClockFor team={team.id} />

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end">
        {Object.entries(groups).map(([typeId, group]) => {
          const pieceType = variant.pieceTypes.find((p) => p.id === typeId)
          return (
            <div key={typeId} className="flex -space-x-2">
              {group.map((_capture, i) => (
                <span key={i} title={pieceType?.name}>
                  <PieceGlyph
                    piece={pieceType}
                    teamIndex={theme === 'dark' ? 0 : 1}
                    size={17}
                    muted
                  />
                </span>
              ))}
            </div>
          )
        })}
      </div>

      {advantage !== 0 && (
        <span className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
          {advantage > 0 ? '+' : ''}
          {advantage} pts
        </span>
      )}
    </div>
  )
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
    <ToggleGroup
      type="single"
      className="shrink-0"
      value={level}
      onValueChange={(value) => value && onChange(value as BotLevel)}
    >
      {(Object.keys(LEVEL_LABELS) as BotLevel[]).map((option) => (
        <ToggleGroupItem key={option} value={option} className="flex-1 py-1 px-2 text-xs">
          {LEVEL_LABELS[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function PlayView() {
  const game = useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const resetGame = useAppStore((s) => s.resetGame)
  const jumpToPly = useAppStore((s) => s.jumpToPly)
  const undoStack = useAppStore((s) => s.undoStack)
  const undo = useAppStore((s) => s.undo)
  const online = useAppStore((s) => s.online)
  // A shared game cannot be taken back: the other player already saw the move.
  const canUndo = useAppStore((s) => s.undoStack.length > 1) && !online
  const turnView = useAppStore((s) => s.turnView)
  const setTurnView = useAppStore((s) => s.setTurnView)
  const bot = useAppStore((s) => s.bot)
  const botSide = useAppStore((s) => s.botSide)
  const setBot = useAppStore((s) => s.setBot)
  const pendingPromotion = useAppStore((s) => s.pendingPromotion)
  const choosePromotion = useAppStore((s) => s.choosePromotion)
  const cancelPromotion = useAppStore((s) => s.cancelPromotion)
  const promotionIds = pendingPromotion?.move.promotionOptions ?? []
  const clock = useAppStore((s) => s.clock)
  const setClock = useAppStore((s) => s.setClock)
  const botThinking = useAppStore((s) => s.botThinking)
  const setOpponentOpen = useAppStore((s) => s.setOpponentOpen)


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

  // Number keys pick a promotion, the way the board's own shortcuts work.
  useEffect(() => {
    const options = pendingPromotion?.move.promotionOptions ?? []
    if (!options.length) return
    const onKey = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1
      if (Number.isInteger(index) && index >= 0 && index < options.length) {
        event.preventDefault()
        choosePromotion(options[index])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingPromotion, choosePromotion])

  const teamIndex = (id: string) => variant.teams.findIndex((t) => t.id === id)
  // The moves of the whole game, even when the board has been moved back to an
  // earlier position.
  const fullMoves = undoStack[undoStack.length - 1]?.moveHistory ?? game.moveHistory
  const currentPly = game.moveHistory.length
  const moveHistoryRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = moveHistoryRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [fullMoves.length])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-0">
      <WinConfetti />
      <BotPlayer />
      <ClockTicker />
      <Dialog
        open={!!pendingPromotion}
        onOpenChange={(open) => {
          if (!open) cancelPromotion()
        }}
      >
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Promote</DialogTitle>
            <DialogDescription>
              Your piece reached the last rank. Choose what it becomes.
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              'grid gap-2',
              promotionIds.length > 2 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2',
            )}
          >
            {promotionIds.map((typeId, index) => {
              const type = variant.pieceTypes.find((p) => p.id === typeId)
              if (!type) return null
              return (
                <button
                  key={typeId}
                  type="button"
                  autoFocus={index === 0}
                  onClick={() => choosePromotion(typeId)}
                  className="group relative flex flex-col items-center gap-2 rounded-[3px] border bg-card px-2 py-4 transition-colors hover:border-foreground/30 hover:bg-accent focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <PieceGlyph piece={type} teamIndex={teamIndex(game.turn)} size={40} />
                  <span className="text-[13px] leading-none">{type.name}</span>
                  <kbd className="label-mono absolute top-1.5 right-2 text-[10px] text-muted-foreground">
                    {index + 1}
                  </kbd>
                </button>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={cancelPromotion}>
              Cancel <kbd className="label-mono ml-1 text-[10px] text-muted-foreground">Esc</kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mx-auto flex w-full max-w-[640px] min-w-0 flex-col items-center gap-3">
        <OnlineBar />
        {game.winner && (
          <div className="flex w-full items-center gap-3 border border-foreground/20 bg-secondary px-2.5 py-2">
            <Trophy className="text-signal size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">
                {game.winner === 'draw'
                  ? 'Draw'
                  : `${variant.teams.find((t) => t.id === game.winner)?.name ?? game.winner}${
                      isBotTeam(bot, game.winner, botSide) ? ' (bot)' : ''
                    } wins`}
              </p>
              <p className="label-mono">{STATUS_TEXT[game.status] ?? 'Game over'}</p>
            </div>
            <Button size="sm" onClick={resetGame}>
              Play again
            </Button>
          </div>
        )}
        <PlayerStrip teamIndex={1} />
        <GameBoard />
        <PlayerStrip teamIndex={0} />
        <div className="flex w-full flex-wrap items-center justify-center gap-1.5 border-t pt-3">
          {!online && (
            <>
              <Button variant="outline" size="sm" onClick={resetGame}>
                <RotateCcw /> Restart
              </Button>
              <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo}>
                <Undo2 /> Undo
              </Button>
            </>
          )}

          {!online && (
          <Popover onOpenChange={setOpponentOpen}>
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
                            ? (bot.side ?? variant.teams[1]?.id ?? null)
                            : bot.side,
                      })
                    }}
                  >
                    <ToggleGroupItem value="off" className="flex-1 py-1 px-2">
                      Two players
                    </ToggleGroupItem>
                    <ToggleGroupItem value="one" className="flex-1 py-1 px-2">
                      One bot
                    </ToggleGroupItem>
                    <ToggleGroupItem value="all" className="flex-1 py-1 px-2">
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
                        <ToggleGroupItem key={team.id} value={team.id} className="flex-1 py-1 px-2">
                          {team.name}
                        </ToggleGroupItem>
                      ))}
                      <ToggleGroupItem value="random" className="flex-1 py-1 px-2">
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
                        ? ''
                        : LEVEL_HINTS[bot.level]}
                    </p>
                  </div>
                )}

                <Separator />
                <p className="text-xs text-muted-foreground">
                  {bot.mode === 'all'
                    ? ''
                    : "The bot plays with Goonchess's own rules engine, so it works in every variant — custom pieces, portals, blasts and all."}
                </p>
              </div>
            </PopoverContent>
          </Popover>
          )}

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
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(toPgn(game))
                      toast.success('PGN copied')
                    } catch {
                      toast.error('Clipboard unavailable.')
                    }
                  }}
                >
                  <FileText /> Copy game as PGN
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

          {!online && (
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
          )}

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
                  <ToggleGroupItem value="off" className="flex-1 py-1 px-2">
                    Off
                  </ToggleGroupItem>
                  <ToggleGroupItem value="board" className="flex-1 py-1 px-2">
                    Flip board
                  </ToggleGroupItem>
                  <ToggleGroupItem value="pieces" className="flex-1 py-1 px-2">
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

      <aside className="flex min-w-0 flex-col gap-6 lg:border-l lg:border-border lg:pl-7">
        <LiveAnnouncer />
        <AnalysisPanel />

        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2 border-t pt-4">
            <h2 className="label-mono">Move history</h2>
            <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
              {currentPly} {currentPly === 1 ? 'ply' : 'plies'}
            </span>
          </div>
          <div
            ref={moveHistoryRef}
            className={cn(
              'overflow-y-auto border-t pt-1 pr-1',
              fullMoves.length > 0 && 'h-52',
            )}
          >
            {fullMoves.length === 0 ? (
              <p className="text-muted-foreground py-2 text-xs">No moves yet.</p>
            ) : (
              <ol>
                <li>
                  <button
                    type="button"
                    onClick={() => jumpToPly(0)}
                    className={cn(
                      'border-l-2 border-transparent hover:bg-accent',
                      'grid w-full grid-cols-[1.5rem_0.5rem_1fr] items-baseline gap-2 px-1.5 py-[3px] text-left font-mono text-[11px] transition-colors',
                      currentPly === 0 && 'border-signal bg-accent',
                    )}
                  >
                    <span className="text-muted-foreground/60 text-right tabular-nums">0</span>
                    <span />
                    <span className="text-muted-foreground">the opening position</span>
                  </button>
                </li>
                {fullMoves.map((rec, i) => {
                  const ply = i + 1
                  const current = ply === currentPly
                  const team = variant.teams.find((t) => t.id === rec.team)
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => jumpToPly(ply)}
                        title="Go to this position"
                        className={cn(
                          'border-l-2 border-transparent hover:bg-accent',
                          'grid w-full grid-cols-[1.5rem_0.5rem_1fr] items-baseline gap-2 px-1.5 py-[3px] text-left font-mono text-[11px] transition-colors',
                          current && 'border-signal bg-accent',
                          !current && i % 2 === 0 && 'bg-foreground/[0.03]',
                        )}
                      >
                        <span className="text-muted-foreground/60 text-right tabular-nums">
                          {ply}
                        </span>
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full ring-1 ring-black/20"
                          style={{ backgroundColor: team?.color }}
                        />
                        <span className="flex items-baseline justify-between gap-2">
                          <span>{rec.notation}</span>
                          <span className="text-muted-foreground/60 truncate text-[10px]">
                            {team?.name ?? rec.team}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </section>

        <StatsPanel />
      </aside>
    </div>
  )
}
