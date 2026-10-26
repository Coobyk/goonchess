import { useEffect, useMemo, useRef, useState } from 'react'
import { BrainCircuit, LineChart, Loader2, ShieldAlert } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { BotWorker, type BotResult } from '@/lib/bot'
import { replayStates } from '@/lib/replay'
import { computeThreats, mergeThreats, threatSummary } from '@/engine/threats'
import { AnalysisGraph } from './AnalysisGraph'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Label } from './ui/label'
import { Separator } from './ui/separator'
import { Switch } from './ui/switch'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

/**
 * The analysis panel.
 *
 * It has three modes. Off, which is nothing. Engine, which looks at the
 * position on the board and says what it thinks, with a bar beside the board
 * showing the same thing. And Computer, which looks at the whole game and
 * draws a graph of how it went.
 *
 * The threat visualiser lives here too, since it is another way of reading
 * the position.
 */
export function AnalysisPanel() {
  const game = useAppStore((s) => s.game)
  const variant = useAppStore((s) => s.variant)
  const analysis = useAppStore((s) => s.analysis)
  const setAnalysis = useAppStore((s) => s.setAnalysis)
  const mode = useAppStore((s) => s.analysisMode)
  const setMode = useAppStore((s) => s.setAnalysisMode)
  const setAnalysisResult = useAppStore((s) => s.setAnalysisResult)
  const jumpToPly = useAppStore((s) => s.jumpToPly)
  const undoStack = useAppStore((s) => s.undoStack)
  const threatSettings = useAppStore((s) => s.threats)
  const setThreats = useAppStore((s) => s.setThreats)
  const [result, setResult] = useState<BotResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [graph, setGraph] = useState<number[] | null>(null)
  const [graphBusy, setGraphBusy] = useState(false)
  const worker = useRef<BotWorker | null>(null)

  // The game with every move played, even when the board is showing an earlier
  // position. Its result is whether the game is over.
  const full = undoStack[undoStack.length - 1] ?? game
  const over = full.status !== 'active'

  useEffect(() => {
    return () => {
      worker.current?.dispose()
      worker.current = null
    }
  }, [])

  // The graph belongs to a finished game, so a game being played again — a new
  // one, or one taken back — drops the picture of the old one.
  useEffect(() => {
    if (!over) setGraph(null)
  }, [over])

  // The live analysis of the position on the board.
  useEffect(() => {
    if (mode !== 'engine' || game.winner) {
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
        // The move the engine likes best travels with the score, so the board
        // can draw it as an arrow.
        const best = reply.move ? { from: reply.move.from, to: reply.move.finalTo } : null
        setAnalysisResult({ score, depth: reply.depth, best })
      })
  }, [mode, analysis.showLine, game, game.winner, setAnalysisResult])

  // The whole game, position by position.
  const analyseGame = async () => {
    const client = worker.current ?? new BotWorker()
    worker.current = client
    setGraphBusy(true)
    try {
      // The whole game, even when the board has been moved back.
      const latest = useAppStore.getState()
      const finished = latest.undoStack[latest.undoStack.length - 1] ?? latest.game
      const states = replayStates(finished)
      const firstTeam = finished.variant.teams[0]
      const reply = await client.analyseGame(states, firstTeam?.id ?? 'white')
      // If the game was taken back while the scores were being worked out,
      // they are scores of a game that no longer exists.
      const now = useAppStore.getState()
      const nowGame = now.undoStack[now.undoStack.length - 1] ?? now.game
      if (nowGame !== finished) return
      const raw = reply.scores ?? []
      // Every score is from the side to move; the graph is from the first army.
      setGraph(
        raw.map((score, i) => {
          const turn = states[i]?.turn
          return turn && turn !== firstTeam?.id ? -score : score
        }),
      )
    } finally {
      setGraphBusy(false)
    }
  }

  // What the other side can attack.
  const threatReport = useMemo(() => {
    if (!threatSettings.show) return null
    const teams =
      threatSettings.scope === 'both' ? variant.teams.map((t) => t.id) : [game.turn]
    return mergeThreats(teams.map((team) => computeThreats(game, team)))
  }, [game, variant.teams, threatSettings.show, threatSettings.scope])
  const summary = threatReport ? threatSummary(threatReport, game) : null

  const firstTeam = game.variant.teams[0]
  const mover = game.turn
  const raw = result?.score ?? 0
  const score = mover === firstTeam?.id ? raw : -raw
  const mate = Math.abs(score) > 90_000
  const label = mate
    ? `M${Math.max(1, Math.ceil((100_000 - Math.abs(score)) / 100))}`
    : `${score >= 0 ? '+' : '−'}${(Math.abs(score) / 100).toFixed(1)}`

  return (
    <Card className="py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BrainCircuit className="text-muted-foreground size-4" /> Analysis
          {busy && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 text-sm">
        <ToggleGroup
          type="single"
          className="w-full"
          value={mode}
          onValueChange={(value) => {
            if (value) setMode(value as 'off' | 'engine' | 'computer')
          }}
        >
          <ToggleGroupItem value="off" className="flex-1">
            Off
          </ToggleGroupItem>
          <ToggleGroupItem value="engine" className="flex-1">
            Engine
          </ToggleGroupItem>
          <ToggleGroupItem value="computer" className="flex-1">
            Computer
          </ToggleGroupItem>
        </ToggleGroup>

        {mode === 'engine' && (
          <>
            {!result && !busy && (
              <p className="text-muted-foreground text-xs">No position to look at yet.</p>
            )}
                {result && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg tabular-nums">{label}</span>
                      <span className="text-muted-foreground text-[10px]">depth {result.depth}</span>
                      <span className="text-muted-foreground text-xs">
                        for {variant.teams.find((t) => t.id === firstTeam?.id)?.name ?? 'the first army'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-xs">Best-move arrow</Label>
                      <Switch
                        aria-label="Show best-move arrow"
                        checked={analysis.showArrow}
                        onCheckedChange={(showArrow) => setAnalysis({ showArrow })}
                      />
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
          </>
        )}

        {mode === 'computer' && (
          <div className="space-y-2">
            {over ? (
              <>
                <p className="text-muted-foreground text-xs">
                  Every position of the game is looked at, and the scores are drawn as a graph.
                </p>
                <Button size="sm" variant="secondary" onClick={analyseGame} disabled={graphBusy}>
                  {graphBusy ? <Loader2 className="animate-spin" /> : <LineChart />}
                  {graph ? 'Analyse again' : 'Analyse the game'}
                </Button>
                {graph && graph.length > 0 && (
                  <AnalysisGraph
                    scores={graph}
                    variantName={variant.name}
                    current={
                      game.moveHistory.length < graph.length ? game.moveHistory.length : null
                    }
                    onPick={(ply) => {
                      jumpToPly(ply)
                      setGraphBusy(false)
                    }}
                  />
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-xs">
                The graph is drawn once the game is over, so it is not remade move by move. Play
                it out, or take moves back, and it will be here at the end.
              </p>
            )}
          </div>
        )}

        <Separator />

        {/* The threat visualiser. */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              <ShieldAlert className="text-muted-foreground size-4" /> Threats
            </span>
            <Switch
              aria-label="Show threats"
              checked={threatSettings.show}
              onCheckedChange={(show) => setThreats({ show })}
            />
          </div>
          {threatSettings.show && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-foreground">Threats</span>
                <span>
                  {summary?.total ?? 0} attacked
                  {summary ? ` · ${summary.hanging} hanging` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">Threat arrows</Label>
                <Switch
                  aria-label="Show threat arrows"
                  checked={threatSettings.arrows}
                  onCheckedChange={(arrows) => setThreats({ arrows })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">Attacked squares</Label>
                <Switch
                  aria-label="Show attacked squares"
                  checked={threatSettings.coverage}
                  onCheckedChange={(coverage) => setThreats({ coverage })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">Hanging pieces</Label>
                <Switch
                  aria-label="Show hanging pieces"
                  checked={threatSettings.hanging}
                  onCheckedChange={(hanging) => setThreats({ hanging })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">Defended pieces</Label>
                <Switch
                  aria-label="Show defended pieces"
                  checked={threatSettings.defended}
                  onCheckedChange={(defended) => setThreats({ defended })}
                />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {threatSettings.arrows && (
                  <span className="flex items-center gap-1.5">
                    <span className="flex items-center gap-0.5 text-rose-400">
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
              <ToggleGroup
                type="single"
                className="w-full"
                value={threatSettings.scope}
                onValueChange={(scope) => {
                  if (scope) setThreats({ scope: scope as 'turn' | 'both' })
                }}
              >
                <ToggleGroupItem value="turn" className="flex-1 text-xs">
                  Side to move
                </ToggleGroupItem>
                <ToggleGroupItem value="both" className="flex-1 text-xs">
                  Both sides
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
