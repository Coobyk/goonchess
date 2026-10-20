import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Undo2, Trophy, ShieldAlert } from 'lucide-react'
import { GameBoard } from './GameBoard'
import { PieceGlyph } from './PieceGlyph'
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
import { playSound } from '@/lib/sound'

const STATUS_TEXT: Record<string, string> = {
  checkmate: 'Checkmate',
  'royal-captured': 'Royal captured',
  eliminated: 'Army eliminated',
  points: 'Point target reached',
  stalemate: 'Stalemate — draw',
}

export function PlayView() {
  const game = useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const resetGame = useAppStore((s) => s.resetGame)
  const undo = useAppStore((s) => s.undo)
  const canUndo = useAppStore((s) => s.undoStack.length > 0)
  const threatSettings = useAppStore((s) => s.threats)
  const setThreats = useAppStore((s) => s.setThreats)

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
      <div className="flex flex-col items-center gap-4">
        {game.winner && (
          <Alert className="w-full max-w-xl">
            <Trophy className="size-4" />
            <AlertTitle>
              {game.winner === 'draw' ? 'Draw' : `${variant.teams.find((t) => t.id === game.winner)?.name ?? game.winner} wins`}
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
          <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo}>
            <Undo2 /> Undo
          </Button>

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
        </div>
      </div>

      <aside className="flex flex-col gap-4">
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
              <span className="capitalize">{game.status.replace('-', ' ')}</span>
            ) : checked ? (
              <span className="text-rose-500">Check — the royal piece is under attack.</span>
            ) : (
              <span>Move {game.moveHistory.length + 1} · select a piece to see its legal moves.</span>
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
                  <span className="size-2.5 rounded-full ring-1 ring-black/20" style={{ backgroundColor: team.color }} />
                  {team.name}
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
