import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { BotWorker, type BotResult } from '@/lib/bot'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Switch } from './ui/switch'

/**
 * The analysis panel.
 *
 * The bot looks at the position on the board and says what it thinks: a score
 * for the first army and the line it would play. It runs in the worker, so the
 * board stays responsive while it thinks.
 */
export function AnalysisPanel() {
  const game = useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const [enabled, setEnabled] = useState(false)
  const [result, setResult] = useState<BotResult | null>(null)
  const [busy, setBusy] = useState(false)
  const worker = useRef<BotWorker | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    return () => {
      worker.current?.dispose()
      worker.current = null
    }
  }, [])

  // Re-analyse whenever the position changes.
  const position = game.moveHistory.length
  useEffect(() => {
    if (!enabled || game.winner) {
      setResult(null)
      setBusy(false)
      return
    }
    const client = worker.current ?? new BotWorker()
    worker.current = client
    const id = ++requestId.current
    setBusy(true)
    void client
      .think(game, game.turn, 'normal', Date.now(), 1200, true)
      .then((reply) => {
        if (id !== requestId.current) return
        setBusy(false)
        setResult(reply)
      })
  }, [enabled, position, game, game.winner])

  const firstTeam = variant.teams[0]
  const mover = game.turn
  // The search scores the side to move; show it for the first army.
  const raw = result?.score ?? 0
  const score = mover === firstTeam?.id ? raw : -raw
  const mate = Math.abs(score) > 90_000
  const label = mate
    ? `M${Math.max(1, Math.ceil((100_000 - Math.abs(score)) / 100))}`
    : `${score >= 0 ? '+' : '−'}${(Math.abs(score) / 100).toFixed(1)}`

  return (
    <Card className="py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <BrainCircuit className="text-muted-foreground size-4" /> Analysis
            {busy && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
          </span>
          <Switch aria-label="Show analysis" checked={enabled} onCheckedChange={setEnabled} />
        </CardTitle>
      </CardHeader>
      {enabled && (
        <CardContent className="space-y-2 px-4 text-sm">
          {!result && !busy && (
            <p className="text-muted-foreground text-xs">No position to look at yet.</p>
          )}
          {result && (
            <>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg tabular-nums">{label}</span>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  depth {result.depth}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  for {variant.teams.find((t) => t.id === firstTeam?.id)?.name ?? 'the first army'}
                </span>
              </div>
              {result.line.length > 0 && (
                <p className="text-muted-foreground font-mono text-[11px] leading-relaxed">
                  {result.line.join(' ')}
                </p>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
