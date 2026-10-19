import { useEffect } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Undo2, Trophy, Swords } from 'lucide-react'
import { GameBoard } from './GameBoard'
import { PieceGlyph } from './PieceGlyph'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Separator } from './ui/separator'
import { ScrollArea } from './ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { useAppStore } from '@/store/useAppStore'
import { isInCheck } from '@/engine/rules'

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
  const setMakerTab = useAppStore((s) => s.setMakerTab)
  const setView = useAppStore((s) => s.setView)

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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMakerTab('board')
              setView('maker')
            }}
          >
            <Swords /> Open Maker
          </Button>
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
