import { useEffect, useRef, useState } from "react"
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
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Textarea } from './ui/textarea'
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
  center: 'The king took the hill',
  'three-check': 'The third check',
  antichess: 'No pieces, or no move to make',
  race: 'The king reached the far rank',
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
  const theme = useAppStore((s) => s.theme)
  const variant = useAppStore((s) => s.variant)
  const threeCheck = variant.winConditions.some((w) => w.kind === 'threeCheck')
  const crazyhouse = !!variant.rules?.includes('crazyhouse')
  const selected = useAppStore((s) => s.selected)
  const legalMoves = useAppStore((s) => s.legalMoves)
  const selectPocket = useAppStore((s) => s.selectPocket)
  // A drop waits on the off-board square: no real square is ever selected.
  const pocketPick =
    selected && selected.x === -1 && selected.y === -1
      ? legalMoves[0]?.drop?.typeId ?? null
      : null
  /** What a side holds in its pocket, as [typeId, count] pairs. */
  const pocketOf = (teamId: string) =>
    Object.entries(game.hands?.[teamId] ?? {}).filter(([, count]) => count > 0)
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
  const clock = useAppStore((s) => s.clock)
  const setClock = useAppStore((s) => s.setClock)
  const botThinking = useAppStore((s) => s.botThinking)
  const setOpponentOpen = useAppStore((s) => s.setOpponentOpen)
  const [exportOpen, setExportOpen] = useState(false)
  const [pgnExport, setPgnExport] = useState<{ text: string; filename: string } | null>(null)
  const exportTriggerRef = useRef<HTMLButtonElement>(null)

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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <WinConfetti />
      <BotPlayer />
      <ClockTicker />
      <Dialog open={pgnExport !== null} onOpenChange={(open) => !open && setPgnExport(null)}>
        <DialogContent
          className="sm:max-w-xl [&>[data-slot=dialog-close]]:-m-3.5 [&>[data-slot=dialog-close]]:p-3.5"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            exportTriggerRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-4" /> Export game as PGN
            </DialogTitle>
            <DialogDescription>
              View the game notation, copy it, or download a .pgn file.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-3">
            <Label htmlFor="export-pgn">Game PGN</Label>
            <Textarea
              id="export-pgn"
              readOnly
              value={pgnExport?.text ?? ''}
              className="h-64 max-h-[40vh] min-h-24 field-sizing-fixed font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-11"
                onClick={async () => {
                  if (!pgnExport) return
                  try {
                    await navigator.clipboard.writeText(pgnExport.text)
                    toast.success('PGN copied')
                  } catch {
                    toast.error('Clipboard unavailable. Select the PGN text and copy manually.')
                  }
                }}
              >
                <ClipboardCopy /> Copy PGN
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  if (!pgnExport) return
                  downloadBlob(
                    new Blob([pgnExport.text], { type: 'application/x-chess-pgn;charset=utf-8' }),
                    pgnExport.filename,
                  )
                  toast.success('Game saved as PGN')
                }}
              >
                <Download /> Download PGN
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col items-center gap-4">
        <OnlineBar />
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
        {(() => {
          const team = variant.teams[1]
          const other = variant.teams[0]
          const lost = game.captured.filter((c) => c.team === team.id).sort((a,b)=>a.typeId.localeCompare(b.typeId))
          const value = (typeId: string) => variant.pieceTypes.find((p) => p.id === typeId)?.value ?? 0
          const material = lost.reduce((sum, c) => sum + value(c.typeId), 0)
          // The difference, not what each side has taken: equal material shows nothing.
          const advantage = game.captured.filter((c) => c.team === other.id).reduce((sum, c) => sum + value(c.typeId), 0) - material
          return (
            <div className={`flex w-full max-w-xl items-center gap-3 rounded-lg border px-3 py-2 ${game.turn === team.id && !game.winner ? "border-foreground bg-secondary" : "bg-card"}`}>
              <span className="size-2.5 rounded-full ring-1 ring-black/20" style={{ backgroundColor: team.color }} />
              <span className="text-sm font-medium">{team.name}</span>
              {threeCheck && (
                <span className="text-muted-foreground text-xs tabular-nums" title="Checks given">
                  {game.checks?.[team.id] ?? 0}/3 checks
                </span>
              )}
              <ClockFor team={team.id} />
              <div className="flex flex-1 flex-wrap items-center justify-end gap-0">
                {crazyhouse ? (
                  pocketOf(team.id).length === 0 ? (
                    <span className="text-muted-foreground text-xs">Pocket empty</span>
                  ) : (
                    pocketOf(team.id).map(([typeId, count]) => {
                      const pt = variant.pieceTypes.find((p) => p.id === typeId)
                      const held = pocketPick === typeId
                      const canDrop = !game.winner && game.turn === team.id
                      return (
                        <button
                          key={typeId}
                          type="button"
                          title={`${pt?.name ?? 'Piece'} in the pocket — tap to pick it up`}
                          aria-label={`Drop ${pt?.name ?? 'piece'} (${count} in pocket)`}
                          aria-pressed={held}
                          onClick={() => selectPocket(typeId)}
                          disabled={!canDrop}
                          className={cn(
                            'flex items-center gap-0.5 rounded-md border px-1 py-0.5 transition-colors',
                            held ? 'border-foreground bg-secondary' : 'border-transparent hover:bg-muted',
                            !canDrop && 'opacity-60',
                          )}
                        >
                          <PieceGlyph
                            piece={pt}
                            teamIndex={variant.teams.findIndex((t) => t.id === team.id)}
                            size={18}
                          />
                          <span className="text-xs tabular-nums">×{count}</span>
                        </button>
                      )
                    })
                  )
                ) : (
                  Object.entries(lost.reduce((g, c) => { (g[c.typeId] ??= []).push(c); return g }, {} as Record<string, typeof lost>)).map(([typeId, grp]) => {
                    const pt = variant.pieceTypes.find((p) => p.id === typeId)
                    return (
                      <div key={typeId} className="flex -space-x-2">
                        {grp.map((_c, i) => (
                          <span key={i} title={pt?.name}><PieceGlyph piece={pt} teamIndex={theme === 'dark' ? 0 : 1} size={18} muted /></span>
                        ))}
                      </div>
                    )
                  })
                )}
              </div>
              {advantage !== 0 && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {advantage > 0 ? '+' : ''}{advantage} pts
                </span>
              )}
            </div>
          )
        })()}
        <GameBoard />
        {(() => {
          const team = variant.teams[0]
          const other = variant.teams[1]
          const lost = game.captured.filter((c) => c.team === team.id).sort((a,b)=>a.typeId.localeCompare(b.typeId))
          const value = (typeId: string) => variant.pieceTypes.find((p) => p.id === typeId)?.value ?? 0
          const material = lost.reduce((sum, c) => sum + value(c.typeId), 0)
          // The difference, not what each side has taken: equal material shows nothing.
          const advantage = game.captured.filter((c) => c.team === other.id).reduce((sum, c) => sum + value(c.typeId), 0) - material
          return (
            <div className={`flex w-full max-w-xl items-center gap-3 rounded-lg border px-3 py-2 ${game.turn === team.id && !game.winner ? "border-foreground bg-secondary" : "bg-card"}`}>
              <span className="size-2.5 rounded-full ring-1 ring-black/20" style={{ backgroundColor: team.color }} />
              <span className="text-sm font-medium">{team.name}</span>
              {threeCheck && (
                <span className="text-muted-foreground text-xs tabular-nums" title="Checks given">
                  {game.checks?.[team.id] ?? 0}/3 checks
                </span>
              )}
              <ClockFor team={team.id} />
              <div className="flex flex-1 flex-wrap items-center justify-end gap-0">
                {crazyhouse ? (
                  pocketOf(team.id).length === 0 ? (
                    <span className="text-muted-foreground text-xs">Pocket empty</span>
                  ) : (
                    pocketOf(team.id).map(([typeId, count]) => {
                      const pt = variant.pieceTypes.find((p) => p.id === typeId)
                      const held = pocketPick === typeId
                      const canDrop = !game.winner && game.turn === team.id
                      return (
                        <button
                          key={typeId}
                          type="button"
                          title={`${pt?.name ?? 'Piece'} in the pocket — tap to pick it up`}
                          aria-label={`Drop ${pt?.name ?? 'piece'} (${count} in pocket)`}
                          aria-pressed={held}
                          onClick={() => selectPocket(typeId)}
                          disabled={!canDrop}
                          className={cn(
                            'flex items-center gap-0.5 rounded-md border px-1 py-0.5 transition-colors',
                            held ? 'border-foreground bg-secondary' : 'border-transparent hover:bg-muted',
                            !canDrop && 'opacity-60',
                          )}
                        >
                          <PieceGlyph
                            piece={pt}
                            teamIndex={variant.teams.findIndex((t) => t.id === team.id)}
                            size={18}
                          />
                          <span className="text-xs tabular-nums">×{count}</span>
                        </button>
                      )
                    })
                  )
                ) : (
                  Object.entries(lost.reduce((g, c) => { (g[c.typeId] ??= []).push(c); return g }, {} as Record<string, typeof lost>)).map(([typeId, grp]) => {
                    const pt = variant.pieceTypes.find((p) => p.id === typeId)
                    return (
                      <div key={typeId} className="flex -space-x-2">
                        {grp.map((_c, i) => (
                          <span key={i} title={pt?.name}><PieceGlyph piece={pt} teamIndex={theme === 'dark' ? 0 : 1} size={18} muted /></span>
                        ))}
                      </div>
                    )
                  })
                )}
              </div>
              {advantage !== 0 && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {advantage > 0 ? '+' : ''}{advantage} pts
                </span>
              )}
            </div>
          )
        })()}
        <div className="flex flex-wrap items-center justify-center gap-2">
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

          <Popover open={exportOpen} onOpenChange={setExportOpen}>
            <PopoverTrigger asChild>
              <Button ref={exportTriggerRef} variant="outline" size="sm">
                <Download /> Export
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-72"
              align="center"
              onCloseAutoFocus={(event) => {
                if (pgnExport) event.preventDefault()
              }}
            >
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
                    setPgnExport({
                      text: toPgn(game),
                      filename: fileNameFor(positionName(game), 'pgn'),
                    })
                    setExportOpen(false)
                  }}
                >
                  <FileText /> View game as PGN
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

      <aside className="flex flex-col gap-4">
        <LiveAnnouncer />
        <AnalysisPanel />

        <Card className="py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Move history</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <Separator className="mb-2" />
            <div ref={moveHistoryRef} className="h-48 overflow-y-auto pr-2">
              {fullMoves.length === 0 ? (
                <p className="text-xs text-muted-foreground">No moves yet.</p>
              ) : (
                <ol className="space-y-1">
                  <li>
                    <button
                      type="button"
                      onClick={() => jumpToPly(0)}
                      className={cn(
                        'flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left font-mono text-[11px] transition-colors hover:bg-accent',
                        currentPly === 0 && 'bg-accent',
                      )}
                    >
                      <span className="w-5 text-right text-muted-foreground">0</span>
                      <span className="w-10 truncate text-muted-foreground">start</span>
                      <span className="text-muted-foreground">the opening position</span>
                    </button>
                  </li>
                  {fullMoves.map((rec, i) => {
                    const ply = i + 1
                    const current = ply === currentPly
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => jumpToPly(ply)}
                          title="Go to this position"
                          className={cn(
                            'flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left font-mono text-[11px] transition-colors hover:bg-accent',
                            current && 'bg-accent',
                            i % 2 === 0 ? 'dark:bg-white/5' : 'bg-black/5 dark:bg-transparent',
                          )}
                        >
                          <span className="w-5 text-right text-muted-foreground">{ply}</span>
                          <span className="w-10 truncate text-muted-foreground">
                            {variant.teams.find((t) => t.id === rec.team)?.name ?? rec.team}
                          </span>
                          <span>{rec.notation}</span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </CardContent>
        </Card>

        <StatsPanel />
      </aside>
    </div>
  )
}
