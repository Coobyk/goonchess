import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { BotWorker, type BotResult } from '@/lib/bot'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Switch } from './ui/switch'

/**
 * The analysis panel.
 *
 * The bot looks at the position on the board and says what it thinks: a score
 * for the first army. The line it would play is hidden by default and can be
 * switched on.
 */
export function AnalysisPanel() {
  const game = useAppStore((s) => s.game)
  const analysis = useAppStore((s) => s.analysis)
  const setAnalysis = useAppStore((s) => s.setAnalysis)
  const enabled = useAppStore((s) => s.analysisOn)
  const setEnabled = useAppStore((s) => s.setAnalysisOn)
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult)
  const [result, setResult] = useState<BotResult | null>(null)
  const [busy, setBusy] = useState(false)
  const worker = useRef<BotWorker | null>(null)

  useEffect(() => {
    return () => {
      worker.current?.dispose()
      worker.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || game.winner) {
      setResult(null)
      setBusy(false)
      setAnalysisResult(null)
      return
    }
    const client = worker.current ?? new BotWorker()
    worker.current = client
    setBusy(true)
    void client
      .think(game, game.turn, 'normal', {
        analyze: true,
        timeBudgetMs: 1200,
        wantLine: analysis.showLine,
      })
      .then((reply) => {
        setBusy(false)
        setResult(reply)
        const firstTeam = game.variant.teams[0]
        const raw = reply.score
        // The search scores the side to move; the panel reports the first army.
        const score = game.turn === firstTeam?.id ? raw : -raw
        setAnalysisResult({ score, depth: reply.depth })
      })
  }, [enabled, analysis.showLine, game, game.winner, setAnalysisResult])

  const firstTeam = game.variant.teams[0]
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
                <span className="text-muted-foreground text-[10px]">depth {result.depth}</span>
                <span className="text-muted-foreground text-xs">
                  for {game.variant.teams.find((t) => t.id === firstTeam?.id)?.name ?? 'the first army'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                {analysis.showLine ? (
                  <p className="text-muted-foreground font-mono text-[11px] leading-relaxed">
                    {result.line.length ? result.line.join(' ') : '—'}
                  </p>
                ) : (
                  <span className="text-muted-foreground text-[11px]">The best line is hidden.</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setAnalysis({ showLine: !analysis.showLine })}
                >
                  {analysis.showLine ? 'Hide the line' : 'Show the line'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
