import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Flame, Lightbulb, Loader2, Puzzle as PuzzleIcon, Repeat, SkipForward } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { BotWorker } from '@/lib/bot'
import { loadPuzzleStats, savePuzzleStats } from '@/lib/persist'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Switch } from './ui/switch'
import { cn } from '@/lib/utils'

/** How the difficulties are shown. */
const DIFFICULTY_LABEL: Record<string, string> = {
  easy: 'easy',
  medium: 'tricky',
  hard: 'hard',
}

/** What a theme chip says, in plain words. */
const THEME_LABEL: Record<string, string> = {
  capture: 'capture',
  fork: 'fork',
  check: 'check',
  promotion: 'promotion',
  'big-capture': 'big piece',
}

/**
 * Puzzles.
 *
 * A position is looked for in a game the bot played against itself, and the
 * player has to find the move that wins the material. Each puzzle names what
 * kind of tactic it is and how much it wins, and a streak counts the ones
 * answered right in a row — with a mode that keeps dealing them.
 *
 * The puzzle on the board lives in the store, because solving it means
 * leaving this panel: the view goes to the board, and the panel is still
 * here, with its verdict, when the player comes back.
 */
export function PuzzlePanel() {
  const variant = useAppStore((s) => s.variant)
  const game = useAppStore((s) => s.game)
  const puzzle = useAppStore((s) => s.puzzle)
  const setPuzzle = useAppStore((s) => s.setPuzzle)
  const verdict = useAppStore((s) => s.puzzleVerdict)
  const setVerdict = useAppStore((s) => s.setPuzzleVerdict)
  const setPuzzleStart = useAppStore((s) => s.setPuzzleStart)
  const resetGame = useAppStore((s) => s.resetGame)
  const worker = useRef<BotWorker | null>(null)
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState(loadPuzzleStats)
  const [streakMode, setStreakMode] = useState(false)
  const streakModeRef = useRef(streakMode)
  streakModeRef.current = streakMode

  useEffect(() => {
    return () => {
      worker.current?.dispose()
      worker.current = null
    }
  }, [])

  // Another variant means another puzzle. The panel remounts whenever the
  // player comes back from the board, so only a real change of variant — or a
  // puzzle left over from another one — clears what is here.
  const variantId = variant.id
  const knownVariant = useRef<string | null>(null)
  useEffect(() => {
    const first = knownVariant.current === null
    const changed = knownVariant.current !== null && knownVariant.current !== variantId
    knownVariant.current = variantId
    if (!first && !changed) return
    const store = useAppStore.getState()
    if (!first || (store.puzzle && store.puzzleStart?.variant.id !== variantId)) {
      setPuzzle(null)
      setPuzzleStart(null)
    }
  }, [variantId, setPuzzle, setPuzzleStart])

  const loadPuzzle = async () => {
    setBusy(true)
    try {
      const client = worker.current ?? new BotWorker()
      worker.current = client
      const result = await client.findPuzzle(variant, Math.floor(Math.random() * 1e9))
      if (!result.puzzle) {
        toast.error('No puzzle could be found in this variant.')
        return
      }
      const found = result.puzzle
      setPuzzle({
        from: found.from,
        to: found.to,
        side: found.side,
        gain: found.gain,
        difficulty: found.difficulty,
        themes: found.themes,
        movesBefore: found.state.moveHistory.length,
      })
      // The position is kept, so restarting the game starts the puzzle over.
      setPuzzleStart(found.state)
      useAppStore.getState().loadPosition(found.state)
      // A puzzle is solved on the board, so go there.
      useAppStore.getState().setView('play')
    } finally {
      setBusy(false)
    }
  }

  const recordAnswer = (right: boolean) => {
    setStats((current) => {
      const next = {
        streak: right ? current.streak + 1 : 0,
        best: Math.max(current.best, right ? current.streak + 1 : 0),
      }
      savePuzzleStats(next)
      return next
    })
  }

  // Watch for the player's answer.
  useEffect(() => {
    if (!puzzle || verdict !== null) return
    if (game.moveHistory.length === puzzle.movesBefore) return
    const record = game.moveHistory[game.moveHistory.length - 1]
    if (!record) return
    const right =
      record.move.from.x === puzzle.from.x &&
      record.move.from.y === puzzle.from.y &&
      record.move.finalTo.x === puzzle.to.x &&
      record.move.finalTo.y === puzzle.to.y
    setVerdict(right)
    recordAnswer(right)
    if (right) {
      toast.success('Solved!')
    } else {
      toast.error('Not this time — there was a better move.')
    }
    // In a streak, the next puzzle deals itself, after a moment to read the
    // verdict. A miss ends the run.
    if (streakModeRef.current) {
      const timer = window.setTimeout(() => {
        if (streakModeRef.current) void loadPuzzle()
      }, right ? 1200 : 2200)
      return () => window.clearTimeout(timer)
    }
  }, [game, puzzle, verdict, setVerdict])

  // Starting the puzzle over clears the verdict on it.
  useEffect(() => {
    if (!puzzle || verdict === null) return
    if (game.moveHistory.length !== puzzle.movesBefore) return
    setVerdict(null)
  }, [game, puzzle, verdict, setVerdict])

  return (
    <Card className="py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <PuzzleIcon className="text-muted-foreground size-4" /> Puzzles
            {busy && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            {stats.streak > 1 && (
              <span className={cn('flex items-center gap-1 font-medium', stats.streak >= 5 ? 'text-amber-500' : 'text-foreground')}>
                <Flame className="size-3.5" /> {stats.streak}
              </span>
            )}
            {stats.best > 0 && <span className="text-muted-foreground">best {stats.best}</span>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 text-sm">
        {puzzle ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  puzzle.difficulty === 'hard' && 'border-rose-500/40 text-rose-500',
                  puzzle.difficulty === 'medium' && 'border-amber-500/40 text-amber-500',
                  puzzle.difficulty === 'easy' && 'border-emerald-500/40 text-emerald-600',
                )}
              >
                {DIFFICULTY_LABEL[puzzle.difficulty] ?? puzzle.difficulty}
              </span>
              {puzzle.themes.map((theme) => (
                <span key={theme} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  {THEME_LABEL[theme] ?? theme}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              {verdict === null
                ? 'Find the move that wins the material.'
                : verdict
                  ? 'That was the move.'
                  : 'The best move was on the board.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={loadPuzzle} disabled={busy}>
                <SkipForward /> Next puzzle
              </Button>
              {verdict === false && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // Back to the position the puzzle started from.
                    resetGame()
                    setVerdict(null)
                  }}
                >
                  <Lightbulb /> Try again
                </Button>
              )}
              <span className="ml-auto flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Repeat className="size-3.5" /> Streak
                </span>
                <Switch
                  aria-label="Streak mode: keep dealing puzzles"
                  checked={streakMode}
                  onCheckedChange={setStreakMode}
                />
              </span>
            </div>
            {streakMode && !busy && (
              <p className="text-muted-foreground text-[10px]">
                The next puzzle deals itself. A miss ends the run.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Positions are taken from games the bot played against itself. Find the capture that
              cannot be taken back.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={loadPuzzle} disabled={busy}>
                <PuzzleIcon /> Give me a puzzle
              </Button>
              <span className="ml-auto flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Repeat className="size-3.5" /> Streak
                </span>
                <Switch
                  aria-label="Streak mode: keep dealing puzzles"
                  checked={streakMode}
                  onCheckedChange={setStreakMode}
                />
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
